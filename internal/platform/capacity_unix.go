//go:build darwin || linux

package platform

import "syscall"

func queryDiskCapacity(path string) (DiskCapacity, bool) {
	var stats syscall.Statfs_t
	if err := syscall.Statfs(path, &stats); err != nil || stats.Bsize <= 0 || stats.Blocks == 0 {
		return DiskCapacity{}, false
	}
	blockSize := uint64(stats.Bsize)
	total, totalOK := multiplyCapacity(uint64(stats.Blocks), blockSize)
	available, availableOK := multiplyCapacity(uint64(stats.Bavail), blockSize)
	if !totalOK || !availableOK || total == 0 {
		return DiskCapacity{}, false
	}
	if available > total {
		available = total
	}
	return DiskCapacity{Total: total, Available: available}, true
}
