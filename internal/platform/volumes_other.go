//go:build !darwin && !linux && !windows

package platform

import "context"

func discoverVolumes(context.Context) ([]Volume, error) {
	return []Volume{{Path: "/", Name: "/", Kind: "local"}}, nil
}
