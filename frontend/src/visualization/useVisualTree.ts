import { useEffect, useRef, useState } from "react";

import type { ChartSettings } from "../api/settings";
import {
	fetchChildren,
	fetchNode,
	type ScanNode,
	type ScanSnapshot,
} from "../api/scans";
import type { AuthenticatedFetch } from "../api/status";
import { nodeSize, type SizeMetric } from "../scans/metric";
import {
	chartOptionsFromSettings,
	selectChartNodes,
	type VisualTreeNode,
} from "./tree";

export const minimumVisualDepth = 2;
export const maximumVisualDepth = 12;

interface VisualTreeState {
	tree?: VisualTreeNode;
	loading: boolean;
	error?: string;
}

export function useVisualTree(
	fetcher: AuthenticatedFetch,
	scan?: ScanSnapshot,
	rootID = 0,
	metric: SizeMetric = "logical",
	settings?: ChartSettings,
): VisualTreeState {
	const [state, setState] = useState<VisualTreeState>({ loading: false });
	const latestScan = useRef(scan);
	latestScan.current = scan;

	useEffect(() => {
		if (!scan || !settings) {
			setState({ loading: false });
			return;
		}
		const chartSettings = settings;
		let disposed = false;
		let controller = new AbortController();
		let timer = 0;

		async function refresh() {
			const current = latestScan.current;
			if (!current || disposed) return;
			controller.abort();
			controller = new AbortController();
			setState((value) => ({ ...value, loading: true, error: undefined }));
			try {
				const tree = await loadVisualTree(
					fetcher,
					current.id,
					rootID,
					metric,
					chartSettings,
					controller.signal,
				);
				if (!disposed) setState({ tree, loading: false });
			} catch (reason: unknown) {
				if (!disposed && !controller.signal.aborted) {
					setState((value) => ({
						...value,
						loading: false,
						error:
							reason instanceof Error
								? reason.message
								: "Radial data could not be loaded",
					}));
				}
			}
		}

		void refresh();
		if (scan.state === "scanning" || scan.state === "cancelling") {
			timer = window.setInterval(() => void refresh(), 1000);
		}
		return () => {
			disposed = true;
			controller.abort();
			window.clearInterval(timer);
		};
	}, [fetcher, metric, rootID, scan?.id, scan?.state, settings]);

	return state;
}

export async function loadVisualTree(
	fetcher: AuthenticatedFetch,
	scanID: string,
	rootID: number,
	metric: SizeMetric,
	settings: ChartSettings,
	signal?: AbortSignal,
): Promise<VisualTreeNode> {
	const root = await fetchNode(fetcher, scanID, rootID, signal);
	const chartSize = nodeSize(root, metric) ?? 0;
	const childrenByParent = new Map<number, ScanNode[]>();
	let frontier = [root];
	let retainedNodes = 1;

	const boundedDepth = Math.max(
		minimumVisualDepth,
		Math.min(maximumVisualDepth, settings.maximumDepth),
	);
	const nodeBudget = Math.max(200, Math.min(4000, settings.nodeBudget));
	const chartOptions = chartOptionsFromSettings(settings);
	for (
		let level = 0;
		level < boundedDepth && frontier.length > 0 && retainedNodes < nodeBudget;
		level += 1
	) {
		const remainingLevels = boundedDepth - level;
		const levelBudget = Math.max(
			1,
			Math.floor((nodeBudget - retainedNodes) / remainingLevels),
		);
		const expandable = frontier
			.filter((node) => node.kind === "directory" && node.childCount > 0)
			.sort(
				(left, right) =>
					(nodeSize(right, metric) ?? -1) - (nodeSize(left, metric) ?? -1),
			)
			.slice(0, Math.min(settings.expandedDirectoriesPerRing, levelBudget));
		const pages = await Promise.all(
			expandable.map(async (parent) => ({
				parent,
				page: await fetchChildren(fetcher, scanID, parent.id, { signal }),
			})),
		);
		const queues = pages.map(({ parent, page }) => {
			const selected = selectChartNodes(
				parent,
				page.nodes,
				chartOptions,
				metric,
				chartSize,
			);
			const directory = selected.find((node) => node.kind === "directory");
			return {
				parent,
				nodes: directory
					? [directory, ...selected.filter((node) => node.id !== directory.id)]
					: selected,
			};
		});
		const retainedByParent = new Map<number, ScanNode[]>();
		let retainedThisLevel = 0;
		let queueIndex = 0;
		while (
			queues.some((queue) => queue.nodes.length > 0) &&
			retainedThisLevel < levelBudget &&
			retainedNodes < nodeBudget
		) {
			const queue = queues[queueIndex % queues.length];
			queueIndex += 1;
			const child = queue?.nodes.shift();
			if (!queue || !child) continue;
			const retained = retainedByParent.get(queue.parent.id) ?? [];
			retained.push(child);
			retainedByParent.set(queue.parent.id, retained);
			retainedThisLevel += 1;
			retainedNodes += 1;
		}
		const next: ScanNode[] = [];
		for (const { parent } of queues) {
			const selected = retainedByParent.get(parent.id) ?? [];
			if (selected.length > 0) childrenByParent.set(parent.id, selected);
			next.push(...selected.filter((node) => node.kind === "directory"));
		}
		frontier = next;
	}
	return assemble(root, childrenByParent);
}

function assemble(
	node: ScanNode,
	childrenByParent: Map<number, ScanNode[]>,
): VisualTreeNode {
	const children = childrenByParent.get(node.id);
	return children
		? {
				node,
				children: children.map((child) => assemble(child, childrenByParent)),
			}
		: { node };
}
