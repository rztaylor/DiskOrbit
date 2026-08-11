//go:build darwin

package platform

import (
	"context"
	"os/exec"
)

func revealPath(ctx context.Context, path string, _ bool) error {
	return exec.CommandContext(ctx, "open", "-R", path).Run()
}
