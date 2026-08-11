import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ScanNode } from "../api/scans";
import { ReviewList } from "./ReviewList";

describe("ReviewList", () => {
	it("renders a measured, read-only review collection with accessible actions", () => {
		const markup = renderToStaticMarkup(
			<ReviewList
				items={[{ node: fixture, ancestorIDs: [0] }]}
				pendingCount={0}
				metric="allocated"
				live={false}
				expanded
				externalDragActive={false}
				message="Pictures added to Review list."
				onExpandedChange={vi.fn()}
				onRemove={vi.fn()}
				onClear={vi.fn()}
				onSelect={vi.fn()}
				onReveal={vi.fn()}
				canAcceptDrop={() => false}
				onDrop={vi.fn()}
			/>,
		);

		expect(markup).toContain("Review list");
		expect(markup).toContain("1 item · 128 B measured");
		expect(markup).toContain("measured at scan time");
		expect(markup).toContain("Resize Review list");
		expect(markup).toContain("View Pictures in DiskOrbit");
		expect(markup).toContain("Reveal Pictures in file manager");
		expect(markup).toContain("Remove Pictures from Review list");
		expect(markup).toContain("item-action--view");
		expect(markup).toContain("item-action--reveal");
		expect(markup).toContain("review-list__remove");
		expect(markup).not.toContain("Delete");
	});

	it("explains the safe empty state while a scan is active", () => {
		const markup = renderToStaticMarkup(
			<ReviewList
				items={[]}
				pendingCount={0}
				metric="logical"
				live
				expanded
				externalDragActive={false}
				onExpandedChange={vi.fn()}
				onRemove={vi.fn()}
				onClear={vi.fn()}
				onSelect={vi.fn()}
				onReveal={vi.fn()}
				canAcceptDrop={() => false}
				onDrop={vi.fn()}
			/>,
		);

		expect(markup).toContain("provisional while scanning");
		expect(markup).toContain("Drag files or folders here");
		expect(markup).toContain("Nothing here changes your files.");
	});
});

const fixture: ScanNode = {
	id: 1,
	parentId: 0,
	name: "Pictures",
	path: "/scan/Pictures",
	kind: "directory",
	flags: {
		warning: false,
		filesystemBoundary: false,
		allocatedSizeKnown: true,
		subtreeComplete: true,
	},
	logicalSize: 100,
	allocatedSize: 128,
	fileCount: 2,
	directoryCount: 1,
	childCount: 2,
};
