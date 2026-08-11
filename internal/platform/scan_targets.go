package platform

import (
	"context"
	"path/filepath"
	"strings"
)

func cloudFolderCandidates(ctx context.Context, home string, readDir readDirectory) []namedPath {
	candidates := []namedPath{
		{name: "Dropbox", path: filepath.Join(home, "Dropbox")},
		{name: "Google Drive", path: filepath.Join(home, "Google Drive")},
		{name: "OneDrive", path: filepath.Join(home, "OneDrive")},
		{name: "iCloud Drive", path: filepath.Join(home, "iCloud Drive")},
		{name: "Box", path: filepath.Join(home, "Box")},
	}
	candidates = appendCloudChildren(ctx, candidates, home, readDir)
	for _, root := range platformCloudRoots(home) {
		if root.enumerate {
			candidates = appendCloudChildren(ctx, candidates, root.path, readDir)
			continue
		}
		candidates = append(candidates, namedPath{name: root.name, path: root.path})
	}
	return candidates
}

func appendCloudChildren(ctx context.Context, candidates []namedPath, root string, readDir readDirectory) []namedPath {
	entries, err := readDir(root)
	if err != nil {
		return candidates
	}
	for _, entry := range entries {
		if ctx.Err() != nil {
			return candidates
		}
		provider, ok := cloudProviderName(entry.Name())
		if !ok || !entry.IsDir() {
			continue
		}
		name := provider
		if provider == "OneDrive" && !strings.EqualFold(entry.Name(), provider) {
			name = entry.Name()
		}
		candidates = append(candidates, namedPath{name: name, path: filepath.Join(root, entry.Name())})
	}
	return candidates
}

func cloudProviderName(name string) (string, bool) {
	normalized := strings.ToLower(strings.TrimSpace(name))
	switch {
	case normalized == "dropbox" || strings.HasPrefix(normalized, "dropbox-") || strings.HasPrefix(normalized, "dropbox ("):
		return "Dropbox", true
	case normalized == "google drive" || strings.HasPrefix(normalized, "googledrive-"):
		return "Google Drive", true
	case normalized == "onedrive" || strings.HasPrefix(normalized, "onedrive-") || strings.HasPrefix(normalized, "onedrive -"):
		return "OneDrive", true
	case normalized == "icloud drive":
		return "iCloud Drive", true
	case normalized == "box" || strings.HasPrefix(normalized, "box-"):
		return "Box", true
	default:
		return "", false
	}
}

type cloudRoot struct {
	name      string
	path      string
	enumerate bool
}

func conventionalFolderCandidates(home string, includeMovies bool) []namedPath {
	candidates := []namedPath{
		{name: "Desktop", path: filepath.Join(home, "Desktop")},
		{name: "Documents", path: filepath.Join(home, "Documents")},
		{name: "Downloads", path: filepath.Join(home, "Downloads")},
		{name: "Pictures", path: filepath.Join(home, "Pictures")},
		{name: "Music", path: filepath.Join(home, "Music")},
		{name: "Videos", path: filepath.Join(home, "Videos")},
	}
	if includeMovies {
		candidates = append(candidates, namedPath{name: "Movies", path: filepath.Join(home, "Movies")})
	}
	return candidates
}
