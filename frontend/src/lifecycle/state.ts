import type { HeartbeatResult } from "singleserve-client";

export type ConnectionPhase =
  | "connecting"
  | "connected"
  | "degraded"
  | "stopping"
  | "unavailable"
  | "stopped";

export interface LifecycleState {
  phase: ConnectionPhase;
  detail: string;
  failures: number;
  checkedAt?: Date;
  shutdownError?: string;
}

export const initialLifecycleState: LifecycleState = {
  phase: "connecting",
  detail: "Establishing a private local session…",
  failures: 0,
};

export function stateFromHeartbeat(result: HeartbeatResult): LifecycleState {
  if (result.ok) {
    return {
      phase: "connected",
      detail: "Private loopback connection active",
      failures: 0,
      checkedAt: result.checkedAt,
    };
  }
  return {
    phase: "degraded",
    detail: `Waiting for the local backend (${result.failures} failed heartbeat${result.failures === 1 ? "" : "s"})`,
    failures: result.failures,
    checkedAt: result.checkedAt,
  };
}
