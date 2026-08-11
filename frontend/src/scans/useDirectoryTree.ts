import { useCallback, useEffect, useRef, useState } from "react";

import { fetchChildren, type ScanNode } from "../api/scans";
import type { AuthenticatedFetch } from "../api/status";
import { nodeSize, type SizeMetric } from "./metric";

const treePageSize = 100;

interface DirectoryTreeState {
  expanded: ReadonlySet<number>;
  childrenByParent: ReadonlyMap<number, ScanNode[]>;
  moreByParent: ReadonlyMap<number, boolean>;
  loading: ReadonlySet<number>;
  error?: string;
  toggle(node: ScanNode): void;
  loadMore(nodeID: number): void;
}

export function useDirectoryTree(
  fetcher: AuthenticatedFetch,
  scanID: string | undefined,
  root: ScanNode | undefined,
  selectionPath: ScanNode[],
  active: boolean,
  metric: SizeMetric,
): DirectoryTreeState {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [childrenByParent, setChildrenByParent] = useState<ReadonlyMap<number, ScanNode[]>>(new Map());
  const [moreByParent, setMoreByParent] = useState<ReadonlyMap<number, boolean>>(new Map());
  const [loading, setLoading] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const loaded = useRef(new Set<number>());
  const loadingNodes = useRef(new Set<number>());
  const nextAfter = useRef(new Map<number, number | null>());
  const pagesLoaded = useRef(new Map<number, number>());
  const selectedDirectory = useRef<ScanNode | undefined>(undefined);
  selectedDirectory.current = [...selectionPath].reverse().find((node) => node.kind === "directory");

  useEffect(() => {
    generation.current += 1;
    loaded.current = new Set();
    loadingNodes.current = new Set();
    nextAfter.current = new Map();
    pagesLoaded.current = new Map();
    setExpanded(root ? new Set([root.id]) : new Set());
    setChildrenByParent(new Map());
    setMoreByParent(new Map());
    setLoading(new Set());
    setError(undefined);
  }, [scanID, root?.id]);

  const load = useCallback(async (nodeID: number, mode: "initial" | "more" | "refresh" = "initial") => {
    if (!scanID || loadingNodes.current.has(nodeID)) return;
    if (mode === "initial" && loaded.current.has(nodeID)) return;
    const cursor = mode === "more" ? nextAfter.current.get(nodeID) : undefined;
    if (mode === "more" && (cursor === undefined || cursor === null)) return;

    const currentGeneration = generation.current;
    loadingNodes.current.add(nodeID);
    setLoading((current) => new Set(current).add(nodeID));
    setError(undefined);
    try {
      const page = await fetchChildren(fetcher, scanID, nodeID, {
        after: cursor ?? undefined,
        limit: treePageSize,
      });
      if (generation.current !== currentGeneration) return;
      const directories = page.nodes.filter((node) => node.kind === "directory" || node.kind === "symlink");
      setChildrenByParent((current) => {
        const existing = current.get(nodeID) ?? [];
        const combined = mode === "more" || mode === "refresh" ? mergeNodes(existing, directories) : directories;
        return new Map(current).set(nodeID, sortDirectories(combined, metric));
      });
      const loadedPages = pagesLoaded.current.get(nodeID) ?? 0;
      if (mode !== "refresh" || loadedPages <= 1) {
        nextAfter.current.set(nodeID, page.nextAfter);
        setMoreByParent((current) => new Map(current).set(nodeID, page.more));
      }
      if (mode === "more") pagesLoaded.current.set(nodeID, Math.max(1, loadedPages) + 1);
      else if (mode === "initial" || loadedPages === 0) pagesLoaded.current.set(nodeID, 1);
      loaded.current.add(nodeID);
    } catch (reason: unknown) {
      if (generation.current === currentGeneration) {
        setError(reason instanceof Error ? reason.message : "Directory tree could not be loaded");
      }
    } finally {
      if (generation.current === currentGeneration) {
        loadingNodes.current.delete(nodeID);
        setLoading((current) => {
          const next = new Set(current);
          next.delete(nodeID);
          return next;
        });
      }
    }
  }, [fetcher, metric, scanID]);

  useEffect(() => {
    setChildrenByParent((current) => new Map(
      [...current].map(([nodeID, nodes]) => [nodeID, sortDirectories(nodes, metric)]),
    ));
  }, [metric]);

  useEffect(() => {
    if (!root || !scanID) return;
    const directoryPath = selectionPath.filter((node) => node.kind === "directory");
    setExpanded((current) => new Set([...current, ...directoryPath.map((node) => node.id), root.id]));
    let disposed = false;
    void (async () => {
      for (const node of directoryPath.slice(0, -1)) {
        if (disposed) return;
        await load(node.id);
      }
      if (!disposed) await load(root.id);
    })();
    return () => { disposed = true; };
  }, [load, root, scanID, selectionPath]);

  useEffect(() => {
    if (!active || !root || !scanID) return;
    const timer = window.setInterval(() => {
      void load(root.id, "refresh");
      const selected = selectedDirectory.current;
      if (selected && selected.id !== root.id) void load(selected.id, "refresh");
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, load, root, scanID]);

  const toggle = useCallback((node: ScanNode) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
    if (!expanded.has(node.id)) void load(node.id);
  }, [expanded, load]);

  const loadMore = useCallback((nodeID: number) => void load(nodeID, "more"), [load]);
  return { expanded, childrenByParent, moreByParent, loading, error, toggle, loadMore };
}

function mergeNodes(existing: ScanNode[], incoming: ScanNode[]): ScanNode[] {
  const byID = new Map(existing.map((node) => [node.id, node]));
  for (const node of incoming) byID.set(node.id, node);
  return [...byID.values()];
}

function sortDirectories(nodes: ScanNode[], metric: SizeMetric): ScanNode[] {
  return [...nodes].sort((left, right) =>
    (nodeSize(right, metric) ?? -1) - (nodeSize(left, metric) ?? -1) || left.name.localeCompare(right.name));
}
