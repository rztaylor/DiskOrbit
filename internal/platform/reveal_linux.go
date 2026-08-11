//go:build linux

package platform

import (
	"context"
	"os/exec"
	"path/filepath"
)

func revealPath(ctx context.Context, path string, directory bool) error {
	target := path
	if !directory {
		target = filepath.Dir(path)
	}
	return exec.CommandContext(ctx, "xdg-open", target).Run()
}
