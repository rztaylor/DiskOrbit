package webui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCompiledIndex(t *testing.T) {
	t.Parallel()

	handler, err := New()
	if err != nil {
		t.Fatalf("New(): %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if !strings.Contains(recorder.Body.String(), "<title>DiskOrbit</title>") {
		t.Error("compiled index does not contain DiskOrbit title")
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
}
