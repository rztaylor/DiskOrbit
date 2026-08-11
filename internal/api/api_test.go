package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/rztaylor/diskorbit/internal/buildinfo"
	"github.com/rztaylor/diskorbit/internal/filesystem"
	"github.com/rztaylor/diskorbit/internal/model"
	"github.com/rztaylor/diskorbit/internal/platform"
	"github.com/rztaylor/diskorbit/internal/report"
	"github.com/rztaylor/diskorbit/internal/scan"
	"github.com/rztaylor/diskorbit/internal/scanner"
	"github.com/rztaylor/diskorbit/internal/settings"
)

func TestStatus(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	recorder := httptest.NewRecorder()
	New(Options{Build: buildinfo.Info{Version: "test", Commit: "abc", BuildDate: "today"}}).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
	var body struct {
		Name   string         `json:"name"`
		Status string         `json:"status"`
		Build  buildinfo.Info `json:"build"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Name != "DiskOrbit" || body.Status != "ok" || body.Build.Version != "test" {
		t.Fatalf("unexpected response: %+v", body)
	}
}

func TestStatusRejectsOtherMethods(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodPost, "/api/status", nil)
	recorder := httptest.NewRecorder()
	New(Options{}).ServeHTTP(recorder, request)
	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusMethodNotAllowed)
	}
}

func TestSettingsAPIReadsAndPersistsValidatedPreferences(t *testing.T) {
	t.Parallel()
	store, err := settings.NewStore(filepath.Join(t.TempDir(), "settings.json"))
	if err != nil {
		t.Fatal(err)
	}
	handler := New(Options{Settings: store})

	get := serveJSON(t, handler, http.MethodGet, "/api/settings", "")
	if get.Code != http.StatusOK || !strings.Contains(get.Body.String(), `"value":{"version":1`) ||
		!strings.Contains(get.Body.String(), `"defaults":{"version":1`) ||
		!strings.Contains(get.Body.String(), `"nodeBudget":4000`) ||
		!strings.Contains(get.Body.String(), `"minimumArcDegrees":0.75`) ||
		!strings.Contains(get.Body.String(), `"singleColour":"#3bb5a1"`) ||
		!strings.Contains(get.Body.String(), `"sizeLargeColour":"#750000"`) ||
		!strings.Contains(get.Body.String(), `"sizeSmallColour":"#e1ff00"`) ||
		strings.Contains(get.Body.String(), `"minimumSegmentPercent"`) ||
		strings.Contains(get.Body.String(), `"primaryColour"`) ||
		strings.Contains(get.Body.String(), `"secondaryColour"`) ||
		!strings.Contains(get.Body.String(), `"theme":"system"`) {
		t.Fatalf("default settings = %d %s", get.Code, get.Body.String())
	}

	updated := settings.Defaults()
	updated.Theme = "dark"
	updated.Chart.MaximumDepth = 10
	updated.Chart.ShowFiles = false
	updated.Chart.SingleColour = "#123456"
	updated.Chart.SizeLargeColour = "#abcdef"
	updated.Chart.SizeSmallColour = "#654321"
	body, err := json.Marshal(mapSettings(updated))
	if err != nil {
		t.Fatal(err)
	}
	put := serveJSON(t, handler, http.MethodPut, "/api/settings", string(body))
	if put.Code != http.StatusOK || !strings.Contains(put.Body.String(), `"maximumDepth":10`) {
		t.Fatalf("saved settings = %d %s", put.Code, put.Body.String())
	}
	persisted, err := store.Get()
	if err != nil || persisted.Theme != "dark" || persisted.Chart.MaximumDepth != 10 || persisted.Chart.ShowFiles ||
		persisted.Chart.SingleColour != "#123456" || persisted.Chart.SizeLargeColour != "#abcdef" ||
		persisted.Chart.SizeSmallColour != "#654321" {
		t.Fatalf("persisted settings = %+v, %v", persisted, err)
	}

	get = serveJSON(t, handler, http.MethodGet, "/api/settings", "")
	if !strings.Contains(get.Body.String(), `"value":{"version":1,"theme":"dark"`) ||
		!strings.Contains(get.Body.String(), `"defaults":{"version":1,"theme":"system"`) ||
		!strings.Contains(get.Body.String(), `"singleColour":"#3bb5a1"`) {
		t.Fatalf("saved settings and application defaults = %d %s", get.Code, get.Body.String())
	}
}

func TestSettingsAPIRejectsMalformedAndOutOfRangeValues(t *testing.T) {
	t.Parallel()
	store, err := settings.NewStore(filepath.Join(t.TempDir(), "settings.json"))
	if err != nil {
		t.Fatal(err)
	}
	handler := New(Options{Settings: store})
	unknown := serveJSON(t, handler, http.MethodPut, "/api/settings", `{"surprise":true}`)
	if unknown.Code != http.StatusBadRequest || !strings.Contains(unknown.Body.String(), `"code":"invalid_request"`) {
		t.Fatalf("unknown settings = %d %s", unknown.Code, unknown.Body.String())
	}

	value := mapSettings(settings.Defaults())
	value.Chart.NodeBudget = 100
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	invalid := serveJSON(t, handler, http.MethodPut, "/api/settings", string(body))
	if invalid.Code != http.StatusBadRequest || !strings.Contains(invalid.Body.String(), `"code":"invalid_settings"`) {
		t.Fatalf("invalid settings = %d %s", invalid.Code, invalid.Body.String())
	}
}

func TestScanLifecycleAndBoundedNodeAPI(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "first.dng"), make([]byte, 7), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "second.jpg"), make([]byte, 11), 0o600); err != nil {
		t.Fatal(err)
	}
	manager := newTestManager(t)
	handler := New(Options{Scans: manager})

	started := serveJSON(t, handler, http.MethodPost, "/api/scans", `{"path":`+quoted(root)+`,"metric":"logical"}`)
	if started.Code != http.StatusAccepted || started.Header().Get("Location") == "" {
		t.Fatalf("start status = %d, location = %q, body = %s", started.Code, started.Header().Get("Location"), started.Body.String())
	}
	var startBody scanResponse
	decodeRecorder(t, started, &startBody)
	if startBody.ID == "" || startBody.State != scan.StateScanning {
		t.Fatalf("start response = %+v", startBody)
	}
	if _, err := manager.Wait(context.Background(), startBody.ID); err != nil {
		t.Fatal(err)
	}

	update := serveJSON(t, handler, http.MethodGet, "/api/scans/"+startBody.ID+"/updates?after="+strconvFormat(startBody.Revision), "")
	if update.Code != http.StatusOK || !strings.Contains(update.Body.String(), `"changed":true`) || !strings.Contains(update.Body.String(), `"state":"completed"`) {
		t.Fatalf("update = %d %s", update.Code, update.Body.String())
	}

	rootNode := serveJSON(t, handler, http.MethodGet, "/api/scans/"+startBody.ID+"/nodes/0", "")
	if rootNode.Code != http.StatusOK {
		t.Fatalf("root node = %d %s", rootNode.Code, rootNode.Body.String())
	}
	var rootBody nodeResponse
	decodeRecorder(t, rootNode, &rootBody)
	if rootBody.ParentID != nil || rootBody.LogicalSize != 18 || rootBody.AllocatedSize == nil ||
		rootBody.Path != filepath.Clean(root) || !rootBody.Flags.SubtreeComplete ||
		rootBody.DominantFileType == nil || rootBody.DominantFileType.Category != "image" ||
		rootBody.DominantFileType.LogicalSize != 18 {
		t.Fatalf("root response = %+v", rootBody)
	}

	pageOne := serveJSON(t, handler, http.MethodGet, "/api/scans/"+startBody.ID+"/nodes/0/children?limit=1", "")
	var firstPage struct {
		Nodes     []nodeResponse `json:"nodes"`
		NextAfter *uint32        `json:"nextAfter"`
		More      bool           `json:"more"`
	}
	decodeRecorder(t, pageOne, &firstPage)
	if len(firstPage.Nodes) != 1 || firstPage.NextAfter == nil || !firstPage.More ||
		filepath.Dir(firstPage.Nodes[0].Path) != filepath.Clean(root) || !firstPage.Nodes[0].Flags.SubtreeComplete {
		t.Fatalf("first page = %+v", firstPage)
	}
	pageTwo := serveJSON(t, handler, http.MethodGet, "/api/scans/"+startBody.ID+"/nodes/0/children?limit=1&after="+strconvFormat(uint64(*firstPage.NextAfter)), "")
	if pageTwo.Code != http.StatusOK || !strings.Contains(pageTwo.Body.String(), `"more":false`) {
		t.Fatalf("second page = %d %s", pageTwo.Code, pageTwo.Body.String())
	}
}

func TestScanAPIValidatesRequestsAndMapsErrors(t *testing.T) {
	t.Parallel()

	manager := newTestManager(t)
	handler := New(Options{Scans: manager})
	tests := []struct {
		name, method, path, body, code string
		status                         int
	}{
		{name: "unknown field", method: http.MethodPost, path: "/api/scans", body: `{"path":".","surprise":true}`, status: http.StatusBadRequest, code: "invalid_request"},
		{name: "missing path", method: http.MethodPost, path: "/api/scans", body: `{}`, status: http.StatusBadRequest, code: "invalid_path"},
		{name: "unsupported metric", method: http.MethodPost, path: "/api/scans", body: `{"path":".","metric":"allocated"}`, status: http.StatusBadRequest, code: "invalid_metric"},
		{name: "bad node", method: http.MethodGet, path: "/api/scans/missing/nodes/nope", status: http.StatusBadRequest, code: "invalid_node"},
		{name: "missing scan", method: http.MethodGet, path: "/api/scans/missing", status: http.StatusNotFound, code: "not_found"},
		{name: "oversized limit", method: http.MethodGet, path: "/api/scans/missing/nodes/0/children?limit=501", status: http.StatusBadRequest, code: "invalid_limit"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := serveJSON(t, handler, test.method, test.path, test.body)
			if recorder.Code != test.status || !strings.Contains(recorder.Body.String(), `"code":"`+test.code+`"`) {
				t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestScanAPIUnavailableWithoutManager(t *testing.T) {
	t.Parallel()
	recorder := serveJSON(t, New(Options{}), http.MethodGet, "/api/scans", "")
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusServiceUnavailable)
	}
}

func TestScanResponseMapsCoverageAndOnlyValidKnownCapacity(t *testing.T) {
	t.Parallel()

	mapped := mapScan(scan.Snapshot{
		CapacityKnown: true,
		Capacity:      scan.Capacity{Total: 1000, Available: 250},
		WarningCounts: scanner.WarningCounts{Permission: 3, Changed: 1},
		Warnings: []scanner.Warning{{
			Kind: scanner.WarningPermission, Path: "/protected", Operation: "read_directory", Message: "operation not permitted",
		}},
	})
	if mapped.Capacity == nil || mapped.Capacity.Total != 1000 || mapped.Capacity.Available != 250 {
		t.Fatalf("mapped capacity = %+v", mapped.Capacity)
	}
	if mapped.WarningCounts.Permission != 3 || mapped.WarningCounts.Changed != 1 || len(mapped.Warnings) != 1 ||
		mapped.Warnings[0].Kind != string(scanner.WarningPermission) {
		t.Fatalf("mapped warning coverage = counts %+v, samples %+v", mapped.WarningCounts, mapped.Warnings)
	}
	invalid := mapScan(scan.Snapshot{
		CapacityKnown: true,
		Capacity:      scan.Capacity{Total: 1000, Available: 1001},
	})
	if invalid.Capacity != nil {
		t.Fatalf("invalid capacity was exposed: %+v", invalid.Capacity)
	}
}

func TestHostAPIListsScanTargetsAndRevealsOnlyScanNodes(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "item.bin"), []byte("data"), 0o600); err != nil {
		t.Fatal(err)
	}
	manager := newTestManager(t)
	started, err := manager.Start(context.Background(), scan.StartRequest{Path: root})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Wait(context.Background(), started.ID); err != nil {
		t.Fatal(err)
	}
	host := &recordingHost{targets: []platform.ScanTarget{{Path: "/", Name: "Root", Kind: platform.ScanTargetLocalVolume, Filesystem: "testfs"}}}
	handler := New(Options{Scans: manager, Host: host})

	targets := serveJSON(t, handler, http.MethodGet, "/api/system/scan-targets", "")
	if targets.Code != http.StatusOK || !strings.Contains(targets.Body.String(), `"kind":"local-volume"`) ||
		!strings.Contains(targets.Body.String(), `"filesystem":"testfs"`) {
		t.Fatalf("targets = %d %s", targets.Code, targets.Body.String())
	}
	children, err := manager.Children(started.ID, 0, model.NoNode, 10)
	if err != nil || len(children.Nodes) != 1 {
		t.Fatalf("children = %+v, %v", children, err)
	}
	reveal := serveJSON(t, handler, http.MethodPost, fmt.Sprintf("/api/scans/%s/nodes/%d/reveal", started.ID, children.Nodes[0].ID), "")
	if reveal.Code != http.StatusNoContent || host.revealed != filepath.Join(root, "item.bin") {
		t.Fatalf("reveal = %d %s, path %q", reveal.Code, reveal.Body.String(), host.revealed)
	}
	missing := serveJSON(t, handler, http.MethodPost, "/api/scans/missing/nodes/0/reveal", "")
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing reveal = %d %s", missing.Code, missing.Body.String())
	}
}

func TestDirectoryAPIListsOnlyDirectChildFolders(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	for _, name := range []string{"Alpha", ".hidden"} {
		if err := os.Mkdir(filepath.Join(root, name), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "file.txt"), []byte("ignored"), 0o600); err != nil {
		t.Fatal(err)
	}
	handler := New(Options{Directories: filesystem.Local{}})

	response := serveJSON(t, handler, http.MethodPost, "/api/system/directories", `{"path":`+quoted(root)+`}`)
	if response.Code != http.StatusOK {
		t.Fatalf("directory response = %d %s", response.Code, response.Body.String())
	}
	var listing directoryListingResponse
	decodeRecorder(t, response, &listing)
	if listing.Path != filepath.Clean(root) || len(listing.Directories) != 1 || listing.Truncated {
		t.Fatalf("directory listing = %+v", listing)
	}
	if listing.Directories[0].Name != "Alpha" || strings.Contains(response.Body.String(), ".hidden") || strings.Contains(response.Body.String(), "file.txt") {
		t.Fatalf("directory entries = %+v", listing.Directories)
	}

	response = serveJSON(t, handler, http.MethodPost, "/api/system/directories", `{"path":`+quoted(root)+`,"showHidden":true}`)
	if response.Code != http.StatusOK {
		t.Fatalf("directory response with hidden folders = %d %s", response.Code, response.Body.String())
	}
	decodeRecorder(t, response, &listing)
	if len(listing.Directories) != 2 || listing.Directories[0].Name != ".hidden" {
		t.Fatalf("directory entries with hidden folders = %+v", listing.Directories)
	}
}

func TestDirectoryAPIMapsInvalidAndUnavailableLocations(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	file := filepath.Join(root, "file.txt")
	if err := os.WriteFile(file, []byte("file"), 0o600); err != nil {
		t.Fatal(err)
	}
	handler := New(Options{Directories: filesystem.Local{}})
	tests := []struct {
		name   string
		body   string
		status int
		code   string
	}{
		{name: "missing path", body: `{}`, status: http.StatusBadRequest, code: "invalid_path"},
		{name: "file", body: `{"path":` + quoted(file) + `}`, status: http.StatusBadRequest, code: "invalid_directory"},
		{name: "missing directory", body: `{"path":` + quoted(filepath.Join(root, "missing")) + `}`, status: http.StatusNotFound, code: "directory_not_found"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := serveJSON(t, handler, http.MethodPost, "/api/system/directories", test.body)
			if response.Code != test.status || !strings.Contains(response.Body.String(), `"code":"`+test.code+`"`) {
				t.Fatalf("response = %d %s", response.Code, response.Body.String())
			}
		})
	}

	unavailable := serveJSON(t, New(Options{}), http.MethodPost, "/api/system/directories", `{"path":"/"}`)
	if unavailable.Code != http.StatusServiceUnavailable || !strings.Contains(unavailable.Body.String(), `"code":"directory_browser_unavailable"`) {
		t.Fatalf("unavailable response = %d %s", unavailable.Code, unavailable.Body.String())
	}
}

func TestReportAPIAndStreamingExports(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "large.iso"), make([]byte, 20), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "small.txt"), make([]byte, 5), 0o600); err != nil {
		t.Fatal(err)
	}
	manager := newTestManager(t)
	reports, err := report.New(manager)
	if err != nil {
		t.Fatal(err)
	}
	started, err := manager.Start(context.Background(), scan.StartRequest{Path: root})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Wait(context.Background(), started.ID); err != nil {
		t.Fatal(err)
	}
	handler := New(Options{Scans: manager, Reports: reports})

	for _, path := range []string{
		fmt.Sprintf("/api/scans/%s/reports/summary?root=0", started.ID),
		fmt.Sprintf("/api/scans/%s/reports/largest-files?root=0&limit=1", started.ID),
		fmt.Sprintf("/api/scans/%s/reports/extensions?root=0&limit=10", started.ID),
	} {
		response := serveJSON(t, handler, http.MethodGet, path, "")
		if response.Code != http.StatusOK {
			t.Fatalf("GET %s = %d %s", path, response.Code, response.Body.String())
		}
	}
	jsonExport := serveJSON(t, handler, http.MethodGet, fmt.Sprintf("/api/scans/%s/export?root=0&format=json", started.ID), "")
	if jsonExport.Code != http.StatusOK || !strings.Contains(jsonExport.Header().Get("Content-Disposition"), ".json") || !json.Valid(jsonExport.Body.Bytes()) {
		t.Fatalf("JSON export = %d, %q, %s", jsonExport.Code, jsonExport.Header().Get("Content-Disposition"), jsonExport.Body.String())
	}
	csvExport := serveJSON(t, handler, http.MethodGet, fmt.Sprintf("/api/scans/%s/export?root=0&format=csv", started.ID), "")
	if csvExport.Code != http.StatusOK || !strings.Contains(csvExport.Body.String(), "logical_size") {
		t.Fatalf("CSV export = %d %s", csvExport.Code, csvExport.Body.String())
	}
	invalid := serveJSON(t, handler, http.MethodGet, fmt.Sprintf("/api/scans/%s/export?format=xml", started.ID), "")
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid export = %d %s", invalid.Code, invalid.Body.String())
	}
}

func newTestManager(t *testing.T) *scan.Manager {
	t.Helper()
	engine, err := scanner.New(scanner.Config{Workers: 1, ProgressInterval: time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	manager, err := scan.NewManager(context.Background(), scan.Config{Scanner: engine})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(manager.Close)
	return manager
}

func serveJSON(t *testing.T, handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func decodeRecorder(t *testing.T, recorder *httptest.ResponseRecorder, target any) {
	t.Helper()
	if err := json.NewDecoder(recorder.Body).Decode(target); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

func quoted(value string) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

func strconvFormat(value uint64) string {
	return fmt.Sprintf("%d", value)
}

type recordingHost struct {
	targets  []platform.ScanTarget
	revealed string
}

func (h *recordingHost) ScanTargets(context.Context) ([]platform.ScanTarget, error) {
	return h.targets, nil
}
func (h *recordingHost) Reveal(_ context.Context, path string) error {
	h.revealed = path
	return nil
}
