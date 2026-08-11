//go:build darwin

package platform

import (
	"context"
	"path/filepath"
	"sort"
	"syscall"
)

const (
	darwinMountNowait = 2
	darwinMountLocal  = 0x00001000
)

type darwinMount struct {
	path       string
	source     string
	filesystem string
	local      bool
}

func discoverVolumes(ctx context.Context) ([]Volume, error) {
	mounts, err := readDarwinMounts()
	if err != nil {
		return nil, err
	}
	return darwinVolumes(ctx, mounts)
}

func darwinVolumes(ctx context.Context, mounts []darwinMount) ([]Volume, error) {
	volumes := make([]Volume, 0, len(mounts))
	seenPaths := make(map[string]bool, len(mounts))
	seenFilesystems := make(map[string]bool, len(mounts))
	for _, mount := range mounts {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		path := filepath.Clean(mount.path)
		if path != "/" && filepath.Dir(path) != "/Volumes" {
			continue
		}
		pathKey := scanTargetPathKey(path)
		filesystemKey := mount.filesystem + "\x00" + mount.source
		if seenPaths[pathKey] || mount.source != "" && seenFilesystems[filesystemKey] {
			continue
		}
		seenPaths[pathKey] = true
		if mount.source != "" {
			seenFilesystems[filesystemKey] = true
		}
		kind := "local"
		if !mount.local {
			kind = "network"
		}
		name := filepath.Base(path)
		if path == "/" {
			name = "Macintosh root"
		}
		volumes = append(volumes, Volume{Path: path, Name: name, Kind: kind, Filesystem: mount.filesystem})
	}
	sort.SliceStable(volumes, func(i, j int) bool {
		leftRoot := volumes[i].Path == "/"
		rightRoot := volumes[j].Path == "/"
		if leftRoot != rightRoot {
			return leftRoot
		}
		return volumes[i].Name < volumes[j].Name
	})
	return volumes, nil
}

func readDarwinMounts() ([]darwinMount, error) {
	count, err := syscall.Getfsstat(nil, darwinMountNowait)
	if err != nil {
		return nil, err
	}
	stats := make([]syscall.Statfs_t, count)
	count, err = syscall.Getfsstat(stats, darwinMountNowait)
	if err != nil {
		return nil, err
	}
	if count > len(stats) {
		count = len(stats)
	}
	mounts := make([]darwinMount, 0, count)
	for _, stat := range stats[:count] {
		mounts = append(mounts, darwinMount{
			path:       darwinString(stat.Mntonname[:]),
			source:     darwinString(stat.Mntfromname[:]),
			filesystem: darwinString(stat.Fstypename[:]),
			local:      stat.Flags&darwinMountLocal != 0,
		})
	}
	return mounts, nil
}

func darwinString(value []int8) string {
	bytes := make([]byte, 0, len(value))
	for _, character := range value {
		if character == 0 {
			break
		}
		bytes = append(bytes, byte(character))
	}
	return string(bytes)
}
