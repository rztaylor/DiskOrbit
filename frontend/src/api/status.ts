export interface BuildInfo {
  version: string;
  commit: string;
  buildDate: string;
}

export interface BackendStatus {
  name: "DiskOrbit";
  status: "ok";
  build: BuildInfo;
}

export type AuthenticatedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchStatus(
  authenticatedFetch: AuthenticatedFetch,
  signal?: AbortSignal,
): Promise<BackendStatus> {
  const response = await authenticatedFetch("/api/status", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Backend status request failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (!isBackendStatus(payload)) {
    throw new Error("Backend status response was invalid");
  }
  return payload;
}

function isBackendStatus(value: unknown): value is BackendStatus {
  if (!isRecord(value) || value.name !== "DiskOrbit" || value.status !== "ok") {
    return false;
  }
  const build = value.build;
  return (
    isRecord(build) &&
    typeof build.version === "string" &&
    typeof build.commit === "string" &&
    typeof build.buildDate === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

