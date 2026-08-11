//go:build windows

package platform

import (
	"context"
	"os/exec"
)

func revealPath(ctx context.Context, path string, _ bool) error {
	return exec.CommandContext(ctx, "explorer.exe", "/select,"+path).Run()
}
