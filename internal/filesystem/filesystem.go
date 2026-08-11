package filesystem

import (
	"context"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

const directoryBatchSize = 256

// Kind classifies an entry without following symbolic links.
type Kind uint8

const (
	KindFile Kind = iota
	KindDirectory
	KindSymlink
	KindSpecial
)

// Identity describes a filesystem object when the platform exposes stable IDs.
type Identity struct {
	Device uint64
	File   uint64
	Known  bool
}

// Entry is the minimal discovery metadata retained by the scanner.
type Entry struct {
	Name           string
	Kind           Kind
	Size           uint64
	AllocatedSize  uint64
	AllocatedKnown bool
	Modified       time.Time
	Identity       Identity
}

// VisitFunc receives each directory entry. An entry-info error is supplied
// alongside the best classification available from the directory record.
type VisitFunc func(Entry, error) error

// Reader is the scanner-facing filesystem discovery boundary.
type Reader interface {
	Canonical(path string) (string, error)
	Stat(context.Context, string) (Entry, error)
	ReadDir(context.Context, string, VisitFunc) error
}

// Local implements Reader with the host operating system.
type Local struct{}

// Canonical returns a cleaned absolute path without resolving symlinks.
func (Local) Canonical(path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("filesystem path is empty")
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("make path absolute: %w", err)
	}
	return filepath.Clean(absolute), nil
}

// Stat returns metadata for a selected root, following a final symbolic link.
// Directory entries discovered beneath that root remain classified without
// following links by ReadDir.
func (Local) Stat(ctx context.Context, path string) (Entry, error) {
	if err := contextError(ctx); err != nil {
		return Entry{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return Entry{}, err
	}
	return entryFromInfo(path, filepath.Base(path), info), nil
}

// ReadDir visits entries in fixed-size batches and closes the directory before
// returning, including on cancellation and visitor errors.
func (Local) ReadDir(ctx context.Context, path string, visit VisitFunc) error {
	if err := contextError(ctx); err != nil {
		return err
	}
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()

	for {
		entries, readErr := directory.ReadDir(directoryBatchSize)
		for _, directoryEntry := range entries {
			if err := contextError(ctx); err != nil {
				return err
			}
			entry := Entry{Name: directoryEntry.Name(), Kind: kindFromMode(directoryEntry.Type())}
			info, infoErr := directoryEntry.Info()
			if infoErr == nil {
				entry = entryFromInfo(filepath.Join(path, directoryEntry.Name()), directoryEntry.Name(), info)
			}
			if err := visit(entry, infoErr); err != nil {
				return err
			}
		}
		if readErr != nil {
			if readErr == io.EOF {
				return nil
			}
			return readErr
		}
	}
}

func entryFromInfo(path, name string, info fs.FileInfo) Entry {
	size := info.Size()
	if size < 0 {
		size = 0
	}
	allocatedSize, allocatedKnown := allocatedSizeFromPath(path, info)
	return Entry{
		Name:           name,
		Kind:           kindFromMode(info.Mode()),
		Size:           uint64(size),
		Modified:       info.ModTime(),
		Identity:       identityFromPath(path, info),
		AllocatedSize:  allocatedSize,
		AllocatedKnown: allocatedKnown,
	}
}

func kindFromMode(mode fs.FileMode) Kind {
	switch {
	case mode&fs.ModeSymlink != 0:
		return KindSymlink
	case mode.IsDir():
		return KindDirectory
	case mode.IsRegular():
		return KindFile
	default:
		return KindSpecial
	}
}

func contextError(ctx context.Context) error {
	if ctx == nil {
		return nil
	}
	return ctx.Err()
}
