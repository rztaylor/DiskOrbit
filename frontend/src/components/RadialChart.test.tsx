import { hsl } from "d3";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ScanNode } from "../api/scans";
import { settingsFixture as defaultSettings } from "../test/settings";
import { RadialChart } from "./RadialChart";

describe("RadialChart", () => {
	it("renders active scanning branches in monochrome without navigation controls", () => {
		const root = node(0, null, false);
		const child = node(1, 0, false);
		const markup = renderToStaticMarkup(
			<RadialChart
				tree={{ node: root, children: [{ node: child }] }}
				loading={false}
				selectionPath={[root]}
				onSelect={vi.fn()}
				metric="logical"
				live
				settings={defaultSettings.chart}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
			/>,
		);

		expect(markup).toContain("Live scan");
		expect(markup).toContain(
			"Scanning. The chart updates as files are measured.",
		);
		expect(markup).toContain("radial-centre-control--scanning");
		expect(markup).toContain("radial-centre__scan-label");
		expect(markup).toContain("var(--chart-pending)");
		expect(markup).toContain("scanning");
		expect(markup).toContain('aria-haspopup="menu"');
		expect(markup).not.toContain("Go up to");
	});

	it("gives inspector metrics stable identities and semantic coverage state", () => {
		const root = node(0, null, false);
		root.logicalSize = 200;
		root.allocatedSize = 256;
		const markup = renderToStaticMarkup(
			<RadialChart
				tree={{ node: root, children: [{ node: node(1, 0, true) }] }}
				loading={false}
				selectionPath={[root]}
				onSelect={vi.fn()}
				metric="allocated"
				live={false}
				settings={defaultSettings.chart}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
			/>,
		);

		expect(markup).toContain("Center path");
		expect(markup).not.toContain("Current focus");
		expect(markup).toContain("detail-metric--size");
		expect(markup).toContain("detail-metric--share");
		expect(markup).toContain("detail-metric--files");
		expect(markup).toContain("detail-metric--directories");
		expect(markup).toContain("detail-metric--root");
		expect(markup).toContain(
			"detail-metric--coverage detail-metric--incomplete",
		);
		expect(markup).toContain("Not expanded");
		expect(markup.indexOf("Not expanded")).toBeLessThan(
			markup.indexOf("Coverage"),
		);
		expect(markup).toContain("chart-warning");
	});

	it("allows a bounded leaf directory to drill down and exposes centre-up navigation", () => {
		const root = node(0, null, true);
		const child = node(1, 0, true);
		const markup = renderToStaticMarkup(
			<RadialChart
				tree={{ node: child, children: [{ node: node(2, 1, true) }] }}
				loading={false}
				selectionPath={[root, child]}
				onSelect={vi.fn()}
				metric="logical"
				live={false}
				settings={defaultSettings.chart}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
			/>,
		);

		expect(markup).toContain('role="button"');
		expect(markup).not.toContain("Select a ring to focus");
		expect(markup).toContain('aria-label="Chart colour style"');
		expect(markup).toMatch(
			/<option value="single">Single Colour<\/option><option value="rainbow">Rainbow Wash<\/option><option value="branch" selected="">Folder Branches<\/option><option value="size">Size Gradient<\/option><option value="file-type">File Type<\/option>/,
		);
		expect(markup).toContain("Go up to root");
		expect(markup).toContain("directory-2, 100 B, complete");
	});

	it("preserves terminal colours and marks only the visible permission frontier", () => {
		const root = node(0, null, false);
		const child = {
			...node(1, 0, false),
			flags: { ...node(1, 0, false).flags, warning: true },
			childCount: 0,
		};
		const markup = renderToStaticMarkup(
			<RadialChart
				tree={{ node: root, children: [{ node: child }] }}
				loading={false}
				selectionPath={[root]}
				onSelect={vi.fn()}
				metric="logical"
				live={false}
				settings={defaultSettings.chart}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
				warningCounts={{
					permission: 3,
					changed: 0,
					metadata: 0,
					read: 0,
					other: 0,
				}}
			/>,
		);

		expect(markup).toContain("radial-segment--partial");
		expect(markup).toContain("coverage-frontier");
		expect(markup).toContain("Limited access");
		expect(markup).toContain(
			"DiskOrbit does not have permission to read some contents beyond this point.",
		);
		expect(markup).not.toMatch(
			/radial-segment--partial[^>]*fill="var\(--chart-pending\)"/,
		);
		expect(markup).toContain(" measured");
	});

	it("does not hatch an incomplete directory that continues into another ring", () => {
		const root = node(0, null, false);
		const branch = {
			...node(1, 0, false),
			flags: { ...node(1, 0, false).flags, warning: true },
		};
		const child = node(2, 1, true);
		const markup = renderToStaticMarkup(
			<RadialChart
				tree={{
					node: root,
					children: [{ node: branch, children: [{ node: child }] }],
				}}
				loading={false}
				selectionPath={[root]}
				onSelect={vi.fn()}
				metric="logical"
				live={false}
				settings={defaultSettings.chart}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
			/>,
		);

		expect(markup).not.toContain('class="coverage-frontier"');
		expect(markup).not.toContain("Limited access");
	});

	it("hatches an incomplete branch when all of its children are too small to render", () => {
		const root = sizedNode(0, null, true, 1_000);
		const bulk = sizedNode(1, 0, true, 900);
		const branch = sizedNode(2, 0, false, 100);
		branch.childCount = 100;
		const tinyFiles = Array.from({ length: 100 }, (_, index) => {
			const file = sizedNode(index + 3, 2, index !== 0, 1);
			file.kind = "file";
			file.childCount = 0;
			file.flags.warning = index === 0;
			return { node: file };
		});
		const markup = renderToStaticMarkup(
			<RadialChart
				tree={{
					node: root,
					children: [{ node: bulk }, { node: branch, children: tinyFiles }],
				}}
				loading={false}
				selectionPath={[root]}
				onSelect={vi.fn()}
				metric="logical"
				live={false}
				settings={{
					...defaultSettings.chart,
					minimumArcDegrees: 0.75,
					omittedStyle: "gaps",
				}}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
				warningCounts={{
					permission: 1,
					changed: 0,
					metadata: 0,
					read: 0,
					other: 0,
				}}
			/>,
		);

		expect(markup.match(/class="coverage-frontier"/g)).toHaveLength(1);
		expect(markup).toContain("Limited access");
	});

	it("hatches only the unresolved remainder beside a visible child ring", () => {
		const root = sizedNode(0, null, true, 1_000);
		const bulk = sizedNode(1, 0, true, 900);
		const branch = sizedNode(2, 0, false, 100);
		branch.childCount = 51;
		const visible = sizedNode(3, 2, true, 50);
		visible.kind = "file";
		visible.childCount = 0;
		const tinyFiles = Array.from({ length: 50 }, (_, index) => {
			const file = sizedNode(index + 4, 2, index !== 0, 1);
			file.kind = "file";
			file.childCount = 0;
			file.flags.warning = index === 0;
			return { node: file };
		});
		const markup = renderToStaticMarkup(
			<RadialChart
				tree={{
					node: root,
					children: [
						{ node: bulk },
						{
							node: branch,
							children: [{ node: visible }, ...tinyFiles],
						},
					],
				}}
				loading={false}
				selectionPath={[root]}
				onSelect={vi.fn()}
				metric="logical"
				live={false}
				settings={{
					...defaultSettings.chart,
					minimumArcDegrees: 0.75,
					omittedStyle: "gaps",
				}}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
				warningCounts={{
					permission: 1,
					changed: 0,
					metadata: 0,
					read: 0,
					other: 0,
				}}
			/>,
		);

		expect(markup).toContain("directory-3, 50 B, complete");
		expect(markup.match(/class="coverage-frontier"/g)).toHaveLength(1);
		expect(markup).toContain("Limited access");
	});

	it("hatches the unresolved circumference of the focused root", () => {
		const parent = sizedNode(0, null, true, 2_000);
		const root = sizedNode(1, 0, false, 1_000);
		const visible = sizedNode(2, 1, true, 10);
		visible.kind = "file";
		visible.childCount = 0;
		const markup = renderToStaticMarkup(
			<RadialChart
				tree={{ node: root, children: [{ node: visible }] }}
				loading={false}
				selectionPath={[parent, root]}
				onSelect={vi.fn()}
				metric="logical"
				live={false}
				settings={{
					...defaultSettings.chart,
					minimumArcDegrees: 0,
					omittedStyle: "gaps",
				}}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
				warningCounts={{
					permission: 1,
					changed: 0,
					metadata: 0,
					read: 0,
					other: 0,
				}}
			/>,
		);

		expect(markup.match(/coverage-frontier--root/g)).toHaveLength(1);
		expect(markup).toContain("directory-2, 10 B, complete");
		expect(markup).toContain("Limited access");
	});

	it("offers free-space display only from allocated mode when capacity is known", () => {
		const root = node(0, null, true);
		const logicalMarkup = renderToStaticMarkup(
			<RadialChart
				tree={{ node: root, children: [{ node: node(1, 0, true) }] }}
				loading={false}
				selectionPath={[root]}
				onSelect={vi.fn()}
				metric="logical"
				live={false}
				settings={defaultSettings.chart}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
				capacity={{ total: 512, available: 128 }}
			/>,
		);
		const allocatedMarkup = renderToStaticMarkup(
			<RadialChart
				tree={{ node: root, children: [{ node: node(1, 0, true) }] }}
				loading={false}
				selectionPath={[root]}
				onSelect={vi.fn()}
				metric="allocated"
				live={false}
				settings={{ ...defaultSettings.chart, showFreeSpace: true }}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
				capacity={{ total: 512, available: 128 }}
			/>,
		);

		expect(logicalMarkup).toContain('aria-label="Show free space in chart"');
		expect(logicalMarkup).toContain("disabled");
		expect(allocatedMarkup).toContain('aria-label="Show free space in chart"');
		expect(allocatedMarkup).not.toContain(
			'aria-label="Show free space in chart" disabled',
		);
		expect(allocatedMarkup).toContain("Unaccounted used space");
	});

	it("applies file-type colours and exposes their legend", () => {
		const root = node(0, null, true);
		const album = {
			...node(1, 0, true),
			name: "album",
			childCount: 0,
			dominantFileType: { category: "image" as const, logicalSize: 100 },
		};
		const settings = {
			...defaultSettings.chart,
			colourMode: "file-type" as const,
			minimumArcDegrees: 0,
		};
		const markup = renderToStaticMarkup(
			<RadialChart
				tree={{ node: root, children: [{ node: album }] }}
				loading={false}
				selectionPath={[root]}
				onSelect={vi.fn()}
				metric="logical"
				live={false}
				settings={settings}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
			/>,
		);

		expect(markup).toContain('fill="#d45087"');
		expect(markup).toContain('aria-label="File type colours"');
		expect(markup).toContain("Images");
		expect(markup).toContain("Software &amp; system");
	});

	it("uses clearly separated shades for neighbouring single-colour segments", () => {
		const root = sizedNode(0, null, true, 600);
		const children = Array.from({ length: 6 }, (_, index) => ({
			node: sizedNode(index + 1, 0, true, 100),
		}));
		const markup = renderToStaticMarkup(
			<RadialChart
				tree={{ node: root, children }}
				loading={false}
				selectionPath={[root]}
				onSelect={vi.fn()}
				metric="logical"
				live={false}
				settings={{
					...defaultSettings.chart,
					colourMode: "single",
					minimumArcDegrees: 0,
				}}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
			/>,
		);
		const colours = [...markup.matchAll(/fill="(#[0-9a-f]{6})"/g)].map(
			(match) => match[1] ?? "",
		);
		const lightness = colours.map((colour) => hsl(colour).l);

		expect(colours).toHaveLength(6);
		expect(new Set(colours)).toHaveLength(6);
		expect(Math.max(...lightness) - Math.min(...lightness)).toBeGreaterThan(
			0.3,
		);
	});

	it("keeps branch colours stable across focus and anchors child hues", () => {
		const root = sizedNode(0, null, true, 1_000);
		root.name = "root";
		const branch = sizedNode(1, 0, true, 1_000);
		branch.name = "Pictures";
		const child = sizedNode(2, 1, true, 1_000);
		child.name = "Family Library";
		const settings = {
			...defaultSettings.chart,
			colourMode: "branch" as const,
			minimumArcDegrees: 0,
		};
		const rootMarkup = renderToStaticMarkup(
			<RadialChart
				tree={{
					node: root,
					children: [{ node: branch, children: [{ node: child }] }],
				}}
				loading={false}
				selectionPath={[root]}
				onSelect={vi.fn()}
				metric="logical"
				live={false}
				settings={settings}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
			/>,
		);
		const focusedMarkup = renderToStaticMarkup(
			<RadialChart
				tree={{ node: branch, children: [{ node: child }] }}
				loading={false}
				selectionPath={[root, branch]}
				onSelect={vi.fn()}
				metric="logical"
				live={false}
				settings={settings}
				onColourMode={vi.fn()}
				onDepth={vi.fn()}
				onShowFreeSpace={vi.fn()}
				onMetric={vi.fn()}
				onReveal={vi.fn()}
				onAddToReview={vi.fn()}
				onReviewDragState={vi.fn()}
				onOpenInsights={vi.fn()}
			/>,
		);
		const rootColours = [
			...rootMarkup.matchAll(
				/class="radial-segment[^"]*"[^>]*fill="(#[0-9a-f]{6})"/g,
			),
		].map((match) => match[1] ?? "");
		const focusedColours = [
			...focusedMarkup.matchAll(
				/class="radial-segment[^"]*"[^>]*fill="(#[0-9a-f]{6})"/g,
			),
		].map((match) => match[1] ?? "");

		expect(rootColours).toHaveLength(2);
		expect(focusedColours).toEqual([rootColours[1]]);
		expect(focusedMarkup).toContain(
			`class="radial-centre__branch-accent" r="66" style="stroke:${rootColours[0]}"`,
		);
		const parentColour = rootColours[0];
		const childColour = rootColours[1];
		if (!parentColour || !childColour) {
			throw new Error("expected parent and child branch colours");
		}
		const parentHue = hsl(parentColour).h;
		const childHue = hsl(childColour).h;
		const hueDistance = Math.min(
			Math.abs(parentHue - childHue),
			360 - Math.abs(parentHue - childHue),
		);
		expect(hueDistance).toBeLessThanOrEqual(24.5);
	});
});

function node(
	id: number,
	parentId: number | null,
	subtreeComplete: boolean,
): ScanNode {
	return {
		id,
		parentId,
		name: id === 0 ? "root" : `directory-${id}`,
		kind: "directory",
		flags: {
			warning: false,
			filesystemBoundary: false,
			allocatedSizeKnown: true,
			subtreeComplete,
		},
		logicalSize: 100,
		allocatedSize: 128,
		fileCount: 1,
		directoryCount: 1,
		childCount: 1,
	};
}

function sizedNode(
	id: number,
	parentId: number | null,
	subtreeComplete: boolean,
	size: number,
): ScanNode {
	return {
		...node(id, parentId, subtreeComplete),
		logicalSize: size,
		allocatedSize: size,
	};
}
