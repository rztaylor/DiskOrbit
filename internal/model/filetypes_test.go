package model

import "testing"

func TestFileTypeForName(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		want FileType
	}{
		{name: "portrait.DNG", want: FileTypeImage},
		{name: "clip.mov", want: FileTypeVideo},
		{name: "recording.flac", want: FileTypeAudio},
		{name: "report.pdf", want: FileTypeDocument},
		{name: "component.tsx", want: FileTypeCode},
		{name: "backup.tar", want: FileTypeArchive},
		{name: "DiskOrbit.exe", want: FileTypeApplication},
		{name: "capture.on1", want: FileTypeOther},
		{name: "README", want: FileTypeOther},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := fileTypeForName(test.name); got != test.want {
				t.Fatalf("fileTypeForName(%q) = %s, want %s", test.name, got, test.want)
			}
		})
	}
}
