import { useEffect, useState } from "react";

import { fetchScanTargets, type ScanTarget } from "../api/system";
import type { AuthenticatedFetch } from "../api/status";

interface ScanTargetState {
  targets: ScanTarget[];
  loading: boolean;
  error?: string;
}

export function useScanTargets(ready: boolean, fetcher: AuthenticatedFetch): ScanTargetState {
  const [state, setState] = useState<ScanTargetState>({ targets: [], loading: false });
  useEffect(() => {
    if (!ready) {
      setState({ targets: [], loading: false });
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: undefined }));
    void fetchScanTargets(fetcher, controller.signal)
      .then((targets) => setState({ targets, loading: false }))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setState({ targets: [], loading: false, error: reason instanceof Error ? reason.message : "Scan choices could not be loaded" });
        }
      });
    return () => controller.abort();
  }, [fetcher, ready]);
  return state;
}
