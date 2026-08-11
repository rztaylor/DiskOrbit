package scanner

import (
	"errors"
	"io/fs"
	"testing"
)

func TestWarningCollectorClassifiesExactCountsAndBoundsSamplesPerKind(t *testing.T) {
	t.Parallel()

	collector := newWarningCollector(256)
	for index := 0; index < 8; index++ {
		collector.add("/protected", "read_directory", fs.ErrPermission)
	}
	collector.add("/gone-a", "stat", fs.ErrNotExist)
	collector.add("/gone-b", "read_directory", fs.ErrNotExist)
	collector.add("/metadata", "stat", errors.New("metadata unavailable"))
	collector.add("/unreadable", "read_directory", errors.New("input/output error"))
	collector.add("/other", "observe", errors.New("unexpected observation failure"))

	samples, counts := collector.snapshot()
	if counts != (WarningCounts{Permission: 8, Changed: 2, Metadata: 1, Read: 1, Other: 1}) {
		t.Fatalf("counts = %+v", counts)
	}
	if counts.Total() != 13 || collector.count() != 13 {
		t.Fatalf("total = %d, collector count = %d", counts.Total(), collector.count())
	}
	if len(samples) != 10 {
		t.Fatalf("retained samples = %d, want 10", len(samples))
	}
	permissionSamples := 0
	for _, sample := range samples {
		if sample.Kind == WarningPermission {
			permissionSamples++
		}
	}
	if permissionSamples != warningSamplesPerKind {
		t.Fatalf("permission samples = %d, want %d", permissionSamples, warningSamplesPerKind)
	}
}
