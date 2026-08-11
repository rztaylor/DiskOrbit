import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ChartDatum } from "../visualization/tree";
import { SegmentActionsMenu } from "./SegmentActionsMenu";

describe("SegmentActionsMenu", () => {
  it("offers read-only segment actions and disables terminal reports during a live scan", () => {
    const markup = renderToStaticMarkup(
      <SegmentActionsMenu
        state={{ segment, x: 40, y: 60 }}
        live
        onClose={vi.fn()}
        onFocus={vi.fn()}
        onPin={vi.fn()}
        onReveal={vi.fn()}
        onAddToReview={vi.fn()}
        onOpenInsights={vi.fn()}
      />,
    );
    expect(markup).toContain('role="menu"');
    expect(markup).toContain("Reveal in file manager");
    expect(markup).toContain("Add to Review list");
    expect(markup).toContain("Copy full path");
    expect(markup).toMatch(/Focus in chart<\/button>/);
    expect(markup).not.toContain("Terminal");
    expect(markup).not.toContain("Delete");
  });
});

const segment: ChartDatum = {
  key: "node-1",
  nodeID: 1,
  name: "Pictures",
  kind: "directory",
  size: 100,
  logicalSize: 100,
  allocatedSize: 128,
  fileCount: 2,
  directoryCount: 1,
  path: "/Users/example/Pictures",
  warning: false,
  complete: true,
};
