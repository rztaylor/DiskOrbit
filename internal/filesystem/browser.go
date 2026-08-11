package filesystem

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const maximumBrowseEntriesVisited = 10_000

// ErrNotDirectory reports that a requested browser location is not a directory.
var ErrNotDirectory = errors.New("filesystem path is not a directory")

// DirectoryLocation is one selectable directory in a browser listing.
type DirectoryLocation struct {
	Name string
	Path string
}

// DirectoryListing is one bounded, non-recursive view of a directory.
type DirectoryListing struct {
	Path        string
	Parent      string
	Ancestors   []DirectoryLocation
	Directories []DirectoryLocation
	Truncated   bool
}

// BrowseDirectories returns only the direct child directories of path. It
// follows the explicitly requested location and child directory aliases, but
// never descends recursively or reads file contents.
func (Local) BrowseDirectories(ctx context.Context, path string, limit int, showHidden bool) (DirectoryListing, error) {
	if limit < 1 {
		return DirectoryListing{}, fmt.Errorf("browse directory limit must be positive")
	}
	absolute, err := (Local{}).Canonical(path)
	if err != nil {
		return DirectoryListing{}, err
	}
	info, err := os.Stat(absolute)
	if err != nil {
		return DirectoryListing{}, fmt.Errorf("inspect browse directory: %w", err)
	}
	if !info.IsDir() {
		return DirectoryListing{}, ErrNotDirectory
	}

	listing := DirectoryListing{
		Path:        absolute,
		Parent:      directoryParent(absolute),
		Ancestors:   directoryAncestors(absolute),
		Directories: make([]DirectoryLocation, 0, min(limit, directoryBatchSize)),
	}
	directory, err := os.Open(absolute)
	if err != nil {
		return DirectoryListing{}, fmt.Errorf("open browse directory: %w", err)
	}
	defer directory.Close()

	visited := 0
	for {
		if err := contextError(ctx); err != nil {
			return DirectoryListing{}, err
		}
		entries, readErr := directory.ReadDir(directoryBatchSize)
		for _, entry := range entries {
			if err := contextError(ctx); err != nil {
				return DirectoryListing{}, err
			}
			visited++
			if visited > maximumBrowseEntriesVisited {
				listing.Truncated = true
				return sortedDirectoryListing(listing), nil
			}
			childPath := filepath.Join(absolute, entry.Name())
			if !entry.IsDir() {
				if entry.Type()&os.ModeSymlink == 0 {
					continue
				}
				target, statErr := os.Stat(childPath)
				if statErr != nil || !target.IsDir() {
					continue
				}
			}
			if !showHidden && directoryEntryHidden(entry) {
				continue
			}
			if len(listing.Directories) == limit {
				listing.Truncated = true
				return sortedDirectoryListing(listing), nil
			}
			listing.Directories = append(listing.Directories, DirectoryLocation{Name: entry.Name(), Path: childPath})
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				return sortedDirectoryListing(listing), nil
			}
			return DirectoryListing{}, fmt.Errorf("read browse directory: %w", readErr)
		}
	}
}

func directoryEntryHidden(entry os.DirEntry) bool {
	return strings.HasPrefix(entry.Name(), ".") || platformDirectoryEntryHidden(entry)
}

func sortedDirectoryListing(listing DirectoryListing) DirectoryListing {
	sort.Slice(listing.Directories, func(i, j int) bool {
		left := strings.ToLower(listing.Directories[i].Name)
		right := strings.ToLower(listing.Directories[j].Name)
		if left == right {
			return listing.Directories[i].Name < listing.Directories[j].Name
		}
		return left < right
	})
	return listing
}

func directoryParent(path string) string {
	parent := filepath.Dir(path)
	if parent == path {
		return ""
	}
	return parent
}

func directoryAncestors(path string) []DirectoryLocation {
	ancestors := make([]DirectoryLocation, 0, 8)
	for current := path; current != ""; current = directoryParent(current) {
		name := filepath.Base(current)
		if parent := directoryParent(current); parent == "" {
			name = current
		}
		ancestors = append(ancestors, DirectoryLocation{Name: name, Path: current})
	}
	for left, right := 0, len(ancestors)-1; left < right; left, right = left+1, right-1 {
		ancestors[left], ancestors[right] = ancestors[right], ancestors[left]
	}
	return ancestors
}
