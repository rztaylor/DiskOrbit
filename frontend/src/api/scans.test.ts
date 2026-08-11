import { describe, expect, it, vi } from "vitest";

import { fetchChildren, fetchNode, listScans } from "./scans";

describe("fetchChildren", () => {
	it("requests a bounded cursor page", async () => {
		const authenticatedFetch = vi.fn(async () =>
			Response.json({
				nodes: [],
				nextAfter: null,
				more: false,
			}),
		);

		await fetchChildren(authenticatedFetch, "scan/a", 42, {
			after: 17,
			limit: 100,
		});

		expect(authenticatedFetch).toHaveBeenCalledWith(
			"/api/scans/scan%2Fa/nodes/42/children?limit=100&after=17",
			{ cache: "no-store", signal: undefined },
		);
	});
});

describe("fetchNode", () => {
	it("accepts an authoritative dominant file-type summary", async () => {
		const authenticatedFetch = vi.fn(async () =>
			Response.json({
				id: 42,
				parentId: 0,
				name: "album",
				kind: "directory",
				flags: {
					warning: false,
					filesystemBoundary: false,
					allocatedSizeKnown: true,
					subtreeComplete: true,
				},
				logicalSize: 1000,
				allocatedSize: 1200,
				fileCount: 10,
				directoryCount: 0,
				childCount: 10,
				dominantFileType: { category: "image", logicalSize: 900 },
			}),
		);

		await expect(fetchNode(authenticatedFetch, "scan-1", 42)).resolves.toMatchObject({
			dominantFileType: { category: "image", logicalSize: 900 },
		});
	});

	it("rejects a dominant type larger than the directory", async () => {
		const authenticatedFetch = vi.fn(async () =>
			Response.json({
				id: 42,
				parentId: 0,
				name: "album",
				kind: "directory",
				flags: {
					warning: false,
					filesystemBoundary: false,
					allocatedSizeKnown: false,
					subtreeComplete: true,
				},
				logicalSize: 1000,
				fileCount: 10,
				directoryCount: 0,
				childCount: 10,
				dominantFileType: { category: "image", logicalSize: 1001 },
			}),
		);

		await expect(fetchNode(authenticatedFetch, "scan-1", 42)).rejects.toThrow(
			"Scan node response was invalid",
		);
	});
});

describe("listScans", () => {
	it("accepts bounded volume capacity metadata", async () => {
		const authenticatedFetch = vi.fn(async () =>
			Response.json({
				scans: [
					{
						id: "scan-1",
						path: "/Volumes/Archive",
						state: "completed",
						revision: 2,
						progress: {
							files: 1,
							directories: 1,
							bytes: 750,
							warnings: 0,
							nodes: 2,
							elapsedMs: 10,
						},
						warningDetails: [],
						warningCounts: {
							permission: 0,
							changed: 0,
							metadata: 0,
							read: 0,
							other: 0,
						},
						capacity: { total: 1000, available: 250 },
					},
				],
			}),
		);

		await expect(listScans(authenticatedFetch)).resolves.toMatchObject([
			{ capacity: { total: 1000, available: 250 } },
		]);
	});

	it("rejects capacity with more available bytes than total bytes", async () => {
		const authenticatedFetch = vi.fn(async () =>
			Response.json({
				scans: [
					{
						id: "scan-1",
						path: "/Volumes/Archive",
						state: "completed",
						revision: 2,
						progress: {
							files: 0,
							directories: 1,
							bytes: 0,
							warnings: 0,
							nodes: 1,
							elapsedMs: 10,
						},
						warningDetails: [],
						warningCounts: {
							permission: 0,
							changed: 0,
							metadata: 0,
							read: 0,
							other: 0,
						},
						capacity: { total: 1000, available: 1001 },
					},
				],
			}),
		);

		await expect(listScans(authenticatedFetch)).rejects.toThrow(
			"Scan list response was invalid",
		);
	});
});
