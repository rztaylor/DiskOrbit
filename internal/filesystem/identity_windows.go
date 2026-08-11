//go:build windows

package filesystem

import (
	"hash/fnv"
	"io/fs"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var getCompressedFileSizeW = syscall.NewLazyDLL("kernel32.dll").NewProc("GetCompressedFileSizeW")

func identityFromPath(path string, _ fs.FileInfo) Identity {
	volume := strings.ToLower(filepath.VolumeName(filepath.Clean(path)))
	if volume == "" {
		return Identity{}
	}
	hash := fnv.New64a()
	_, _ = hash.Write([]byte(volume))
	return Identity{Device: hash.Sum64(), Known: true}
}

func allocatedSizeFromPath(path string, info fs.FileInfo) (uint64, bool) {
	if info.IsDir() {
		return 0, true
	}
	pathPointer, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, false
	}
	var high uint32
	low, _, callErr := getCompressedFileSizeW.Call(
		uintptr(unsafe.Pointer(pathPointer)),
		uintptr(unsafe.Pointer(&high)),
	)
	if uint32(low) == ^uint32(0) && high == 0 && callErr != syscall.Errno(0) {
		return 0, false
	}
	return uint64(high)<<32 | uint64(uint32(low)), true
}
