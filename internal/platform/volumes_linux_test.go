//go:build linux

package platform

import "testing"

func TestUnescapeMountField(t *testing.T) {
	if got := unescapeMountField(`/media/My\040Disk`); got != "/media/My Disk" {
		t.Fatalf("unescapeMountField() = %q", got)
	}
}
