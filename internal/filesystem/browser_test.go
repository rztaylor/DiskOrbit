package filesystem

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestBrowseDirectoriesHidesFoldersByDefaultAndIncludesThemOnRequest(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	for _, name := range []string{"zeta", ".hidden", "Alpha"} {
		if err := os.Mkdir(filepath.Join(root, name), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "file.txt"), []byte("ignored"), 0o600); err != nil {
		t.Fatal(err)
	}

	listing, err := (Local{}).BrowseDirectories(context.Background(), root, 10, false)
	if err != nil {
		t.Fatal(err)
	}
	if listing.Path != filepath.Clean(root) || listing.Parent != filepath.Dir(root) || listing.Truncated {
		t.Fatalf("listing metadata = %+v", listing)
	}
	want := []string{"Alpha", "zeta"}
	if len(listing.Directories) != len(want) {
		t.Fatalf("directories = %+v", listing.Directories)
	}
	for index, name := range want {
		if listing.Directories[index].Name != name || listing.Directories[index].Path != filepath.Join(root, name) {
			t.Errorf("directory %d = %+v, want %q", index, listing.Directories[index], name)
		}
	}
	if len(listing.Ancestors) == 0 || listing.Ancestors[len(listing.Ancestors)-1].Path != filepath.Clean(root) {
		t.Fatalf("ancestors = %+v", listing.Ancestors)
	}

	listing, err = (Local{}).BrowseDirectories(context.Background(), root, 10, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(listing.Directories) != 3 || listing.Directories[0].Name != ".hidden" {
		t.Fatalf("directories with hidden folders = %+v", listing.Directories)
	}
}

func TestBrowseDirectoriesIsBounded(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	for _, name := range []string{"one", "two", "three"} {
		if err := os.Mkdir(filepath.Join(root, name), 0o700); err != nil {
			t.Fatal(err)
		}
	}

	listing, err := (Local{}).BrowseDirectories(context.Background(), root, 2, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(listing.Directories) != 2 || !listing.Truncated {
		t.Fatalf("listing = %+v, want two directories and truncation", listing)
	}
}

func TestBrowseDirectoriesRejectsFilesAndMissingPaths(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	file := filepath.Join(root, "file.txt")
	if err := os.WriteFile(file, []byte("file"), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := (Local{}).BrowseDirectories(context.Background(), file, 10, false); !errors.Is(err, ErrNotDirectory) {
		t.Fatalf("file error = %v, want ErrNotDirectory", err)
	}
	if _, err := (Local{}).BrowseDirectories(context.Background(), filepath.Join(root, "missing"), 10, false); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing error = %v, want os.ErrNotExist", err)
	}
}
