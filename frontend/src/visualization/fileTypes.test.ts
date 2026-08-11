import { describe, expect, it } from "vitest";

import { fileCategory } from "./fileTypes";

describe("file type groups", () => {
  it("recognises common housekeeping categories case-insensitively", () => {
    expect(fileCategory("holiday.HEIC")).toBe("image");
    expect(fileCategory("movie.mkv")).toBe("video");
    expect(fileCategory("podcast.flac")).toBe("audio");
    expect(fileCategory("report.docx")).toBe("document");
    expect(fileCategory("component.tsx")).toBe("code");
    expect(fileCategory("backup.tar")).toBe("archive");
    expect(fileCategory("library.dylib")).toBe("application");
    expect(fileCategory("README")).toBe("other");
  });
});
