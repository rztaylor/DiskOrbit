package buildinfo

import "testing"

func TestInfoString(t *testing.T) {
	t.Parallel()

	got := (Info{Version: "1.2.3", Commit: "abc123", BuildDate: "2026-08-07"}).String()
	want := "DiskOrbit 1.2.3 (commit abc123, built 2026-08-07)"
	if got != want {
		t.Fatalf("Info.String() = %q, want %q", got, want)
	}
}

func TestInfoStringUsesUnknownForMissingValues(t *testing.T) {
	t.Parallel()

	got := (Info{}).String()
	want := "DiskOrbit unknown (commit unknown, built unknown)"
	if got != want {
		t.Fatalf("Info.String() = %q, want %q", got, want)
	}
}
