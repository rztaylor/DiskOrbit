import { useCallback, useEffect, useReducer, useRef } from "react";

import { fetchNode, type ScanNode } from "../api/scans";
import type { AuthenticatedFetch } from "../api/status";

export const reviewDragType = "application/x-diskorbit-review-node";
export const maximumReviewItems = 100;

export interface ReviewItem {
	node: ScanNode;
	ancestorIDs: number[];
}

interface ReviewState {
	scanID?: string;
	items: ReviewItem[];
	pendingIDs: number[];
	message?: string;
}

type ReviewAction =
	| { type: "reset"; scanID?: string }
	| { type: "loading"; scanID: string; nodeID: number }
	| { type: "loaded"; scanID: string; item: ReviewItem }
	| { type: "failed"; scanID: string; nodeID: number; message: string }
	| { type: "refreshed"; scanID: string; nodes: ScanNode[] }
	| { type: "remove"; nodeID: number }
	| { type: "clear" };

export interface ReviewListState {
	items: ReviewItem[];
	pendingIDs: number[];
	message?: string;
	addNode(nodeID: number): Promise<void>;
	removeNode(nodeID: number): void;
	clear(): void;
	beginDrag(nodeID: number, dataTransfer: DataTransfer): void;
	canAcceptDrop(dataTransfer: DataTransfer): boolean;
	drop(dataTransfer: DataTransfer): void;
}

export function useReviewList(
	fetcher: AuthenticatedFetch,
	scanID: string | undefined,
	active: boolean,
	revision: number | undefined,
): ReviewListState {
	const [state, dispatch] = useReducer(reviewReducer, {
		scanID,
		items: [],
		pendingIDs: [],
	});
	const pending = useRef(new Set<number>());
	const items = useRef<ReviewItem[]>([]);
	const lastRefresh = useRef<string | undefined>(undefined);

	useEffect(() => {
		pending.current.clear();
		items.current = [];
		lastRefresh.current = undefined;
		dispatch({ type: "reset", scanID });
	}, [scanID]);

	useEffect(() => {
		items.current = state.items;
	}, [state.items]);

	useEffect(() => {
		if (!scanID || active || revision === undefined || items.current.length === 0)
			return;
		const key = `${scanID}:${revision}`;
		if (lastRefresh.current === key) return;
		lastRefresh.current = key;
		const controller = new AbortController();
		void Promise.all(
			items.current.map((item) =>
				fetchNode(fetcher, scanID, item.node.id, controller.signal),
			),
		).then((nodes) => {
			if (!controller.signal.aborted)
				dispatch({ type: "refreshed", scanID, nodes });
		}).catch(() => undefined);
		return () => controller.abort();
	}, [active, fetcher, revision, scanID]);

	const addNode = useCallback(async (nodeID: number) => {
		if (!scanID || pending.current.has(nodeID)) return;
		pending.current.add(nodeID);
		dispatch({ type: "loading", scanID, nodeID });
		try {
			const item = await loadReviewItem(fetcher, scanID, nodeID);
			dispatch({ type: "loaded", scanID, item });
		} catch (reason: unknown) {
			dispatch({
				type: "failed",
				scanID,
				nodeID,
				message: reason instanceof Error ? reason.message : "The item could not be added",
			});
		} finally {
			pending.current.delete(nodeID);
		}
	}, [fetcher, scanID]);

	const beginDrag = useCallback((nodeID: number, dataTransfer: DataTransfer) => {
		if (!scanID) return;
		dataTransfer.effectAllowed = "copy";
		dataTransfer.setData(reviewDragType, JSON.stringify({ scanID, nodeID }));
	}, [scanID]);

	const canAcceptDrop = useCallback((dataTransfer: DataTransfer) => (
		dataTransfer.types.includes(reviewDragType)
	), []);

	const drop = useCallback((dataTransfer: DataTransfer) => {
		if (!scanID) return;
		const payload = parseReviewDrag(dataTransfer.getData(reviewDragType));
		if (!payload || payload.scanID !== scanID) return;
		void addNode(payload.nodeID);
	}, [addNode, scanID]);

	return {
		items: state.items,
		pendingIDs: state.pendingIDs,
		message: state.message,
		addNode,
		removeNode: (nodeID) => dispatch({ type: "remove", nodeID }),
		clear: () => dispatch({ type: "clear" }),
		beginDrag,
		canAcceptDrop,
		drop,
	};
}

export async function loadReviewItem(
	fetcher: AuthenticatedFetch,
	scanID: string,
	nodeID: number,
	signal?: AbortSignal,
): Promise<ReviewItem> {
	const node = await fetchNode(fetcher, scanID, nodeID, signal);
	const ancestorIDs: number[] = [];
	const visited = new Set([node.id]);
	let parentID = node.parentId;
	while (parentID !== null && ancestorIDs.length < 512) {
		if (visited.has(parentID))
			throw new Error("Filesystem node ancestry contained a cycle");
		visited.add(parentID);
		ancestorIDs.push(parentID);
		const parent = await fetchNode(fetcher, scanID, parentID, signal);
		parentID = parent.parentId;
	}
	if (parentID !== null)
		throw new Error("Filesystem node ancestry exceeded the safe review depth");
	return { node, ancestorIDs };
}

export function consolidateReviewItems(
	items: ReviewItem[],
	candidate: ReviewItem,
): { items: ReviewItem[]; message: string } {
	const duplicate = items.find((item) => item.node.id === candidate.node.id);
	if (duplicate) {
		return { items, message: `${candidate.node.name} is already in Review list.` };
	}
	const coveringAncestor = items.find((item) =>
		candidate.ancestorIDs.includes(item.node.id),
	);
	if (coveringAncestor) {
		return {
			items,
			message: `${candidate.node.name} is already included by ${coveringAncestor.node.name}.`,
		};
	}
	const retained = items.filter((item) =>
		!item.ancestorIDs.includes(candidate.node.id),
	);
	if (retained.length >= maximumReviewItems) {
		return {
			items,
			message: `Review list is limited to ${maximumReviewItems} top-level items.`,
		};
	}
	const consolidated = items.length - retained.length;
	return {
		items: [...retained, candidate],
		message: consolidated > 0
			? `${candidate.node.name} added; ${consolidated} nested ${consolidated === 1 ? "item was" : "items were"} consolidated.`
			: `${candidate.node.name} added to Review list.`,
	};
}

function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
	if (action.type === "reset") {
		return { scanID: action.scanID, items: [], pendingIDs: [] };
	}
	if ("scanID" in action && state.scanID !== action.scanID) return state;
	switch (action.type) {
		case "loading":
			return {
				...state,
				pendingIDs: state.pendingIDs.includes(action.nodeID)
					? state.pendingIDs
					: [...state.pendingIDs, action.nodeID],
				message: "Adding item to Review list…",
			};
		case "loaded": {
			const result = consolidateReviewItems(state.items, action.item);
			return {
				...state,
				items: result.items,
				pendingIDs: state.pendingIDs.filter((id) => id !== action.item.node.id),
				message: result.message,
			};
		}
		case "failed":
			return {
				...state,
				pendingIDs: state.pendingIDs.filter((id) => id !== action.nodeID),
				message: `Could not add item: ${action.message}`,
			};
		case "refreshed": {
			const refreshed = new Map(action.nodes.map((node) => [node.id, node]));
			return {
				...state,
				items: state.items.map((item) => ({
					...item,
					node: refreshed.get(item.node.id) ?? item.node,
				})),
			};
		}
		case "remove": {
			const removed = state.items.find((item) => item.node.id === action.nodeID);
			return {
				...state,
				items: state.items.filter((item) => item.node.id !== action.nodeID),
				message: removed ? `${removed.node.name} removed from Review list. No files were changed.` : state.message,
			};
		}
		case "clear":
			return {
				...state,
				items: [],
				message: "Review list cleared. No files were changed.",
			};
	}
}

function parseReviewDrag(value: string): { scanID: string; nodeID: number } | undefined {
	try {
		const parsed: unknown = JSON.parse(value);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"scanID" in parsed &&
			typeof parsed.scanID === "string" &&
			"nodeID" in parsed &&
			typeof parsed.nodeID === "number" &&
			Number.isSafeInteger(parsed.nodeID) &&
			parsed.nodeID >= 0
		) return { scanID: parsed.scanID, nodeID: parsed.nodeID };
	} catch {
		return undefined;
	}
	return undefined;
}
