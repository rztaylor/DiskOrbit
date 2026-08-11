//go:build darwin

package filesystem

import (
	"os"
	"syscall"
)

const userHiddenFlag = 0x00008000

func platformDirectoryEntryHidden(entry os.DirEntry) bool {
	info, err := entry.Info()
	if err != nil {
		return false
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && stat.Flags&userHiddenFlag != 0
}
