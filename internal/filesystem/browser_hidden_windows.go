//go:build windows

package filesystem

import (
	"os"
	"syscall"
)

func platformDirectoryEntryHidden(entry os.DirEntry) bool {
	info, err := entry.Info()
	if err != nil {
		return false
	}
	attributes, ok := info.Sys().(*syscall.Win32FileAttributeData)
	return ok && attributes.FileAttributes&syscall.FILE_ATTRIBUTE_HIDDEN != 0
}
