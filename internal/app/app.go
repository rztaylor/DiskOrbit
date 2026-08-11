package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/rztaylor/diskorbit/internal/api"
	"github.com/rztaylor/diskorbit/internal/buildinfo"
	"github.com/rztaylor/diskorbit/internal/filesystem"
	"github.com/rztaylor/diskorbit/internal/platform"
	"github.com/rztaylor/diskorbit/internal/report"
	"github.com/rztaylor/diskorbit/internal/scan"
	"github.com/rztaylor/diskorbit/internal/scanner"
	"github.com/rztaylor/diskorbit/internal/settings"
	"github.com/rztaylor/diskorbit/internal/webui"
	"github.com/rztaylor/singleserve"
)

// Options configures one DiskOrbit process lifetime.
type Options struct {
	Build        buildinfo.Info
	Debug        bool
	InitialPath  string
	SettingsPath string
	Workers      int
	Stdout       io.Writer
	Stderr       io.Writer
	Opener       singleserve.BrowserOpener
}

type runtime struct {
	server   *singleserve.Server
	scans    *scan.Manager
	requests *requestTracker
}

// Run starts DiskOrbit and blocks until its local server has drained.
func Run(ctx context.Context, options Options) error {
	if ctx == nil {
		ctx = context.Background()
	}
	stdout := writerOrDiscard(options.Stdout)
	stderr := writerOrDiscard(options.Stderr)

	runtime, err := newRuntime(ctx, options)
	if err != nil {
		return err
	}
	defer runtime.scans.Close()
	launch, err := runtime.server.Start(ctx)
	if err != nil {
		return fmt.Errorf("start local server: %w", err)
	}
	if options.Debug {
		fmt.Fprintf(stderr, "DiskOrbit listening on loopback %s\n", launch.Address())
	}

	if err := launch.OpenBrowser(ctx); err != nil {
		if ctx.Err() != nil {
			result, waitErr := launch.Wait()
			if waitErr != nil {
				return fmt.Errorf("local server shutdown: %w", waitErr)
			}
			if options.Debug {
				fmt.Fprintf(stdout, "DiskOrbit stopped: %s\n", result.Reason)
			}
			return nil
		}
		manualURL, renewErr := launch.NewBootstrapURL()
		if renewErr != nil {
			shutdownErr := shutdownLaunch(launch)
			return errors.Join(fmt.Errorf("open browser: %w", err), fmt.Errorf("create manual browser URL: %w", renewErr), shutdownErr)
		}
		fmt.Fprintf(stderr, "Could not open a browser: %v\nOpen this URL within two minutes: %s\n", err, manualURL)
	}

	result, err := launch.Wait()
	if err != nil {
		if tolerableBrowserDrain(result, err, runtime.requests) {
			if options.Debug {
				fmt.Fprintln(stderr, "DiskOrbit forced closed an unused browser connection after authenticated Quit")
			}
			return nil
		}
		if options.Debug {
			fmt.Fprintf(stderr, "DiskOrbit active application requests at shutdown: %s\n", runtime.requests.String())
		}
		return fmt.Errorf("local server shutdown: %w", err)
	}
	if options.Debug {
		fmt.Fprintf(stdout, "DiskOrbit stopped: %s\n", result.Reason)
	}
	return nil
}

func tolerableBrowserDrain(result singleserve.Result, err error, requests *requestTracker) bool {
	return result.Reason == singleserve.ShutdownBrowserRequest && errors.Is(err, context.DeadlineExceeded) && requests != nil && requests.Empty()
}

func newRuntime(ctx context.Context, options Options) (*runtime, error) {
	frontend, err := webui.New()
	if err != nil {
		return nil, err
	}
	engine, err := scanner.New(scanner.Config{Workers: options.Workers})
	if err != nil {
		return nil, err
	}
	host := platform.Host{}
	manager, err := scan.NewManager(ctx, scan.Config{
		Scanner:  engine,
		Observer: scanDiagnostics(options.Debug, writerOrDiscard(options.Stderr)),
		CapacityProbe: func(ctx context.Context, path string) (scan.Capacity, bool) {
			capacity, known := host.VolumeCapacity(ctx, path)
			return scan.Capacity{Total: capacity.Total, Available: capacity.Available}, known
		},
	})
	if err != nil {
		return nil, err
	}
	if options.InitialPath != "" {
		if _, err := manager.Start(ctx, scan.StartRequest{Path: options.InitialPath}); err != nil {
			manager.Close()
			return nil, fmt.Errorf("start initial scan: %w", err)
		}
	}
	reports, err := report.New(manager)
	if err != nil {
		manager.Close()
		return nil, err
	}
	preferences, err := settings.NewStore(options.SettingsPath)
	if err != nil {
		manager.Close()
		return nil, err
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", api.New(api.Options{
		Build: options.Build, Scans: manager, Host: host, Directories: filesystem.Local{}, Reports: reports, Settings: preferences,
	}))
	mux.Handle("/", frontend)

	serverOptions := singleserve.Options{
		Handler:  nil,
		Lifetime: singleserve.BrowserBoundLifetime(),
		Opener:   options.Opener,
	}
	requests := newRequestTracker()
	serverOptions.Handler = requests.Wrap(securityHeaders(mux))
	server, err := singleserve.New(serverOptions)
	if err != nil {
		manager.Close()
		return nil, fmt.Errorf("configure local server: %w", err)
	}
	return &runtime{server: server, scans: manager, requests: requests}, nil
}

func scanDiagnostics(enabled bool, output io.Writer) scan.Observer {
	if !enabled {
		return nil
	}
	var mu sync.Mutex
	return func(snapshot scan.Snapshot) {
		mu.Lock()
		defer mu.Unlock()
		fmt.Fprintf(
			output,
			"DiskOrbit scan id=%q state=%q path=%q files=%d directories=%d bytes=%d warnings=%d elapsed_ms=%d",
			snapshot.ID, snapshot.State, snapshot.Path, snapshot.Progress.Files, snapshot.Progress.Directories,
			snapshot.Progress.Bytes, snapshot.Progress.Warnings, snapshot.Progress.Elapsed.Milliseconds(),
		)
		if snapshot.ErrorMessage != "" {
			fmt.Fprintf(output, " error=%q", snapshot.ErrorMessage)
		}
		fmt.Fprintln(output)
		if terminalScan(snapshot.State) {
			for _, warning := range snapshot.Warnings {
				fmt.Fprintf(output, "DiskOrbit scan_warning id=%q operation=%q path=%q error=%q\n", snapshot.ID, warning.Operation, warning.Path, warning.Message)
			}
		}
	}
}

func terminalScan(state scan.State) bool {
	return state == scan.StateCompleted || state == scan.StateCancelled || state == scan.StateFailed
}

type requestTracker struct {
	mu    sync.Mutex
	paths map[string]int
}

func newRequestTracker() *requestTracker { return &requestTracker{paths: make(map[string]int)} }

func (t *requestTracker) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.mu.Lock()
		t.paths[r.URL.Path]++
		t.mu.Unlock()
		defer func() {
			t.mu.Lock()
			t.paths[r.URL.Path]--
			if t.paths[r.URL.Path] == 0 {
				delete(t.paths, r.URL.Path)
			}
			t.mu.Unlock()
		}()
		next.ServeHTTP(w, r)
	})
}

func (t *requestTracker) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(t.paths) == 0 {
		return "none"
	}
	paths := make([]string, 0, len(t.paths))
	for path, count := range t.paths {
		paths = append(paths, fmt.Sprintf("%s (%d)", path, count))
	}
	sort.Strings(paths)
	return strings.Join(paths, ", ")
}

func (t *requestTracker) Empty() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return len(t.paths) == 0
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}

func shutdownLaunch(launch *singleserve.Launch) error {
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	if err := launch.Shutdown(ctx); err != nil {
		return fmt.Errorf("stop local server after launch failure: %w", err)
	}
	return nil
}

func writerOrDiscard(writer io.Writer) io.Writer {
	if writer == nil {
		return io.Discard
	}
	return writer
}
