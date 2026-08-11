//go:build windows

package platform

import (
	"os"
	"syscall"
	"unsafe"
)

var shGetKnownFolderPath = syscall.NewLazyDLL("shell32.dll").NewProc("SHGetKnownFolderPath")
var coTaskMemFree = syscall.NewLazyDLL("ole32.dll").NewProc("CoTaskMemFree")

type windowsGUID struct {
	data1 uint32
	data2 uint16
	data3 uint16
	data4 [8]byte
}

var windowsKnownFolders = []struct {
	name string
	id   windowsGUID
}{
	{"Desktop", windowsGUID{0xb4bfcc3a, 0xdb2c, 0x424c, [8]byte{0xb0, 0x29, 0x7f, 0xe9, 0x9a, 0x87, 0xc6, 0x41}}},
	{"Documents", windowsGUID{0xfdd39ad0, 0x238f, 0x46af, [8]byte{0xad, 0xb4, 0x6c, 0x85, 0x48, 0x03, 0x69, 0xc7}}},
	{"Downloads", windowsGUID{0x374de290, 0x123f, 0x4565, [8]byte{0x91, 0x64, 0x39, 0xc4, 0x92, 0x5e, 0x46, 0x7b}}},
	{"Pictures", windowsGUID{0x33e28130, 0x4e1e, 0x4676, [8]byte{0x83, 0x5a, 0x98, 0x39, 0x5c, 0x3b, 0xc3, 0xbb}}},
	{"Music", windowsGUID{0x4bd8d571, 0x6d19, 0x48d3, [8]byte{0xbe, 0x97, 0x42, 0x22, 0x20, 0x08, 0x0e, 0x43}}},
	{"Videos", windowsGUID{0x18989b1d, 0x99b5, 0x455b, [8]byte{0x84, 0x1c, 0xab, 0x7c, 0x74, 0xe4, 0xdf, 0xfc}}},
}

func standardFolderCandidates(home string) []namedPath {
	candidates := make([]namedPath, 0, len(windowsKnownFolders))
	fallbacks := conventionalFolderCandidates(home, false)
	for index, folder := range windowsKnownFolders {
		path := windowsKnownFolderPath(&folder.id)
		if path == "" {
			path = fallbacks[index].path
		}
		candidates = append(candidates, namedPath{name: folder.name, path: path})
	}
	return candidates
}

func windowsKnownFolderPath(id *windowsGUID) string {
	var pointer *uint16
	result, _, _ := shGetKnownFolderPath.Call(
		uintptr(unsafe.Pointer(id)), 0, 0, uintptr(unsafe.Pointer(&pointer)),
	)
	if result != 0 || pointer == nil {
		return ""
	}
	defer coTaskMemFree.Call(uintptr(unsafe.Pointer(pointer)))
	length := 0
	for *(*uint16)(unsafe.Add(unsafe.Pointer(pointer), uintptr(length)*2)) != 0 {
		length++
	}
	return syscall.UTF16ToString(unsafe.Slice(pointer, length))
}

func platformCloudRoots(string) []cloudRoot {
	roots := make([]cloudRoot, 0, 3)
	for _, variable := range []string{"OneDrive", "OneDriveConsumer", "OneDriveCommercial"} {
		if path := os.Getenv(variable); path != "" {
			roots = append(roots, cloudRoot{name: "OneDrive", path: path})
		}
	}
	return roots
}
