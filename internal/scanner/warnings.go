package scanner

import (
	"errors"
	"io/fs"
	"sync"
)

const warningSamplesPerKind = 5

// WarningKind classifies one recoverable observation failure for presentation.
type WarningKind string

const (
	WarningPermission WarningKind = "permission"
	WarningChanged    WarningKind = "changed"
	WarningMetadata   WarningKind = "metadata"
	WarningRead       WarningKind = "read"
	WarningOther      WarningKind = "other"
)

// Warning is a recoverable filesystem observation failure.
type Warning struct {
	Kind      WarningKind
	Path      string
	Operation string
	Message   string
}

// WarningCounts records exact category totals even when examples are bounded.
type WarningCounts struct {
	Permission uint64
	Changed    uint64
	Metadata   uint64
	Read       uint64
	Other      uint64
}

// Total returns every classified recoverable observation failure.
func (c WarningCounts) Total() uint64 {
	return c.Permission + c.Changed + c.Metadata + c.Read + c.Other
}

func (c *WarningCounts) add(kind WarningKind) {
	switch kind {
	case WarningPermission:
		c.Permission++
	case WarningChanged:
		c.Changed++
	case WarningMetadata:
		c.Metadata++
	case WarningRead:
		c.Read++
	default:
		c.Other++
	}
}

type warningCollector struct {
	mu          sync.Mutex
	limit       int
	counts      WarningCounts
	sampleCount map[WarningKind]int
	entries     []Warning
}

func newWarningCollector(limit int) *warningCollector {
	return &warningCollector{
		limit:       limit,
		sampleCount: make(map[WarningKind]int, 5),
		entries:     make([]Warning, 0, min(limit, warningSamplesPerKind*5)),
	}
}

func (c *warningCollector) add(path, operation string, err error) {
	if err == nil {
		return
	}
	kind := warningKind(operation, err)
	c.mu.Lock()
	defer c.mu.Unlock()
	c.counts.add(kind)
	if len(c.entries) < c.limit && c.sampleCount[kind] < warningSamplesPerKind {
		c.entries = append(c.entries, Warning{Kind: kind, Path: path, Operation: operation, Message: err.Error()})
		c.sampleCount[kind]++
	}
}

func (c *warningCollector) count() uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.counts.Total()
}

func (c *warningCollector) snapshot() ([]Warning, WarningCounts) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entries := append([]Warning(nil), c.entries...)
	return entries, c.counts
}

func warningKind(operation string, err error) WarningKind {
	switch {
	case errors.Is(err, fs.ErrPermission):
		return WarningPermission
	case errors.Is(err, fs.ErrNotExist):
		return WarningChanged
	case operation == "stat":
		return WarningMetadata
	case operation == "read_directory":
		return WarningRead
	default:
		return WarningOther
	}
}
