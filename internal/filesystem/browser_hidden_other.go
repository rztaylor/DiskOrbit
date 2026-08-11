//go:build !darwin && !windows

package filesystem

import "os"

func platformDirectoryEntryHidden(os.DirEntry) bool {
	return false
}
