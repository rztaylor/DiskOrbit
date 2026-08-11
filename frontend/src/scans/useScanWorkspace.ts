import { useCallback, useEffect, useState } from "react";

import {
  cancelScan,
  fetchChildren,
  fetchNode,
  fetchScanUpdate,
  listScans,
  revealNode,
  startScan,
  type ScanNode,
  type ScanSnapshot,
} from "../api/scans";
import type { AuthenticatedFetch } from "../api/status";

interface ScanWorkspace {
  scan?: ScanSnapshot;
  selectedNode?: ScanNode;
  selectionPath: ScanNode[];
  children: ScanNode[];
  childrenTruncated: boolean;
  childrenPage: number;
  canShowPreviousChildren: boolean;
  loading: boolean;
  submitting: boolean;
  error?: string;
  start(path: string): Promise<void>;
  cancel(): Promise<void>;
  selectNode(nodeID: number): void;
  showNextChildren(): void;
  showPreviousChildren(): void;
  reveal(nodeID: number): Promise<void>;
  retry(): void;
  returnToLauncher(): void;
}

export function useScanWorkspace(ready: boolean, fetcher: AuthenticatedFetch): ScanWorkspace {
  const [scan, setScan] = useState<ScanSnapshot>();
  const [selectedID, setSelectedID] = useState(0);
  const [selectedNode, setSelectedNode] = useState<ScanNode>();
  const [selectionPath, setSelectionPath] = useState<ScanNode[]>([]);
  const [children, setChildren] = useState<ScanNode[]>([]);
  const [childrenTruncated, setChildrenTruncated] = useState(false);
  const [childrenNextAfter, setChildrenNextAfter] = useState<number | null>(null);
  const [childrenCursors, setChildrenCursors] = useState<Array<number | undefined>>([undefined]);
  const [childrenPage, setChildrenPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [retryRevision, setRetryRevision] = useState(0);

  const clearNavigation = useCallback(() => {
    setSelectedID(0);
    setSelectedNode(undefined);
    setSelectionPath([]);
    setChildren([]);
    setChildrenTruncated(false);
    setChildrenNextAfter(null);
    setChildrenCursors([undefined]);
    setChildrenPage(0);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    void listScans(fetcher, controller.signal)
      .then((scans) => {
        setSelectedID(0);
        setScan(scans.at(-1));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetcher, ready, retryRevision]);

  useEffect(() => {
    if (!ready || !scan) {
      setSelectedNode(undefined);
      setSelectionPath([]);
      setChildren([]);
      setChildrenTruncated(false);
      setChildrenNextAfter(null);
      return;
    }
    const controller = new AbortController();
    void Promise.all([
      fetchNode(fetcher, scan.id, selectedID, controller.signal),
      fetchChildren(fetcher, scan.id, selectedID, {
        after: childrenCursors[childrenPage],
        signal: controller.signal,
      }),
    ])
      .then(([nextSelected, page]) => {
        setSelectedNode(nextSelected);
        setChildren(page.nodes);
        setChildrenTruncated(page.more);
        setChildrenNextAfter(page.nextAfter);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, [childrenCursors, childrenPage, fetcher, ready, scan?.id, scan?.revision, selectedID]);

  useEffect(() => {
    if (!ready || !scan) {
      setSelectionPath([]);
      return;
    }
    const controller = new AbortController();
    void fetchNode(fetcher, scan.id, selectedID, controller.signal)
      .then((node) => loadSelectionPath(fetcher, scan.id, node, controller.signal))
      .then(setSelectionPath)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, [fetcher, ready, scan?.id, selectedID]);

  useEffect(() => {
    if (!ready || !scan || (scan.state !== "scanning" && scan.state !== "cancelling")) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchScanUpdate(fetcher, scan.id, scan.revision, controller.signal)
        .then((update) => {
          if (update.changed && update.scan) setScan(update.scan);
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(reason));
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetcher, ready, scan]);

  const start = useCallback(async (path: string) => {
    const target = path.trim();
    if (target === "") {
      setError("Enter a directory path to scan.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const started = await startScan(fetcher, target);
      clearNavigation();
      setScan(started);
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }, [clearNavigation, fetcher]);

  const cancel = useCallback(async () => {
    if (!scan) return;
    setSubmitting(true);
    setError(undefined);
    try {
      setScan(await cancelScan(fetcher, scan.id));
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }, [fetcher, scan]);

  const selectNode = useCallback((nodeID: number) => {
    setSelectedID(nodeID);
    setChildren([]);
    setChildrenTruncated(false);
    setChildrenNextAfter(null);
    setChildrenCursors([undefined]);
    setChildrenPage(0);
  }, []);
  const showNextChildren = useCallback(() => {
    if (!childrenTruncated || childrenNextAfter === null) return;
    setChildrenCursors((current) => {
      const next = current.slice(0, childrenPage + 1);
      next.push(childrenNextAfter);
      return next;
    });
    setChildrenPage((current) => current + 1);
  }, [childrenNextAfter, childrenPage, childrenTruncated]);
  const showPreviousChildren = useCallback(() => setChildrenPage((current) => Math.max(0, current - 1)), []);
  const reveal = useCallback(async (nodeID: number) => {
    if (!scan) return;
    setError(undefined);
    try {
      await revealNode(fetcher, scan.id, nodeID);
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    }
  }, [fetcher, scan]);
  const retry = useCallback(() => setRetryRevision((value) => value + 1), []);
  const returnToLauncher = useCallback(() => {
    if (!scan || scan.state === "scanning" || scan.state === "cancelling") return;
    setScan(undefined);
    setError(undefined);
    clearNavigation();
  }, [clearNavigation, scan]);
  return {
    scan, selectedNode, selectionPath, children, childrenTruncated, childrenPage: childrenPage + 1,
    canShowPreviousChildren: childrenPage > 0, loading, submitting, error, start, cancel,
    selectNode, showNextChildren, showPreviousChildren, reveal, retry, returnToLauncher,
  };
}

async function loadSelectionPath(
  fetcher: AuthenticatedFetch,
  scanID: string,
  selected: ScanNode,
  signal?: AbortSignal,
): Promise<ScanNode[]> {
  const path = [selected];
  const visited = new Set([selected.id]);
  let parentID = selected.parentId;
  while (parentID !== null && path.length < 512) {
    if (visited.has(parentID)) throw new Error("Filesystem node ancestry contained a cycle");
    visited.add(parentID);
    const parent = await fetchNode(fetcher, scanID, parentID, signal);
    path.unshift(parent);
    parentID = parent.parentId;
  }
  if (parentID !== null) throw new Error("Filesystem node ancestry exceeded the safe breadcrumb depth");
  return path;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The scan request failed";
}
