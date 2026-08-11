//go:build !darwin && !linux && !windows

package filesystem

import "io/fs"

func identityFromPath(string, fs.FileInfo) Identity {
	return Identity{}
}

func allocatedSizeFromPath(string, fs.FileInfo) (uint64, bool) { return 0, false }
