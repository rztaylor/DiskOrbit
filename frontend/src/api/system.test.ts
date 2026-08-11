import { describe, expect, it, vi } from "vitest";

import { fetchDirectoryListing, fetchScanTargets } from "./system";

describe("fetchScanTargets", () => {
  it("accepts familiar folders and volume choices", async () => {
    const authenticatedFetch = vi.fn(async () => Response.json({
      targets: [
        { path: "/Users/example", name: "Home", kind: "home" },
        { path: "/Volumes/Archive", name: "Archive", kind: "local-volume", filesystem: "apfs" },
      ],
    }));

    await expect(fetchScanTargets(authenticatedFetch)).resolves.toHaveLength(2);
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/system/scan-targets", { cache: "no-store", signal: undefined });
  });

  it("rejects an unknown target kind", async () => {
    const authenticatedFetch = vi.fn(async () => Response.json({
      targets: [{ path: "/tmp", name: "Temporary", kind: "mystery" }],
    }));

    await expect(fetchScanTargets(authenticatedFetch)).rejects.toThrow("Scan choice response was invalid");
  });
});

describe("fetchDirectoryListing", () => {
  it("posts the selected path and accepts a bounded folder listing", async () => {
    const authenticatedFetch = vi.fn(async () => Response.json({
      path: "/Users/example",
      parent: "/Users",
      ancestors: [{ name: "/", path: "/" }, { name: "example", path: "/Users/example" }],
      directories: [{ name: ".config", path: "/Users/example/.config" }],
      truncated: false,
    }));

    await expect(fetchDirectoryListing(authenticatedFetch, "/Users/example")).resolves.toMatchObject({
      directories: [{ name: ".config" }],
    });
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/system/directories", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ path: "/Users/example", showHidden: false }),
    }));
  });

  it("requests hidden folders only when enabled", async () => {
    const authenticatedFetch = vi.fn(async () => Response.json({
      path: "/Users/example",
      ancestors: [],
      directories: [{ name: ".config", path: "/Users/example/.config" }],
      truncated: false,
    }));

    await fetchDirectoryListing(authenticatedFetch, "/Users/example", { showHidden: true });
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/system/directories", expect.objectContaining({
      body: JSON.stringify({ path: "/Users/example", showHidden: true }),
    }));
  });

  it("uses the backend's recoverable error message", async () => {
    const authenticatedFetch = vi.fn(async () => Response.json({
      error: { code: "directory_not_found", message: "the selected directory no longer exists" },
    }, { status: 404 }));

    await expect(fetchDirectoryListing(authenticatedFetch, "/missing")).rejects.toThrow("the selected directory no longer exists");
  });

  it("rejects malformed directory entries", async () => {
    const authenticatedFetch = vi.fn(async () => Response.json({
      path: "/tmp",
      ancestors: [],
      directories: [{ name: "broken" }],
      truncated: false,
    }));

    await expect(fetchDirectoryListing(authenticatedFetch, "/tmp")).rejects.toThrow("Directory listing response was invalid");
  });
});
