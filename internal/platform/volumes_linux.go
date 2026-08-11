//go:build linux

package platform

import (
	"bufio"
	"context"
	"os"
	"strings"
)

const maximumVolumes = 128

var ignoredLinuxFilesystems = map[string]bool{
	"autofs": true, "bpf": true, "cgroup": true, "cgroup2": true,
	"configfs": true, "debugfs": true, "devpts": true, "devtmpfs": true,
	"fusectl": true, "hugetlbfs": true, "mqueue": true, "proc": true,
	"pstore": true, "securityfs": true, "sysfs": true, "tracefs": true,
}

func discoverVolumes(ctx context.Context) ([]Volume, error) {
	file, err := os.Open("/proc/self/mountinfo")
	if err != nil {
		return []Volume{{Path: "/", Name: "/", Kind: "local"}}, nil
	}
	defer file.Close()
	volumes := make([]Volume, 0, 16)
	seen := make(map[string]bool)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() && len(volumes) < maximumVolumes {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		before, after, ok := strings.Cut(scanner.Text(), " - ")
		fields := strings.Fields(before)
		post := strings.Fields(after)
		if !ok || len(fields) < 5 || len(post) < 1 || ignoredLinuxFilesystems[post[0]] {
			continue
		}
		path := unescapeMountField(fields[4])
		if seen[path] {
			continue
		}
		seen[path] = true
		kind := "local"
		if networkFilesystem(post[0]) {
			kind = "network"
		}
		volumes = append(volumes, Volume{Path: path, Name: volumeName(path), Kind: kind, Filesystem: post[0]})
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if len(volumes) == 0 {
		volumes = append(volumes, Volume{Path: "/", Name: "/", Kind: "local"})
	}
	return volumes, nil
}

func unescapeMountField(value string) string {
	replacer := strings.NewReplacer(`\040`, " ", `\011`, "\t", `\012`, "\n", `\134`, `\`)
	return replacer.Replace(value)
}

func networkFilesystem(value string) bool {
	return value == "nfs" || value == "nfs4" || value == "cifs" || value == "smb3" ||
		value == "sshfs" || strings.HasPrefix(value, "fuse.sshfs")
}
