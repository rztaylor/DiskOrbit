package report

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/rztaylor/diskorbit/internal/model"
	"github.com/rztaylor/diskorbit/internal/scan"
	"github.com/rztaylor/diskorbit/internal/scanner"
)

func TestReportsAreBoundedSortedAndSubtreeScoped(t *testing.T) {
	t.Parallel()
	service := testService(t, scan.StateCompleted)

	summary, err := service.Summary("scan-1", 0)
	if err != nil || summary.LogicalSize != 160 || summary.Files != 4 || summary.AllocatedSize == nil {
		t.Fatalf("Summary() = %+v, %v", summary, err)
	}
	largest, err := service.LargestFiles("scan-1", 0, 2)
	if err != nil || len(largest) != 2 || largest[0].Name != "movie.mp4" || largest[1].Name != "archive.zip" {
		t.Fatalf("LargestFiles() = %+v, %v", largest, err)
	}
	extensions, err := service.Extensions("scan-1", 0, 2)
	if err != nil || len(extensions.Entries) != 3 || extensions.Entries[0].Extension != ".mp4" || !extensions.Truncated {
		t.Fatalf("Extensions() = %+v, %v", extensions, err)
	}
	subtree, err := service.LargestFiles("scan-1", 1, 10)
	if err != nil || len(subtree) != 2 || !strings.Contains(subtree[0].Path, "/media/") {
		t.Fatalf("subtree LargestFiles() = %+v, %v", subtree, err)
	}
}

func TestExportsStreamValidJSONAndCSV(t *testing.T) {
	t.Parallel()
	service := testService(t, scan.StateCompleted)
	var jsonOutput bytes.Buffer
	if err := service.WriteJSON(&jsonOutput, "scan-1", 0); err != nil {
		t.Fatal(err)
	}
	var payload struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if err := json.Unmarshal(jsonOutput.Bytes(), &payload); err != nil || len(payload.Nodes) != 6 {
		t.Fatalf("JSON export nodes = %d, error %v, body %s", len(payload.Nodes), err, jsonOutput.String())
	}

	var csvOutput bytes.Buffer
	if err := service.WriteCSV(&csvOutput, "scan-1", 0); err != nil {
		t.Fatal(err)
	}
	records, err := csv.NewReader(strings.NewReader(csvOutput.String())).ReadAll()
	if err != nil || len(records) != 7 || records[0][2] != "path" {
		t.Fatalf("CSV records = %d, error %v", len(records), err)
	}
}

func TestReportsRejectActiveScans(t *testing.T) {
	t.Parallel()
	service := testService(t, scan.StateScanning)
	if _, err := service.Summary("scan-1", 0); !errors.Is(err, scan.ErrScanNotComplete) {
		t.Fatalf("Summary() error = %v", err)
	}
}

func testService(t *testing.T, state scan.State) *Service {
	t.Helper()
	tree := model.NewTree("/root", "root", time.Time{})
	media, _ := tree.Add(0, model.NodeSpec{Name: "media", Kind: model.KindDirectory})
	_, _ = tree.Add(media, model.NodeSpec{Name: "movie.mp4", Kind: model.KindFile, LogicalSize: 80, AllocatedSize: 4096, Flags: model.FlagAllocatedSizeKnown})
	_, _ = tree.Add(media, model.NodeSpec{Name: "photo.jpg", Kind: model.KindFile, LogicalSize: 20, AllocatedSize: 4096, Flags: model.FlagAllocatedSizeKnown})
	_, _ = tree.Add(0, model.NodeSpec{Name: "archive.zip", Kind: model.KindFile, LogicalSize: 50, AllocatedSize: 4096, Flags: model.FlagAllocatedSizeKnown})
	_, _ = tree.Add(0, model.NodeSpec{Name: "README", Kind: model.KindFile, LogicalSize: 10, AllocatedSize: 4096, Flags: model.FlagAllocatedSizeKnown})
	source := &fakeSource{tree: tree, snapshot: scan.Snapshot{ID: "scan-1", State: state, Progress: scanner.Progress{Warnings: 2}}}
	service, err := New(source)
	if err != nil {
		t.Fatal(err)
	}
	return service
}

type fakeSource struct {
	tree     *model.Tree
	snapshot scan.Snapshot
}

func (s *fakeSource) Get(string) (scan.Snapshot, error) { return s.snapshot, nil }
func (s *fakeSource) Node(_ string, id model.NodeID) (scan.NodeResult, error) {
	node, ok := s.tree.Node(id)
	if !ok {
		return scan.NodeResult{}, model.ErrInvalidNode
	}
	path, _ := s.tree.Path(id)
	return scan.NodeResult{Node: node, Path: path}, nil
}
func (s *fakeSource) Walk(_ string, root model.NodeID, visit func(model.NodeView, string) error) error {
	return s.tree.Walk(root, visit)
}
