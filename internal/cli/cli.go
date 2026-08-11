package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"

	"github.com/rztaylor/diskorbit/internal/app"
	"github.com/rztaylor/diskorbit/internal/buildinfo"
	"github.com/rztaylor/diskorbit/internal/scanner"
)

// AppRunner starts the application and blocks until its lifecycle completes.
type AppRunner func(context.Context, app.Options) error

// Dependencies are process-owned collaborators used by Run.
type Dependencies struct {
	Build  buildinfo.Info
	RunApp AppRunner
}

// Run executes the command and returns a process exit code.
func Run(ctx context.Context, args []string, stdout, stderr io.Writer, dependencies Dependencies) int {
	if ctx == nil {
		ctx = context.Background()
	}
	if stdout == nil {
		stdout = io.Discard
	}
	if stderr == nil {
		stderr = io.Discard
	}

	flags := flag.NewFlagSet("diskorbit", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	debug := flags.Bool("debug", false, "show lifecycle diagnostics")
	showVersion := flags.Bool("version", false, "show version information")
	workers := flags.Int("workers", 0, "scan worker limit (default: automatic)")

	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			writeUsage(stdout)
			return 0
		}
		fmt.Fprintf(stderr, "diskorbit: %v\n\n", err)
		writeUsage(stderr)
		return 2
	}
	if flags.NArg() > 1 {
		fmt.Fprintf(stderr, "diskorbit: expected at most one path, got %d positional arguments\n\n", flags.NArg())
		writeUsage(stderr)
		return 2
	}
	if *workers < 0 || *workers > scanner.MaximumWorkers {
		fmt.Fprintf(stderr, "diskorbit: --workers must be between 0 and %d (0 selects automatic concurrency)\n\n", scanner.MaximumWorkers)
		writeUsage(stderr)
		return 2
	}
	if *showVersion {
		fmt.Fprintln(stdout, dependencies.Build.String())
		return 0
	}
	if dependencies.RunApp == nil {
		fmt.Fprintln(stderr, "diskorbit: application runner is unavailable")
		return 1
	}

	initialPath := ""
	if flags.NArg() == 1 {
		initialPath = flags.Arg(0)
	}
	err := dependencies.RunApp(ctx, app.Options{
		Build:       dependencies.Build,
		Debug:       *debug,
		InitialPath: initialPath,
		Workers:     *workers,
		Stdout:      stdout,
		Stderr:      stderr,
	})
	if err != nil {
		fmt.Fprintf(stderr, "diskorbit: %v\n", err)
		return 1
	}
	return 0
}

func writeUsage(output io.Writer) {
	fmt.Fprintln(output, "Usage: diskorbit [options] [path]")
	fmt.Fprintln(output)
	fmt.Fprintln(output, "Scan an optional directory and open the local DiskOrbit interface.")
	fmt.Fprintln(output)
	fmt.Fprintln(output, "Options:")
	fmt.Fprintln(output, "  --debug     show lifecycle diagnostics")
	fmt.Fprintln(output, "  --help      show this help")
	fmt.Fprintln(output, "  --version     show version information")
	fmt.Fprintln(output, "  --workers N   scan worker limit (default: automatic)")
}
