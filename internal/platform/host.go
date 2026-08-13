package platform

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func multiplyCapacity(value, unit uint64) (uint64, bool) {
	if unit != 0 && value > math.MaxUint64/unit {
		return 0, false
	}
	return value * unit, true
}

// Volume is one bounded host-provided scan-root suggestion.
type Volume struct {
	Path       string
	Name       string
	Kind       string
	Filesystem string
}

// ScanTarget is one bounded, existing location offered by the startup UI.
type ScanTarget struct {
	Path       string
	Name       string
	Kind       string
	Filesystem string
}

// DiskCapacity is one filesystem's total and currently available byte capacity.
type DiskCapacity struct {
	Total     uint64
	Available uint64
}

const (
	ScanTargetHome          = "home"
	ScanTargetFolder        = "folder"
	ScanTargetLocalVolume   = "local-volume"
	ScanTargetNetworkVolume = "network-volume"
)

// Host provides local platform integration.
type Host struct{}

// Volumes returns suitable local scan roots without reading their contents.
func (Host) Volumes(ctx context.Context) ([]Volume, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	return discoverVolumes(ctx)
}

// ScanTargets returns existing familiar folders followed by suitable volumes.
// It performs only bounded, non-recursive discovery of known user locations.
func (Host) ScanTargets(ctx context.Context) ([]ScanTarget, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	targets := commonScanTargets(ctx, os.UserHomeDir, os.Stat, readDirectoryBounded)
	volumes, volumeErr := discoverVolumes(ctx)
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if volumeErr != nil && len(targets) == 0 {
		return nil, fmt.Errorf("discover scan targets: %w", volumeErr)
	}

	seen := make(map[string]bool, len(targets)+len(volumes))
	for _, target := range targets {
		seen[canonicalScanTargetPathKey(target.Path)] = true
	}
	for _, volume := range volumes {
		key := canonicalScanTargetPathKey(volume.Path)
		if seen[key] {
			continue
		}
		seen[key] = true
		kind := ScanTargetLocalVolume
		if volume.Kind == "network" {
			kind = ScanTargetNetworkVolume
		}
		targets = append(targets, ScanTarget{
			Path: volume.Path, Name: volume.Name, Kind: kind, Filesystem: volume.Filesystem,
		})
	}
	return targets, nil
}

// VolumeCapacity returns capacity only when path exactly identifies a discovered
// volume root. Ordinary folders are deliberately not treated as having their
// own independent capacity.
func (Host) VolumeCapacity(ctx context.Context, path string) (DiskCapacity, bool) {
	if ctx == nil {
		ctx = context.Background()
	}
	if ctx.Err() != nil || path == "" {
		return DiskCapacity{}, false
	}
	volumes, err := discoverVolumes(ctx)
	if err != nil {
		return DiskCapacity{}, false
	}
	target := scanTargetPathKey(path)
	for _, volume := range volumes {
		if scanTargetPathKey(volume.Path) == target {
			return queryDiskCapacity(volume.Path)
		}
	}
	return DiskCapacity{}, false
}

// Reveal opens the native filesystem manager at an existing absolute path.
func (Host) Reveal(ctx context.Context, path string) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("resolve reveal path: %w", err)
	}
	info, err := os.Lstat(absolute)
	if err != nil {
		return fmt.Errorf("validate reveal path: %w", err)
	}
	if err := revealPath(ctx, absolute, info.IsDir()); err != nil {
		return fmt.Errorf("reveal path: %w", err)
	}
	return nil
}

func volumeName(path string) string {
	name := filepath.Base(filepath.Clean(path))
	if name == "." || name == string(filepath.Separator) {
		return path
	}
	return name
}

type homeDirectory func() (string, error)
type statPath func(string) (os.FileInfo, error)
type readDirectory func(string) ([]os.DirEntry, error)

type namedPath struct {
	name string
	path string
}

const (
	maximumStandardTargets = 7
	maximumCloudTargets    = 4
)

func readDirectoryBounded(path string) ([]os.DirEntry, error) {
	directory, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer directory.Close()
	return directory.ReadDir(64)
}

func commonScanTargets(ctx context.Context, homeDirectory homeDirectory, stat statPath, readDir readDirectory) []ScanTarget {
	return commonScanTargetsWithCandidates(
		ctx,
		homeDirectory,
		stat,
		readDir,
		standardFolderCandidates,
		cloudFolderCandidates,
	)
}

func commonScanTargetsWithCandidates(
	ctx context.Context,
	homeDirectory homeDirectory,
	stat statPath,
	readDir readDirectory,
	standardCandidates func(string) []namedPath,
	cloudCandidates func(context.Context, string, readDirectory) []namedPath,
) []ScanTarget {
	home, err := homeDirectory()
	if err != nil || home == "" {
		return nil
	}

	targets := make([]ScanTarget, 0, 1+maximumStandardTargets+maximumCloudTargets)
	seen := make(map[string]bool, cap(targets))
	appendExisting := func(candidate namedPath, kind string) {
		if ctx.Err() != nil || candidate.path == "" {
			return
		}
		info, statErr := stat(candidate.path)
		if statErr != nil || !info.IsDir() {
			return
		}
		if !hasUsefulDirectoryContent(candidate.path, stat, readDir) {
			return
		}
		key := canonicalScanTargetPathKey(candidate.path)
		if seen[key] {
			return
		}
		seen[key] = true
		targets = append(targets, ScanTarget{Path: candidate.path, Name: candidate.name, Kind: kind})
	}

	appendExisting(namedPath{name: "Home", path: home}, ScanTargetHome)
	for index, candidate := range standardCandidates(home) {
		if index >= maximumStandardTargets {
			break
		}
		appendExisting(candidate, ScanTargetFolder)
	}
	cloudCount := 0
	for _, candidate := range cloudCandidates(ctx, home, readDir) {
		if ctx.Err() != nil {
			return targets
		}
		before := len(targets)
		appendExisting(candidate, ScanTargetFolder)
		if len(targets) > before {
			cloudCount++
			if cloudCount == maximumCloudTargets {
				break
			}
		}
	}
	return targets
}

func hasUsefulDirectoryContent(path string, stat statPath, readDir readDirectory) bool {
	entries, err := readDir(path)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		childPath := filepath.Join(path, entry.Name())
		info, statErr := stat(childPath)
		if statErr != nil {
			continue
		}
		if !info.IsDir() {
			return true
		}
		children, readErr := readDir(childPath)
		if readErr == nil && hasVisibleEntry(children) {
			return true
		}
	}
	return false
}

func hasVisibleEntry(entries []os.DirEntry) bool {
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), ".") {
			return true
		}
	}
	return false
}

func canonicalScanTargetPathKey(path string) string {
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		path = resolved
	}
	return scanTargetPathKey(path)
}

func scanTargetPathKey(path string) string {
	key := filepath.Clean(path)
	if runtime.GOOS == "windows" {
		key = strings.ToLower(key)
	}
	return key
}
