package scanner

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rztaylor/diskorbit/internal/filesystem"
	"github.com/rztaylor/diskorbit/internal/model"
)

const (
	defaultWarningLimit   = 256
	defaultProgressPeriod = 250 * time.Millisecond
	// MaximumWorkers caps configured scanner concurrency and open readers.
	MaximumWorkers = 256
)

var (
	// ErrInvalidRoot reports a missing root or a root that is not a directory.
	ErrInvalidRoot = errors.New("invalid scan root")
	// ErrInvalidConfiguration reports unsafe or nonsensical scanner settings.
	ErrInvalidConfiguration = errors.New("invalid scanner configuration")
)

// Config defines process-wide scanner resource limits.
type Config struct {
	Reader           filesystem.Reader
	Workers          int
	WarningLimit     int
	ProgressInterval time.Duration
}

// Options define behavior for one prepared scan.
type Options struct {
	CrossFilesystems bool
}

// Progress is an honest point-in-time observation; no total-work percentage is
// implied because the amount of undiscovered work is unknown.
type Progress struct {
	Files       uint64
	Directories uint64
	Bytes       uint64
	Warnings    uint64
	Nodes       uint64
	Elapsed     time.Duration
}

// Result is the authoritative partial or completed scan output.
type Result struct {
	Tree          *model.Tree
	Progress      Progress
	Warnings      []Warning
	WarningTotal  uint64
	WarningCounts WarningCounts
	StartedAt     time.Time
	FinishedAt    time.Time
}

// ProgressFunc observes batched scanner progress from the Scan caller goroutine.
type ProgressFunc func(Progress)

// Scanner prepares and runs independent scans with shared resource defaults.
type Scanner struct {
	reader           filesystem.Reader
	workers          int
	warningLimit     int
	progressInterval time.Duration
}

// Prepared is a validated immutable scan root ready for traversal.
type Prepared struct {
	scanner  *Scanner
	rootPath string
	rootInfo filesystem.Entry
	options  Options
	tree     *model.Tree
}

// DefaultWorkers returns the conservative automatic worker limit.
func DefaultWorkers() int {
	workers := runtime.GOMAXPROCS(0)
	if workers < 2 {
		workers = 2
	}
	if workers > 8 {
		workers = 8
	}
	return workers
}

// New validates resource limits and returns a scanner.
func New(config Config) (*Scanner, error) {
	reader := config.Reader
	if reader == nil {
		reader = filesystem.Local{}
	}
	workers := config.Workers
	if workers == 0 {
		workers = DefaultWorkers()
	}
	if workers < 1 || workers > MaximumWorkers {
		return nil, fmt.Errorf("%w: workers must be between 1 and %d", ErrInvalidConfiguration, MaximumWorkers)
	}
	warningLimit := config.WarningLimit
	if warningLimit == 0 {
		warningLimit = defaultWarningLimit
	}
	if warningLimit < 1 {
		return nil, fmt.Errorf("%w: warning limit must be positive", ErrInvalidConfiguration)
	}
	progressInterval := config.ProgressInterval
	if progressInterval == 0 {
		progressInterval = defaultProgressPeriod
	}
	if progressInterval < 0 {
		return nil, fmt.Errorf("%w: progress interval cannot be negative", ErrInvalidConfiguration)
	}
	return &Scanner{
		reader:           reader,
		workers:          workers,
		warningLimit:     warningLimit,
		progressInterval: progressInterval,
	}, nil
}

// Prepare canonicalises and validates a selected directory synchronously.
func (s *Scanner) Prepare(ctx context.Context, path string, options Options) (*Prepared, error) {
	if s == nil {
		return nil, fmt.Errorf("%w: nil scanner", ErrInvalidConfiguration)
	}
	if ctx == nil {
		ctx = context.Background()
	}
	canonical, err := s.reader.Canonical(path)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidRoot, err)
	}
	rootInfo, err := s.reader.Stat(ctx, canonical)
	if err != nil {
		return nil, fmt.Errorf("%w %q: %w", ErrInvalidRoot, canonical, err)
	}
	if rootInfo.Kind != filesystem.KindDirectory {
		return nil, fmt.Errorf("%w %q: selected path is not a directory", ErrInvalidRoot, canonical)
	}
	return &Prepared{
		scanner:  s,
		rootPath: canonical,
		rootInfo: rootInfo,
		options:  options,
		tree:     model.NewTree(canonical, rootInfo.Name, rootInfo.Modified),
	}, nil
}

// RootPath returns the canonical selected root.
func (p *Prepared) RootPath() string {
	if p == nil {
		return ""
	}
	return p.rootPath
}

// Tree returns the progressive authoritative tree.
func (p *Prepared) Tree() *model.Tree {
	if p == nil {
		return nil
	}
	return p.tree
}

// Run traverses the prepared root and waits for every worker before returning.
func (p *Prepared) Run(ctx context.Context, onProgress ProgressFunc) (Result, error) {
	if p == nil || p.scanner == nil || p.tree == nil {
		return Result{}, fmt.Errorf("%w: nil prepared scan", ErrInvalidConfiguration)
	}
	if ctx == nil {
		ctx = context.Background()
	}
	startedAt := time.Now()
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	traversal := &traversal{
		ctx:                 runCtx,
		cancel:              cancel,
		prepared:            p,
		slots:               make(chan struct{}, p.scanner.workers),
		warnings:            newWarningCollector(p.scanner.warningLimit),
		startedAt:           startedAt,
		completion:          newCompletionTracker(p.tree),
		directoryIdentities: newDirectoryIdentitySet(p.rootInfo.Identity),
	}
	traversal.directories.Store(1)

	traversal.tasks.Add(1)
	traversal.slots <- struct{}{}
	go traversal.runTask(model.RootID, p.rootPath)
	done := make(chan struct{})
	go func() {
		traversal.tasks.Wait()
		close(done)
	}()

	emit := func() Progress {
		progress := traversal.progress(time.Now())
		if onProgress != nil {
			onProgress(progress)
		}
		return progress
	}
	emit()

	if p.scanner.progressInterval > 0 {
		ticker := time.NewTicker(p.scanner.progressInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				emit()
			case <-done:
				goto complete
			}
		}
	} else {
		<-done
	}

complete:
	finishedAt := time.Now()
	progress := traversal.progress(finishedAt)
	if onProgress != nil {
		onProgress(progress)
	}
	warnings, warningCounts := traversal.warnings.snapshot()
	result := Result{
		Tree:          p.tree,
		Progress:      progress,
		Warnings:      warnings,
		WarningTotal:  warningCounts.Total(),
		WarningCounts: warningCounts,
		StartedAt:     startedAt,
		FinishedAt:    finishedAt,
	}
	if fatalErr := traversal.fatal(); fatalErr != nil {
		return result, fatalErr
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	return result, nil
}

type traversal struct {
	ctx                 context.Context
	cancel              context.CancelFunc
	prepared            *Prepared
	slots               chan struct{}
	tasks               sync.WaitGroup
	warnings            *warningCollector
	startedAt           time.Time
	completion          *completionTracker
	directoryIdentities *directoryIdentitySet

	files       atomic.Uint64
	directories atomic.Uint64
	bytes       atomic.Uint64

	errMu sync.Mutex
	err   error
}

func (t *traversal) runTask(nodeID model.NodeID, path string) {
	defer t.tasks.Done()
	defer func() { <-t.slots }()
	t.scanDirectory(nodeID, path)
}

func (t *traversal) scanDirectory(nodeID model.NodeID, path string) {
	if err := t.completion.finish(nodeID, t.walkDirectory(nodeID, path)); err != nil {
		t.setFatal(err)
	}
}

func (t *traversal) walkDirectory(nodeID model.NodeID, path string) bool {
	if t.ctx.Err() != nil {
		return false
	}
	complete := true
	err := t.prepared.scanner.reader.ReadDir(t.ctx, path, func(entry filesystem.Entry, infoErr error) error {
		if t.ctx.Err() != nil {
			return t.ctx.Err()
		}
		flags := model.Flags(0)
		if infoErr != nil {
			complete = false
			flags |= model.FlagWarning
			t.warnings.add(filepath.Join(path, entry.Name), "stat", infoErr)
		}
		if entry.Kind == filesystem.KindDirectory && !t.prepared.options.CrossFilesystems &&
			t.prepared.rootInfo.Identity.Known && entry.Identity.Known &&
			entry.Identity.Device != t.prepared.rootInfo.Identity.Device {
			flags |= model.FlagFilesystemBoundary
		}
		if entry.AllocatedKnown {
			flags |= model.FlagAllocatedSizeKnown
		}
		if entry.Kind == filesystem.KindDirectory && !t.directoryIdentities.claim(entry.Identity) {
			return nil
		}
		childID, addErr := t.prepared.tree.Add(nodeID, model.NodeSpec{
			Name:          entry.Name,
			Kind:          modelKind(entry.Kind),
			LogicalSize:   entry.Size,
			AllocatedSize: entry.AllocatedSize,
			Modified:      entry.Modified,
			Flags:         flags,
		})
		if addErr != nil {
			t.setFatal(fmt.Errorf("add filesystem node %q: %w", filepath.Join(path, entry.Name), addErr))
			return addErr
		}
		_ = childID
		if entry.Kind == filesystem.KindDirectory {
			t.directories.Add(1)
		} else {
			t.files.Add(1)
			t.bytes.Add(entry.Size)
		}
		return nil
	})
	if err != nil {
		if t.ctx.Err() != nil {
			return false
		}
		t.warnings.add(path, "read_directory", err)
		_ = t.prepared.tree.Mark(nodeID, model.FlagWarning)
		return false
	}

	for childID, ok := t.prepared.tree.FirstChild(nodeID); ok; {
		child, exists := t.prepared.tree.Node(childID)
		if !exists {
			t.setFatal(fmt.Errorf("read discovered child %d: %w", childID, model.ErrInvalidNode))
			return false
		}
		nextID, hasNext := t.prepared.tree.NextSibling(childID)
		if child.Kind == model.KindDirectory && child.Flags&model.FlagFilesystemBoundary == 0 && t.ctx.Err() == nil {
			childPath := filepath.Join(path, child.Name)
			if err := t.completion.add(nodeID, childID); err != nil {
				t.setFatal(err)
				return false
			}
			select {
			case t.slots <- struct{}{}:
				t.tasks.Add(1)
				go t.runTask(childID, childPath)
			default:
				t.scanDirectory(childID, childPath)
			}
		}
		if !hasNext {
			break
		}
		childID = nextID
	}
	return complete && t.ctx.Err() == nil
}

type directoryIdentity struct {
	device uint64
	file   uint64
}

// directoryIdentitySet prevents a directory exposed through multiple paths
// from being traversed and aggregated more than once. Claims happen during
// discovery, before descendant workers start, so shallower paths win.
type directoryIdentitySet struct {
	mu   sync.Mutex
	seen map[directoryIdentity]struct{}
}

func newDirectoryIdentitySet(root filesystem.Identity) *directoryIdentitySet {
	identities := &directoryIdentitySet{seen: make(map[directoryIdentity]struct{})}
	identities.claim(root)
	return identities
}

func (s *directoryIdentitySet) claim(identity filesystem.Identity) bool {
	if !identity.Known || identity.File == 0 {
		return true
	}
	key := directoryIdentity{device: identity.Device, file: identity.File}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.seen[key]; exists {
		return false
	}
	s.seen[key] = struct{}{}
	return true
}

func (t *traversal) setFatal(err error) {
	if err == nil {
		return
	}
	t.errMu.Lock()
	if t.err == nil {
		t.err = err
		t.cancel()
	}
	t.errMu.Unlock()
}

func (t *traversal) fatal() error {
	t.errMu.Lock()
	defer t.errMu.Unlock()
	return t.err
}

func (t *traversal) progress(now time.Time) Progress {
	return Progress{
		Files:       t.files.Load(),
		Directories: t.directories.Load(),
		Bytes:       t.bytes.Load(),
		Warnings:    t.warnings.count(),
		Nodes:       uint64(t.prepared.tree.Len()),
		Elapsed:     now.Sub(t.startedAt),
	}
}

func modelKind(kind filesystem.Kind) model.Kind {
	switch kind {
	case filesystem.KindDirectory:
		return model.KindDirectory
	case filesystem.KindSymlink:
		return model.KindSymlink
	case filesystem.KindSpecial:
		return model.KindSpecial
	default:
		return model.KindFile
	}
}
