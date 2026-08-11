package model

import (
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"sync"
	"time"
)

// NodeID is a process-local index into a Tree.
type NodeID uint32

const (
	// RootID is the root node in every Tree.
	RootID NodeID = 0
	// NoNode is the sentinel used when a relationship has no target.
	NoNode NodeID = math.MaxUint32
)

// Kind identifies a filesystem entry without following links.
type Kind uint8

const (
	KindFile Kind = iota
	KindDirectory
	KindSymlink
	KindSpecial
)

// String returns the stable API spelling for a node kind.
func (k Kind) String() string {
	switch k {
	case KindFile:
		return "file"
	case KindDirectory:
		return "directory"
	case KindSymlink:
		return "symlink"
	case KindSpecial:
		return "special"
	default:
		return "unknown"
	}
}

// Flags record compact node conditions that affect presentation or traversal.
type Flags uint8

const (
	FlagWarning Flags = 1 << iota
	FlagFilesystemBoundary
	FlagAllocatedSizeKnown
	// FlagSubtreeComplete marks a directory whose traversed subtree can no longer change.
	FlagSubtreeComplete
)

var (
	// ErrCapacity reports that the compact 32-bit node or name arena is full.
	ErrCapacity = errors.New("filesystem model capacity exceeded")
	// ErrAggregateOverflow reports that discovered totals cannot fit in uint64.
	ErrAggregateOverflow = errors.New("filesystem aggregate overflow")
	// ErrInvalidNode reports an unknown node identifier or relationship.
	ErrInvalidNode = errors.New("invalid filesystem node")
)

// NodeSpec contains the data needed to append one child node.
type NodeSpec struct {
	Name          string
	Kind          Kind
	LogicalSize   uint64
	AllocatedSize uint64
	Modified      time.Time
	Flags         Flags
}

// NodeView is an immutable copy safe to share outside Tree.
type NodeView struct {
	ID                    NodeID
	ParentID              NodeID
	Name                  string
	Kind                  Kind
	Flags                 Flags
	LogicalSize           uint64
	FileCount             uint64
	DirCount              uint64
	ChildCount            uint32
	Modified              time.Time
	AllocatedSize         uint64
	DominantFileType      FileType
	DominantFileTypeBytes uint64
}

type node struct {
	parent           NodeID
	firstChild       NodeID
	lastChild        NodeID
	nextSibling      NodeID
	nameOffset       uint32
	nameLength       uint32
	logicalSize      uint64
	allocatedSize    uint64
	unknownAllocated uint64
	fileCount        uint64
	dirCount         uint64
	modifiedNS       int64
	childCount       uint32
	fileTypeIndex    uint32
	kind             Kind
	flags            Flags
	_                [2]byte
}

// Tree is a concurrency-safe indexed filesystem hierarchy.
type Tree struct {
	mu        sync.RWMutex
	rootPath  string
	nodes     []node
	names     []byte
	fileTypes []fileTypeTotals
}

// Walk visits a stable subtree in discovery order without allocating a copy.
// The callback must not call methods on Tree because Walk holds its read lock.
func (t *Tree) Walk(rootID NodeID, visit func(NodeView, string) error) error {
	if visit == nil {
		return nil
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	if !t.validLocked(rootID) {
		return ErrInvalidNode
	}
	var walk func(NodeID) error
	walk = func(id NodeID) error {
		if err := visit(t.viewLocked(id), t.pathLocked(id)); err != nil {
			return err
		}
		for child := t.nodes[id].firstChild; child != NoNode; child = t.nodes[child].nextSibling {
			if err := walk(child); err != nil {
				return err
			}
		}
		return nil
	}
	return walk(rootID)
}

// NewTree creates a tree with one directory root.
func NewTree(rootPath, rootName string, modified time.Time) *Tree {
	rootName = nameOrPath(rootName, rootPath)
	tree := &Tree{
		rootPath:  filepath.Clean(rootPath),
		nodes:     make([]node, 1, 1024),
		names:     make([]byte, 0, 16*1024),
		fileTypes: make([]fileTypeTotals, 1, 128),
	}
	offset := tree.appendName(rootName)
	tree.nodes[0] = node{
		parent:        NoNode,
		firstChild:    NoNode,
		lastChild:     NoNode,
		nextSibling:   NoNode,
		nameOffset:    offset,
		nameLength:    uint32(len(rootName)),
		fileTypeIndex: 0,
		modifiedNS:    timeToUnixNano(modified),
		kind:          KindDirectory,
	}
	return tree
}

// Add appends one child and updates all ancestor aggregates atomically.
func (t *Tree) Add(parentID NodeID, spec NodeSpec) (NodeID, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if !t.validLocked(parentID) || t.nodes[parentID].kind != KindDirectory || spec.Name == "" {
		return NoNode, ErrInvalidNode
	}
	if uint64(len(t.nodes)) >= uint64(NoNode) || uint64(len(t.names))+uint64(len(spec.Name)) > math.MaxUint32 {
		return NoNode, ErrCapacity
	}

	var sizeDelta, allocatedDelta, unknownAllocatedDelta, fileDelta, dirDelta uint64
	if spec.Kind == KindDirectory {
		dirDelta = 1
	} else {
		sizeDelta = spec.LogicalSize
		fileDelta = 1
		if spec.Flags&FlagAllocatedSizeKnown != 0 {
			allocatedDelta = spec.AllocatedSize
		} else {
			unknownAllocatedDelta = 1
		}
	}
	if err := t.checkAggregateLocked(parentID, sizeDelta, allocatedDelta, unknownAllocatedDelta, fileDelta, dirDelta); err != nil {
		return NoNode, err
	}

	id := NodeID(len(t.nodes))
	offset := t.appendName(spec.Name)
	fileTypeIndex := uint32(NoNode)
	if spec.Kind == KindDirectory {
		fileTypeIndex = uint32(len(t.fileTypes))
		t.fileTypes = append(t.fileTypes, fileTypeTotals{})
	}
	created := node{
		parent:           parentID,
		firstChild:       NoNode,
		lastChild:        NoNode,
		nextSibling:      NoNode,
		nameOffset:       offset,
		nameLength:       uint32(len(spec.Name)),
		logicalSize:      sizeDelta,
		allocatedSize:    allocatedDelta,
		unknownAllocated: unknownAllocatedDelta,
		fileCount:        fileDelta,
		dirCount:         0,
		modifiedNS:       timeToUnixNano(spec.Modified),
		fileTypeIndex:    fileTypeIndex,
		kind:             spec.Kind,
		flags:            spec.Flags,
	}
	t.nodes = append(t.nodes, created)

	parent := &t.nodes[parentID]
	if parent.firstChild == NoNode {
		parent.firstChild = id
	} else {
		t.nodes[parent.lastChild].nextSibling = id
	}
	parent.lastChild = id
	parent.childCount++
	fileType := FileTypeUnknown
	if spec.Kind == KindFile {
		fileType = fileTypeForName(spec.Name)
	}
	t.applyAggregateLocked(parentID, sizeDelta, allocatedDelta, unknownAllocatedDelta, fileDelta, dirDelta, fileType)
	return id, nil
}

// Mark adds flags to an existing node.
func (t *Tree) Mark(id NodeID, flags Flags) error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if !t.validLocked(id) {
		return ErrInvalidNode
	}
	t.nodes[id].flags |= flags
	return nil
}

// Node returns an immutable view of a node.
func (t *Tree) Node(id NodeID) (NodeView, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	if !t.validLocked(id) {
		return NodeView{}, false
	}
	return t.viewLocked(id), true
}

// Path reconstructs a full path without retaining one on every node.
func (t *Tree) Path(id NodeID) (string, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	if !t.validLocked(id) {
		return "", false
	}
	return t.pathLocked(id), true
}

func (t *Tree) pathLocked(id NodeID) string {
	if id == RootID {
		return t.rootPath
	}
	parts := make([]string, 0, 8)
	for current := id; current != RootID; current = t.nodes[current].parent {
		parts = append(parts, t.nameLocked(current))
	}
	path := t.rootPath
	for index := len(parts) - 1; index >= 0; index-- {
		path = filepath.Join(path, parts[index])
	}
	return path
}

// RootPath returns the canonical selected root stored once per tree.
func (t *Tree) RootPath() string {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.rootPath
}

// Len returns the number of authoritative nodes.
func (t *Tree) Len() int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return len(t.nodes)
}

// FirstChild returns the first child in discovery order.
func (t *Tree) FirstChild(parentID NodeID) (NodeID, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	if !t.validLocked(parentID) || t.nodes[parentID].firstChild == NoNode {
		return NoNode, false
	}
	return t.nodes[parentID].firstChild, true
}

// NextSibling returns the next sibling in discovery order.
func (t *Tree) NextSibling(id NodeID) (NodeID, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	if !t.validLocked(id) || t.nodes[id].nextSibling == NoNode {
		return NoNode, false
	}
	return t.nodes[id].nextSibling, true
}

// Children returns a bounded cursor page in discovery order.
func (t *Tree) Children(parentID, after NodeID, limit int) ([]NodeView, NodeID, bool, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	if !t.validLocked(parentID) || limit <= 0 {
		return nil, NoNode, false, ErrInvalidNode
	}
	current := t.nodes[parentID].firstChild
	if after != NoNode {
		found := false
		for current != NoNode {
			if current == after {
				found = true
				current = t.nodes[current].nextSibling
				break
			}
			current = t.nodes[current].nextSibling
		}
		if !found {
			return nil, NoNode, false, fmt.Errorf("%w: child cursor", ErrInvalidNode)
		}
	}

	views := make([]NodeView, 0, limit)
	last := NoNode
	for current != NoNode && len(views) < limit {
		views = append(views, t.viewLocked(current))
		last = current
		current = t.nodes[current].nextSibling
	}
	return views, last, current != NoNode, nil
}

func (t *Tree) checkAggregateLocked(id NodeID, size, allocated, unknownAllocated, files, dirs uint64) error {
	for current := id; current != NoNode; current = t.nodes[current].parent {
		n := t.nodes[current]
		if math.MaxUint64-n.logicalSize < size || math.MaxUint64-n.allocatedSize < allocated ||
			math.MaxUint64-n.unknownAllocated < unknownAllocated || math.MaxUint64-n.fileCount < files ||
			math.MaxUint64-n.dirCount < dirs {
			return ErrAggregateOverflow
		}
	}
	return nil
}

func (t *Tree) applyAggregateLocked(id NodeID, size, allocated, unknownAllocated, files, dirs uint64, fileType FileType) {
	for current := id; current != NoNode; current = t.nodes[current].parent {
		n := &t.nodes[current]
		n.logicalSize += size
		n.allocatedSize += allocated
		n.unknownAllocated += unknownAllocated
		n.fileCount += files
		n.dirCount += dirs
		if fileType != FileTypeUnknown && n.fileTypeIndex != uint32(NoNode) {
			t.fileTypes[n.fileTypeIndex][fileType-1] += size
		}
	}
}

func (t *Tree) viewLocked(id NodeID) NodeView {
	n := t.nodes[id]
	flags := n.flags
	if n.kind == KindDirectory && n.unknownAllocated == 0 {
		flags |= FlagAllocatedSizeKnown
	}
	dominantFileType := FileTypeUnknown
	var dominantFileTypeBytes uint64
	if n.fileTypeIndex != uint32(NoNode) {
		dominantFileType, dominantFileTypeBytes = t.fileTypes[n.fileTypeIndex].dominant()
	}
	return NodeView{
		ID:                    id,
		ParentID:              n.parent,
		Name:                  t.nameLocked(id),
		Kind:                  n.kind,
		Flags:                 flags,
		LogicalSize:           n.logicalSize,
		FileCount:             n.fileCount,
		DirCount:              n.dirCount,
		ChildCount:            n.childCount,
		Modified:              unixNanoToTime(n.modifiedNS),
		AllocatedSize:         n.allocatedSize,
		DominantFileType:      dominantFileType,
		DominantFileTypeBytes: dominantFileTypeBytes,
	}
}

func (t *Tree) nameLocked(id NodeID) string {
	n := t.nodes[id]
	return string(t.names[n.nameOffset : n.nameOffset+n.nameLength])
}

func (t *Tree) appendName(name string) uint32 {
	offset := uint32(len(t.names))
	t.names = append(t.names, name...)
	return offset
}

func (t *Tree) validLocked(id NodeID) bool {
	return id != NoNode && uint64(id) < uint64(len(t.nodes))
}

func nameOrPath(name, path string) string {
	if name != "" && name != "." {
		return name
	}
	if base := filepath.Base(filepath.Clean(path)); base != "." {
		return base
	}
	return path
}

func timeToUnixNano(value time.Time) int64 {
	if value.IsZero() {
		return 0
	}
	return value.UnixNano()
}

func unixNanoToTime(value int64) time.Time {
	if value == 0 {
		return time.Time{}
	}
	return time.Unix(0, value)
}
