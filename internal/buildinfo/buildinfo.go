package buildinfo

import "fmt"

// Values are replaced by release builds with -ldflags -X assignments.
var (
	Version   = "dev"
	Commit    = "unknown"
	BuildDate = "unknown"
)

// Info is the build metadata safe to expose to local clients.
type Info struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"buildDate"`
}

// Current returns the metadata compiled into this executable.
func Current() Info {
	return Info{Version: Version, Commit: Commit, BuildDate: BuildDate}
}

// String formats human-readable version output.
func (i Info) String() string {
	return fmt.Sprintf("DiskOrbit %s (commit %s, built %s)", valueOrUnknown(i.Version), valueOrUnknown(i.Commit), valueOrUnknown(i.BuildDate))
}

func valueOrUnknown(value string) string {
	if value == "" {
		return "unknown"
	}
	return value
}
