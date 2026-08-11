import type { DiskCapacity, ScanNode } from "../api/scans";
import type { ChartSettings } from "../api/settings";
import { nodeSize, type SizeMetric } from "../scans/metric";
import { fileCategory, type FileCategory } from "./fileTypes";

export interface VisualTreeNode {
	node: ScanNode;
	children?: VisualTreeNode[];
}

export interface ChartDatum {
	key: string;
	nodeID?: number;
	name: string;
	kind: ScanNode["kind"] | "other" | "free" | "unaccounted";
	size: number;
	layoutSize?: number;
	parentSize?: number;
	logicalSize: number;
	allocatedSize?: number;
	fileCount: number;
	directoryCount: number;
	path?: string;
	warning: boolean;
	complete: boolean;
	fileCategory?: FileCategory;
	dominantCategory?: FileCategory;
	layoutRemainder?: number;
	omittedSize?: number;
	padAngle?: number;
	children?: ChartDatum[];
}

export function withDiskCapacity(
	root: ChartDatum,
	capacity: DiskCapacity,
): ChartDatum {
	const usedCapacity = capacity.total - capacity.available;
	const measured = root.size;
	const fitted =
		measured > usedCapacity && usedCapacity > 0
			? scaleLayoutSize(root, measured, usedCapacity)
			: root;
	const representedUsed = Math.min(measured, usedCapacity);
	const children = fitted.children?.length
		? [...fitted.children]
		: root.size > 0
			? [
					{
						...fitted,
						key: "scanned-contents",
						nodeID: undefined,
						name: "Measured contents",
						kind: "other" as const,
						children: undefined,
					},
				]
			: [];
	const unaccounted = usedCapacity - representedUsed;
	if (unaccounted > 0) {
		children.push(
			capacitySegment(
				"unaccounted-space",
				"Unaccounted used space",
				"unaccounted",
				unaccounted,
				unaccounted,
			),
		);
	}
	if (capacity.available > 0) {
		children.push(
			capacitySegment(
				"free-space",
				"Free space",
				"free",
				capacity.available,
				capacity.available,
			),
		);
	}
	return { ...fitted, layoutSize: capacity.total, children };
}

function scaleLayoutSize(
	node: ChartDatum,
	scannedSize: number,
	usedCapacity: number,
): ChartDatum {
	if (node.children?.length) {
		return {
			...node,
			layoutRemainder:
				node.layoutRemainder === undefined || scannedSize === 0
					? node.layoutRemainder
					: (node.layoutRemainder / scannedSize) * usedCapacity,
			children: node.children.map((child) =>
				scaleLayoutSize(child, scannedSize, usedCapacity),
			),
		};
	}
	return {
		...node,
		layoutSize: scannedSize > 0 ? (node.size / scannedSize) * usedCapacity : 0,
	};
}

function capacitySegment(
	key: string,
	name: string,
	kind: "free" | "unaccounted",
	size: number,
	layoutSize: number,
): ChartDatum {
	return {
		key,
		name,
		kind,
		size,
		layoutSize,
		logicalSize: 0,
		allocatedSize: size,
		fileCount: 0,
		directoryCount: 0,
		path:
			kind === "free"
				? "Available filesystem capacity"
				: "Used capacity not represented by readable scanned entries; this can include inaccessible contents, metadata, snapshots, or shared storage",
		warning: false,
		complete: true,
	};
}

export interface ChartOptions {
	maximumChildren: number;
	minimumArcDegrees: number;
	showFiles: boolean;
	fileLimitMode: "count" | "size";
	maximumFilesPerDirectory: number;
	minimumFileSizeBytes: number;
	fileTypeDominanceShare: number;
	omittedStyle: "gaps" | "aggregate";
}

export function chartOptionsFromSettings(
	settings: ChartSettings,
): ChartOptions {
	return {
		maximumChildren: settings.segmentsPerDirectory,
		minimumArcDegrees: settings.minimumArcDegrees,
		showFiles: settings.showFiles,
		fileLimitMode: settings.fileLimitMode,
		maximumFilesPerDirectory: settings.maximumFilesPerDirectory,
		minimumFileSizeBytes: settings.minimumFileSizeBytes,
		fileTypeDominanceShare: settings.fileTypeDominancePercent / 100,
		omittedStyle: settings.omittedStyle,
	};
}

export function toChartDatum(
	tree: VisualTreeNode,
	options: ChartOptions,
	metric: SizeMetric = "logical",
	chartSize?: number,
): ChartDatum {
	const size = nodeSize(tree.node, metric) ?? 0;
	return toChartDatumNode(
		tree,
		options,
		metric,
		chartSize ?? size,
	);
}

function toChartDatumNode(
	tree: VisualTreeNode,
	resolvedOptions: ChartOptions,
	metric: SizeMetric,
	chartSize: number,
	parentSize?: number,
): ChartDatum {
	const node = tree.node;
	const size = nodeSize(node, metric) ?? 0;
	const category = node.kind === "file" ? fileCategory(node.name) : undefined;
	const dominantCategory =
		category ??
		dominantFileCategory(node, resolvedOptions.fileTypeDominanceShare);
	const base: ChartDatum = {
		key: `node-${node.id}`,
		nodeID: node.id,
		name: node.name,
		kind: node.kind,
		size,
		parentSize,
		logicalSize: node.logicalSize,
		allocatedSize: node.allocatedSize,
		fileCount: node.fileCount,
		directoryCount: node.directoryCount,
		path: node.path,
		warning: node.flags.warning,
		complete: node.flags.subtreeComplete,
		fileCategory: category,
		dominantCategory,
	};
	if (!tree.children || tree.children.length === 0) {
		return base;
	}

	const selectedNodes = selectChartNodes(
		node,
		tree.children.map((child) => child.node),
		resolvedOptions,
		metric,
		chartSize,
	);
	const selectedIDs = new Set(selectedNodes.map((child) => child.id));
	const retained = tree.children
		.filter((child) => selectedIDs.has(child.node.id))
		.sort(
			(left, right) =>
				(nodeSize(right.node, metric) ?? 0) -
					(nodeSize(left.node, metric) ?? 0) ||
				left.node.name.localeCompare(right.node.name),
		);
	const children = retained.map((child) =>
		toChartDatumNode(child, resolvedOptions, metric, chartSize, size),
	);
	const represented = retained.reduce(
		(total, child) => total + (nodeSize(child.node, metric) ?? 0),
		0,
	);
	const remainder = Math.max(0, size - represented);
	const remainderClearsMinimum =
		chartSize === 0 ||
		(remainder / chartSize) * 360 >= resolvedOptions.minimumArcDegrees;
	if (
		remainder > 0 &&
		resolvedOptions.omittedStyle === "aggregate" &&
		remainderClearsMinimum
	) {
		const retainedLogical = retained.reduce(
			(total, child) => total + child.node.logicalSize,
			0,
		);
		const retainedAllocated = retained.reduce<number | undefined>(
			(total, child) => {
				if (total === undefined || child.node.allocatedSize === undefined)
					return undefined;
				return total + child.node.allocatedSize;
			},
			0,
		);
		children.push({
			key: `other-${node.id}`,
			name: "Other",
			kind: "other",
			size: remainder,
			parentSize: size,
			logicalSize: Math.max(0, node.logicalSize - retainedLogical),
			allocatedSize:
				node.allocatedSize === undefined || retainedAllocated === undefined
					? undefined
					: Math.max(0, node.allocatedSize - retainedAllocated),
			fileCount: Math.max(
				0,
				node.fileCount -
					retained.reduce((total, child) => total + child.node.fileCount, 0),
			),
			directoryCount: Math.max(
				0,
				node.directoryCount -
					retained.reduce(
						(total, child) =>
							total +
							child.node.directoryCount +
							(child.node.kind === "directory" ? 1 : 0),
						0,
					),
			),
			warning: false,
			complete: node.flags.subtreeComplete,
		});
	}
	return {
		...base,
		children,
		omittedSize: remainder > 0 ? remainder : undefined,
		layoutRemainder:
			remainder > 0 &&
			(resolvedOptions.omittedStyle === "gaps" || !remainderClearsMinimum)
				? remainder
				: undefined,
	};
}

function dominantFileCategory(
	node: ScanNode,
	threshold: number,
): FileCategory | undefined {
	const dominant = node.dominantFileType;
	if (!dominant || node.logicalSize <= 0) return undefined;
	return dominant.logicalSize / node.logicalSize >= threshold
		? dominant.category
		: undefined;
}

// selectChartNodes applies per-directory visibility rules while retaining one
// eligible directory branch when possible, so broad levels preserve useful depth.
export function selectChartNodes(
	parent: ScanNode,
	children: ScanNode[],
	options: ChartOptions,
	metric: SizeMetric = "logical",
	chartSize: number = nodeSize(parent, metric) ?? 0,
): ScanNode[] {
	const ordered = [...children].sort(compareNodes(metric));
	const directories = ordered.filter((node) => node.kind === "directory");
	const files = ordered.filter((node) => node.kind === "file");
	const other = ordered.filter(
		(node) => node.kind !== "directory" && node.kind !== "file",
	);
	const visibleFiles = !options.showFiles
		? []
		: options.fileLimitMode === "count"
			? files.slice(0, options.maximumFilesPerDirectory)
			: files.filter(
					(node) =>
						(nodeSize(node, metric) ?? 0) >= options.minimumFileSizeBytes,
				);
	const candidates = [...directories, ...visibleFiles, ...other]
		.sort(compareNodes(metric))
		.filter(
			(node) =>
				chartSize === 0 ||
				((nodeSize(node, metric) ?? 0) / chartSize) * 360 >=
					options.minimumArcDegrees,
		);
	const retained = candidates.slice(0, options.maximumChildren);
	const largestDirectory = candidates.find((node) => node.kind === "directory");
	if (
		largestDirectory &&
		!retained.some((node) => node.kind === "directory") &&
		options.maximumChildren > 0
	) {
		if (retained.length === options.maximumChildren) retained.pop();
		retained.push(largestDirectory);
		retained.sort(compareNodes(metric));
	}
	return retained;
}

function compareNodes(metric: SizeMetric) {
	return (left: ScanNode, right: ScanNode) =>
		(nodeSize(right, metric) ?? 0) - (nodeSize(left, metric) ?? 0) ||
		left.name.localeCompare(right.name);
}

export function findChartPath(
	root: ChartDatum,
	key: string,
): ChartDatum[] | undefined {
	if (root.key === key) return [root];
	for (const child of root.children ?? []) {
		const path = findChartPath(child, key);
		if (path) return [root, ...path];
	}
	return undefined;
}
