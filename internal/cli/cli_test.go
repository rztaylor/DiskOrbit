package cli

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/rztaylor/diskorbit/internal/app"
	"github.com/rztaylor/diskorbit/internal/buildinfo"
)

func TestRunImmediateResults(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		args       []string
		wantCode   int
		wantStdout string
		wantStderr string
	}{
		{name: "help", args: []string{"--help"}, wantCode: 0, wantStdout: "Usage: diskorbit [options] [path]"},
		{name: "version", args: []string{"--version"}, wantCode: 0, wantStdout: "DiskOrbit 1.2.3 (commit abc, built today)"},
		{name: "unknown flag", args: []string{"--unknown"}, wantCode: 2, wantStderr: "flag provided but not defined"},
		{name: "too many paths", args: []string{"/tmp", "/var"}, wantCode: 2, wantStderr: "expected at most one path"},
		{name: "negative workers", args: []string{"--workers", "-1"}, wantCode: 2, wantStderr: "--workers must be between"},
		{name: "excess workers", args: []string{"--workers", "257"}, wantCode: 2, wantStderr: "--workers must be between"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			var stdout bytes.Buffer
			var stderr bytes.Buffer
			called := false
			code := Run(context.Background(), test.args, &stdout, &stderr, Dependencies{
				Build: buildinfo.Info{Version: "1.2.3", Commit: "abc", BuildDate: "today"},
				RunApp: func(context.Context, app.Options) error {
					called = true
					return nil
				},
			})
			if code != test.wantCode {
				t.Fatalf("Run() code = %d, want %d", code, test.wantCode)
			}
			if test.wantStdout != "" && !strings.Contains(stdout.String(), test.wantStdout) {
				t.Errorf("stdout %q does not contain %q", stdout.String(), test.wantStdout)
			}
			if test.wantStderr != "" && !strings.Contains(stderr.String(), test.wantStderr) {
				t.Errorf("stderr %q does not contain %q", stderr.String(), test.wantStderr)
			}
			if called {
				t.Error("application runner called for immediate-result command")
			}
		})
	}
}

func TestRunStartsApplicationWithScanOptions(t *testing.T) {
	t.Parallel()

	var received app.Options
	code := Run(context.Background(), []string{"--debug", "--workers", "3", "/tmp/example"}, ioDiscard{}, ioDiscard{}, Dependencies{
		Build: buildinfo.Info{Version: "dev"},
		RunApp: func(_ context.Context, options app.Options) error {
			received = options
			return nil
		},
	})
	if code != 0 {
		t.Fatalf("Run() code = %d, want 0", code)
	}
	if !received.Debug {
		t.Error("Run() did not pass debug option")
	}
	if received.InitialPath != "/tmp/example" || received.Workers != 3 {
		t.Errorf("scan options = path %q, workers %d", received.InitialPath, received.Workers)
	}
	if received.Build.Version != "dev" {
		t.Errorf("build version = %q, want dev", received.Build.Version)
	}
}

func TestRunReportsApplicationFailure(t *testing.T) {
	t.Parallel()

	var stderr bytes.Buffer
	code := Run(context.Background(), nil, ioDiscard{}, &stderr, Dependencies{
		RunApp: func(context.Context, app.Options) error { return errors.New("startup failed") },
	})
	if code != 1 {
		t.Fatalf("Run() code = %d, want 1", code)
	}
	if got := stderr.String(); got != "diskorbit: startup failed\n" {
		t.Fatalf("stderr = %q", got)
	}
}

type ioDiscard struct{}

func (ioDiscard) Write(data []byte) (int, error) { return len(data), nil }
