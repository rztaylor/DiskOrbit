//go:build windows

package settings

import (
	"errors"
	"os"
)

func replaceSettingsFile(source, target string) error {
	if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return os.Rename(source, target)
}
