package scanner

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/rztaylor/diskorbit/internal/filesystem"
)

func BenchmarkScanTenThousandFiles(b *testing.B) {
	entries := make([]fakeEntry, 10_000)
	for index := range entries {
		entries[index] = fakeEntry{entry: filesystem.Entry{Name: fmt.Sprintf("file-%05d", index), Kind: filesystem.KindFile, Size: 1024}}
	}
	root := filepath.Clean("/root")
	b.ReportAllocs()
	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		reader := &fakeReader{
			root:    filesystem.Entry{Name: "root", Kind: filesystem.KindDirectory},
			entries: map[string][]fakeEntry{root: entries},
		}
		scan, _ := New(Config{Reader: reader, Workers: 4, ProgressInterval: time.Hour})
		prepared, _ := scan.Prepare(context.Background(), root, Options{})
		if _, err := prepared.Run(context.Background(), nil); err != nil {
			b.Fatal(err)
		}
	}
}
