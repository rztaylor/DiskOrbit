import { describe, expect, it, vi } from "vitest";

import type { ScanNode } from "../api/scans";
import { settingsFixture as defaultSettings } from "../test/settings";
import type { VisualTreeNode } from "./tree";
import { loadVisualTree } from "./useVisualTree";

describe("loadVisualTree", () => {
  it("honours the configured ring depth and defaults to eight", async () => {
    const fetcher = chainFetcher(10);

    const shallow = await loadVisualTree(fetcher, "scan", 0, "logical", { ...defaultSettings.chart, maximumDepth: 2 });
    const defaultDepth = await loadVisualTree(fetcher, "scan", 0, "logical", defaultSettings.chart);

    expect(treeDepth(shallow)).toBe(2);
    expect(treeDepth(defaultDepth)).toBe(defaultSettings.chart.maximumDepth);
  });

  it("reserves budget for later rings instead of exhausting it on broad early levels", async () => {
    const fetcher = broadFetcher(12, 40);
    const settings = {
      ...defaultSettings.chart,
      maximumDepth: 10,
      nodeBudget: 200,
      segmentsPerDirectory: 24,
      expandedDirectoriesPerRing: 12,
      showFiles: false,
    };

    const tree = await loadVisualTree(fetcher, "scan", 0, "logical", settings);

    expect(treeDepth(tree)).toBe(10);
    expect(treeCount(tree)).toBeLessThanOrEqual(200);
  });
});

function chainFetcher(lastID: number) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = url.match(/\/nodes\/(\d+)(\/children)?/);
    const id = Number(match?.[1] ?? 0);
    if (match?.[2]) {
      const nodes = id < lastID ? [node(id + 1, id)] : [];
      return Response.json({ nodes, nextAfter: nodes.at(-1)?.id ?? null, more: false });
    }
    return Response.json(node(id, id === 0 ? null : id - 1));
  });
}

function broadFetcher(lastDepth: number, breadth: number) {
  const depths = new Map<number, number>([[0, 0]]);
  const parents = new Map<number, number | null>([[0, null]]);
  const pages = new Map<number, ScanNode[]>();
  let nextID = 1;
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = url.match(/\/nodes\/(\d+)(\/children)?/);
    const id = Number(match?.[1] ?? 0);
    const depth = depths.get(id) ?? 0;
    if (match?.[2]) {
      if (!pages.has(id)) {
        const nodes = depth < lastDepth
          ? Array.from({ length: breadth }, () => {
            const childID = nextID++;
            depths.set(childID, depth + 1);
            parents.set(childID, id);
            const child = node(childID, id);
            child.childCount = depth + 1 < lastDepth ? breadth : 0;
            return child;
          })
          : [];
        pages.set(id, nodes);
      }
      const nodes = pages.get(id) ?? [];
      return Response.json({ nodes, nextAfter: nodes.at(-1)?.id ?? null, more: false });
    }
    const result = node(id, parents.get(id) ?? null);
    result.childCount = depth < lastDepth ? breadth : 0;
    return Response.json(result);
  });
}

function node(id: number, parentId: number | null): ScanNode {
  return {
    id,
    parentId,
    name: id === 0 ? "root" : `level-${id}`,
    kind: "directory",
    flags: { warning: false, filesystemBoundary: false, allocatedSizeKnown: true, subtreeComplete: true },
    logicalSize: 100,
    allocatedSize: 128,
    fileCount: 1,
    directoryCount: Math.max(0, 10 - id),
    childCount: id < 10 ? 1 : 0,
  };
}

function treeDepth(tree: VisualTreeNode): number {
  const child = tree.children?.[0];
  return child ? 1 + treeDepth(child) : 0;
}

function treeCount(tree: VisualTreeNode): number {
  return 1 + (tree.children?.reduce((total, child) => total + treeCount(child), 0) ?? 0);
}
