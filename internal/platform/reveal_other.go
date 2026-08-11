//go:build !darwin && !linux && !windows

package platform

import (
	"context"
	"fmt"
)

func revealPath(context.Context, string, bool) error {
	return fmt.Errorf("reveal is not supported on this platform")
}
