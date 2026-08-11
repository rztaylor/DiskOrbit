import { useState } from "react";

import type { ScanNode } from "../api/scans";
import { formatBytes, formatCount, formatPercent } from "../scans/format";
import { nodeSize, type SizeMetric } from "../scans/metric";
import { ItemActionIcon } from "./ItemActionIcon";

interface DirectoryTableProps {
  root?: ScanNode;
  nodes: ScanNode[];
  truncated: boolean;
  page: number;
  canShowPrevious: boolean;
  scanning: boolean;
  onSelect(nodeID: number): void;
  onShowNext(): void;
  onShowPrevious(): void;
  onReveal(nodeID: number): void;
  onAddToReview(nodeID: number): void;
  onReviewDragStart(nodeID: number, dataTransfer: DataTransfer): void;
  metric: SizeMetric;
}

type SortKey = "name" | "directoryCount" | "fileCount" | "logicalSize" | "allocatedSize";

export function DirectoryTable({ root, nodes, truncated, page, canShowPrevious, scanning, onSelect, onShowNext, onShowPrevious, onReveal, onAddToReview, onReviewDragStart, metric }: DirectoryTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "logicalSize", descending: true });
  const sorted = [...nodes].sort((left, right) => compareNodes(left, right, sort.key) * (sort.descending ? -1 : 1));
  function sortBy(key: SortKey) {
    setSort((current) => ({ key, descending: current.key === key ? !current.descending : key !== "name" }));
  }
  return (
    <section className="directory-panel" aria-labelledby="directory-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Immediate children</p>
          <h2 id="directory-heading">{root?.name ?? "Directory contents"}</h2>
        </div>
        <span>{formatCount(nodes.length)} shown{truncated ? " · more available" : ""}</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <SortableHeading label="Name" column="name" sort={sort} onSort={sortBy} />
              <th scope="col">Type</th>
              <SortableHeading label="Directories" column="directoryCount" sort={sort} onSort={sortBy} numeric />
              <SortableHeading label="Files" column="fileCount" sort={sort} onSort={sortBy} numeric />
              <SortableHeading label="Logical" column="logicalSize" sort={sort} onSort={sortBy} numeric />
              <SortableHeading label="Allocated" column="allocatedSize" sort={sort} onSort={sortBy} numeric />
              <th scope="col" className="numeric">Share</th>
              <th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((node) => (
              <tr key={node.id} draggable onDragStart={(event) => onReviewDragStart(node.id, event.dataTransfer)}>
                <td><span className={`kind-mark kind-mark--${node.kind}`} aria-hidden="true" />{node.kind === "directory" ? <button className="table-node-button node-name" type="button" onClick={() => onSelect(node.id)}>{node.name}</button> : <span className="node-name">{node.name}</span>}{node.flags.warning ? <span className="warning-mark" title="Some contents could not be read"><span aria-hidden="true">!</span><span className="visually-hidden">Incomplete</span></span> : null}</td>
                <td className="muted-cell">{node.flags.filesystemBoundary ? "Boundary" : kindLabel(node.kind)}</td>
                <td className="numeric tabular">{formatCount(node.directoryCount)}</td>
                <td className="numeric tabular">{formatCount(node.fileCount)}</td>
                <td className="numeric tabular size-cell">{formatBytes(node.logicalSize)}</td>
                <td className="numeric tabular size-cell">{node.allocatedSize === undefined ? "—" : formatBytes(node.allocatedSize)}</td>
                <td className="numeric tabular">{formatPercent(nodeSize(node, metric) ?? 0, root ? nodeSize(root, metric) ?? 0 : 0)}</td>
                <td className="row-action">
                  <div>
                    {node.kind === "directory" ? (
                      <button className="item-action" type="button" title="View in DiskOrbit" onClick={() => onSelect(node.id)} aria-label={`View ${node.name} in DiskOrbit`}>
                        <ItemActionIcon kind="view" />
                      </button>
                    ) : null}
                    <button className="item-action" type="button" title="Add to Review list" onClick={() => onAddToReview(node.id)} aria-label={`Add ${node.name} to Review list`}>
                      <ItemActionIcon kind="review" />
                    </button>
                    <button className="item-action" type="button" title="Reveal in file manager" onClick={() => onReveal(node.id)} aria-label={`Reveal ${node.name} in file manager`}>
                      <ItemActionIcon kind="reveal" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {nodes.length === 0 ? (
          <div className="table-empty" role="status">
            <strong>{scanning ? "Discovering top-level entries…" : "This directory is empty."}</strong>
            <span>{scanning ? "The table updates in bounded batches while the scan runs." : "No child entries were observed."}</span>
          </div>
        ) : null}
      </div>
      {canShowPrevious || truncated ? (
        <nav className="table-pagination" aria-label="Directory pages">
          <button className="button button--quiet" type="button" disabled={!canShowPrevious} onClick={onShowPrevious}>Previous</button>
          <span>Page {formatCount(page)}</span>
          <button className="button button--quiet" type="button" disabled={!truncated} onClick={onShowNext}>Next</button>
        </nav>
      ) : null}
    </section>
  );
}

function SortableHeading({ label, column, sort, onSort, numeric = false }: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; descending: boolean };
  onSort(key: SortKey): void;
  numeric?: boolean;
}) {
  const active = sort.key === column;
  return (
    <th scope="col" className={numeric ? "numeric" : undefined} aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}>
      <button className="sort-button" type="button" onClick={() => onSort(column)}>
        {label}<span aria-hidden="true">{active ? (sort.descending ? "↓" : "↑") : "↕"}</span>
      </button>
    </th>
  );
}

function compareNodes(left: ScanNode, right: ScanNode, key: SortKey): number {
  if (key === "name") return left.name.localeCompare(right.name);
  return (left[key] ?? -1) - (right[key] ?? -1) || left.name.localeCompare(right.name);
}

function kindLabel(kind: ScanNode["kind"]): string {
  switch (kind) {
    case "directory": return "Folder";
    case "file": return "File";
    case "symlink": return "Link";
    case "special": return "Special";
    case "unknown": return "Unknown";
  }
}
