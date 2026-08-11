import { useCallback, useEffect, useRef, useState } from "react";
import { connect, type SingleserveSession } from "singleserve-client";

import type { AuthenticatedFetch } from "../api/status";
import {
  initialLifecycleState,
  stateFromHeartbeat,
  type LifecycleState,
} from "./state";

export interface SingleserveLifecycle {
  state: LifecycleState;
  ready: boolean;
  fetch: AuthenticatedFetch;
  requestShutdown(): Promise<void>;
}

export function useSingleserve(): SingleserveLifecycle {
  const [state, setState] = useState<LifecycleState>(initialLifecycleState);
  const [ready, setReady] = useState(false);
  const sessionRef = useRef<SingleserveSession | undefined>(undefined);
  const pendingRequests = useRef<Set<AbortController>>(new Set());
  const terminalRef = useRef(false);

  const enterTerminal = useCallback((phase: "unavailable" | "stopped", detail: string) => {
    if (terminalRef.current) {
      return;
    }
    terminalRef.current = true;
    sessionRef.current?.stop();
    setReady(false);
    setState({ phase, detail, failures: 0 });
    window.close();
  }, []);

  useEffect(() => {
    let disposed = false;
    terminalRef.current = false;

    void connect({
      onHeartbeat(result) {
        if (!disposed && !terminalRef.current) {
          setState(stateFromHeartbeat(result));
        }
      },
      onServerUnavailable({ failures }) {
        if (!disposed) {
          enterTerminal(
            "unavailable",
            `The local backend stopped responding after ${failures} consecutive heartbeat failures. Close this tab.`,
          );
        }
      },
    })
      .then((session) => {
        if (disposed) {
          session.stop();
          return;
        }
        sessionRef.current = session;
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!disposed) {
          const detail = error instanceof Error ? error.message : "Could not establish the local session";
          setState({ phase: "unavailable", detail, failures: 0 });
        }
      });

    return () => {
      disposed = true;
      for (const controller of pendingRequests.current) controller.abort();
      pendingRequests.current.clear();
      sessionRef.current?.stop();
      sessionRef.current = undefined;
    };
  }, [enterTerminal]);

  const authenticatedFetch = useCallback<AuthenticatedFetch>((input, init) => {
    const session = sessionRef.current;
    if (!session) {
      return Promise.reject(new Error("The local backend session is not ready"));
    }
    const controller = new AbortController();
    const callerSignal = init?.signal;
    const abort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abort();
    else callerSignal?.addEventListener("abort", abort, { once: true });
    pendingRequests.current.add(controller);
    return session.fetch(input, { ...init, signal: controller.signal }).finally(() => {
      callerSignal?.removeEventListener("abort", abort);
      pendingRequests.current.delete(controller);
    });
  }, []);

  const requestShutdown = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || terminalRef.current) {
      return;
    }
    for (const controller of pendingRequests.current) controller.abort("DiskOrbit is stopping");
    pendingRequests.current.clear();
    session.stop();
    setState((current) => ({ ...current, phase: "stopping", detail: "Stopping DiskOrbit…", shutdownError: undefined }));
    try {
      await session.requestShutdown();
      enterTerminal("stopped", "DiskOrbit has stopped. You can close this tab.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "DiskOrbit could not stop";
      setState((current) => ({
        ...current,
        phase: "connected",
        detail: "Private loopback connection active",
        shutdownError: message,
      }));
    }
  }, [enterTerminal]);

  return { state, ready, fetch: authenticatedFetch, requestShutdown };
}
