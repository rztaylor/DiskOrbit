package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/rztaylor/diskorbit/internal/app"
	"github.com/rztaylor/diskorbit/internal/buildinfo"
	"github.com/rztaylor/diskorbit/internal/cli"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	exitCode := cli.Run(ctx, os.Args[1:], os.Stdout, os.Stderr, cli.Dependencies{
		Build:  buildinfo.Current(),
		RunApp: app.Run,
	})
	os.Exit(exitCode)
}
