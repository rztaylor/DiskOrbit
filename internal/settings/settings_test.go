package settings

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreReturnsDefaultsThenPersistsSettings(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "nested", "settings.json")
	store, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	initial, err := store.Get()
	if err != nil || initial != Defaults() {
		t.Fatalf("Get() = %+v, %v", initial, err)
	}
	initial.Theme = "dark"
	initial.Chart.NodeBudget = 2000
	if _, err := store.Save(initial); err != nil {
		t.Fatal(err)
	}
	loaded, err := store.Get()
	if err != nil || loaded != initial {
		t.Fatalf("Get() = %+v, %v; want %+v", loaded, err, initial)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm()&0o077 != 0 {
		t.Fatalf("settings mode = %v, %v", info.Mode(), err)
	}
}

func TestStoreRejectsInvalidAndCorruptSettings(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "settings.json")
	store, _ := NewStore(path)
	invalid := Defaults()
	invalid.Chart.MaximumDepth = 99
	if _, err := store.Save(invalid); !errors.Is(err, ErrInvalid) {
		t.Fatalf("Save() error = %v, want ErrInvalid", err)
	}
	if err := os.WriteFile(path, []byte(`{"version":1,"surprise":true}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(); err == nil {
		t.Fatal("Get() accepted corrupt settings")
	}
}

func TestStoreBackfillsNewFieldsFromDefaults(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte(`{"version":1,"theme":"dark"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	store, _ := NewStore(path)
	loaded, err := store.Get()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Theme != "dark" || loaded.Chart.ColourMode != "size" || loaded.Chart.SingleColour == "" ||
		loaded.Chart.SizeLargeColour == "" || loaded.Chart.SizeSmallColour == "" || loaded.Chart.NodeBudget != 4000 {
		t.Fatalf("backfilled settings = %+v", loaded)
	}
}

func TestStoreMigratesSharedLegacyColours(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "settings.json")
	legacy := `{"version":1,"chart":{"colourMode":"single","primaryColour":"#123456","secondaryColour":"#abcdef"}}`
	if err := os.WriteFile(path, []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	store, _ := NewStore(path)
	loaded, err := store.Get()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Chart.SingleColour != "#123456" || loaded.Chart.SizeLargeColour != "#123456" ||
		loaded.Chart.SizeSmallColour != "#abcdef" {
		t.Fatalf("migrated colours = %+v", loaded.Chart)
	}
	if _, err := store.Save(loaded); err != nil {
		t.Fatal(err)
	}
	persisted, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	document := string(persisted)
	if strings.Contains(document, "primaryColour") || strings.Contains(document, "secondaryColour") ||
		!strings.Contains(document, `"singleColour": "#123456"`) ||
		!strings.Contains(document, `"sizeLargeColour": "#123456"`) ||
		!strings.Contains(document, `"sizeSmallColour": "#abcdef"`) {
		t.Fatalf("persisted migrated settings = %s", document)
	}
}

func TestStoreRetiresLegacyMinimumSegmentPercent(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte(`{"version":1,"chart":{"minimumSegmentPercent":2}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	store, _ := NewStore(path)
	loaded, err := store.Get()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Chart.MinimumArcDegrees != 0.75 || loaded.Chart.LegacyMinimumSegmentPercent != nil {
		t.Fatalf("migrated chart settings = %+v", loaded.Chart)
	}
}

func TestValidateRejectsMinimumArcOutsideBounds(t *testing.T) {
	t.Parallel()
	for _, angle := range []float64{-0.25, 5.25} {
		value := Defaults()
		value.Chart.MinimumArcDegrees = angle
		if err := Validate(value); !errors.Is(err, ErrInvalid) {
			t.Fatalf("Validate() angle %v error = %v, want ErrInvalid", angle, err)
		}
	}
}

func TestValidateRejectsUnsafeColourSettings(t *testing.T) {
	t.Parallel()
	value := Defaults()
	value.Chart.SingleColour = "red"
	if err := Validate(value); !errors.Is(err, ErrInvalid) {
		t.Fatalf("Validate() colour error = %v, want ErrInvalid", err)
	}
	value = Defaults()
	value.Chart.FileTypeDominancePercent = 10
	if err := Validate(value); !errors.Is(err, ErrInvalid) {
		t.Fatalf("Validate() threshold error = %v, want ErrInvalid", err)
	}
}
