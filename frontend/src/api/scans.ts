import type { AuthenticatedFetch } from "./status";

export type ScanState =
	| "queued"
	| "scanning"
	| "cancelling"
	| "completed"
	| "cancelled"
	| "failed";

export interface ScanProgress {
	files: number;
	directories: number;
	bytes: number;
	warnings: number;
	nodes: number;
	elapsedMs: number;
}

export interface ScanWarning {
	kind: WarningKind;
	path: string;
	operation: string;
	message: string;
}

export type WarningKind =
	| "permission"
	| "changed"
	| "metadata"
	| "read"
	| "other";

export type WarningCounts = Record<WarningKind, number>;

export interface DiskCapacity {
	total: number;
	available: number;
}

export interface ScanSnapshot {
	id: string;
	path: string;
	state: ScanState;
	revision: number;
	progress: ScanProgress;
	warningDetails: ScanWarning[];
	warningCounts: WarningCounts;
	capacity?: DiskCapacity;
	startedAt?: string;
	finishedAt?: string;
	error?: string;
}

export interface NodeFlags {
	warning: boolean;
	filesystemBoundary: boolean;
	allocatedSizeKnown: boolean;
	subtreeComplete: boolean;
}

export interface ScanNode {
	id: number;
	parentId: number | null;
	name: string;
	path?: string;
	kind: "file" | "directory" | "symlink" | "special" | "unknown";
	flags: NodeFlags;
	logicalSize: number;
	allocatedSize?: number;
	fileCount: number;
	directoryCount: number;
	childCount: number;
	modifiedAt?: string;
	dominantFileType?: {
		category: FileTypeCategory;
		logicalSize: number;
	};
}

export type FileTypeCategory =
	| "image"
	| "video"
	| "audio"
	| "document"
	| "code"
	| "archive"
	| "application"
	| "other";

export interface ChildrenPage {
	nodes: ScanNode[];
	nextAfter: number | null;
	more: boolean;
}

export interface ChildrenRequest {
	after?: number;
	limit?: number;
	signal?: AbortSignal;
}

interface ScanUpdate {
	revision: number;
	changed: boolean;
	scan?: ScanSnapshot;
}

export async function listScans(
	fetcher: AuthenticatedFetch,
	signal?: AbortSignal,
): Promise<ScanSnapshot[]> {
	const value = await requestJSON(fetcher, "/api/scans", { signal });
	if (
		!isRecord(value) ||
		!Array.isArray(value.scans) ||
		!value.scans.every(isScanSnapshot)
	) {
		throw new Error("Scan list response was invalid");
	}
	return value.scans;
}

export async function startScan(
	fetcher: AuthenticatedFetch,
	path: string,
	signal?: AbortSignal,
): Promise<ScanSnapshot> {
	const value = await requestJSON(fetcher, "/api/scans", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path, metric: "logical", crossFilesystems: false }),
		signal,
	});
	if (!isScanSnapshot(value)) {
		throw new Error("Start scan response was invalid");
	}
	return value;
}

export async function fetchScanUpdate(
	fetcher: AuthenticatedFetch,
	scanID: string,
	after: number,
	signal?: AbortSignal,
): Promise<ScanUpdate> {
	const value = await requestJSON(
		fetcher,
		`/api/scans/${encodeURIComponent(scanID)}/updates?after=${after}`,
		{ signal },
	);
	if (
		!isRecord(value) ||
		!isSafeNumber(value.revision) ||
		typeof value.changed !== "boolean"
	) {
		throw new Error("Scan update response was invalid");
	}
	if (value.changed && !isScanSnapshot(value.scan)) {
		throw new Error("Changed scan update omitted its snapshot");
	}
	return {
		revision: value.revision,
		changed: value.changed,
		scan: value.scan as ScanSnapshot | undefined,
	};
}

export async function cancelScan(
	fetcher: AuthenticatedFetch,
	scanID: string,
): Promise<ScanSnapshot> {
	const value = await requestJSON(
		fetcher,
		`/api/scans/${encodeURIComponent(scanID)}/cancel`,
		{ method: "POST" },
	);
	if (!isScanSnapshot(value)) {
		throw new Error("Cancel scan response was invalid");
	}
	return value;
}

export async function revealNode(
	fetcher: AuthenticatedFetch,
	scanID: string,
	nodeID: number,
): Promise<void> {
	const response = await fetcher(
		`/api/scans/${encodeURIComponent(scanID)}/nodes/${nodeID}/reveal`,
		{
			method: "POST",
			cache: "no-store",
		},
	);
	if (!response.ok) {
		const payload: unknown = await response.json().catch(() => undefined);
		const message =
			isRecord(payload) &&
			isRecord(payload.error) &&
			typeof payload.error.message === "string"
				? payload.error.message
				: `Reveal request failed (${response.status})`;
		throw new Error(message);
	}
}

export async function fetchNode(
	fetcher: AuthenticatedFetch,
	scanID: string,
	nodeID: number,
	signal?: AbortSignal,
): Promise<ScanNode> {
	const value = await requestJSON(
		fetcher,
		`/api/scans/${encodeURIComponent(scanID)}/nodes/${nodeID}`,
		{ signal },
	);
	if (!isScanNode(value)) {
		throw new Error("Scan node response was invalid");
	}
	return value;
}

export async function fetchChildren(
	fetcher: AuthenticatedFetch,
	scanID: string,
	nodeID: number,
	request: ChildrenRequest = {},
): Promise<ChildrenPage> {
	const parameters = new URLSearchParams({
		limit: String(request.limit ?? 500),
	});
	if (request.after !== undefined)
		parameters.set("after", String(request.after));
	const value = await requestJSON(
		fetcher,
		`/api/scans/${encodeURIComponent(scanID)}/nodes/${nodeID}/children?${parameters}`,
		{ signal: request.signal },
	);
	if (
		!isRecord(value) ||
		!Array.isArray(value.nodes) ||
		!value.nodes.every(isScanNode) ||
		!(value.nextAfter === null || isSafeNumber(value.nextAfter)) ||
		typeof value.more !== "boolean"
	) {
		throw new Error("Scan children response was invalid");
	}
	return { nodes: value.nodes, nextAfter: value.nextAfter, more: value.more };
}

async function requestJSON(
	fetcher: AuthenticatedFetch,
	input: string,
	init?: RequestInit,
): Promise<unknown> {
	const response = await fetcher(input, { cache: "no-store", ...init });
	const payload: unknown = await response.json().catch(() => undefined);
	if (!response.ok) {
		const message =
			isRecord(payload) &&
			isRecord(payload.error) &&
			typeof payload.error.message === "string"
				? payload.error.message
				: `Backend request failed (${response.status})`;
		throw new Error(message);
	}
	return payload;
}

function isScanSnapshot(value: unknown): value is ScanSnapshot {
	if (
		!isRecord(value) ||
		typeof value.id !== "string" ||
		typeof value.path !== "string" ||
		!isScanState(value.state) ||
		!isSafeNumber(value.revision) ||
		!isProgress(value.progress) ||
		!Array.isArray(value.warningDetails) ||
		!isWarningCounts(value.warningCounts) ||
		(value.capacity !== undefined && !isDiskCapacity(value.capacity))
	) {
		return false;
	}
	return value.warningDetails.every(isWarning);
}

function isDiskCapacity(value: unknown): value is DiskCapacity {
	return (
		isRecord(value) &&
		isSafeNumber(value.total) &&
		value.total > 0 &&
		isSafeNumber(value.available) &&
		value.available <= value.total
	);
}

function isScanNode(value: unknown): value is ScanNode {
	if (
		!isRecord(value) ||
		!isSafeNumber(value.id) ||
		!(value.parentId === null || isSafeNumber(value.parentId)) ||
		typeof value.name !== "string" ||
		(value.path !== undefined && typeof value.path !== "string") ||
		!isNodeKind(value.kind) ||
		!isRecord(value.flags)
	) {
		return false;
	}
	return (
		isSafeNumber(value.logicalSize) &&
		isSafeNumber(value.fileCount) &&
		isSafeNumber(value.directoryCount) &&
		isSafeNumber(value.childCount) &&
		(value.allocatedSize === undefined || isSafeNumber(value.allocatedSize)) &&
		(value.dominantFileType === undefined ||
			(value.kind === "directory" &&
				isRecord(value.dominantFileType) &&
				isFileTypeCategory(value.dominantFileType.category) &&
				isSafeNumber(value.dominantFileType.logicalSize) &&
				value.dominantFileType.logicalSize > 0 &&
				value.dominantFileType.logicalSize <= value.logicalSize)) &&
		typeof value.flags.warning === "boolean" &&
		typeof value.flags.filesystemBoundary === "boolean" &&
		typeof value.flags.allocatedSizeKnown === "boolean" &&
		typeof value.flags.subtreeComplete === "boolean"
	);
}

function isFileTypeCategory(value: unknown): value is FileTypeCategory {
	return (
		value === "image" ||
		value === "video" ||
		value === "audio" ||
		value === "document" ||
		value === "code" ||
		value === "archive" ||
		value === "application" ||
		value === "other"
	);
}

function isNodeKind(value: unknown): value is ScanNode["kind"] {
	return (
		value === "file" ||
		value === "directory" ||
		value === "symlink" ||
		value === "special" ||
		value === "unknown"
	);
}

function isProgress(value: unknown): value is ScanProgress {
	return (
		isRecord(value) &&
		isSafeNumber(value.files) &&
		isSafeNumber(value.directories) &&
		isSafeNumber(value.bytes) &&
		isSafeNumber(value.warnings) &&
		isSafeNumber(value.nodes) &&
		isSafeNumber(value.elapsedMs)
	);
}

function isWarning(value: unknown): value is ScanWarning {
	return (
		isRecord(value) &&
		isWarningKind(value.kind) &&
		typeof value.path === "string" &&
		typeof value.operation === "string" &&
		typeof value.message === "string"
	);
}

function isWarningCounts(value: unknown): value is WarningCounts {
	return (
		isRecord(value) &&
		isSafeNumber(value.permission) &&
		isSafeNumber(value.changed) &&
		isSafeNumber(value.metadata) &&
		isSafeNumber(value.read) &&
		isSafeNumber(value.other)
	);
}

function isWarningKind(value: unknown): value is WarningKind {
	return (
		value === "permission" ||
		value === "changed" ||
		value === "metadata" ||
		value === "read" ||
		value === "other"
	);
}

function isScanState(value: unknown): value is ScanState {
	return (
		value === "queued" ||
		value === "scanning" ||
		value === "cancelling" ||
		value === "completed" ||
		value === "cancelled" ||
		value === "failed"
	);
}

function isSafeNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
