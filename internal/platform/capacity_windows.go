//go:build windows

package platform

import (
	"syscall"
	"unsafe"
)

var getDiskFreeSpaceEx = syscall.NewLazyDLL("kernel32.dll").NewProc("GetDiskFreeSpaceExW")

func queryDiskCapacity(path string) (DiskCapacity, bool) {
	pathPointer, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return DiskCapacity{}, false
	}
	var available uint64
	var total uint64
	result, _, _ := getDiskFreeSpaceEx.Call(
		uintptr(unsafe.Pointer(pathPointer)),
		uintptr(unsafe.Pointer(&available)),
		uintptr(unsafe.Pointer(&total)),
		0,
	)
	if result == 0 || total == 0 {
		return DiskCapacity{}, false
	}
	if available > total {
		available = total
	}
	return DiskCapacity{Total: total, Available: available}, true
}
