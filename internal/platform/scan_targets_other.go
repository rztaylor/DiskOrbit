//go:build !darwin && !linux && !windows

package platform

func standardFolderCandidates(home string) []namedPath {
	return conventionalFolderCandidates(home, false)
}

func platformCloudRoots(string) []cloudRoot { return nil }
