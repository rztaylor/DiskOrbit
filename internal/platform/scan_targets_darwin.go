//go:build darwin

package platform

import "path/filepath"

func standardFolderCandidates(home string) []namedPath {
	return conventionalFolderCandidates(home, true)
}

func platformCloudRoots(home string) []cloudRoot {
	return []cloudRoot{
		{path: filepath.Join(home, "Library", "CloudStorage"), enumerate: true},
		{name: "iCloud Drive", path: filepath.Join(home, "Library", "Mobile Documents", "com~apple~CloudDocs")},
	}
}
