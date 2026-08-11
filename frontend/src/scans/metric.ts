import type { ScanNode } from "../api/scans";

export type SizeMetric = "logical" | "allocated";

export function nodeSize(node: ScanNode, metric: SizeMetric): number | undefined {
  return metric === "logical" ? node.logicalSize : node.allocatedSize;
}

export function metricLabel(metric: SizeMetric): string {
  return metric === "logical" ? "Logical size" : "Allocated size";
}
