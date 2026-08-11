//go:build !windows

package settings

import "os"

func replaceSettingsFile(source, target string) error {
	return os.Rename(source, target)
}
