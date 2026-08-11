//go:build windows

package platform

import (
	"context"
	"fmt"
	"syscall"
	"unsafe"
)

var getLogicalDrives = syscall.NewLazyDLL("kernel32.dll").NewProc("GetLogicalDrives")
var getDriveType = syscall.NewLazyDLL("kernel32.dll").NewProc("GetDriveTypeW")

const windowsDriveRemote = 4

func discoverVolumes(ctx context.Context) ([]Volume, error) {
	mask, _, callErr := getLogicalDrives.Call()
	if mask == 0 {
		return nil, fmt.Errorf("GetLogicalDrives: %w", callErr)
	}
	volumes := make([]Volume, 0, 8)
	for index := 0; index < 26; index++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if mask&(1<<index) == 0 {
			continue
		}
		path := fmt.Sprintf("%c:\\", 'A'+index)
		pathPointer, err := syscall.UTF16PtrFromString(path)
		if err != nil {
			continue
		}
		driveType, _, _ := getDriveType.Call(uintptr(unsafe.Pointer(pathPointer)))
		kind := "local"
		if driveType == windowsDriveRemote {
			kind = "network"
		}
		volumes = append(volumes, Volume{Path: path, Name: path, Kind: kind})
	}
	return volumes, nil
}
