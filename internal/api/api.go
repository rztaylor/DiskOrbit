package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
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

const (
	maximumRequestBytes  = 16 << 10
	defaultPageLimit     = 100
	maximumPageLimit     = 500
	directoryBrowseLimit = 500
)

// ScanService is the bounded process-local scan surface required by HTTP.
type ScanService interface {
	Start(context.Context, scan.StartRequest) (scan.Snapshot, error)
	Get(string) (scan.Snapshot, error)
	List() []scan.Snapshot
	Updates(string, uint64) (scan.Update, error)
	Cancel(string) (scan.Snapshot, error)
	Node(string, model.NodeID) (scan.NodeResult, error)
	Children(string, model.NodeID, model.NodeID, int) (scan.ChildrenResult, error)
}

// HostService is the narrow platform surface exposed through authenticated API requests.
type HostService interface {
	ScanTargets(context.Context) ([]platform.ScanTarget, error)
	Reveal(context.Context, string) error
}

// DirectoryService is the bounded read-only filesystem surface required by HTTP.
type DirectoryService interface {
	BrowseDirectories(context.Context, string, int, bool) (filesystem.DirectoryListing, error)
}

// ReportService is the bounded reporting surface required by HTTP.
type ReportService interface {
	Summary(string, model.NodeID) (report.Summary, error)
	LargestFiles(string, model.NodeID, int) ([]report.FileEntry, error)
	Extensions(string, model.NodeID, int) (report.ExtensionReport, error)
	WriteJSON(io.Writer, string, model.NodeID) error
	WriteCSV(io.Writer, string, model.NodeID) error
}

// SettingsService is the complete persisted preference surface required by HTTP.
type SettingsService interface {
	Get() (settings.Preferences, error)
	Save(settings.Preferences) (settings.Preferences, error)
}

// Options are the API-owned dependencies.
type Options struct {
	Build       buildinfo.Info
	Scans       ScanService
	Host        HostService
	Directories DirectoryService
	Reports     ReportService
	Settings    SettingsService
}

// New returns the application API handler.
func New(options Options) http.Handler {
	handler := &handler{build: options.Build, scans: options.Scans}
	handler.host = options.Host
	handler.directories = options.Directories
	handler.reports = options.Reports
	handler.settings = options.Settings
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/status", handler.status)
	mux.HandleFunc("GET /api/settings", handler.getSettings)
	mux.HandleFunc("PUT /api/settings", handler.putSettings)
	mux.HandleFunc("GET /api/system/scan-targets", handler.scanTargets)
	mux.HandleFunc("POST /api/system/directories", handler.browseDirectories)
	mux.HandleFunc("GET /api/scans", handler.listScans)
	mux.HandleFunc("POST /api/scans", handler.startScan)
	mux.HandleFunc("GET /api/scans/{scanID}", handler.getScan)
	mux.HandleFunc("POST /api/scans/{scanID}/cancel", handler.cancelScan)
	mux.HandleFunc("GET /api/scans/{scanID}/updates", handler.scanUpdates)
	mux.HandleFunc("GET /api/scans/{scanID}/nodes/{nodeID}", handler.getNode)
	mux.HandleFunc("GET /api/scans/{scanID}/nodes/{nodeID}/children", handler.getChildren)
	mux.HandleFunc("POST /api/scans/{scanID}/nodes/{nodeID}/reveal", handler.revealNode)
	mux.HandleFunc("GET /api/scans/{scanID}/reports/summary", handler.reportSummary)
	mux.HandleFunc("GET /api/scans/{scanID}/reports/largest-files", handler.reportLargestFiles)
	mux.HandleFunc("GET /api/scans/{scanID}/reports/extensions", handler.reportExtensions)
	mux.HandleFunc("GET /api/scans/{scanID}/export", handler.exportScan)
	return mux
}

type handler struct {
	build       buildinfo.Info
	scans       ScanService
	host        HostService
	directories DirectoryService
	reports     ReportService
	settings    SettingsService
}

type startScanRequest struct {
	Path             string `json:"path"`
	Metric           string `json:"metric"`
	CrossFilesystems bool   `json:"crossFilesystems"`
}

type browseDirectoryRequest struct {
	Path       string `json:"path"`
	ShowHidden bool   `json:"showHidden"`
}

type directoryLocationResponse struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type directoryListingResponse struct {
	Path        string                      `json:"path"`
	Parent      string                      `json:"parent,omitempty"`
	Ancestors   []directoryLocationResponse `json:"ancestors"`
	Directories []directoryLocationResponse `json:"directories"`
	Truncated   bool                        `json:"truncated"`
}

type chartSettingsResponse struct {
	MaximumDepth               int     `json:"maximumDepth"`
	NodeBudget                 int     `json:"nodeBudget"`
	SegmentsPerDirectory       int     `json:"segmentsPerDirectory"`
	ExpandedDirectoriesPerRing int     `json:"expandedDirectoriesPerRing"`
	MinimumArcDegrees          float64 `json:"minimumArcDegrees"`
	ShowFiles                  bool    `json:"showFiles"`
	FileLimitMode              string  `json:"fileLimitMode"`
	MaximumFilesPerDirectory   int     `json:"maximumFilesPerDirectory"`
	MinimumFileSizeBytes       uint64  `json:"minimumFileSizeBytes"`
	ShowFreeSpace              bool    `json:"showFreeSpace"`
	ColourMode                 string  `json:"colourMode"`
	SingleColour               string  `json:"singleColour"`
	SizeLargeColour            string  `json:"sizeLargeColour"`
	SizeSmallColour            string  `json:"sizeSmallColour"`
	FileTypeDominancePercent   int     `json:"fileTypeDominancePercent"`
	OmittedStyle               string  `json:"omittedStyle"`
	SegmentOrder               string  `json:"segmentOrder"`
	FileGroupGapDegrees        float64 `json:"fileGroupGapDegrees"`
}

type settingsResponse struct {
	Version       int                   `json:"version"`
	Theme         string                `json:"theme"`
	DefaultMetric string                `json:"defaultMetric"`
	Chart         chartSettingsResponse `json:"chart"`
}

type settingsDocumentResponse struct {
	Value    settingsResponse `json:"value"`
	Defaults settingsResponse `json:"defaults"`
}

type progressResponse struct {
	Files       uint64 `json:"files"`
	Directories uint64 `json:"directories"`
	Bytes       uint64 `json:"bytes"`
	Warnings    uint64 `json:"warnings"`
	Nodes       uint64 `json:"nodes"`
	ElapsedMS   int64  `json:"elapsedMs"`
}

type scanResponse struct {
	ID            string                `json:"id"`
	Path          string                `json:"path"`
	State         scan.State            `json:"state"`
	Revision      uint64                `json:"revision"`
	Progress      progressResponse      `json:"progress"`
	Warnings      []warningResponse     `json:"warningDetails"`
	WarningCounts warningCountsResponse `json:"warningCounts"`
	StartedAt     string                `json:"startedAt,omitempty"`
	FinishedAt    string                `json:"finishedAt,omitempty"`
	ErrorMessage  string                `json:"error,omitempty"`
	Capacity      *capacityResponse     `json:"capacity,omitempty"`
}

type capacityResponse struct {
	Total     uint64 `json:"total"`
	Available uint64 `json:"available"`
}

type warningResponse struct {
	Kind      string `json:"kind"`
	Path      string `json:"path"`
	Operation string `json:"operation"`
	Message   string `json:"message"`
}

type warningCountsResponse struct {
	Permission uint64 `json:"permission"`
	Changed    uint64 `json:"changed"`
	Metadata   uint64 `json:"metadata"`
	Read       uint64 `json:"read"`
	Other      uint64 `json:"other"`
}

type nodeFlagsResponse struct {
	Warning            bool `json:"warning"`
	FilesystemBoundary bool `json:"filesystemBoundary"`
	AllocatedSizeKnown bool `json:"allocatedSizeKnown"`
	SubtreeComplete    bool `json:"subtreeComplete"`
}

type dominantFileTypeResponse struct {
	Category    string `json:"category"`
	LogicalSize uint64 `json:"logicalSize"`
}

type nodeResponse struct {
	ID               uint32                    `json:"id"`
	ParentID         *uint32                   `json:"parentId"`
	Name             string                    `json:"name"`
	Path             string                    `json:"path,omitempty"`
	Kind             string                    `json:"kind"`
	Flags            nodeFlagsResponse         `json:"flags"`
	LogicalSize      uint64                    `json:"logicalSize"`
	AllocatedSize    *uint64                   `json:"allocatedSize,omitempty"`
	FileCount        uint64                    `json:"fileCount"`
	DirectoryCount   uint64                    `json:"directoryCount"`
	ChildCount       uint32                    `json:"childCount"`
	ModifiedAt       string                    `json:"modifiedAt,omitempty"`
	DominantFileType *dominantFileTypeResponse `json:"dominantFileType,omitempty"`
}

func (h *handler) status(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, struct {
		Name   string         `json:"name"`
		Status string         `json:"status"`
		Build  buildinfo.Info `json:"build"`
	}{Name: "DiskOrbit", Status: "ok", Build: h.build})
}

func (h *handler) getSettings(w http.ResponseWriter, _ *http.Request) {
	if h.settings == nil {
		writeError(w, http.StatusServiceUnavailable, "settings_unavailable", "settings are unavailable")
		return
	}
	value, err := h.settings.Get()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "settings_read_failed", "settings could not be loaded")
		return
	}
	writeJSON(w, http.StatusOK, settingsDocumentResponse{
		Value:    mapSettings(value),
		Defaults: mapSettings(settings.Defaults()),
	})
}

func (h *handler) putSettings(w http.ResponseWriter, r *http.Request) {
	if h.settings == nil {
		writeError(w, http.StatusServiceUnavailable, "settings_unavailable", "settings are unavailable")
		return
	}
	var request settingsResponse
	if err := decodeJSON(w, r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	value, err := h.settings.Save(unmapSettings(request))
	if err != nil {
		if errors.Is(err, settings.ErrInvalid) {
			writeError(w, http.StatusBadRequest, "invalid_settings", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "settings_write_failed", "settings could not be saved")
		return
	}
	writeJSON(w, http.StatusOK, mapSettings(value))
}

func (h *handler) listScans(w http.ResponseWriter, _ *http.Request) {
	if !h.requireScans(w) {
		return
	}
	snapshots := h.scans.List()
	items := make([]scanResponse, 0, len(snapshots))
	for _, snapshot := range snapshots {
		items = append(items, mapScan(snapshot))
	}
	writeJSON(w, http.StatusOK, struct {
		Scans []scanResponse `json:"scans"`
	}{Scans: items})
}

func (h *handler) scanTargets(w http.ResponseWriter, r *http.Request) {
	if h.host == nil {
		writeError(w, http.StatusServiceUnavailable, "host_unavailable", "host integration is unavailable")
		return
	}
	targets, err := h.host.ScanTargets(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "scan_target_discovery_failed", "local scan choices could not be discovered")
		return
	}
	type scanTargetResponse struct {
		Path       string `json:"path"`
		Name       string `json:"name"`
		Kind       string `json:"kind"`
		Filesystem string `json:"filesystem,omitempty"`
	}
	items := make([]scanTargetResponse, 0, len(targets))
	for _, target := range targets {
		items = append(items, scanTargetResponse(target))
	}
	writeJSON(w, http.StatusOK, struct {
		Targets []scanTargetResponse `json:"targets"`
	}{Targets: items})
}

func (h *handler) browseDirectories(w http.ResponseWriter, r *http.Request) {
	if h.directories == nil {
		writeError(w, http.StatusServiceUnavailable, "directory_browser_unavailable", "directory browsing is unavailable")
		return
	}
	var request browseDirectoryRequest
	if err := decodeJSON(w, r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	request.Path = strings.TrimSpace(request.Path)
	if request.Path == "" {
		writeError(w, http.StatusBadRequest, "invalid_path", "path is required")
		return
	}
	listing, err := h.directories.BrowseDirectories(r.Context(), request.Path, directoryBrowseLimit, request.ShowHidden)
	if err != nil {
		switch {
		case errors.Is(err, filesystem.ErrNotDirectory):
			writeError(w, http.StatusBadRequest, "invalid_directory", "the selected path is not a directory")
		case errors.Is(err, os.ErrNotExist):
			writeError(w, http.StatusNotFound, "directory_not_found", "the selected directory no longer exists")
		case errors.Is(err, os.ErrPermission):
			writeError(w, http.StatusForbidden, "directory_unavailable", "the selected directory is not accessible")
		default:
			writeError(w, http.StatusInternalServerError, "directory_browse_failed", "the selected directory could not be opened")
		}
		return
	}
	writeJSON(w, http.StatusOK, mapDirectoryListing(listing))
}

func mapDirectoryListing(listing filesystem.DirectoryListing) directoryListingResponse {
	response := directoryListingResponse{
		Path:        listing.Path,
		Parent:      listing.Parent,
		Ancestors:   make([]directoryLocationResponse, 0, len(listing.Ancestors)),
		Directories: make([]directoryLocationResponse, 0, len(listing.Directories)),
		Truncated:   listing.Truncated,
	}
	for _, ancestor := range listing.Ancestors {
		response.Ancestors = append(response.Ancestors, directoryLocationResponse(ancestor))
	}
	for _, directory := range listing.Directories {
		response.Directories = append(response.Directories, directoryLocationResponse(directory))
	}
	return response
}

func (h *handler) startScan(w http.ResponseWriter, r *http.Request) {
	if !h.requireScans(w) {
		return
	}
	var request startScanRequest
	if err := decodeJSON(w, r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	request.Path = strings.TrimSpace(request.Path)
	if request.Path == "" {
		writeError(w, http.StatusBadRequest, "invalid_path", "path is required")
		return
	}
	if request.Metric == "" {
		request.Metric = "logical"
	}
	if request.Metric != "logical" {
		writeError(w, http.StatusBadRequest, "invalid_metric", "only the logical metric is currently supported")
		return
	}
	snapshot, err := h.scans.Start(r.Context(), scan.StartRequest{
		Path: request.Path, CrossFilesystems: request.CrossFilesystems,
	})
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	w.Header().Set("Location", "/api/scans/"+snapshot.ID)
	writeJSON(w, http.StatusAccepted, mapScan(snapshot))
}

func (h *handler) getScan(w http.ResponseWriter, r *http.Request) {
	if !h.requireScans(w) {
		return
	}
	snapshot, err := h.scans.Get(r.PathValue("scanID"))
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, mapScan(snapshot))
}

func (h *handler) cancelScan(w http.ResponseWriter, r *http.Request) {
	if !h.requireScans(w) {
		return
	}
	snapshot, err := h.scans.Cancel(r.PathValue("scanID"))
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, mapScan(snapshot))
}

func (h *handler) scanUpdates(w http.ResponseWriter, r *http.Request) {
	if !h.requireScans(w) {
		return
	}
	after, err := queryUint(r, "after", 0, ^uint64(0))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_cursor", err.Error())
		return
	}
	update, err := h.scans.Updates(r.PathValue("scanID"), after)
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	response := struct {
		Revision uint64        `json:"revision"`
		Changed  bool          `json:"changed"`
		Scan     *scanResponse `json:"scan,omitempty"`
	}{Revision: update.Revision, Changed: update.Changed}
	if update.Changed {
		mapped := mapScan(update.Snapshot)
		response.Scan = &mapped
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *handler) getNode(w http.ResponseWriter, r *http.Request) {
	if !h.requireScans(w) {
		return
	}
	nodeID, err := pathNodeID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_node", err.Error())
		return
	}
	result, err := h.scans.Node(r.PathValue("scanID"), nodeID)
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, mapNode(result.Node, result.Path))
}

func (h *handler) getChildren(w http.ResponseWriter, r *http.Request) {
	if !h.requireScans(w) {
		return
	}
	nodeID, err := pathNodeID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_node", err.Error())
		return
	}
	after := model.NoNode
	if raw := r.URL.Query().Get("after"); raw != "" {
		value, parseErr := strconv.ParseUint(raw, 10, 32)
		if parseErr != nil || model.NodeID(value) == model.NoNode {
			writeError(w, http.StatusBadRequest, "invalid_cursor", "after must be a valid node ID")
			return
		}
		after = model.NodeID(value)
	}
	limit64, err := queryUint(r, "limit", defaultPageLimit, maximumPageLimit)
	if err != nil || limit64 == 0 {
		writeError(w, http.StatusBadRequest, "invalid_limit", fmt.Sprintf("limit must be between 1 and %d", maximumPageLimit))
		return
	}
	result, err := h.scans.Children(r.PathValue("scanID"), nodeID, after, int(limit64))
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	items := make([]nodeResponse, 0, len(result.Nodes))
	for index, node := range result.Nodes {
		items = append(items, mapNode(node, result.Paths[index]))
	}
	response := struct {
		Nodes     []nodeResponse `json:"nodes"`
		NextAfter *uint32        `json:"nextAfter"`
		More      bool           `json:"more"`
	}{Nodes: items, More: result.More}
	if result.NextAfter != model.NoNode {
		value := uint32(result.NextAfter)
		response.NextAfter = &value
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *handler) revealNode(w http.ResponseWriter, r *http.Request) {
	if !h.requireScans(w) {
		return
	}
	if h.host == nil {
		writeError(w, http.StatusServiceUnavailable, "host_unavailable", "host integration is unavailable")
		return
	}
	nodeID, err := pathNodeID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_node", err.Error())
		return
	}
	node, err := h.scans.Node(r.PathValue("scanID"), nodeID)
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	if err := h.host.Reveal(r.Context(), node.Path); err != nil {
		writeError(w, http.StatusInternalServerError, "reveal_failed", "the item could not be revealed in the filesystem manager")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) reportSummary(w http.ResponseWriter, r *http.Request) {
	rootID, ok := h.reportRoot(w, r)
	if !ok {
		return
	}
	summary, err := h.reports.Summary(r.PathValue("scanID"), rootID)
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

func (h *handler) reportLargestFiles(w http.ResponseWriter, r *http.Request) {
	rootID, ok := h.reportRoot(w, r)
	if !ok {
		return
	}
	limit, ok := reportLimit(w, r)
	if !ok {
		return
	}
	files, err := h.reports.LargestFiles(r.PathValue("scanID"), rootID, limit)
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Files []report.FileEntry `json:"files"`
	}{Files: files})
}

func (h *handler) reportExtensions(w http.ResponseWriter, r *http.Request) {
	rootID, ok := h.reportRoot(w, r)
	if !ok {
		return
	}
	limit, ok := reportLimit(w, r)
	if !ok {
		return
	}
	result, err := h.reports.Extensions(r.PathValue("scanID"), rootID, limit)
	if err != nil {
		h.writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *handler) exportScan(w http.ResponseWriter, r *http.Request) {
	rootID, ok := h.reportRoot(w, r)
	if !ok {
		return
	}
	scanID := r.PathValue("scanID")
	if _, err := h.reports.Summary(scanID, rootID); err != nil {
		h.writeServiceError(w, err)
		return
	}
	format := r.URL.Query().Get("format")
	switch format {
	case "json":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="diskorbit-%s.json"`, scanID))
		if err := h.reports.WriteJSON(w, scanID, rootID); err != nil {
			return
		}
	case "csv":
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="diskorbit-%s.csv"`, scanID))
		if err := h.reports.WriteCSV(w, scanID, rootID); err != nil {
			return
		}
	default:
		writeError(w, http.StatusBadRequest, "invalid_format", "format must be json or csv")
	}
}

func (h *handler) reportRoot(w http.ResponseWriter, r *http.Request) (model.NodeID, bool) {
	if h.reports == nil {
		writeError(w, http.StatusServiceUnavailable, "reports_unavailable", "reporting is unavailable")
		return 0, false
	}
	value, err := queryUint(r, "root", 0, uint64(model.NoNode-1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_node", "root must be a valid node ID")
		return 0, false
	}
	return model.NodeID(value), true
}

func reportLimit(w http.ResponseWriter, r *http.Request) (int, bool) {
	value, err := queryUint(r, "limit", 50, 1000)
	if err != nil || value == 0 {
		writeError(w, http.StatusBadRequest, "invalid_limit", "limit must be between 1 and 1000")
		return 0, false
	}
	return int(value), true
}

func (h *handler) requireScans(w http.ResponseWriter) bool {
	if h.scans != nil {
		return true
	}
	writeError(w, http.StatusServiceUnavailable, "scanner_unavailable", "scanner is unavailable")
	return false
}

func (h *handler) writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, scanner.ErrInvalidRoot):
		writeError(w, http.StatusBadRequest, "invalid_path", err.Error())
	case errors.Is(err, scan.ErrActiveScan):
		writeError(w, http.StatusConflict, "scan_active", err.Error())
	case errors.Is(err, scan.ErrScanNotRunning):
		writeError(w, http.StatusConflict, "scan_not_running", err.Error())
	case errors.Is(err, scan.ErrScanNotComplete):
		writeError(w, http.StatusConflict, "scan_not_complete", err.Error())
	case errors.Is(err, scan.ErrScanNotFound), errors.Is(err, model.ErrInvalidNode):
		writeError(w, http.StatusNotFound, "not_found", err.Error())
	case errors.Is(err, scan.ErrManagerClosed):
		writeError(w, http.StatusServiceUnavailable, "scanner_unavailable", err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", "the scan request could not be completed")
	}
}

func mapScan(snapshot scan.Snapshot) scanResponse {
	response := scanResponse{
		ID: snapshot.ID, Path: snapshot.Path, State: snapshot.State,
		Revision: snapshot.Revision, Warnings: make([]warningResponse, 0, len(snapshot.Warnings)),
		ErrorMessage: snapshot.ErrorMessage,
		WarningCounts: warningCountsResponse{
			Permission: snapshot.WarningCounts.Permission,
			Changed:    snapshot.WarningCounts.Changed,
			Metadata:   snapshot.WarningCounts.Metadata,
			Read:       snapshot.WarningCounts.Read,
			Other:      snapshot.WarningCounts.Other,
		},
		Progress: progressResponse{
			Files: snapshot.Progress.Files, Directories: snapshot.Progress.Directories,
			Bytes: snapshot.Progress.Bytes, Warnings: snapshot.Progress.Warnings,
			Nodes: snapshot.Progress.Nodes, ElapsedMS: snapshot.Progress.Elapsed.Milliseconds(),
		},
	}
	for _, warning := range snapshot.Warnings {
		response.Warnings = append(response.Warnings, warningResponse{
			Kind: string(warning.Kind), Path: warning.Path, Operation: warning.Operation, Message: warning.Message,
		})
	}
	if !snapshot.StartedAt.IsZero() {
		response.StartedAt = snapshot.StartedAt.UTC().Format(time.RFC3339Nano)
	}
	if !snapshot.FinishedAt.IsZero() {
		response.FinishedAt = snapshot.FinishedAt.UTC().Format(time.RFC3339Nano)
	}
	if snapshot.CapacityKnown && snapshot.Capacity.Total > 0 && snapshot.Capacity.Available <= snapshot.Capacity.Total {
		response.Capacity = &capacityResponse{Total: snapshot.Capacity.Total, Available: snapshot.Capacity.Available}
	}
	return response
}

func mapSettings(value settings.Preferences) settingsResponse {
	return settingsResponse{
		Version:       value.Version,
		Theme:         value.Theme,
		DefaultMetric: value.DefaultMetric,
		Chart: chartSettingsResponse{
			MaximumDepth:               value.Chart.MaximumDepth,
			NodeBudget:                 value.Chart.NodeBudget,
			SegmentsPerDirectory:       value.Chart.SegmentsPerDirectory,
			ExpandedDirectoriesPerRing: value.Chart.ExpandedDirectoriesPerRing,
			MinimumArcDegrees:          value.Chart.MinimumArcDegrees,
			ShowFiles:                  value.Chart.ShowFiles,
			FileLimitMode:              value.Chart.FileLimitMode,
			MaximumFilesPerDirectory:   value.Chart.MaximumFilesPerDirectory,
			MinimumFileSizeBytes:       value.Chart.MinimumFileSizeBytes,
			ShowFreeSpace:              value.Chart.ShowFreeSpace,
			ColourMode:                 value.Chart.ColourMode,
			SingleColour:               value.Chart.SingleColour,
			SizeLargeColour:            value.Chart.SizeLargeColour,
			SizeSmallColour:            value.Chart.SizeSmallColour,
			FileTypeDominancePercent:   value.Chart.FileTypeDominancePercent,
			OmittedStyle:               value.Chart.OmittedStyle,
			SegmentOrder:               value.Chart.SegmentOrder,
			FileGroupGapDegrees:        value.Chart.FileGroupGapDegrees,
		},
	}
}

func unmapSettings(value settingsResponse) settings.Preferences {
	return settings.Preferences{
		Version:       value.Version,
		Theme:         value.Theme,
		DefaultMetric: value.DefaultMetric,
		Chart: settings.ChartSettings{
			MaximumDepth:               value.Chart.MaximumDepth,
			NodeBudget:                 value.Chart.NodeBudget,
			SegmentsPerDirectory:       value.Chart.SegmentsPerDirectory,
			ExpandedDirectoriesPerRing: value.Chart.ExpandedDirectoriesPerRing,
			MinimumArcDegrees:          value.Chart.MinimumArcDegrees,
			ShowFiles:                  value.Chart.ShowFiles,
			FileLimitMode:              value.Chart.FileLimitMode,
			MaximumFilesPerDirectory:   value.Chart.MaximumFilesPerDirectory,
			MinimumFileSizeBytes:       value.Chart.MinimumFileSizeBytes,
			ShowFreeSpace:              value.Chart.ShowFreeSpace,
			ColourMode:                 value.Chart.ColourMode,
			SingleColour:               value.Chart.SingleColour,
			SizeLargeColour:            value.Chart.SizeLargeColour,
			SizeSmallColour:            value.Chart.SizeSmallColour,
			FileTypeDominancePercent:   value.Chart.FileTypeDominancePercent,
			OmittedStyle:               value.Chart.OmittedStyle,
			SegmentOrder:               value.Chart.SegmentOrder,
			FileGroupGapDegrees:        value.Chart.FileGroupGapDegrees,
		},
	}
}

func mapNode(node model.NodeView, path string) nodeResponse {
	response := nodeResponse{
		ID: uint32(node.ID), Name: node.Name, Path: path, Kind: node.Kind.String(),
		LogicalSize: node.LogicalSize, FileCount: node.FileCount,
		DirectoryCount: node.DirCount, ChildCount: node.ChildCount,
		Flags: nodeFlagsResponse{
			Warning:            node.Flags&model.FlagWarning != 0,
			FilesystemBoundary: node.Flags&model.FlagFilesystemBoundary != 0,
			AllocatedSizeKnown: node.Flags&model.FlagAllocatedSizeKnown != 0,
			SubtreeComplete:    node.Kind != model.KindDirectory || node.Flags&model.FlagSubtreeComplete != 0,
		},
	}
	if node.ParentID != model.NoNode {
		value := uint32(node.ParentID)
		response.ParentID = &value
	}
	if node.Flags&model.FlagAllocatedSizeKnown != 0 {
		value := node.AllocatedSize
		response.AllocatedSize = &value
	}
	if !node.Modified.IsZero() {
		response.ModifiedAt = node.Modified.UTC().Format(time.RFC3339Nano)
	}
	if node.DominantFileType != model.FileTypeUnknown && node.DominantFileTypeBytes > 0 {
		response.DominantFileType = &dominantFileTypeResponse{
			Category:    node.DominantFileType.String(),
			LogicalSize: node.DominantFileTypeBytes,
		}
	}
	return response
}

func pathNodeID(r *http.Request) (model.NodeID, error) {
	value, err := strconv.ParseUint(r.PathValue("nodeID"), 10, 32)
	if err != nil || model.NodeID(value) == model.NoNode {
		return model.NoNode, fmt.Errorf("node ID must be an unsigned 32-bit integer")
	}
	return model.NodeID(value), nil
}

func queryUint(r *http.Request, name string, defaultValue, maximum uint64) (uint64, error) {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return defaultValue, nil
	}
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || value > maximum {
		return 0, fmt.Errorf("%s is out of range", name)
	}
	return value, nil
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maximumRequestBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("invalid JSON body: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return fmt.Errorf("request body must contain one JSON object")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}{Error: struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}{Code: code, Message: message}})
}
