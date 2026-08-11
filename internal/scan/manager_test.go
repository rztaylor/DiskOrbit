package scan

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/rztaylor/diskorbit/internal/filesystem"
	"github.com/rztaylor/diskorbit/internal/model"
	"github.com/rztaylor/diskorbit/internal/scanner"
)

func TestManagerObserverReceivesLifecycleSnapshots(t *testing.T) {
	t.Parallel()

	var mu sync.Mutex
	var states []State
	engine, _ := scanner.New(scanner.Config{Workers: 1, ProgressInterval: time.Hour})
	manager, err := NewManager(context.Background(), Config{
		Scanner: engine,
		Observer: func(snapshot Snapshot) {
			mu.Lock()
			states = append(states, snapshot.State)
			mu.Unlock()
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()

	started, err := manager.Start(context.Background(), StartRequest{Path: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Wait(context.Background(), started.ID); err != nil {
		t.Fatal(err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(states) != 2 || states[0] != StateScanning || states[1] != StateCompleted {
		t.Fatalf("observed states = %v, want [scanning completed]", states)
	}
}

func TestManagerCompletesAndExposesRevisionsAndNodes(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "data.bin"), make([]byte, 12), 0o600); err != nil {
		t.Fatal(err)
	}
	engine, _ := scanner.New(scanner.Config{Workers: 2, ProgressInterval: time.Millisecond})
	manager, err := NewManager(context.Background(), Config{Scanner: engine})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()

	started, err := manager.Start(context.Background(), StartRequest{Path: root})
	if err != nil {
		t.Fatalf("Start(): %v", err)
	}
	if started.State != StateScanning || started.Revision == 0 {
		t.Fatalf("started snapshot = %+v", started)
	}
	completed, err := manager.Wait(context.Background(), started.ID)
	if err != nil {
		t.Fatalf("Wait(): %v", err)
	}
	if completed.State != StateCompleted || completed.Progress.Files != 1 || completed.Progress.Bytes != 12 {
		t.Fatalf("completed snapshot = %+v", completed)
	}
	update, err := manager.Updates(started.ID, started.Revision)
	if err != nil || !update.Changed || update.Snapshot.State != StateCompleted {
		t.Fatalf("Updates() = %+v, %v", update, err)
	}
	unchanged, err := manager.Updates(started.ID, completed.Revision)
	if err != nil || unchanged.Changed || unchanged.Revision != completed.Revision {
		t.Fatalf("unchanged Updates() = %+v, %v", unchanged, err)
	}

	rootNode, err := manager.Node(started.ID, model.RootID)
	if err != nil || rootNode.Node.LogicalSize != 12 || rootNode.Path != filepath.Clean(root) {
		t.Fatalf("Node() = %+v, %v", rootNode, err)
	}
	children, err := manager.Children(started.ID, model.RootID, model.NoNode, 10)
	if err != nil || len(children.Nodes) != 1 || children.Nodes[0].Name != "data.bin" || children.More {
		t.Fatalf("Children() = %+v, %v", children, err)
	}
}

func TestManagerCapturesSelectedRootCapacity(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	var probedPath string
	engine, _ := scanner.New(scanner.Config{Workers: 1, ProgressInterval: time.Hour})
	manager, err := NewManager(context.Background(), Config{
		Scanner: engine,
		CapacityProbe: func(_ context.Context, path string) (Capacity, bool) {
			probedPath = path
			return Capacity{Total: 1000, Available: 250}, true
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()

	started, err := manager.Start(context.Background(), StartRequest{Path: root})
	if err != nil {
		t.Fatal(err)
	}
	if probedPath != filepath.Clean(root) || !started.CapacityKnown ||
		started.Capacity != (Capacity{Total: 1000, Available: 250}) {
		t.Fatalf("capacity probe path %q, snapshot %+v", probedPath, started)
	}
}

func TestManagerAllowsOnlyOneActiveScanAndCancels(t *testing.T) {
	t.Parallel()

	reader := &managerBlockingReader{entered: make(chan struct{})}
	engine, _ := scanner.New(scanner.Config{Reader: reader, Workers: 1, ProgressInterval: time.Hour})
	manager, _ := NewManager(context.Background(), Config{Scanner: engine})
	defer manager.Close()

	started, err := manager.Start(context.Background(), StartRequest{Path: "/root"})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-reader.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("scan reader did not start")
	}
	if _, err := manager.Start(context.Background(), StartRequest{Path: "/other"}); !errors.Is(err, ErrActiveScan) {
		t.Fatalf("second Start() error = %v, want ErrActiveScan", err)
	}
	cancelling, err := manager.Cancel(started.ID)
	if err != nil || cancelling.State != StateCancelling {
		t.Fatalf("Cancel() = %+v, %v", cancelling, err)
	}
	cancelled, err := manager.Wait(context.Background(), started.ID)
	if err != nil || cancelled.State != StateCancelled {
		t.Fatalf("Wait() = %+v, %v", cancelled, err)
	}
	if _, err := manager.Cancel(started.ID); !errors.Is(err, ErrScanNotRunning) {
		t.Fatalf("second Cancel() error = %v", err)
	}
}

func TestManagerRetainsBoundedCompletedScans(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	engine, _ := scanner.New(scanner.Config{Workers: 1, ProgressInterval: time.Hour})
	manager, _ := NewManager(context.Background(), Config{Scanner: engine, RetainResults: 2})
	defer manager.Close()
	var firstID string
	for index := 0; index < 3; index++ {
		started, err := manager.Start(context.Background(), StartRequest{Path: root})
		if err != nil {
			t.Fatal(err)
		}
		if index == 0 {
			firstID = started.ID
		}
		if _, err := manager.Wait(context.Background(), started.ID); err != nil {
			t.Fatal(err)
		}
	}
	if scans := manager.List(); len(scans) != 2 {
		t.Fatalf("retained scans = %d, want 2", len(scans))
	}
	if _, err := manager.Get(firstID); !errors.Is(err, ErrScanNotFound) {
		t.Fatalf("Get(first) error = %v, want ErrScanNotFound", err)
	}
}

type managerBlockingReader struct {
	entered chan struct{}
}

func (r *managerBlockingReader) Canonical(path string) (string, error) {
	return filepath.Clean(path), nil
}
func (r *managerBlockingReader) Stat(context.Context, string) (filesystem.Entry, error) {
	return filesystem.Entry{Name: "root", Kind: filesystem.KindDirectory}, nil
}
func (r *managerBlockingReader) ReadDir(ctx context.Context, _ string, _ filesystem.VisitFunc) error {
	close(r.entered)
	<-ctx.Done()
	return ctx.Err()
}
