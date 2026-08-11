package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/rztaylor/diskorbit/internal/buildinfo"
	"github.com/rztaylor/diskorbit/internal/scanner"
	"github.com/rztaylor/singleserve"
)

func TestServerComposesAuthenticatedApplication(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runtime, err := newRuntime(ctx, Options{
		Build: buildinfo.Info{Version: "test"}, SettingsPath: filepath.Join(t.TempDir(), "settings.json"),
	})
	if err != nil {
		t.Fatalf("newRuntime(): %v", err)
	}
	defer runtime.scans.Close()
	launch, err := runtime.server.Start(ctx)
	if err != nil {
		t.Fatalf("Start(): %v", err)
	}
	defer func() {
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer shutdownCancel()
		_ = launch.Shutdown(shutdownCtx)
	}()

	unauthenticatedTransport := http.DefaultTransport.(*http.Transport).Clone()
	unauthenticatedTransport.Proxy = nil
	unauthenticatedTransport.DialContext = func(ctx context.Context, network, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, launch.Address())
	}
	defer unauthenticatedTransport.CloseIdleConnections()
	unauthenticatedResponse, err := (&http.Client{Transport: unauthenticatedTransport}).Get(launch.BaseURL() + "api/status")
	if err != nil {
		t.Fatalf("unauthenticated GET /api/status: %v", err)
	}
	unauthenticatedResponse.Body.Close()
	if unauthenticatedResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d, want %d", unauthenticatedResponse.StatusCode, http.StatusUnauthorized)
	}

	response, err := launch.Client().Get(launch.BaseURL() + "api/status")
	if err != nil {
		t.Fatalf("GET /api/status: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	if got := response.Header.Get("Content-Security-Policy"); !strings.Contains(got, "default-src 'self'") {
		t.Errorf("Content-Security-Policy = %q", got)
	}
	var status struct {
		Name  string         `json:"name"`
		Build buildinfo.Info `json:"build"`
	}
	if err := json.NewDecoder(response.Body).Decode(&status); err != nil {
		t.Fatalf("decode status: %v", err)
	}
	if status.Name != "DiskOrbit" || status.Build.Version != "test" {
		t.Fatalf("unexpected status response: %+v", status)
	}
	settingsResponse, err := launch.Client().Get(launch.BaseURL() + "api/settings")
	if err != nil {
		t.Fatalf("GET /api/settings: %v", err)
	}
	defer settingsResponse.Body.Close()
	if settingsResponse.StatusCode != http.StatusOK {
		t.Fatalf("settings status = %d, want %d", settingsResponse.StatusCode, http.StatusOK)
	}
	var document struct {
		Value struct {
			Theme string `json:"theme"`
			Chart struct {
				NodeBudget int `json:"nodeBudget"`
			} `json:"chart"`
		} `json:"value"`
		Defaults struct {
			Chart struct {
				NodeBudget int `json:"nodeBudget"`
			} `json:"chart"`
		} `json:"defaults"`
	}
	if err := json.NewDecoder(settingsResponse.Body).Decode(&document); err != nil {
		t.Fatalf("decode settings: %v", err)
	}
	if document.Value.Theme != "system" || document.Value.Chart.NodeBudget != 4000 || document.Defaults.Chart.NodeBudget != 4000 {
		t.Fatalf("unexpected settings response: %+v", document)
	}

	indexResponse, err := launch.Client().Get(launch.BaseURL())
	if err != nil {
		t.Fatalf("GET /: %v", err)
	}
	defer indexResponse.Body.Close()
	index, err := io.ReadAll(indexResponse.Body)
	if err != nil {
		t.Fatalf("read index: %v", err)
	}
	if !strings.Contains(string(index), "<title>DiskOrbit</title>") {
		t.Error("embedded frontend title is missing")
	}
}

func TestRuntimeStartsInitialScan(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runtime, err := newRuntime(ctx, Options{InitialPath: t.TempDir(), Workers: 1})
	if err != nil {
		t.Fatalf("newRuntime(): %v", err)
	}
	defer runtime.scans.Close()
	scans := runtime.scans.List()
	if len(scans) != 1 || scans[0].Path == "" {
		t.Fatalf("initial scans = %+v", scans)
	}
}

func TestRuntimeRejectsInvalidInitialPath(t *testing.T) {
	t.Parallel()

	_, err := newRuntime(context.Background(), Options{InitialPath: filepath.Join(t.TempDir(), "missing")})
	if !errors.Is(err, scanner.ErrInvalidRoot) {
		t.Fatalf("newRuntime() error = %v, want ErrInvalidRoot", err)
	}
}

func TestTolerableBrowserDrainIsNarrow(t *testing.T) {
	t.Parallel()
	requests := newRequestTracker()
	deadline := fmt.Errorf("wrapped: %w", context.DeadlineExceeded)
	if !tolerableBrowserDrain(singleserve.Result{Reason: singleserve.ShutdownBrowserRequest}, deadline, requests) {
		t.Error("authenticated browser drain with no application requests was not tolerated")
	}
	requests.paths["/api/scans"] = 1
	if tolerableBrowserDrain(singleserve.Result{Reason: singleserve.ShutdownBrowserRequest}, deadline, requests) {
		t.Error("drain with an active application request was tolerated")
	}
	delete(requests.paths, "/api/scans")
	if tolerableBrowserDrain(singleserve.Result{Reason: singleserve.ShutdownContextCanceled}, deadline, requests) {
		t.Error("context-cancelled drain was tolerated")
	}
}

func TestRunStopsWhenParentContextIsCancelled(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	opened := make(chan struct{})
	opener := singleserve.BrowserOpenerFunc(func(context.Context, string) error {
		close(opened)
		cancel()
		return nil
	})
	done := make(chan error, 1)
	go func() {
		done <- Run(ctx, Options{Opener: opener})
	}()

	select {
	case <-opened:
	case <-time.After(5 * time.Second):
		t.Fatal("browser was not opened")
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run(): %v", err)
		}
	case <-time.After(7 * time.Second):
		t.Fatal("Run() did not stop after parent cancellation")
	}
}
