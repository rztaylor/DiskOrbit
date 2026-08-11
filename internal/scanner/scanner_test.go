package scanner

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rztaylor/diskorbit/internal/filesystem"
	"github.com/rztaylor/diskorbit/internal/model"
)

func TestScanAggregatesWarningsLinksAndBoundaries(t *testing.T) {
	t.Parallel()

	root := filepath.Clean("/root")
	reader := &fakeReader{
		root: filesystem.Entry{Name: "root", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, Known: true}},
		entries: map[string][]fakeEntry{
			root: {
				{entry: filesystem.Entry{Name: "alpha", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, Known: true}}},
				{entry: filesystem.Entry{Name: "boundary", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 2, Known: true}}},
				{entry: filesystem.Entry{Name: "link", Kind: filesystem.KindSymlink, Size: 3, AllocatedKnown: true, AllocatedSize: 512}},
				{entry: filesystem.Entry{Name: "root.bin", Kind: filesystem.KindFile, Size: 10, AllocatedKnown: true, AllocatedSize: 4096}},
			},
			filepath.Join(root, "alpha"): {
				{entry: filesystem.Entry{Name: "nested.bin", Kind: filesystem.KindFile, Size: 5}},
				{entry: filesystem.Entry{Name: "vanished.bin", Kind: filesystem.KindFile}, err: errors.New("file disappeared")},
			},
		},
	}
	scan, err := New(Config{Reader: reader, Workers: 2, WarningLimit: 10, ProgressInterval: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := scan.Prepare(context.Background(), root, Options{})
	if err != nil {
		t.Fatalf("Prepare(): %v", err)
	}
	var observations []Progress
	result, err := prepared.Run(context.Background(), func(progress Progress) {
		observations = append(observations, progress)
	})
	if err != nil {
		t.Fatalf("Run(): %v", err)
	}

	rootNode, _ := result.Tree.Node(model.RootID)
	if rootNode.LogicalSize != 18 || rootNode.FileCount != 4 || rootNode.DirCount != 2 {
		t.Fatalf("root aggregates = %+v", rootNode)
	}
	if rootNode.AllocatedSize != 4608 || rootNode.Flags&model.FlagAllocatedSizeKnown != 0 {
		t.Fatalf("root allocated aggregate = %+v", rootNode)
	}
	if rootNode.Flags&model.FlagSubtreeComplete != 0 {
		t.Fatal("root with an incomplete metadata observation was marked complete")
	}
	if result.Progress.Files != 4 || result.Progress.Directories != 3 || result.Progress.Bytes != 18 || result.Progress.Warnings != 1 {
		t.Fatalf("progress = %+v", result.Progress)
	}
	if result.WarningTotal != 1 || result.WarningCounts.Metadata != 1 || len(result.Warnings) != 1 ||
		result.Warnings[0].Kind != WarningMetadata || result.Warnings[0].Operation != "stat" {
		t.Fatalf("warnings = %+v, total %d", result.Warnings, result.WarningTotal)
	}
	if reader.calls(filepath.Join(root, "boundary")) != 0 {
		t.Error("filesystem boundary was traversed")
	}
	if reader.calls(filepath.Join(root, "link")) != 0 {
		t.Error("symbolic link was traversed")
	}
	if len(observations) < 2 || observations[len(observations)-1] != result.Progress {
		t.Fatalf("progress callbacks = %+v", observations)
	}
}

func TestScanSuppressesRepeatedDirectoryIdentitiesWithoutDeduplicatingFiles(t *testing.T) {
	t.Parallel()

	root := filepath.Clean("/root")
	users := filepath.Join(root, "Users")
	system := filepath.Join(root, "System")
	volumes := filepath.Join(system, "Volumes")
	data := filepath.Join(volumes, "Data")
	dataUsers := filepath.Join(data, "Users")
	unique := filepath.Join(data, "unique")
	reader := &fakeReader{
		root: filesystem.Entry{Name: "root", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, File: 1, Known: true}},
		entries: map[string][]fakeEntry{
			root: {
				{entry: filesystem.Entry{Name: "Users", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, File: 2, Known: true}}},
				{entry: filesystem.Entry{Name: "System", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, File: 3, Known: true}}},
			},
			users: {
				{entry: filesystem.Entry{Name: "first.bin", Kind: filesystem.KindFile, Size: 100, Identity: filesystem.Identity{Device: 1, File: 20, Known: true}}},
				{entry: filesystem.Entry{Name: "second.bin", Kind: filesystem.KindFile, Size: 100, Identity: filesystem.Identity{Device: 1, File: 20, Known: true}}},
			},
			system:  {{entry: filesystem.Entry{Name: "Volumes", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, File: 4, Known: true}}}},
			volumes: {{entry: filesystem.Entry{Name: "Data", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, File: 5, Known: true}}}},
			data: {
				{entry: filesystem.Entry{Name: "Users", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, File: 2, Known: true}}},
				{entry: filesystem.Entry{Name: "unique", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, File: 6, Known: true}}},
			},
			dataUsers: {{entry: filesystem.Entry{Name: "duplicated.bin", Kind: filesystem.KindFile, Size: 200}}},
			unique:    {{entry: filesystem.Entry{Name: "metadata.bin", Kind: filesystem.KindFile, Size: 7}}},
		},
	}
	scan, _ := New(Config{Reader: reader, Workers: 4, ProgressInterval: time.Hour})
	prepared, _ := scan.Prepare(context.Background(), root, Options{})
	result, err := prepared.Run(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	rootNode, _ := result.Tree.Node(model.RootID)
	if rootNode.LogicalSize != 207 || rootNode.FileCount != 3 || rootNode.DirCount != 5 {
		t.Fatalf("root aggregates = %+v", rootNode)
	}
	if reader.calls(dataUsers) != 0 {
		t.Fatal("repeated Data/Users identity was traversed")
	}
	foundUnique := false
	if err := result.Tree.Walk(model.RootID, func(_ model.NodeView, path string) error {
		if path == dataUsers {
			t.Fatalf("repeated directory %q remained in the tree", path)
		}
		if path == unique {
			foundUnique = true
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if !foundUnique {
		t.Fatal("unique Data content was omitted with the repeated directory")
	}
}

func TestScanTraversesDirectoryIdentityUnderExplicitlySelectedAliasRoot(t *testing.T) {
	t.Parallel()

	root := filepath.Clean("/System/Volumes/Data")
	users := filepath.Join(root, "Users")
	reader := &fakeReader{
		root: filesystem.Entry{Name: "Data", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, File: 5, Known: true}},
		entries: map[string][]fakeEntry{
			root:  {{entry: filesystem.Entry{Name: "Users", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, File: 2, Known: true}}}},
			users: {{entry: filesystem.Entry{Name: "profile.bin", Kind: filesystem.KindFile, Size: 100}}},
		},
	}
	scan, _ := New(Config{Reader: reader, Workers: 2, ProgressInterval: time.Hour})
	prepared, _ := scan.Prepare(context.Background(), root, Options{})
	result, err := prepared.Run(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	rootNode, _ := result.Tree.Node(model.RootID)
	if rootNode.LogicalSize != 100 || rootNode.FileCount != 1 || rootNode.DirCount != 1 {
		t.Fatalf("root aggregates = %+v", rootNode)
	}
	if reader.calls(users) != 1 {
		t.Fatalf("selected Data root Users reads = %d, want 1", reader.calls(users))
	}
}

func TestScanDoesNotSuppressDirectoriesWithoutStableFileIdentities(t *testing.T) {
	t.Parallel()

	root := filepath.Clean("/root")
	alpha := filepath.Join(root, "alpha")
	beta := filepath.Join(root, "beta")
	reader := &fakeReader{
		root: filesystem.Entry{Name: "root", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, Known: true}},
		entries: map[string][]fakeEntry{
			root: {
				{entry: filesystem.Entry{Name: "alpha", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, Known: true}}},
				{entry: filesystem.Entry{Name: "beta", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, Known: true}}},
			},
			alpha: {{entry: filesystem.Entry{Name: "alpha.bin", Kind: filesystem.KindFile, Size: 1}}},
			beta:  {{entry: filesystem.Entry{Name: "beta.bin", Kind: filesystem.KindFile, Size: 2}}},
		},
	}
	scan, _ := New(Config{Reader: reader, Workers: 2, ProgressInterval: time.Hour})
	prepared, _ := scan.Prepare(context.Background(), root, Options{})
	result, err := prepared.Run(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	rootNode, _ := result.Tree.Node(model.RootID)
	if rootNode.LogicalSize != 3 || rootNode.FileCount != 2 || rootNode.DirCount != 2 {
		t.Fatalf("root aggregates = %+v", rootNode)
	}
	if reader.calls(alpha) != 1 || reader.calls(beta) != 1 {
		t.Fatalf("directory reads: alpha=%d beta=%d, want 1 each", reader.calls(alpha), reader.calls(beta))
	}
}

func TestScanCancellationWaitsForReader(t *testing.T) {
	t.Parallel()

	reader := &blockingReader{entered: make(chan struct{})}
	scan, err := New(Config{Reader: reader, Workers: 1, ProgressInterval: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := scan.Prepare(context.Background(), "/root", Options{})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		_, runErr := prepared.Run(ctx, nil)
		done <- runErr
	}()
	select {
	case <-reader.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("reader did not start")
	}
	cancel()
	select {
	case runErr := <-done:
		if !errors.Is(runErr, context.Canceled) {
			t.Fatalf("Run() error = %v, want context.Canceled", runErr)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("scan did not stop after cancellation")
	}
	rootNode, _ := prepared.Tree().Node(model.RootID)
	if rootNode.Flags&model.FlagSubtreeComplete != 0 {
		t.Fatal("cancelled root was marked complete")
	}
}

func TestScanConcurrencyNeverExceedsWorkerLimit(t *testing.T) {
	t.Parallel()

	reader := newConcurrencyReader(8)
	scan, err := New(Config{Reader: reader, Workers: 3, ProgressInterval: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := scan.Prepare(context.Background(), "/root", Options{})
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		_, runErr := prepared.Run(context.Background(), nil)
		done <- runErr
	}()
	for count := 0; count < 3; count++ {
		select {
		case <-reader.entered:
		case <-time.After(2 * time.Second):
			t.Fatal("expected three concurrent directory readers")
		}
	}
	close(reader.release)
	if runErr := <-done; runErr != nil {
		t.Fatalf("Run(): %v", runErr)
	}
	if maximum := reader.maximum.Load(); maximum != 3 {
		t.Fatalf("maximum concurrency = %d, want 3", maximum)
	}
}

func TestScanWarningRetentionIsBounded(t *testing.T) {
	t.Parallel()

	root := filepath.Clean("/root")
	entries := make([]fakeEntry, 10)
	for index := range entries {
		entries[index] = fakeEntry{entry: filesystem.Entry{Name: fmt.Sprintf("file-%d", index), Kind: filesystem.KindFile}, err: errors.New("stat failed")}
	}
	reader := &fakeReader{
		root:    filesystem.Entry{Name: "root", Kind: filesystem.KindDirectory},
		entries: map[string][]fakeEntry{root: entries},
	}
	scan, _ := New(Config{Reader: reader, Workers: 1, WarningLimit: 2, ProgressInterval: time.Hour})
	prepared, _ := scan.Prepare(context.Background(), root, Options{})
	result, err := prepared.Run(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.WarningTotal != 10 || len(result.Warnings) != 2 {
		t.Fatalf("retained %d of %d warnings, want 2 of 10", len(result.Warnings), result.WarningTotal)
	}
}

func TestLocalFilesystemIntegration(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "nested"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "root.bin"), make([]byte, 7), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "nested", "child.bin"), make([]byte, 11), 0o600); err != nil {
		t.Fatal(err)
	}
	scan, _ := New(Config{Workers: 2, ProgressInterval: time.Hour})
	prepared, err := scan.Prepare(context.Background(), root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	result, err := prepared.Run(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	rootNode, _ := result.Tree.Node(model.RootID)
	if rootNode.LogicalSize != 18 || rootNode.FileCount != 2 || rootNode.DirCount != 1 {
		t.Fatalf("root aggregates = %+v", rootNode)
	}
	if rootNode.Flags&model.FlagSubtreeComplete == 0 {
		t.Fatal("successfully scanned root was not marked complete")
	}
	children, _, _, err := result.Tree.Children(model.RootID, model.NoNode, 10)
	if err != nil {
		t.Fatal(err)
	}
	for _, child := range children {
		if child.Kind == model.KindDirectory && child.Flags&model.FlagSubtreeComplete == 0 {
			t.Fatalf("successfully scanned directory was not marked complete: %+v", child)
		}
	}
}

func TestLocalFilesystemScansDirectoryRootAlias(t *testing.T) {
	t.Parallel()

	parent := t.TempDir()
	target := filepath.Join(parent, "target")
	alias := filepath.Join(parent, "volume-alias")
	if err := os.Mkdir(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "data.bin"), make([]byte, 7), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, alias); err != nil {
		t.Skipf("directory symlinks unavailable: %v", err)
	}

	scan, err := New(Config{Workers: 1, ProgressInterval: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := scan.Prepare(context.Background(), alias, Options{})
	if err != nil {
		t.Fatalf("Prepare() directory alias: %v", err)
	}
	if prepared.RootPath() != filepath.Clean(alias) {
		t.Fatalf("RootPath() = %q, want selected alias %q", prepared.RootPath(), filepath.Clean(alias))
	}
	result, err := prepared.Run(context.Background(), nil)
	if err != nil {
		t.Fatalf("Run() directory alias: %v", err)
	}
	rootNode, _ := result.Tree.Node(model.RootID)
	if rootNode.Name != filepath.Base(alias) || rootNode.LogicalSize != 7 || rootNode.FileCount != 1 {
		t.Fatalf("root node = %+v", rootNode)
	}
}

func TestScanExposesSubtreeCompletionProgressively(t *testing.T) {
	t.Parallel()

	reader := &subtreeBlockingReader{entered: make(chan struct{}), release: make(chan struct{})}
	scan, _ := New(Config{Reader: reader, Workers: 2, ProgressInterval: time.Millisecond})
	prepared, err := scan.Prepare(context.Background(), "/root", Options{})
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		_, runErr := prepared.Run(context.Background(), nil)
		done <- runErr
	}()
	select {
	case <-reader.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("nested directory did not start")
	}
	root, _ := prepared.Tree().Node(model.RootID)
	children, _, _, err := prepared.Tree().Children(model.RootID, model.NoNode, 10)
	if err != nil || len(children) != 1 {
		t.Fatalf("progressive children = %+v, %v", children, err)
	}
	if root.Flags&model.FlagSubtreeComplete != 0 || children[0].Flags&model.FlagSubtreeComplete != 0 {
		t.Fatalf("active subtree was marked complete: root=%+v child=%+v", root, children[0])
	}
	close(reader.release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	root, _ = prepared.Tree().Node(model.RootID)
	child, _ := prepared.Tree().Node(children[0].ID)
	if root.Flags&model.FlagSubtreeComplete == 0 || child.Flags&model.FlagSubtreeComplete == 0 {
		t.Fatalf("finished subtree remained incomplete: root=%+v child=%+v", root, child)
	}
}

func TestFilesystemBoundaryIsStableWithoutClaimingItsSubtreeWasScanned(t *testing.T) {
	t.Parallel()

	root := filepath.Clean("/root")
	reader := &fakeReader{
		root: filesystem.Entry{Name: "root", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 1, Known: true}},
		entries: map[string][]fakeEntry{root: {{entry: filesystem.Entry{
			Name: "boundary", Kind: filesystem.KindDirectory, Identity: filesystem.Identity{Device: 2, Known: true},
		}}}},
	}
	scan, _ := New(Config{Reader: reader, Workers: 1, ProgressInterval: time.Hour})
	prepared, _ := scan.Prepare(context.Background(), root, Options{})
	result, err := prepared.Run(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	rootNode, _ := result.Tree.Node(model.RootID)
	children, _, _, _ := result.Tree.Children(model.RootID, model.NoNode, 10)
	if rootNode.Flags&model.FlagSubtreeComplete == 0 {
		t.Fatal("root was not complete under the selected boundary policy")
	}
	if len(children) != 1 || children[0].Flags&model.FlagSubtreeComplete != 0 {
		t.Fatalf("untraversed boundary was marked complete: %+v", children)
	}
}

func TestPrepareRejectsFilesAndWorkerLimits(t *testing.T) {
	t.Parallel()

	if _, err := New(Config{Workers: MaximumWorkers + 1}); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatalf("New() error = %v", err)
	}
	reader := &fakeReader{root: filesystem.Entry{Name: "file", Kind: filesystem.KindFile}}
	scan, _ := New(Config{Reader: reader})
	if _, err := scan.Prepare(context.Background(), "/file", Options{}); !errors.Is(err, ErrInvalidRoot) {
		t.Fatalf("Prepare() error = %v, want ErrInvalidRoot", err)
	}
}

type fakeEntry struct {
	entry filesystem.Entry
	err   error
}

type fakeReader struct {
	root    filesystem.Entry
	entries map[string][]fakeEntry
	mu      sync.Mutex
	reads   map[string]int
}

func (r *fakeReader) Canonical(path string) (string, error) { return filepath.Clean(path), nil }

func (r *fakeReader) Stat(context.Context, string) (filesystem.Entry, error) { return r.root, nil }

func (r *fakeReader) ReadDir(ctx context.Context, path string, visit filesystem.VisitFunc) error {
	r.mu.Lock()
	if r.reads == nil {
		r.reads = make(map[string]int)
	}
	r.reads[path]++
	entries := append([]fakeEntry(nil), r.entries[path]...)
	r.mu.Unlock()
	for _, item := range entries {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := visit(item.entry, item.err); err != nil {
			return err
		}
	}
	return nil
}

func (r *fakeReader) calls(path string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.reads[path]
}

type blockingReader struct {
	entered chan struct{}
}

type subtreeBlockingReader struct {
	entered chan struct{}
	release chan struct{}
}

func (r *subtreeBlockingReader) Canonical(path string) (string, error) {
	return filepath.Clean(path), nil
}
func (r *subtreeBlockingReader) Stat(context.Context, string) (filesystem.Entry, error) {
	return filesystem.Entry{Name: "root", Kind: filesystem.KindDirectory}, nil
}
func (r *subtreeBlockingReader) ReadDir(ctx context.Context, path string, visit filesystem.VisitFunc) error {
	if path == filepath.Clean("/root") {
		return visit(filesystem.Entry{Name: "nested", Kind: filesystem.KindDirectory}, nil)
	}
	close(r.entered)
	select {
	case <-r.release:
		return visit(filesystem.Entry{Name: "done.bin", Kind: filesystem.KindFile, Size: 1}, nil)
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (r *blockingReader) Canonical(path string) (string, error) { return filepath.Clean(path), nil }
func (r *blockingReader) Stat(context.Context, string) (filesystem.Entry, error) {
	return filesystem.Entry{Name: "root", Kind: filesystem.KindDirectory}, nil
}
func (r *blockingReader) ReadDir(ctx context.Context, _ string, _ filesystem.VisitFunc) error {
	close(r.entered)
	<-ctx.Done()
	return ctx.Err()
}

type concurrencyReader struct {
	rootEntries []filesystem.Entry
	entered     chan struct{}
	release     chan struct{}
	active      atomic.Int64
	maximum     atomic.Int64
}

func newConcurrencyReader(directoryCount int) *concurrencyReader {
	entries := make([]filesystem.Entry, directoryCount)
	for index := range entries {
		entries[index] = filesystem.Entry{Name: fmt.Sprintf("dir-%02d", index), Kind: filesystem.KindDirectory}
	}
	return &concurrencyReader{rootEntries: entries, entered: make(chan struct{}, directoryCount), release: make(chan struct{})}
}

func (r *concurrencyReader) Canonical(path string) (string, error) { return filepath.Clean(path), nil }
func (r *concurrencyReader) Stat(context.Context, string) (filesystem.Entry, error) {
	return filesystem.Entry{Name: "root", Kind: filesystem.KindDirectory}, nil
}
func (r *concurrencyReader) ReadDir(ctx context.Context, path string, visit filesystem.VisitFunc) error {
	if path == filepath.Clean("/root") {
		for _, entry := range r.rootEntries {
			if err := visit(entry, nil); err != nil {
				return err
			}
		}
		return nil
	}
	active := r.active.Add(1)
	for {
		maximum := r.maximum.Load()
		if active <= maximum || r.maximum.CompareAndSwap(maximum, active) {
			break
		}
	}
	r.entered <- struct{}{}
	select {
	case <-r.release:
	case <-ctx.Done():
	}
	r.active.Add(-1)
	return ctx.Err()
}
