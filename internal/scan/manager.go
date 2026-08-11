package scan

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/rztaylor/diskorbit/internal/model"
	"github.com/rztaylor/diskorbit/internal/scanner"
)

// State is the lifecycle state of one scan.
type State string

const (
	StateQueued     State = "queued"
	StateScanning   State = "scanning"
	StateCancelling State = "cancelling"
	StateCompleted  State = "completed"
	StateCancelled  State = "cancelled"
	StateFailed     State = "failed"
)

const defaultRetainedScans = 4

var (
	ErrActiveScan      = errors.New("a scan is already active")
	ErrScanNotFound    = errors.New("scan not found")
	ErrScanNotRunning  = errors.New("scan is not running")
	ErrScanNotComplete = errors.New("scan is not complete")
	ErrManagerClosed   = errors.New("scan manager is closed")
)

// Config defines manager-owned retention and scanner dependencies.
type Config struct {
	Scanner       *scanner.Scanner
	RetainResults int
	Observer      Observer
	CapacityProbe CapacityProbe
}

// Observer receives bounded lifecycle snapshots after manager locks are released.
type Observer func(Snapshot)

// Capacity is the selected root filesystem's total and available byte capacity.
type Capacity struct {
	Total     uint64
	Available uint64
}

// CapacityProbe optionally resolves capacity for an explicitly selected root.
type CapacityProbe func(context.Context, string) (Capacity, bool)

// Walk visits one retained terminal scan subtree without copying it.
func (m *Manager) Walk(scanID string, rootID model.NodeID, visit func(model.NodeView, string) error) error {
	m.mu.Lock()
	item, ok := m.scans[scanID]
	if !ok {
		m.mu.Unlock()
		return ErrScanNotFound
	}
	if !terminal(item.state) {
		m.mu.Unlock()
		return ErrScanNotComplete
	}
	tree := item.tree
	m.mu.Unlock()
	return tree.Walk(rootID, visit)
}

// StartRequest describes one validated scan request.
type StartRequest struct {
	Path             string
	CrossFilesystems bool
}

// Snapshot is a bounded immutable scan view.
type Snapshot struct {
	ID            string
	Path          string
	State         State
	Revision      uint64
	Progress      scanner.Progress
	Warnings      []scanner.Warning
	WarningCounts scanner.WarningCounts
	StartedAt     time.Time
	FinishedAt    time.Time
	ErrorMessage  string
	Capacity      Capacity
	CapacityKnown bool
}

// Update returns the newest complete snapshot only when its revision changed.
type Update struct {
	Revision uint64
	Changed  bool
	Snapshot Snapshot
}

// NodeResult combines an authoritative node with its reconstructed path.
type NodeResult struct {
	Node model.NodeView
	Path string
}

// ChildrenResult is one bounded child cursor page.
type ChildrenResult struct {
	Nodes     []model.NodeView
	Paths     []string
	NextAfter model.NodeID
	More      bool
}

// Manager coordinates scanner instances for one application process.
type Manager struct {
	mu       sync.Mutex
	ctx      context.Context
	cancel   context.CancelFunc
	scanner  *scanner.Scanner
	retain   int
	observer Observer
	capacity CapacityProbe
	nextID   uint64
	starting bool
	closed   bool
	scans    map[string]*record
	order    []string
	wg       sync.WaitGroup
}

type record struct {
	id            string
	path          string
	state         State
	revision      uint64
	progress      scanner.Progress
	warnings      []scanner.Warning
	warningCounts scanner.WarningCounts
	startedAt     time.Time
	finishedAt    time.Time
	errorMessage  string
	capacity      Capacity
	capacityKnown bool
	tree          *model.Tree
	cancel        context.CancelFunc
	done          chan struct{}
}

// NewManager returns a process-local scan manager.
func NewManager(parent context.Context, config Config) (*Manager, error) {
	if config.Scanner == nil {
		return nil, fmt.Errorf("scan manager requires a scanner")
	}
	if parent == nil {
		parent = context.Background()
	}
	retain := config.RetainResults
	if retain == 0 {
		retain = defaultRetainedScans
	}
	if retain < 1 {
		return nil, fmt.Errorf("scan result retention must be positive")
	}
	ctx, cancel := context.WithCancel(parent)
	return &Manager{
		ctx:      ctx,
		cancel:   cancel,
		scanner:  config.Scanner,
		retain:   retain,
		observer: config.Observer,
		capacity: config.CapacityProbe,
		scans:    make(map[string]*record),
	}, nil
}

// Start validates a root, creates a scan ID, and starts traversal.
func (m *Manager) Start(ctx context.Context, request StartRequest) (Snapshot, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return Snapshot{}, ErrManagerClosed
	}
	if m.starting || m.hasActiveLocked() {
		m.mu.Unlock()
		return Snapshot{}, ErrActiveScan
	}
	m.starting = true
	m.mu.Unlock()

	prepared, err := m.scanner.Prepare(ctx, request.Path, scanner.Options{CrossFilesystems: request.CrossFilesystems})
	var capacity Capacity
	var capacityKnown bool
	if err == nil && m.capacity != nil {
		capacity, capacityKnown = m.capacity(ctx, prepared.RootPath())
	}

	m.mu.Lock()
	m.starting = false
	if err != nil {
		m.mu.Unlock()
		return Snapshot{}, err
	}
	if m.closed || m.ctx.Err() != nil {
		m.mu.Unlock()
		return Snapshot{}, ErrManagerClosed
	}
	m.nextID++
	id := "scan-" + strconv.FormatUint(m.nextID, 36)
	scanCtx, cancel := context.WithCancel(m.ctx)
	item := &record{
		id:            id,
		path:          prepared.RootPath(),
		state:         StateScanning,
		revision:      1,
		startedAt:     time.Now(),
		tree:          prepared.Tree(),
		cancel:        cancel,
		done:          make(chan struct{}),
		capacity:      capacity,
		capacityKnown: capacityKnown,
	}
	m.scans[id] = item
	m.order = append(m.order, id)
	m.pruneLocked()
	snapshot := snapshotLocked(item)
	m.wg.Add(1)
	m.mu.Unlock()
	m.notify(snapshot)

	go m.run(item, scanCtx, prepared)
	return snapshot, nil
}

// Get returns one current scan snapshot.
func (m *Manager) Get(id string) (Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	item, ok := m.scans[id]
	if !ok {
		return Snapshot{}, ErrScanNotFound
	}
	return snapshotLocked(item), nil
}

// List returns retained scans in creation order.
func (m *Manager) List() []Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]Snapshot, 0, len(m.order))
	for _, id := range m.order {
		if item, ok := m.scans[id]; ok {
			result = append(result, snapshotLocked(item))
		}
	}
	return result
}

// Updates returns the latest snapshot if its revision is newer than after.
func (m *Manager) Updates(id string, after uint64) (Update, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	item, ok := m.scans[id]
	if !ok {
		return Update{}, ErrScanNotFound
	}
	update := Update{Revision: item.revision}
	if item.revision > after {
		update.Changed = true
		update.Snapshot = snapshotLocked(item)
	}
	return update, nil
}

// Cancel requests cancellation and exposes the cancelling state immediately.
func (m *Manager) Cancel(id string) (Snapshot, error) {
	m.mu.Lock()
	item, ok := m.scans[id]
	if !ok {
		m.mu.Unlock()
		return Snapshot{}, ErrScanNotFound
	}
	if item.state != StateScanning && item.state != StateQueued {
		m.mu.Unlock()
		return Snapshot{}, ErrScanNotRunning
	}
	item.state = StateCancelling
	item.revision++
	cancel := item.cancel
	snapshot := snapshotLocked(item)
	m.mu.Unlock()
	cancel()
	m.notify(snapshot)
	return snapshot, nil
}

// Node returns a node and reconstructed path from a retained scan.
func (m *Manager) Node(scanID string, nodeID model.NodeID) (NodeResult, error) {
	tree, err := m.tree(scanID)
	if err != nil {
		return NodeResult{}, err
	}
	node, ok := tree.Node(nodeID)
	if !ok {
		return NodeResult{}, model.ErrInvalidNode
	}
	path, ok := tree.Path(nodeID)
	if !ok {
		return NodeResult{}, model.ErrInvalidNode
	}
	return NodeResult{Node: node, Path: path}, nil
}

// Children returns one bounded child page from a retained scan.
func (m *Manager) Children(scanID string, nodeID, after model.NodeID, limit int) (ChildrenResult, error) {
	tree, err := m.tree(scanID)
	if err != nil {
		return ChildrenResult{}, err
	}
	nodes, nextAfter, more, err := tree.Children(nodeID, after, limit)
	if err != nil {
		return ChildrenResult{}, err
	}
	paths := make([]string, len(nodes))
	for index, node := range nodes {
		path, ok := tree.Path(node.ID)
		if !ok {
			return ChildrenResult{}, model.ErrInvalidNode
		}
		paths[index] = path
	}
	return ChildrenResult{Nodes: nodes, Paths: paths, NextAfter: nextAfter, More: more}, nil
}

// Wait waits for one retained scan to reach a terminal state.
func (m *Manager) Wait(ctx context.Context, id string) (Snapshot, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	m.mu.Lock()
	item, ok := m.scans[id]
	if !ok {
		m.mu.Unlock()
		return Snapshot{}, ErrScanNotFound
	}
	done := item.done
	m.mu.Unlock()
	select {
	case <-done:
		return m.Get(id)
	case <-ctx.Done():
		return Snapshot{}, ctx.Err()
	}
}

// Close cancels active work and waits for all scanner goroutines to stop.
func (m *Manager) Close() {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		m.wg.Wait()
		return
	}
	m.closed = true
	for _, item := range m.scans {
		if item.state == StateScanning || item.state == StateQueued {
			item.state = StateCancelling
			item.revision++
		}
	}
	cancel := m.cancel
	m.mu.Unlock()
	cancel()
	m.wg.Wait()
}

func (m *Manager) run(item *record, ctx context.Context, prepared *scanner.Prepared) {
	defer m.wg.Done()
	result, err := prepared.Run(ctx, func(progress scanner.Progress) {
		m.mu.Lock()
		if current, ok := m.scans[item.id]; ok {
			current.progress = progress
			current.revision++
		}
		m.mu.Unlock()
	})

	m.mu.Lock()
	current, ok := m.scans[item.id]
	if !ok {
		m.mu.Unlock()
		close(item.done)
		return
	}
	current.progress = result.Progress
	current.warnings = append([]scanner.Warning(nil), result.Warnings...)
	current.warningCounts = result.WarningCounts
	current.startedAt = result.StartedAt
	current.finishedAt = result.FinishedAt
	switch {
	case err == nil:
		current.state = StateCompleted
	case errors.Is(err, context.Canceled):
		current.state = StateCancelled
	default:
		current.state = StateFailed
		current.errorMessage = err.Error()
	}
	current.revision++
	snapshot := snapshotLocked(current)
	m.pruneLocked()
	m.mu.Unlock()
	m.notify(snapshot)
	close(current.done)
}

func (m *Manager) notify(snapshot Snapshot) {
	if m.observer != nil {
		m.observer(snapshot)
	}
}

func (m *Manager) tree(scanID string) (*model.Tree, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	item, ok := m.scans[scanID]
	if !ok {
		return nil, ErrScanNotFound
	}
	return item.tree, nil
}

func (m *Manager) hasActiveLocked() bool {
	for _, item := range m.scans {
		if item.state == StateQueued || item.state == StateScanning || item.state == StateCancelling {
			return true
		}
	}
	return false
}

func (m *Manager) pruneLocked() {
	terminalCount := 0
	for _, id := range m.order {
		if item, ok := m.scans[id]; ok && terminal(item.state) {
			terminalCount++
		}
	}
	if terminalCount <= m.retain {
		return
	}
	remove := terminalCount - m.retain
	kept := m.order[:0]
	for _, id := range m.order {
		item, ok := m.scans[id]
		if !ok {
			continue
		}
		if remove > 0 && terminal(item.state) {
			delete(m.scans, id)
			remove--
			continue
		}
		kept = append(kept, id)
	}
	m.order = kept
}

func snapshotLocked(item *record) Snapshot {
	return Snapshot{
		ID:            item.id,
		Path:          item.path,
		State:         item.state,
		Revision:      item.revision,
		Progress:      item.progress,
		Warnings:      append([]scanner.Warning(nil), item.warnings...),
		WarningCounts: item.warningCounts,
		StartedAt:     item.startedAt,
		FinishedAt:    item.finishedAt,
		ErrorMessage:  item.errorMessage,
		Capacity:      item.capacity,
		CapacityKnown: item.capacityKnown,
	}
}

func terminal(state State) bool {
	return state == StateCompleted || state == StateCancelled || state == StateFailed
}
