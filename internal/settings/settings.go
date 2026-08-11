package settings

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"sync"
)

const currentVersion = 1

var ErrInvalid = errors.New("invalid settings")

// Preferences is the complete persisted user-settings document.
type Preferences struct {
	Version       int           `json:"version"`
	Theme         string        `json:"theme"`
	DefaultMetric string        `json:"defaultMetric"`
	Chart         ChartSettings `json:"chart"`
}

// ChartSettings controls the bounded browser radial projection.
type ChartSettings struct {
	MaximumDepth               int     `json:"maximumDepth"`
	NodeBudget                 int     `json:"nodeBudget"`
	SegmentsPerDirectory       int     `json:"segmentsPerDirectory"`
	ExpandedDirectoriesPerRing int     `json:"expandedDirectoriesPerRing"`
	MinimumArcDegrees          float64 `json:"minimumArcDegrees"`
	// LegacyMinimumSegmentPercent accepts the retired parent-relative setting
	// while loading, but is cleared before settings leave this package.
	LegacyMinimumSegmentPercent *float64 `json:"minimumSegmentPercent,omitempty"`
	ShowFiles                   bool     `json:"showFiles"`
	FileLimitMode               string   `json:"fileLimitMode"`
	MaximumFilesPerDirectory    int      `json:"maximumFilesPerDirectory"`
	MinimumFileSizeBytes        uint64   `json:"minimumFileSizeBytes"`
	ShowFreeSpace               bool     `json:"showFreeSpace"`
	ColourMode                  string   `json:"colourMode"`
	SingleColour                string   `json:"singleColour"`
	SizeLargeColour             string   `json:"sizeLargeColour"`
	SizeSmallColour             string   `json:"sizeSmallColour"`
	// LegacyPrimaryColour and LegacySecondaryColour accept the former shared
	// colour fields while loading, but are cleared before settings leave this
	// package.
	LegacyPrimaryColour      *string `json:"primaryColour,omitempty"`
	LegacySecondaryColour    *string `json:"secondaryColour,omitempty"`
	FileTypeDominancePercent int     `json:"fileTypeDominancePercent"`
	OmittedStyle             string  `json:"omittedStyle"`
	SegmentOrder             string  `json:"segmentOrder"`
	FileGroupGapDegrees      float64 `json:"fileGroupGapDegrees"`
}

// Defaults is the sole application-default settings definition. The API sends
// it to the browser so restore-default behavior does not duplicate this table.
func Defaults() Preferences {
	return Preferences{
		Version:       currentVersion,
		Theme:         "system",
		DefaultMetric: "allocated",
		Chart: ChartSettings{
			MaximumDepth:               7,
			NodeBudget:                 4000,
			SegmentsPerDirectory:       64,
			ExpandedDirectoriesPerRing: 12,
			MinimumArcDegrees:          0.75,
			ShowFiles:                  true,
			FileLimitMode:              "count",
			MaximumFilesPerDirectory:   6,
			MinimumFileSizeBytes:       100 << 20,
			ShowFreeSpace:              true,
			ColourMode:                 "size",
			SingleColour:               "#3bb5a1",
			SizeLargeColour:            "#750000",
			SizeSmallColour:            "#e1ff00",
			FileTypeDominancePercent:   40,
			OmittedStyle:               "gaps",
			SegmentOrder:               "folders-first",
			FileGroupGapDegrees:        0.8,
		},
	}
}

// Validate checks the complete supported settings range.
func Validate(value Preferences) error {
	if value.Version != currentVersion {
		return invalid("version must be %d", currentVersion)
	}
	if value.Theme != "system" && value.Theme != "light" && value.Theme != "dark" {
		return invalid("theme must be system, light, or dark")
	}
	if value.DefaultMetric != "allocated" && value.DefaultMetric != "logical" {
		return invalid("default metric must be allocated or logical")
	}
	chart := value.Chart
	if chart.MaximumDepth < 2 || chart.MaximumDepth > 12 {
		return invalid("maximum depth must be between 2 and 12")
	}
	if chart.NodeBudget < 200 || chart.NodeBudget > 4000 {
		return invalid("node budget must be between 200 and 4000")
	}
	if chart.SegmentsPerDirectory < 6 || chart.SegmentsPerDirectory > 64 {
		return invalid("segments per directory must be between 6 and 64")
	}
	if chart.ExpandedDirectoriesPerRing < 2 || chart.ExpandedDirectoriesPerRing > 32 {
		return invalid("expanded directories per ring must be between 2 and 32")
	}
	if chart.MinimumArcDegrees < 0 || chart.MinimumArcDegrees > 5 {
		return invalid("minimum arc angle must be between 0 and 5 degrees")
	}
	if chart.FileLimitMode != "count" && chart.FileLimitMode != "size" {
		return invalid("file limit mode must be count or size")
	}
	if chart.MaximumFilesPerDirectory < 1 || chart.MaximumFilesPerDirectory > 100 {
		return invalid("maximum files per directory must be between 1 and 100")
	}
	if chart.MinimumFileSizeBytes > 1<<50 {
		return invalid("minimum file size is too large")
	}
	if chart.ColourMode != "branch" && chart.ColourMode != "single" && chart.ColourMode != "size" &&
		chart.ColourMode != "rainbow" && chart.ColourMode != "file-type" {
		return invalid("colour mode must be branch, single, size, rainbow, or file-type")
	}
	if !validHexColour(chart.SingleColour) || !validHexColour(chart.SizeLargeColour) ||
		!validHexColour(chart.SizeSmallColour) {
		return invalid("chart colours must use six-digit hexadecimal notation")
	}
	if chart.FileTypeDominancePercent < 25 || chart.FileTypeDominancePercent > 90 {
		return invalid("file type dominance percent must be between 25 and 90")
	}
	if chart.OmittedStyle != "gaps" && chart.OmittedStyle != "aggregate" {
		return invalid("omitted style must be gaps or aggregate")
	}
	if chart.SegmentOrder != "size" && chart.SegmentOrder != "folders-first" && chart.SegmentOrder != "name" {
		return invalid("segment order must be size, folders-first, or name")
	}
	if chart.FileGroupGapDegrees < 0 || chart.FileGroupGapDegrees > 2 {
		return invalid("file group gap must be between 0 and 2 degrees")
	}
	return nil
}

func validHexColour(value string) bool {
	if len(value) != 7 || value[0] != '#' {
		return false
	}
	_, err := strconv.ParseUint(value[1:], 16, 24)
	return err == nil
}

func invalid(format string, values ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, values...))
}

// Store loads and saves one settings document.
type Store struct {
	mu   sync.Mutex
	path string
}

// NewStore returns a store at path, or at the standard user configuration path
// when path is empty. It does not create files until Save is called.
func NewStore(path string) (*Store, error) {
	if path == "" {
		root, err := os.UserConfigDir()
		if err != nil {
			return nil, fmt.Errorf("resolve user configuration directory: %w", err)
		}
		path = filepath.Join(root, "DiskOrbit", "settings.json")
	}
	return &Store{path: filepath.Clean(path)}, nil
}

// Get returns persisted settings or Defaults when no settings file exists.
func (s *Store) Get() (Preferences, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return Defaults(), nil
	}
	if err != nil {
		return Preferences{}, fmt.Errorf("read settings: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	value := Defaults()
	if err := decoder.Decode(&value); err != nil {
		return Preferences{}, fmt.Errorf("decode settings: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return Preferences{}, fmt.Errorf("decode settings: document must contain one object")
	}
	migrateLegacyColours(&value.Chart)
	if err := Validate(value); err != nil {
		return Preferences{}, err
	}
	value.Chart.LegacyMinimumSegmentPercent = nil
	value.Chart.LegacyPrimaryColour = nil
	value.Chart.LegacySecondaryColour = nil
	return value, nil
}

// Save validates and atomically replaces the persisted settings document.
func (s *Store) Save(value Preferences) (Preferences, error) {
	value.Chart.LegacyMinimumSegmentPercent = nil
	value.Chart.LegacyPrimaryColour = nil
	value.Chart.LegacySecondaryColour = nil
	if err := Validate(value); err != nil {
		return Preferences{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	directory := filepath.Dir(s.path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return Preferences{}, fmt.Errorf("create settings directory: %w", err)
	}
	temporary, err := os.CreateTemp(directory, "settings-*.tmp")
	if err != nil {
		return Preferences{}, fmt.Errorf("create temporary settings: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return Preferences{}, fmt.Errorf("secure temporary settings: %w", err)
	}
	encoder := json.NewEncoder(temporary)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		temporary.Close()
		return Preferences{}, fmt.Errorf("encode settings: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return Preferences{}, fmt.Errorf("sync settings: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return Preferences{}, fmt.Errorf("close settings: %w", err)
	}
	if err := replaceSettingsFile(temporaryPath, s.path); err != nil {
		return Preferences{}, fmt.Errorf("replace settings: %w", err)
	}
	return value, nil
}

func migrateLegacyColours(chart *ChartSettings) {
	if chart.LegacyPrimaryColour != nil {
		chart.SingleColour = *chart.LegacyPrimaryColour
		chart.SizeLargeColour = *chart.LegacyPrimaryColour
	}
	if chart.LegacySecondaryColour != nil {
		chart.SizeSmallColour = *chart.LegacySecondaryColour
	}
	chart.LegacyPrimaryColour = nil
	chart.LegacySecondaryColour = nil
}
