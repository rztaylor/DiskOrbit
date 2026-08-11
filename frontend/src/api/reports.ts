import type { AuthenticatedFetch } from "./status";

export interface ReportSummary {
  scanId: string;
  rootId: number;
  path: string;
  state: string;
  logicalSize: number;
  allocatedSize: number | null;
  files: number;
  directories: number;
  warnings: number;
  elapsedMs: number;
}

export interface LargestFile {
  nodeId: number;
  name: string;
  path: string;
  logicalSize: number;
  allocatedSize: number | null;
  modifiedAt?: string;
}

export interface ExtensionEntry {
  extension: string;
  logicalSize: number;
  files: number;
}

export interface ExtensionReport {
  entries: ExtensionEntry[];
  truncated: boolean;
}

export async function fetchReportSummary(fetcher: AuthenticatedFetch, scanID: string, rootID: number, signal?: AbortSignal): Promise<ReportSummary> {
  const value = await request(fetcher, `/api/scans/${encodeURIComponent(scanID)}/reports/summary?root=${rootID}`, signal);
  if (!isRecord(value) || typeof value.scanId !== "string" || !isSafe(value.rootId) ||
      typeof value.path !== "string" || typeof value.state !== "string" ||
      !isSafe(value.logicalSize) || !(value.allocatedSize === null || isSafe(value.allocatedSize)) ||
      !isSafe(value.files) || !isSafe(value.directories) || !isSafe(value.warnings) || !isSafe(value.elapsedMs)) {
    throw new Error("Report summary response was invalid");
  }
  return {
    scanId: value.scanId,
    rootId: value.rootId,
    path: value.path,
    state: value.state,
    logicalSize: value.logicalSize,
    allocatedSize: value.allocatedSize,
    files: value.files,
    directories: value.directories,
    warnings: value.warnings,
    elapsedMs: value.elapsedMs,
  };
}

export async function fetchLargestFiles(fetcher: AuthenticatedFetch, scanID: string, rootID: number, signal?: AbortSignal): Promise<LargestFile[]> {
  const value = await request(fetcher, `/api/scans/${encodeURIComponent(scanID)}/reports/largest-files?root=${rootID}&limit=25`, signal);
  if (!isRecord(value) || !Array.isArray(value.files) || !value.files.every(isLargestFile)) {
    throw new Error("Largest files response was invalid");
  }
  return value.files;
}

export async function fetchExtensions(fetcher: AuthenticatedFetch, scanID: string, rootID: number, signal?: AbortSignal): Promise<ExtensionReport> {
  const value = await request(fetcher, `/api/scans/${encodeURIComponent(scanID)}/reports/extensions?root=${rootID}&limit=20`, signal);
  if (!isRecord(value) || !Array.isArray(value.entries) || !value.entries.every(isExtension) || typeof value.truncated !== "boolean") {
    throw new Error("Extension report response was invalid");
  }
  return { entries: value.entries, truncated: value.truncated };
}

export async function downloadExport(fetcher: AuthenticatedFetch, scanID: string, rootID: number, format: "json" | "csv"): Promise<void> {
  const response = await fetcher(`/api/scans/${encodeURIComponent(scanID)}/export?root=${rootID}&format=${format}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `diskorbit-${scanID}.${format}`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function request(fetcher: AuthenticatedFetch, path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetcher(path, { cache: "no-store", signal });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`Report request failed (${response.status})`);
  return payload;
}

function isLargestFile(value: unknown): value is LargestFile {
  return isRecord(value) && isSafe(value.nodeId) && typeof value.name === "string" && typeof value.path === "string" &&
    isSafe(value.logicalSize) && (value.allocatedSize === null || isSafe(value.allocatedSize));
}

function isExtension(value: unknown): value is ExtensionEntry {
  return isRecord(value) && typeof value.extension === "string" && isSafe(value.logicalSize) && isSafe(value.files);
}

function isSafe(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
