package filesystem

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalReadsDirectoryMetadata(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "data.bin"), []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "nested"), 0o700); err != nil {
		t.Fatal(err)
	}

	local := Local{}
	canonical, err := local.Canonical(root)
	if err != nil {
		t.Fatalf("Canonical(): %v", err)
	}
	rootInfo, err := local.Stat(context.Background(), canonical)
	if err != nil {
		t.Fatalf("Stat(): %v", err)
	}
	if rootInfo.Kind != KindDirectory {
		t.Fatalf("root kind = %v, want directory", rootInfo.Kind)
	}

	found := map[string]Entry{}
	if err := local.ReadDir(context.Background(), canonical, func(entry Entry, entryErr error) error {
		if entryErr != nil {
			t.Fatalf("entry %q: %v", entry.Name, entryErr)
		}
		found[entry.Name] = entry
		return nil
	}); err != nil {
		t.Fatalf("ReadDir(): %v", err)
	}
	if found["data.bin"].Kind != KindFile || found["data.bin"].Size != 5 {
		t.Fatalf("file metadata = %+v", found["data.bin"])
	}
	if !found["data.bin"].AllocatedKnown {
		t.Fatalf("allocated metadata unavailable for local file: %+v", found["data.bin"])
	}
	if found["nested"].Kind != KindDirectory {
		t.Fatalf("directory metadata = %+v", found["nested"])
	}
}

func TestLocalHonoursCancellation(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	local := Local{}
	if err := local.ReadDir(ctx, t.TempDir(), func(Entry, error) error { return nil }); !errors.Is(err, context.Canceled) {
		t.Fatalf("ReadDir() error = %v, want context.Canceled", err)
	}
}
