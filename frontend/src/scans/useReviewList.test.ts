import { describe, expect, it } from "vitest";

import type { ScanNode } from "../api/scans";
import { consolidateReviewItems, type ReviewItem } from "./useReviewList";

describe("review list consolidation", () => {
	it("keeps one top-level item when a collected parent already covers a child", () => {
		const parent = item(node(1, 0, "media"), [0]);
		const child = item(node(2, 1, "clip.bin", "file"), [1, 0]);

		const result = consolidateReviewItems([parent], child);

		expect(result.items).toEqual([parent]);
		expect(result.message).toBe("clip.bin is already included by media.");
	});

	it("consolidates collected descendants when their parent is added", () => {
		const first = item(node(2, 1, "clip.bin", "file"), [1, 0]);
		const second = item(node(3, 1, "notes.txt", "file"), [1, 0]);
		const parent = item(node(1, 0, "media"), [0]);

		const result = consolidateReviewItems([first, second], parent);

		expect(result.items).toEqual([parent]);
		expect(result.message).toBe("media added; 2 nested items were consolidated.");
	});

	it("does not add the same item twice", () => {
		const media = item(node(1, 0, "media"), [0]);

		const result = consolidateReviewItems([media], media);

		expect(result.items).toEqual([media]);
		expect(result.message).toBe("media is already in Review list.");
	});
});

function item(value: ScanNode, ancestorIDs: number[]): ReviewItem {
	return { node: value, ancestorIDs };
}

function node(
	id: number,
	parentId: number | null,
	name: string,
	kind: ScanNode["kind"] = "directory",
): ScanNode {
	return {
		id,
		parentId,
		name,
		path: `/scan/${name}`,
		kind,
		flags: {
			warning: false,
			filesystemBoundary: false,
			allocatedSizeKnown: true,
			subtreeComplete: true,
		},
		logicalSize: 100,
		allocatedSize: 128,
		fileCount: kind === "file" ? 1 : 0,
		directoryCount: kind === "directory" ? 1 : 0,
		childCount: 0,
	};
}
