package platform

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVolumesIncludeAUsableRoot(t *testing.T) {
	t.Parallel()
	volumes, err := (Host{}).Volumes(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(volumes) == 0 || volumes[0].Path == "" || volumes[0].Name == "" {
		t.Fatalf("volumes = %+v", volumes)
	}
}

func TestCommonScanTargetsIncludeOnlyExistingDirectories(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	for _, name := range []string{"Desktop", "Downloads", "Movies", "Dropbox", "Google Drive", "OneDrive", "Box"} {
		if err := os.Mkdir(filepath.Join(home, name), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(home, name, "content"), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(home, "Documents"), []byte("not a directory"), 0o600); err != nil {
		t.Fatal(err)
	}

	targets := commonScanTargets(context.Background(), func() (string, error) { return home, nil }, os.Stat, readDirectoryBounded)
	want := []string{
		home,
		filepath.Join(home, "Desktop"),
		filepath.Join(home, "Downloads"),
		filepath.Join(home, "Movies"),
		filepath.Join(home, "Dropbox"),
		filepath.Join(home, "Google Drive"),
		filepath.Join(home, "OneDrive"),
		filepath.Join(home, "Box"),
	}
	if len(targets) != len(want) {
		t.Fatalf("targets = %+v, want paths %v", targets, want)
	}
	for index, path := range want {
		if targets[index].Path != path {
			t.Errorf("target %d path = %q, want %q", index, targets[index].Path, path)
		}
	}
	if targets[0].Kind != ScanTargetHome || targets[1].Kind != ScanTargetFolder {
		t.Fatalf("target kinds = %+v", targets)
	}
}

func TestCommonScanTargetsTolerateUnavailableHome(t *testing.T) {
	t.Parallel()
	targets := commonScanTargets(context.Background(), func() (string, error) {
		return "", os.ErrNotExist
	}, os.Stat, readDirectoryBounded)
	if len(targets) != 0 {
		t.Fatalf("targets = %+v, want none", targets)
	}
}

func TestCommonScanTargetsBoundsAndDeduplicatesCloudFolders(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	for _, name := range []string{"Dropbox", "Google Drive", "OneDrive - Work", "iCloud Drive", "Box"} {
		if err := os.Mkdir(filepath.Join(home, name), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(home, name, "content"), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Remove(filepath.Join(home, "Google Drive", "content")); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(home, "Google Drive")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(home, "Dropbox"), filepath.Join(home, "Google Drive")); err != nil {
		t.Fatal(err)
	}

	targets := commonScanTargets(context.Background(), func() (string, error) { return home, nil }, os.Stat, readDirectoryBounded)
	if len(targets) > 1+maximumStandardTargets+maximumCloudTargets {
		t.Fatalf("targets = %d, want at most %d: %+v", len(targets), 1+maximumStandardTargets+maximumCloudTargets, targets)
	}
	seen := make(map[string]bool)
	clouds := 0
	for _, target := range targets {
		key := canonicalScanTargetPathKey(target.Path)
		if seen[key] {
			t.Fatalf("duplicate target path identity %q in %+v", key, targets)
		}
		seen[key] = true
		if target.Name == "Dropbox" || target.Name == "Google Drive" || strings.HasPrefix(target.Name, "OneDrive") || target.Name == "iCloud Drive" || target.Name == "Box" {
			clouds++
		}
	}
	if clouds != maximumCloudTargets {
		t.Fatalf("cloud targets = %d, want %d: %+v", clouds, maximumCloudTargets, targets)
	}
}

func TestCommonScanTargetsOmitsEmptyQuickPlaceFolders(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	if err := os.Mkdir(filepath.Join(home, "Dropbox"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(home, "Documents"), 0o700); err != nil {
		t.Fatal(err)
	}

	targets := commonScanTargets(context.Background(), func() (string, error) { return home, nil }, os.Stat, readDirectoryBounded)
	if len(targets) != 0 {
		t.Fatalf("folders containing only empty child directories should be omitted: %+v", targets)
	}
}

func TestCommonScanTargetsOmitsEmptyHome(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	targets := commonScanTargets(context.Background(), func() (string, error) { return home, nil }, os.Stat, readDirectoryBounded)
	if len(targets) != 0 {
		t.Fatalf("empty Home should be omitted: %+v", targets)
	}
}

func TestCommonScanTargetsOmitsProtectedWrapperFolder(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	protected := filepath.Join(home, "Music", "Music")
	if err := os.MkdirAll(protected, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, "Music", ".localized"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	readDir := func(path string) ([]os.DirEntry, error) {
		if path == protected {
			return nil, os.ErrPermission
		}
		return readDirectoryBounded(path)
	}

	targets := commonScanTargets(context.Background(), func() (string, error) { return home, nil }, os.Stat, readDir)
	for _, target := range targets {
		if target.Name == "Music" {
			t.Fatalf("protected media wrapper was offered: %+v", targets)
		}
	}
}

func TestCommonScanTargetsIgnoresHiddenMetadata(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	movies := filepath.Join(home, "Movies")
	if err := os.Mkdir(movies, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(movies, ".localized"), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	targets := commonScanTargets(context.Background(), func() (string, error) { return home, nil }, os.Stat, readDirectoryBounded)
	for _, target := range targets {
		if target.Name == "Movies" {
			t.Fatalf("hidden metadata-only folder was offered: %+v", targets)
		}
	}
}

func TestCloudProviderNameRecognizesOnlyKnownFolderShapes(t *testing.T) {
	t.Parallel()
	tests := map[string]string{
		"Dropbox":             "Dropbox",
		"Dropbox (Personal)":  "Dropbox",
		"Google Drive":        "Google Drive",
		"GoogleDrive-account": "Google Drive",
		"OneDrive - Company":  "OneDrive",
		"OneDrive-Personal":   "OneDrive",
		"iCloud Drive":        "iCloud Drive",
		"Box-Box":             "Box",
	}
	for input, want := range tests {
		input, want := input, want
		t.Run(input, func(t *testing.T) {
			t.Parallel()
			got, ok := cloudProviderName(input)
			if !ok || got != want {
				t.Fatalf("cloudProviderName(%q) = %q, %v, want %q, true", input, got, ok, want)
			}
		})
	}
	if got, ok := cloudProviderName("Cloud backups"); ok || got != "" {
		t.Fatalf("cloudProviderName matched unrelated folder: %q, %v", got, ok)
	}
}

func TestRevealRejectsMissingPathBeforeLaunching(t *testing.T) {
	t.Parallel()
	err := (Host{}).Reveal(context.Background(), t.TempDir()+"/missing")
	if err == nil || !strings.Contains(err.Error(), "validate reveal path") {
		t.Fatalf("Reveal() error = %v", err)
	}
}

func TestMultiplyCapacityRejectsOverflow(t *testing.T) {
	t.Parallel()
	if value, ok := multiplyCapacity(12, 4096); !ok || value != 49152 {
		t.Fatalf("multiplyCapacity() = %d, %v", value, ok)
	}
	if _, ok := multiplyCapacity(^uint64(0), 2); ok {
		t.Fatal("multiplyCapacity() accepted overflow")
	}
}

func TestVolumeCapacityRejectsOrdinaryFolder(t *testing.T) {
	t.Parallel()
	if capacity, known := (Host{}).VolumeCapacity(context.Background(), t.TempDir()); known {
		t.Fatalf("VolumeCapacity() = %+v, true for ordinary folder", capacity)
	}
}
