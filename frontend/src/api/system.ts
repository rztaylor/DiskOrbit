import type { AuthenticatedFetch } from "./status";

export interface ScanTarget {
  path: string;
  name: string;
  kind: "home" | "folder" | "local-volume" | "network-volume";
  filesystem?: string;
}

export interface DirectoryLocation {
  name: string;
  path: string;
}

export interface DirectoryListing {
  path: string;
  parent?: string;
  ancestors: DirectoryLocation[];
  directories: DirectoryLocation[];
  truncated: boolean;
}

interface DirectoryListingOptions {
  showHidden?: boolean;
  signal?: AbortSignal;
}

export async function fetchScanTargets(fetcher: AuthenticatedFetch, signal?: AbortSignal): Promise<ScanTarget[]> {
  const response = await fetcher("/api/system/scan-targets", { cache: "no-store", signal });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`Scan choice discovery failed (${response.status})`);
  if (!isRecord(payload) || !Array.isArray(payload.targets) || !payload.targets.every(isScanTarget)) {
    throw new Error("Scan choice response was invalid");
  }
  return payload.targets;
}

export async function fetchDirectoryListing(fetcher: AuthenticatedFetch, path: string, options: DirectoryListingOptions = {}): Promise<DirectoryListing> {
  const response = await fetcher("/api/system/directories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, showHidden: options.showHidden ?? false }),
    cache: "no-store",
    signal: options.signal,
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
      ? payload.error.message
      : `Directory could not be opened (${response.status})`;
    throw new Error(message);
  }
  if (!isDirectoryListing(payload)) throw new Error("Directory listing response was invalid");
  return payload;
}

function isScanTarget(value: unknown): value is ScanTarget {
  return isRecord(value) && typeof value.path === "string" && typeof value.name === "string" &&
    (value.kind === "home" || value.kind === "folder" || value.kind === "local-volume" || value.kind === "network-volume") &&
    (value.filesystem === undefined || typeof value.filesystem === "string");
}

function isDirectoryListing(value: unknown): value is DirectoryListing {
  return isRecord(value) && typeof value.path === "string" &&
    (value.parent === undefined || typeof value.parent === "string") &&
    Array.isArray(value.ancestors) && value.ancestors.every(isDirectoryLocation) &&
    Array.isArray(value.directories) && value.directories.every(isDirectoryLocation) &&
    typeof value.truncated === "boolean";
}

function isDirectoryLocation(value: unknown): value is DirectoryLocation {
  return isRecord(value) && typeof value.name === "string" && typeof value.path === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
