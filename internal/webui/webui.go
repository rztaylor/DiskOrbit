package webui

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
)

//go:embed assets
var embeddedAssets embed.FS

// New returns a handler for the compiled frontend assets.
func New() (http.Handler, error) {
	generated, err := fs.Sub(embeddedAssets, "assets/generated")
	if err != nil {
		return nil, fmt.Errorf("compiled frontend is missing; run npm --prefix frontend run build: %w", err)
	}
	if _, err := fs.Stat(generated, "index.html"); err != nil {
		return nil, fmt.Errorf("compiled frontend index is missing; run npm --prefix frontend run build: %w", err)
	}

	files := http.FileServerFS(generated)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			w.Header().Set("Cache-Control", "no-store")
		} else if len(r.URL.Path) >= len("/assets/") && r.URL.Path[:len("/assets/")] == "/assets/" {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		files.ServeHTTP(w, r)
	}), nil
}
