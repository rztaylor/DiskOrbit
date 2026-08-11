//go:build darwin || linux

package filesystem

import (
	"io/fs"
	"syscall"
)

func identityFromPath(_ string, info fs.FileInfo) Identity {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return Identity{}
	}
	return Identity{Device: uint64(stat.Dev), File: uint64(stat.Ino), Known: true}
}

func allocatedSizeFromPath(_ string, info fs.FileInfo) (uint64, bool) {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat.Blocks < 0 {
		return 0, false
	}
	return uint64(stat.Blocks) * 512, true
}
