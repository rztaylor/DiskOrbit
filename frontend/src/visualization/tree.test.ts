import { describe, expect, it } from "vitest";

import type { ScanNode } from "../api/scans";
import {
	findChartPath,
	toChartDatum,
	type ChartOptions,
	type VisualTreeNode,
	withDiskCapacity,
} from "./tree";

describe("radial tree transform", () => {
	it("retains large children and combines omitted bytes exactly", () => {
		const tree: VisualTreeNode = {
			node: node(0, "root", 1000),
			children: [
				{ node: node(1, "large", 700) },
				{ node: node(2, "small", 200) },
				{ node: node(3, "tiny", 100) },
			],
		};
		const result = toChartDatum(tree, options({
			maximumChildren: 2,
			minimumArcDegrees: 0,
		}));
		expect(result.children?.map((child) => [child.name, child.size])).toEqual([
			["large", 700],
			["small", 200],
			["Other", 100],
		]);
		expect(result.children?.reduce((sum, child) => sum + child.size, 0)).toBe(
			1000,
		);
	});

	it("omits segments below the configured whole-chart angle", () => {
		const tinyDirectory = node(3, "tiny-directory", 1);
		const largeFile = {
			...node(2, "archive.bin", 99),
			kind: "file" as const,
		};
		const tree: VisualTreeNode = {
			node: node(0, "root", 1000),
			children: [
				{ node: node(1, "bulk", 900) },
				{
					node: node(4, "branch", 100),
					children: [{ node: largeFile }, { node: tinyDirectory }],
				},
			],
		};

		const result = toChartDatum(tree, options({
			maximumChildren: 10,
			minimumArcDegrees: 0.75,
		}));
		const branch = result.children?.find((child) => child.name === "branch");

		expect(branch?.children?.map((child) => [child.name, child.size])).toEqual([
			["archive.bin", 99],
		]);
		expect(branch?.layoutRemainder).toBe(1);
		expect(branch?.omittedSize).toBe(1);
		expect(findChartPath(result, "node-3")).toBeUndefined();
	});

	it("finds a focus breadcrumb path", () => {
		const chart = toChartDatum(
			{
				node: node(0, "root", 10),
				children: [{ node: node(1, "child", 10) }],
			},
			options(),
		);
		expect(findChartPath(chart, "node-1")?.map((item) => item.name)).toEqual([
			"root",
			"child",
		]);
	});

	it("preserves completion state for live monochrome rendering", () => {
		const root = node(0, "root", 10);
		const child = node(1, "child", 10);
		root.flags.subtreeComplete = false;
		child.flags.subtreeComplete = true;

		const chart = toChartDatum(
			{ node: root, children: [{ node: child }] },
			options(),
		);

		expect(chart.complete).toBe(false);
		expect(chart.children?.[0]?.complete).toBe(true);
	});

	it("keeps exact aggregate metrics and descendant counts", () => {
		const root = node(0, "root", 1000);
		root.allocatedSize = 800;
		root.flags.allocatedSizeKnown = true;
		root.fileCount = 8;
		root.directoryCount = 3;
		const retained = node(1, "retained", 700);
		retained.allocatedSize = 500;
		retained.flags.allocatedSizeKnown = true;
		retained.fileCount = 5;
		retained.directoryCount = 1;
		const omitted = node(2, "omitted", 300);
		omitted.allocatedSize = 300;
		omitted.flags.allocatedSizeKnown = true;
		omitted.fileCount = 3;
		omitted.directoryCount = 1;

		const result = toChartDatum(
			{ node: root, children: [{ node: retained }, { node: omitted }] },
			options({ maximumChildren: 1, minimumArcDegrees: 0 }),
		);
		const other = result.children?.at(-1);

		expect(other).toMatchObject({
			name: "Other",
			size: 300,
			parentSize: 1000,
			logicalSize: 300,
			allocatedSize: 300,
			fileCount: 3,
			directoryCount: 1,
		});
		expect(result.children?.[0]?.parentSize).toBe(1000);
	});

	it("keeps measured allocation exact and exposes unaccounted used capacity", () => {
		const root = node(0, "root", 1000);
		root.allocatedSize = 600;
		root.flags.allocatedSizeKnown = true;
		const first = node(1, "first", 500);
		first.allocatedSize = 400;
		first.flags.allocatedSizeKnown = true;
		const second = node(2, "second", 500);
		second.allocatedSize = 200;
		second.flags.allocatedSizeKnown = true;

		const chart = toChartDatum(
			{ node: root, children: [{ node: first }, { node: second }] },
			options({ maximumChildren: 10, minimumArcDegrees: 0 }),
			"allocated",
		);
		const capacityChart = withDiskCapacity(chart, {
			total: 1000,
			available: 250,
		});
		const free = capacityChart.children?.find((child) => child.kind === "free");
		const unaccounted = capacityChart.children?.find(
			(child) => child.kind === "unaccounted",
		);
		const measuredWeight = capacityChart.children
			?.filter((child) => child.kind !== "free" && child.kind !== "unaccounted")
			.reduce((total, child) => total + (child.layoutSize ?? child.size), 0);

		expect(measuredWeight).toBe(600);
		expect(unaccounted).toMatchObject({
			name: "Unaccounted used space",
			size: 150,
			layoutSize: 150,
		});
		expect(free).toMatchObject({
			name: "Free space",
			size: 250,
			layoutSize: 250,
		});
	});

	it("can hide files, retain only the largest count, or apply a size threshold", () => {
		const root = node(0, "root", 1000);
		const directory = node(1, "archive", 300);
		const large = { ...node(2, "movie.iso", 500), kind: "file" as const };
		const small = { ...node(3, "note.txt", 200), kind: "file" as const };
		const tree = {
			node: root,
			children: [{ node: directory }, { node: large }, { node: small }],
		};

		const foldersOnly = toChartDatum(tree, options({
			showFiles: false,
			maximumChildren: 10,
			minimumArcDegrees: 0,
		}));
		const oneFile = toChartDatum(tree, options({
			showFiles: true,
			fileLimitMode: "count",
			maximumFilesPerDirectory: 1,
			maximumChildren: 10,
			minimumArcDegrees: 0,
		}));
		const threshold = toChartDatum(tree, options({
			showFiles: true,
			fileLimitMode: "size",
			minimumFileSizeBytes: 300,
			maximumChildren: 10,
			minimumArcDegrees: 0,
		}));

		expect(foldersOnly.children?.map((child) => child.name)).toEqual([
			"archive",
			"Other",
		]);
		expect(oneFile.children?.map((child) => child.name)).toEqual([
			"movie.iso",
			"archive",
			"Other",
		]);
		expect(threshold.children?.map((child) => child.name)).toEqual([
			"movie.iso",
			"archive",
			"Other",
		]);
	});

	it("can leave pruned detail as an exact layout gap instead of an Other segment", () => {
		const result = toChartDatum(
			{
				node: node(0, "root", 1000),
				children: [
					{ node: node(1, "large", 700) },
					{ node: node(2, "small", 300) },
				],
			},
			options({
				maximumChildren: 1,
				minimumArcDegrees: 0,
				omittedStyle: "gaps",
			}),
		);

		expect(result.children?.map((child) => child.name)).toEqual(["large"]);
		expect(result.layoutRemainder).toBe(300);
		expect(result.omittedSize).toBe(300);
	});

	it("colours a folder from its complete subtree even when visual detail is absent", () => {
		const root = node(0, "root", 1000);
		const album = node(1, "album", 1000);
		album.allocatedSize = 2000;
		album.flags.allocatedSizeKnown = true;
		album.dominantFileType = { category: "image", logicalSize: 650 };
		const tree = { node: root, children: [{ node: album }] };

		const classified = toChartDatum(tree, options({
			minimumArcDegrees: 0,
			maximumChildren: 10,
			fileTypeDominanceShare: 0.6,
		}), "allocated");
		const conservative = toChartDatum(tree, options({
			minimumArcDegrees: 0,
			maximumChildren: 10,
			fileTypeDominanceShare: 0.7,
		}), "allocated");

		expect(classified.children?.[0]?.dominantCategory).toBe("image");
		expect(conservative.children?.[0]?.dominantCategory).toBeUndefined();
	});
});

const chartOptionsFixture: ChartOptions = {
	maximumChildren: 18,
	minimumArcDegrees: 0.75,
	showFiles: true,
	fileLimitMode: "count",
	maximumFilesPerDirectory: 12,
	minimumFileSizeBytes: 100 * 1024 * 1024,
	fileTypeDominanceShare: 0.6,
	omittedStyle: "aggregate",
};

function options(overrides: Partial<ChartOptions> = {}): ChartOptions {
	return { ...chartOptionsFixture, ...overrides };
}

function node(id: number, name: string, logicalSize: number): ScanNode {
	return {
		id,
		parentId: id === 0 ? null : 0,
		name,
		kind: "directory",
		flags: {
			warning: false,
			filesystemBoundary: false,
			allocatedSizeKnown: false,
			subtreeComplete: true,
		},
		logicalSize,
		fileCount: 0,
		directoryCount: 0,
		childCount: 0,
	};
}
