import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ScanNode } from "../api/scans";
import { WorkspaceViews } from "./WorkspaceViews";

describe("WorkspaceViews", () => {
  it("presents the chart, contents, and insights as peer workspace views", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceViews
        active="chart"
        chart={<p>Radial chart</p>}
        contents={<p>Exact entries</p>}
        insights={<p>Reports</p>}
        selectionPath={[]}
        live={false}
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('id="workspace-tab-chart"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).not.toMatch(/id="workspace-view-chart"[^>]*hidden/);
    expect(markup).toMatch(/id="workspace-view-contents"[^>]*hidden/);
    expect(markup).toMatch(/id="workspace-view-insights"[^>]*hidden/);
  });

  it("keeps the shared directory path visible and disables navigation during a live scan", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceViews
        active="contents"
        chart={<p>Radial chart</p>}
        contents={<p>Exact entries</p>}
        insights={<p>Reports</p>}
        selectionPath={[root]}
        live
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(markup).toContain('aria-label="Directory path"');
    expect(markup).toContain("root");
    expect(markup).toContain("disabled");
    expect(markup).toContain("Esc returns to Chart");
  });
});

const root: ScanNode = {
  id: 0,
  parentId: null,
  name: "root",
  kind: "directory",
  flags: {
    warning: false,
    filesystemBoundary: false,
    allocatedSizeKnown: true,
    subtreeComplete: false,
  },
  logicalSize: 100,
  allocatedSize: 128,
  fileCount: 1,
  directoryCount: 1,
  childCount: 1,
};
