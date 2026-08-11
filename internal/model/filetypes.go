package model

import (
	"path/filepath"
	"strings"
)

// FileType identifies one broad extension-based regular-file category.
type FileType uint8

const (
	FileTypeUnknown FileType = iota
	FileTypeImage
	FileTypeVideo
	FileTypeAudio
	FileTypeDocument
	FileTypeCode
	FileTypeArchive
	FileTypeApplication
	FileTypeOther
)

const fileTypeCount = int(FileTypeOther)

type fileTypeTotals [fileTypeCount]uint64

var fileTypesByExtension = map[string]FileType{
	"jpg": FileTypeImage, "jpeg": FileTypeImage, "png": FileTypeImage,
	"gif": FileTypeImage, "webp": FileTypeImage, "heic": FileTypeImage,
	"heif": FileTypeImage, "avif": FileTypeImage, "raw": FileTypeImage,
	"dng": FileTypeImage, "bmp": FileTypeImage, "tif": FileTypeImage,
	"tiff": FileTypeImage, "svg": FileTypeImage, "ico": FileTypeImage,
	"mp4": FileTypeVideo, "mov": FileTypeVideo, "mkv": FileTypeVideo,
	"avi": FileTypeVideo, "webm": FileTypeVideo, "m4v": FileTypeVideo,
	"mpg": FileTypeVideo, "mpeg": FileTypeVideo, "wmv": FileTypeVideo,
	"flv": FileTypeVideo, "3gp": FileTypeVideo,
	"mp3": FileTypeAudio, "wav": FileTypeAudio, "flac": FileTypeAudio,
	"aac": FileTypeAudio, "m4a": FileTypeAudio, "ogg": FileTypeAudio,
	"opus": FileTypeAudio, "wma": FileTypeAudio, "aiff": FileTypeAudio,
	"pdf": FileTypeDocument, "doc": FileTypeDocument, "docx": FileTypeDocument,
	"xls": FileTypeDocument, "xlsx": FileTypeDocument, "ppt": FileTypeDocument,
	"pptx": FileTypeDocument, "txt": FileTypeDocument, "rtf": FileTypeDocument,
	"odt": FileTypeDocument, "ods": FileTypeDocument, "odp": FileTypeDocument,
	"csv": FileTypeDocument, "epub": FileTypeDocument, "pages": FileTypeDocument,
	"numbers": FileTypeDocument, "key": FileTypeDocument,
	"go": FileTypeCode, "js": FileTypeCode, "mjs": FileTypeCode,
	"cjs": FileTypeCode, "ts": FileTypeCode, "tsx": FileTypeCode,
	"jsx": FileTypeCode, "py": FileTypeCode, "rb": FileTypeCode,
	"rs": FileTypeCode, "java": FileTypeCode, "c": FileTypeCode,
	"cc": FileTypeCode, "cpp": FileTypeCode, "h": FileTypeCode,
	"hpp": FileTypeCode, "cs": FileTypeCode, "swift": FileTypeCode,
	"kt": FileTypeCode, "kts": FileTypeCode, "sh": FileTypeCode,
	"zsh": FileTypeCode, "fish": FileTypeCode, "sql": FileTypeCode,
	"html": FileTypeCode, "htm": FileTypeCode, "css": FileTypeCode,
	"scss": FileTypeCode, "sass": FileTypeCode, "less": FileTypeCode,
	"json": FileTypeCode, "yaml": FileTypeCode, "yml": FileTypeCode,
	"toml": FileTypeCode, "xml": FileTypeCode, "vue": FileTypeCode,
	"svelte": FileTypeCode, "md": FileTypeCode,
	"zip": FileTypeArchive, "tar": FileTypeArchive, "gz": FileTypeArchive,
	"tgz": FileTypeArchive, "bz2": FileTypeArchive, "xz": FileTypeArchive,
	"7z": FileTypeArchive, "rar": FileTypeArchive, "zst": FileTypeArchive,
	"cab": FileTypeArchive, "dmg": FileTypeArchive, "iso": FileTypeArchive,
	"app": FileTypeApplication, "exe": FileTypeApplication,
	"msi": FileTypeApplication, "dll": FileTypeApplication,
	"so": FileTypeApplication, "dylib": FileTypeApplication,
	"pkg": FileTypeApplication, "deb": FileTypeApplication,
	"rpm": FileTypeApplication, "apk": FileTypeApplication,
	"appimage": FileTypeApplication, "bin": FileTypeApplication,
	"class": FileTypeApplication, "jar": FileTypeApplication,
	"wasm": FileTypeApplication,
}

func (fileType FileType) String() string {
	switch fileType {
	case FileTypeImage:
		return "image"
	case FileTypeVideo:
		return "video"
	case FileTypeAudio:
		return "audio"
	case FileTypeDocument:
		return "document"
	case FileTypeCode:
		return "code"
	case FileTypeArchive:
		return "archive"
	case FileTypeApplication:
		return "application"
	case FileTypeOther:
		return "other"
	default:
		return "unknown"
	}
}

func fileTypeForName(name string) FileType {
	extension := strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")
	if fileType := fileTypesByExtension[extension]; fileType != FileTypeUnknown {
		return fileType
	}
	return FileTypeOther
}

func (totals fileTypeTotals) dominant() (FileType, uint64) {
	fileType := FileTypeUnknown
	var bytes uint64
	for index, candidateBytes := range totals {
		if candidateBytes > bytes {
			fileType = FileType(index + 1)
			bytes = candidateBytes
		}
	}
	return fileType, bytes
}
