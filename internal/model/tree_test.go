package model

import (
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"
)

func TestTreeAggregatesAndReconstructsPaths(t *testing.T) {
	t.Parallel()

	tree := NewTree(filepath.Join(string(filepath.Separator), "scan"), "scan", time.Time{})
	directoryID, err := tree.Add(RootID, NodeSpec{Name: "alpha", Kind: KindDirectory})
	if err != nil {
		t.Fatalf("add directory: %v", err)
	}
	fileID, err := tree.Add(directoryID, NodeSpec{Name: "data.bin", Kind: KindFile, LogicalSize: 42})
	if err != nil {
		t.Fatalf("add file: %v", err)
	}
	if _, err := tree.Add(RootID, NodeSpec{Name: "shortcut", Kind: KindSymlink, LogicalSize: 7, Flags: FlagWarning}); err != nil {
		t.Fatalf("add symlink: %v", err)
	}

	root, ok := tree.Node(RootID)
	if !ok {
		t.Fatal("root missing")
	}
	if root.LogicalSize != 49 || root.FileCount != 2 || root.DirCount != 1 || root.ChildCount != 2 {
		t.Fatalf("unexpected root aggregates: %+v", root)
	}
	directory, _ := tree.Node(directoryID)
	if directory.LogicalSize != 42 || directory.FileCount != 1 || directory.DirCount != 0 {
		t.Fatalf("unexpected directory aggregates: %+v", directory)
	}
	path, ok := tree.Path(fileID)
	if !ok || path != filepath.Join(string(filepath.Separator), "scan", "alpha", "data.bin") {
		t.Fatalf("Path() = %q, %v", path, ok)
	}
}

func TestTreeChildrenAreBoundedAndCursorValidated(t *testing.T) {
	t.Parallel()

	tree := NewTree("/scan", "scan", time.Time{})
	for _, name := range []string{"one", "two", "three"} {
		if _, err := tree.Add(RootID, NodeSpec{Name: name, Kind: KindFile}); err != nil {
			t.Fatalf("add %s: %v", name, err)
		}
	}
	first, cursor, more, err := tree.Children(RootID, NoNode, 2)
	if err != nil {
		t.Fatalf("first page: %v", err)
	}
	if len(first) != 2 || first[0].Name != "one" || first[1].Name != "two" || !more {
		t.Fatalf("unexpected first page: %+v, more=%v", first, more)
	}
	second, _, more, err := tree.Children(RootID, cursor, 2)
	if err != nil {
		t.Fatalf("second page: %v", err)
	}
	if len(second) != 1 || second[0].Name != "three" || more {
		t.Fatalf("unexpected second page: %+v, more=%v", second, more)
	}
	if _, _, _, err := tree.Children(RootID, NodeID(999), 2); !errors.Is(err, ErrInvalidNode) {
		t.Fatalf("invalid cursor error = %v", err)
	}
}

func TestTreeRejectsInvalidParents(t *testing.T) {
	t.Parallel()

	tree := NewTree("/scan", "scan", time.Time{})
	fileID, err := tree.Add(RootID, NodeSpec{Name: "file", Kind: KindFile})
	if err != nil {
		t.Fatalf("add file: %v", err)
	}
	if _, err := tree.Add(fileID, NodeSpec{Name: "child", Kind: KindFile}); !errors.Is(err, ErrInvalidNode) {
		t.Fatalf("Add() error = %v, want ErrInvalidNode", err)
	}
}

func TestTreeAggregatesAllocatedSizeAndTracksUnknownDescendants(t *testing.T) {
	t.Parallel()

	tree := NewTree("/root", "root", time.Time{})
	directory, err := tree.Add(RootID, NodeSpec{Name: "directory", Kind: KindDirectory})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tree.Add(directory, NodeSpec{
		Name: "known.bin", Kind: KindFile, LogicalSize: 100, AllocatedSize: 4096, Flags: FlagAllocatedSizeKnown,
	}); err != nil {
		t.Fatal(err)
	}
	root, _ := tree.Node(RootID)
	if root.AllocatedSize != 4096 || root.Flags&FlagAllocatedSizeKnown == 0 {
		t.Fatalf("known root allocation = %+v", root)
	}
	if _, err := tree.Add(directory, NodeSpec{Name: "unknown.bin", Kind: KindFile, LogicalSize: 50}); err != nil {
		t.Fatal(err)
	}
	root, _ = tree.Node(RootID)
	if root.AllocatedSize != 4096 || root.Flags&FlagAllocatedSizeKnown != 0 {
		t.Fatalf("partially unknown root allocation = %+v", root)
	}
}

func TestTreeAggregatesDominantFileTypeAcrossCompleteSubtrees(t *testing.T) {
	t.Parallel()

	tree := NewTree("/pictures", "pictures", time.Time{})
	year, err := tree.Add(RootID, NodeSpec{Name: "2025", Kind: KindDirectory})
	if err != nil {
		t.Fatal(err)
	}
	album, err := tree.Add(year, NodeSpec{Name: "album", Kind: KindDirectory})
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range []NodeSpec{
		{Name: "raw.dng", Kind: KindFile, LogicalSize: 700},
		{Name: "preview.jpg", Kind: KindFile, LogicalSize: 200},
		{Name: "clip.mov", Kind: KindFile, LogicalSize: 100},
	} {
		if _, err := tree.Add(album, file); err != nil {
			t.Fatal(err)
		}
	}

	for _, id := range []NodeID{RootID, year, album} {
		node, ok := tree.Node(id)
		if !ok {
			t.Fatalf("node %d missing", id)
		}
		if node.DominantFileType != FileTypeImage || node.DominantFileTypeBytes != 900 {
			t.Fatalf("node %d dominant file type = %s/%d, want image/900", id, node.DominantFileType, node.DominantFileTypeBytes)
		}
	}
	if len(tree.fileTypes) != 3 {
		t.Fatalf("directory file-type sidecar length = %d, want 3", len(tree.fileTypes))
	}
}

func TestTreeWalksOnlySelectedSubtreeInDiscoveryOrder(t *testing.T) {
	t.Parallel()
	tree := NewTree("/root", "root", time.Time{})
	alpha, _ := tree.Add(RootID, NodeSpec{Name: "alpha", Kind: KindDirectory})
	_, _ = tree.Add(alpha, NodeSpec{Name: "one", Kind: KindFile})
	_, _ = tree.Add(alpha, NodeSpec{Name: "two", Kind: KindFile})
	_, _ = tree.Add(RootID, NodeSpec{Name: "outside", Kind: KindFile})
	var paths []string
	if err := tree.Walk(alpha, func(_ NodeView, path string) error {
		paths = append(paths, path)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	want := []string{"/root/alpha", "/root/alpha/one", "/root/alpha/two"}
	if fmt.Sprint(paths) != fmt.Sprint(want) {
		t.Fatalf("paths = %v, want %v", paths, want)
	}
}

func BenchmarkTreeAddFiles(b *testing.B) {
	for iteration := 0; iteration < b.N; iteration++ {
		tree := NewTree("/scan", "scan", time.Time{})
		for index := 0; index < 10_000; index++ {
			if _, err := tree.Add(RootID, NodeSpec{Name: "file", Kind: KindFile, LogicalSize: 1024}); err != nil {
				b.Fatal(err)
			}
		}
	}
}
