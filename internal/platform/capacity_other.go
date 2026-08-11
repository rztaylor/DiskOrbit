//go:build !darwin && !linux && !windows

package platform

func queryDiskCapacity(string) (DiskCapacity, bool) {
	return DiskCapacity{}, false
}
