//go:build linux

package platform

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

func standardFolderCandidates(home string) []namedPath {
	configured := xdgFolderCandidates(home)
	fallbacks := conventionalFolderCandidates(home, false)
	byName := make(map[string]string, len(configured))
	for _, candidate := range configured {
		byName[candidate.name] = candidate.path
	}
	for index := range fallbacks {
		if path := byName[fallbacks[index].name]; path != "" {
			fallbacks[index].path = path
		}
	}
	return fallbacks
}

func xdgFolderCandidates(home string) []namedPath {
	configHome := os.Getenv("XDG_CONFIG_HOME")
	if configHome == "" {
		configHome = filepath.Join(home, ".config")
	}
	file, err := os.Open(filepath.Join(configHome, "user-dirs.dirs"))
	if err != nil {
		return nil
	}
	defer file.Close()
	wanted := []struct{ key, name string }{
		{"XDG_DESKTOP_DIR", "Desktop"}, {"XDG_DOCUMENTS_DIR", "Documents"},
		{"XDG_DOWNLOAD_DIR", "Downloads"}, {"XDG_PICTURES_DIR", "Pictures"},
		{"XDG_MUSIC_DIR", "Music"}, {"XDG_VIDEOS_DIR", "Videos"},
	}
	values := make(map[string]string)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		key, value, ok := strings.Cut(scanner.Text(), "=")
		if !ok {
			continue
		}
		value = strings.Trim(strings.TrimSpace(value), `"`)
		value = strings.ReplaceAll(value, "$HOME", home)
		if filepath.IsAbs(value) {
			values[strings.TrimSpace(key)] = filepath.Clean(value)
		}
	}
	candidates := make([]namedPath, 0, len(wanted))
	for _, item := range wanted {
		if path := values[item.key]; path != "" {
			candidates = append(candidates, namedPath{name: item.name, path: path})
		}
	}
	return candidates
}

func platformCloudRoots(string) []cloudRoot { return nil }
