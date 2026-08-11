import type { FileTypeCategory } from "../api/scans";

export type FileCategory = FileTypeCategory;

export const fileCategoryOrder: FileCategory[] = [
  "image", "video", "audio", "document", "code", "archive", "application", "other",
];

const extensions: Record<Exclude<FileCategory, "other">, Set<string>> = {
  image: set("jpg jpeg png gif webp heic heif avif raw dng bmp tif tiff svg ico"),
  video: set("mp4 mov mkv avi webm m4v mpg mpeg wmv flv 3gp"),
  audio: set("mp3 wav flac aac m4a ogg opus wma aiff"),
  document: set("pdf doc docx xls xlsx ppt pptx txt rtf odt ods odp csv epub pages numbers key"),
  code: set("go js mjs cjs ts tsx jsx py rb rs java c cc cpp h hpp cs swift kt kts sh zsh fish sql html htm css scss sass less json yaml yml toml xml vue svelte md"),
  archive: set("zip tar gz tgz bz2 xz 7z rar zst cab dmg iso"),
  application: set("app exe msi dll so dylib pkg deb rpm apk appimage bin class jar wasm"),
};

const labels: Record<FileCategory, string> = {
  image: "Images",
  video: "Video",
  audio: "Audio",
  document: "Documents",
  code: "Code",
  archive: "Archives",
  application: "Software & system",
  other: "Other file types",
};

const colours: Record<FileCategory, string> = {
  image: "#d45087",
  video: "#7a5af8",
  audio: "#2e90fa",
  document: "#12a66f",
  code: "#e98512",
  archive: "#b85c23",
  application: "#667085",
  other: "#98a2b3",
};

export function fileCategory(name: string): FileCategory {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "other";
  const extension = name.slice(dot + 1).toLowerCase();
  for (const category of fileCategoryOrder) {
    if (category !== "other" && extensions[category].has(extension)) return category;
  }
  return "other";
}

export function fileCategoryLabel(category: FileCategory): string {
  return labels[category];
}

export function fileCategoryColour(category: FileCategory): string {
  return colours[category];
}

function set(value: string): Set<string> {
  return new Set(value.split(" "));
}
