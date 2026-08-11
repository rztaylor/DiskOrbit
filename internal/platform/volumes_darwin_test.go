//go:build darwin

package platform

import (
	"context"
	"testing"
)

func TestDarwinMountDiscoveryReturnsOnlyRealDistinctVolumes(t *testing.T) {
	t.Parallel()

	mounts := []darwinMount{
		{path: "/", source: "/dev/disk3s1s1", filesystem: "apfs", local: true},
		{path: "/Volumes/Macintosh HD", source: "/dev/disk3s1s1", filesystem: "apfs", local: true},
		{path: "/System/Volumes/Data", source: "/dev/disk3s5", filesystem: "apfs", local: true},
		{path: "/Volumes/On1-Photos-1", source: "//user@server/On1-Photos", filesystem: "smbfs", local: false},
	}

	volumes, err := darwinVolumes(context.Background(), mounts)
	if err != nil {
		t.Fatal(err)
	}
	if len(volumes) != 2 {
		t.Fatalf("volumes = %+v, want root and one network mount", volumes)
	}
	if volumes[0].Path != "/" || volumes[0].Name != "Macintosh root" || volumes[0].Kind != "local" {
		t.Fatalf("root volume = %+v", volumes[0])
	}
	if volumes[1].Path != "/Volumes/On1-Photos-1" || volumes[1].Kind != "network" || volumes[1].Filesystem != "smbfs" {
		t.Fatalf("network volume = %+v", volumes[1])
	}
}
