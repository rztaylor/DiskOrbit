import { describe, expect, it } from "vitest";

import { stateFromHeartbeat } from "./state";

describe("stateFromHeartbeat", () => {
  const checkedAt = new Date("2026-08-07T12:00:00Z");

  it("maps a healthy heartbeat to connected", () => {
    expect(
      stateFromHeartbeat({ ok: true, failures: 0, tabID: "tab", checkedAt }),
    ).toEqual({
      phase: "connected",
      detail: "Private loopback connection active",
      failures: 0,
      checkedAt,
    });
  });

  it("describes a degraded connection honestly", () => {
    expect(
      stateFromHeartbeat({ ok: false, failures: 2, tabID: "tab", checkedAt }),
    ).toMatchObject({
      phase: "degraded",
      detail: "Waiting for the local backend (2 failed heartbeats)",
      failures: 2,
    });
  });
});

