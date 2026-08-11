import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FolderPickerDialog } from "./FolderPickerDialog";
import { ScanToolbar } from "./ScanToolbar";

describe("ScanToolbar", () => {
  it("presents discovered places as primary scan actions", () => {
    const markup = renderToStaticMarkup(
      <ScanToolbar
        disabled={false}
        submitting={false}
        targets={[
          { path: "/Users/example", name: "Home", kind: "home" },
          { path: "/Volumes/Archive", name: "Archive", kind: "local-volume", filesystem: "apfs" },
        ]}
        targetsLoading={false}
        metric="logical"
        onMetric={vi.fn()}
        onStart={vi.fn()}
        onBrowse={vi.fn()}
      />,
    );

    expect(markup).toContain("Choose what to explore");
    expect(markup).toContain("Quick places");
    expect(markup).toContain("Volumes");
    expect(markup).toContain('aria-label="Scan Home (/Users/example)"');
    expect(markup.indexOf("Choose another folder")).toBeGreaterThan(markup.indexOf("Home"));
  });

  it("shows a recoverable custom-path state when discovery fails", () => {
    const markup = renderToStaticMarkup(
      <ScanToolbar
        disabled={false}
        submitting={false}
        targets={[]}
        targetsLoading={false}
        targetsError="unavailable"
        metric="logical"
        onMetric={vi.fn()}
        onStart={vi.fn()}
        onBrowse={vi.fn()}
      />,
    );

    expect(markup).toContain("Automatic choices are unavailable");
  });

  it("provides a modal directory browser with manual-path recovery", () => {
    const markup = renderToStaticMarkup(
      <FolderPickerDialog
        fetcher={vi.fn()}
        targets={[
          { path: "/Users/example", name: "Home", kind: "home" },
          { path: "/Volumes/Archive", name: "Archive", kind: "network-volume", filesystem: "smbfs" },
        ]}
        submitting={false}
        onClose={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    expect(markup).toContain("Choose a folder to scan");
    expect(markup).toContain('aria-label="Scan locations"');
    expect(markup).toContain('id="folder-picker-location"');
    expect(markup).toContain("Network volume");
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("Show hidden folders");
    expect(markup).not.toContain(">Go<");
    expect(markup).toContain("Scan this folder");
  });
});
