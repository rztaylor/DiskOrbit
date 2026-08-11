import { describe, expect, it, vi } from "vitest";

import { fetchStatus } from "./status";

describe("fetchStatus", () => {
  it("returns a validated status response", async () => {
    const authenticatedFetch = vi.fn(async () =>
      Response.json({
        name: "DiskOrbit",
        status: "ok",
        build: { version: "test", commit: "abc", buildDate: "today" },
      }),
    );

    await expect(fetchStatus(authenticatedFetch)).resolves.toMatchObject({
      name: "DiskOrbit",
      build: { version: "test" },
    });
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/status", {
      cache: "no-store",
      signal: undefined,
    });
  });

  it("rejects malformed responses", async () => {
    const authenticatedFetch = vi.fn(async () => Response.json({ status: "ok" }));
    await expect(fetchStatus(authenticatedFetch)).rejects.toThrow(
      "Backend status response was invalid",
    );
  });

  it("reports HTTP failures", async () => {
    const authenticatedFetch = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(fetchStatus(authenticatedFetch)).rejects.toThrow("(503)");
  });
});

