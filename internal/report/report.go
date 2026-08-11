package report

import (
	"container/heap"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/rztaylor/diskorbit/internal/model"
	"github.com/rztaylor/diskorbit/internal/scan"
)

const (
	defaultReportLimit         = 50
	maximumReportLimit         = 1000
	maximumExtensionCandidates = 2048
)

// Source is the retained terminal-scan surface required for reporting.
type Source interface {
	Get(string) (scan.Snapshot, error)
	Node(string, model.NodeID) (scan.NodeResult, error)
	Walk(string, model.NodeID, func(model.NodeView, string) error) error
}

// Service derives local reports without retaining a second filesystem tree.
type Service struct{ source Source }

// New returns a report service over retained scans.
func New(source Source) (*Service, error) {
	if source == nil {
		return nil, fmt.Errorf("report service requires a scan source")
	}
	return &Service{source: source}, nil
}

// Summary is a selected-subtree overview.
type Summary struct {
	ScanID              string     `json:"scanId"`
	RootID              uint32     `json:"rootId"`
	Path                string     `json:"path"`
	State               scan.State `json:"state"`
	LogicalSize         uint64     `json:"logicalSize"`
	AllocatedSize       *uint64    `json:"allocatedSize"`
	Files               uint64     `json:"files"`
	Directories         uint64     `json:"directories"`
	Warnings            uint64     `json:"warnings"`
	ElapsedMilliseconds int64      `json:"elapsedMs"`
}

// FileEntry is one largest-file result.
type FileEntry struct {
	NodeID        uint32  `json:"nodeId"`
	Name          string  `json:"name"`
	Path          string  `json:"path"`
	LogicalSize   uint64  `json:"logicalSize"`
	AllocatedSize *uint64 `json:"allocatedSize"`
	ModifiedAt    string  `json:"modifiedAt,omitempty"`
}

// ExtensionEntry is one exact candidate total after bounded heavy-hitter selection.
type ExtensionEntry struct {
	Extension   string `json:"extension"`
	LogicalSize uint64 `json:"logicalSize"`
	Files       uint64 `json:"files"`
}

// ExtensionReport identifies whether smaller or displaced extensions were combined.
type ExtensionReport struct {
	Entries   []ExtensionEntry `json:"entries"`
	Truncated bool             `json:"truncated"`
}

// Summary returns authoritative totals for rootID.
func (s *Service) Summary(scanID string, rootID model.NodeID) (Summary, error) {
	snapshot, err := s.source.Get(scanID)
	if err != nil {
		return Summary{}, err
	}
	if snapshot.State != scan.StateCompleted && snapshot.State != scan.StateCancelled && snapshot.State != scan.StateFailed {
		return Summary{}, scan.ErrScanNotComplete
	}
	root, err := s.source.Node(scanID, rootID)
	if err != nil {
		return Summary{}, err
	}
	result := Summary{
		ScanID: scanID, RootID: uint32(rootID), Path: root.Path, State: snapshot.State,
		LogicalSize: root.Node.LogicalSize, Files: root.Node.FileCount,
		Directories: root.Node.DirCount, Warnings: snapshot.Progress.Warnings,
		ElapsedMilliseconds: snapshot.Progress.Elapsed.Milliseconds(),
	}
	if root.Node.Flags&model.FlagAllocatedSizeKnown != 0 {
		value := root.Node.AllocatedSize
		result.AllocatedSize = &value
	}
	return result, nil
}

// LargestFiles returns at most limit regular files using bounded heap memory.
func (s *Service) LargestFiles(scanID string, rootID model.NodeID, limit int) ([]FileEntry, error) {
	limit = normalizedLimit(limit)
	items := make(fileHeap, 0, limit)
	err := s.source.Walk(scanID, rootID, func(node model.NodeView, path string) error {
		if node.Kind != model.KindFile {
			return nil
		}
		entry := FileEntry{NodeID: uint32(node.ID), Name: node.Name, Path: path, LogicalSize: node.LogicalSize}
		if node.Flags&model.FlagAllocatedSizeKnown != 0 {
			value := node.AllocatedSize
			entry.AllocatedSize = &value
		}
		if !node.Modified.IsZero() {
			entry.ModifiedAt = node.Modified.UTC().Format(time.RFC3339Nano)
		}
		if len(items) < limit {
			heap.Push(&items, entry)
		} else if largerFile(entry, items[0]) {
			heap.Pop(&items)
			heap.Push(&items, entry)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(items, func(i, j int) bool { return largerFile(items[i], items[j]) })
	return items, nil
}

// Extensions returns exact totals for bounded heavy-hitter candidates and an
// Other entry for everything not individually returned.
func (s *Service) Extensions(scanID string, rootID model.NodeID, limit int) (ExtensionReport, error) {
	limit = normalizedLimit(limit)
	candidates := make(extensionHeap, 0, maximumExtensionCandidates)
	byName := make(map[string]*extensionCandidate, maximumExtensionCandidates)
	evicted := false
	err := s.source.Walk(scanID, rootID, func(node model.NodeView, _ string) error {
		if node.Kind != model.KindFile {
			return nil
		}
		name := extensionName(node.Name)
		if candidate := byName[name]; candidate != nil {
			candidate.bytes += node.LogicalSize
			candidate.files++
			heap.Fix(&candidates, candidate.index)
			return nil
		}
		candidate := &extensionCandidate{name: name, bytes: node.LogicalSize, files: 1}
		if len(candidates) == maximumExtensionCandidates {
			smallest := heap.Pop(&candidates).(*extensionCandidate)
			delete(byName, smallest.name)
			candidate.bytes += smallest.bytes
			candidate.files += smallest.files
			evicted = true
		}
		heap.Push(&candidates, candidate)
		byName[name] = candidate
		return nil
	})
	if err != nil {
		return ExtensionReport{}, err
	}

	exact := make(map[string]ExtensionEntry, len(byName))
	var other ExtensionEntry
	other.Extension = "Other"
	err = s.source.Walk(scanID, rootID, func(node model.NodeView, _ string) error {
		if node.Kind != model.KindFile {
			return nil
		}
		name := extensionName(node.Name)
		if _, ok := byName[name]; !ok {
			other.LogicalSize += node.LogicalSize
			other.Files++
			return nil
		}
		entry := exact[name]
		entry.Extension = name
		entry.LogicalSize += node.LogicalSize
		entry.Files++
		exact[name] = entry
		return nil
	})
	if err != nil {
		return ExtensionReport{}, err
	}
	entries := make([]ExtensionEntry, 0, len(exact))
	for _, entry := range exact {
		entries = append(entries, entry)
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].LogicalSize > entries[j].LogicalSize ||
			(entries[i].LogicalSize == entries[j].LogicalSize && entries[i].Extension < entries[j].Extension)
	})
	if len(entries) > limit {
		for _, entry := range entries[limit:] {
			other.LogicalSize += entry.LogicalSize
			other.Files += entry.Files
		}
		entries = entries[:limit]
	}
	truncated := evicted || other.Files > 0
	if other.Files > 0 {
		entries = append(entries, other)
	}
	return ExtensionReport{Entries: entries, Truncated: truncated}, nil
}

// WriteJSON streams one selected subtree as a local JSON export.
func (s *Service) WriteJSON(output io.Writer, scanID string, rootID model.NodeID) error {
	summary, err := s.Summary(scanID, rootID)
	if err != nil {
		return err
	}
	header, err := json.Marshal(summary)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(output, "{\"summary\":%s,\"nodes\":[", header); err != nil {
		return err
	}
	first := true
	err = s.source.Walk(scanID, rootID, func(node model.NodeView, path string) error {
		row := exportRow(node, path)
		encoded, marshalErr := json.Marshal(row)
		if marshalErr != nil {
			return marshalErr
		}
		separator := ""
		if !first {
			separator = ","
		}
		first = false
		_, writeErr := fmt.Fprintf(output, "%s%s", separator, encoded)
		return writeErr
	})
	if err != nil {
		return err
	}
	_, err = io.WriteString(output, "]}\n")
	return err
}

// WriteCSV streams one selected subtree as CSV.
func (s *Service) WriteCSV(output io.Writer, scanID string, rootID model.NodeID) error {
	writer := csv.NewWriter(output)
	if err := writer.Write([]string{"node_id", "parent_id", "path", "name", "kind", "logical_size", "allocated_size", "files", "directories", "modified_at", "warning", "filesystem_boundary"}); err != nil {
		return err
	}
	err := s.source.Walk(scanID, rootID, func(node model.NodeView, path string) error {
		parent := ""
		if node.ParentID != model.NoNode {
			parent = strconv.FormatUint(uint64(node.ParentID), 10)
		}
		allocated := ""
		if node.Flags&model.FlagAllocatedSizeKnown != 0 {
			allocated = strconv.FormatUint(node.AllocatedSize, 10)
		}
		modified := ""
		if !node.Modified.IsZero() {
			modified = node.Modified.UTC().Format(time.RFC3339Nano)
		}
		return writer.Write([]string{
			strconv.FormatUint(uint64(node.ID), 10), parent, path, node.Name, node.Kind.String(),
			strconv.FormatUint(node.LogicalSize, 10), allocated,
			strconv.FormatUint(node.FileCount, 10), strconv.FormatUint(node.DirCount, 10), modified,
			strconv.FormatBool(node.Flags&model.FlagWarning != 0),
			strconv.FormatBool(node.Flags&model.FlagFilesystemBoundary != 0),
		})
	})
	writer.Flush()
	if err != nil {
		return err
	}
	return writer.Error()
}

type exportNode struct {
	NodeID             uint32  `json:"nodeId"`
	ParentID           *uint32 `json:"parentId"`
	Path               string  `json:"path"`
	Name               string  `json:"name"`
	Kind               string  `json:"kind"`
	LogicalSize        uint64  `json:"logicalSize"`
	AllocatedSize      *uint64 `json:"allocatedSize"`
	Files              uint64  `json:"files"`
	Directories        uint64  `json:"directories"`
	ModifiedAt         string  `json:"modifiedAt,omitempty"`
	Warning            bool    `json:"warning"`
	FilesystemBoundary bool    `json:"filesystemBoundary"`
}

func exportRow(node model.NodeView, path string) exportNode {
	row := exportNode{
		NodeID: uint32(node.ID), Path: path, Name: node.Name, Kind: node.Kind.String(),
		LogicalSize: node.LogicalSize, Files: node.FileCount, Directories: node.DirCount,
		Warning:            node.Flags&model.FlagWarning != 0,
		FilesystemBoundary: node.Flags&model.FlagFilesystemBoundary != 0,
	}
	if node.ParentID != model.NoNode {
		value := uint32(node.ParentID)
		row.ParentID = &value
	}
	if node.Flags&model.FlagAllocatedSizeKnown != 0 {
		value := node.AllocatedSize
		row.AllocatedSize = &value
	}
	if !node.Modified.IsZero() {
		row.ModifiedAt = node.Modified.UTC().Format(time.RFC3339Nano)
	}
	return row
}

func normalizedLimit(limit int) int {
	if limit <= 0 {
		return defaultReportLimit
	}
	if limit > maximumReportLimit {
		return maximumReportLimit
	}
	return limit
}

func extensionName(name string) string {
	extension := strings.ToLower(filepath.Ext(name))
	if extension == "" {
		return "[no extension]"
	}
	return extension
}

func largerFile(left, right FileEntry) bool {
	return left.LogicalSize > right.LogicalSize ||
		(left.LogicalSize == right.LogicalSize && left.Path < right.Path)
}

type fileHeap []FileEntry

func (h fileHeap) Len() int           { return len(h) }
func (h fileHeap) Less(i, j int) bool { return largerFile(h[j], h[i]) }
func (h fileHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *fileHeap) Push(value any)    { *h = append(*h, value.(FileEntry)) }
func (h *fileHeap) Pop() any {
	old := *h
	item := old[len(old)-1]
	*h = old[:len(old)-1]
	return item
}

type extensionCandidate struct {
	name  string
	bytes uint64
	files uint64
	index int
}

type extensionHeap []*extensionCandidate

func (h extensionHeap) Len() int           { return len(h) }
func (h extensionHeap) Less(i, j int) bool { return h[i].bytes < h[j].bytes }
func (h extensionHeap) Swap(i, j int) {
	h[i], h[j] = h[j], h[i]
	h[i].index, h[j].index = i, j
}
func (h *extensionHeap) Push(value any) {
	item := value.(*extensionCandidate)
	item.index = len(*h)
	*h = append(*h, item)
}
func (h *extensionHeap) Pop() any {
	old := *h
	item := old[len(old)-1]
	*h = old[:len(old)-1]
	item.index = -1
	return item
}
