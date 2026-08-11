import type { ReactNode } from "react";

import type { ScanNode } from "../api/scans";
import type { AuthenticatedFetch } from "../api/status";
import { formatBytes } from "../scans/format";
import { nodeSize, type SizeMetric } from "../scans/metric";
import { useDirectoryTree } from "../scans/useDirectoryTree";
import { ItemActionIcon } from "./ItemActionIcon";

interface DirectoryTreeProps {
  fetcher: AuthenticatedFetch;
  scanID: string;
  root: ScanNode;
  selectionPath: ScanNode[];
  active: boolean;
  metric: SizeMetric;
  selectedNodeID: number;
  onSelect(nodeID: number): void;
  collapsed: boolean;
  onCollapsedChange(collapsed: boolean): void;
  onAddToReview(nodeID: number): void;
  onReviewDragStart(nodeID: number, dataTransfer: DataTransfer): void;
  footer: ReactNode;
}

export function DirectoryTree(props: DirectoryTreeProps) {
  const state = useDirectoryTree(props.fetcher, props.scanID, props.root, props.selectionPath, props.active, props.metric);
  return (
    <aside className={`tree-panel${props.collapsed ? " tree-panel--collapsed" : ""}`} aria-labelledby="tree-heading">
      <div className="tree-panel__heading">
        <div>
          <p className="eyebrow">Directory tree</p>
          <h2 id="tree-heading">Browse{props.active ? <span className="tree-active">Scanning</span> : null}</h2>
        </div>
        <button
          className="tree-collapse"
          type="button"
          aria-label={`${props.collapsed ? "Expand" : "Collapse"} directory tree`}
          aria-expanded={!props.collapsed}
          title={`${props.collapsed ? "Expand" : "Collapse"} directory tree`}
          onClick={() => props.onCollapsedChange(!props.collapsed)}
        >
          <span aria-hidden="true">{props.collapsed ? "›" : "‹"}</span>
        </button>
      </div>
      <div className="tree-scroll" hidden={props.collapsed}>
        {state.error ? <p className="tree-error" role="alert">{state.error}</p> : null}
        <ul className="directory-tree">
          <TreeItem node={props.root} depth={0} state={state} selectedNodeID={props.selectedNodeID} onSelect={props.onSelect} onAddToReview={props.onAddToReview} onReviewDragStart={props.onReviewDragStart} metric={props.metric} />
        </ul>
      </div>
      {props.footer}
    </aside>
  );
}

interface TreeItemProps {
  node: ScanNode;
  depth: number;
  state: ReturnType<typeof useDirectoryTree>;
  selectedNodeID: number;
  onSelect(nodeID: number): void;
  onAddToReview(nodeID: number): void;
  onReviewDragStart(nodeID: number, dataTransfer: DataTransfer): void;
  metric: SizeMetric;
}

function TreeItem({ node, depth, state, selectedNodeID, onSelect, onAddToReview, onReviewDragStart, metric }: TreeItemProps) {
  const expandable = node.childCount > 0;
  const expanded = state.expanded.has(node.id);
  const loading = state.loading.has(node.id);
  const children = state.childrenByParent.get(node.id) ?? [];
  const more = state.moreByParent.get(node.id) ?? false;
  return (
    <li>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag is an optional pointer shortcut; the row's buttons provide the complete keyboard interaction. */}
      <div
        className={`tree-row${selectedNodeID === node.id ? " tree-row--selected" : ""}`}
        style={{ paddingInlineStart: `${8 + Math.min(depth, 6) * 12}px` }}
        draggable
        onDragStart={(event) => onReviewDragStart(node.id, event.dataTransfer)}
      >
        {expandable ? (
          <button className="tree-toggle" type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name}`} aria-expanded={expanded} onClick={() => state.toggle(node)}>
            {loading ? "·" : expanded ? "▾" : "▸"}
          </button>
        ) : <span className="tree-toggle tree-toggle--empty" aria-hidden="true" />}
        <button className="tree-select" type="button" aria-current={selectedNodeID === node.id ? "page" : undefined} onClick={() => onSelect(node.id)} title={node.path ?? node.name}>
          <span>{node.name}{node.kind === "symlink" ? <><i className="tree-status" title="Symbolic link or reparse point" aria-hidden="true">↗</i><span className="visually-hidden">Symbolic link or reparse point</span></> : null}{node.flags.warning ? <><i className="tree-status" title="Some contents could not be read" aria-hidden="true">!</i><span className="visually-hidden">Incomplete</span></> : null}{node.flags.filesystemBoundary ? <><i className="tree-status" title="Filesystem boundary" aria-hidden="true">∥</i><span className="visually-hidden">Filesystem boundary</span></> : null}</span><small>{nodeSize(node, metric) === undefined ? "—" : formatBytes(nodeSize(node, metric) ?? 0)}</small>
        </button>
        <button className="tree-review item-action" type="button" title="Add to Review list" aria-label={`Add ${node.name} to Review list`} onClick={() => onAddToReview(node.id)}>
          <ItemActionIcon kind="review" />
        </button>
      </div>
      {expanded && children.length > 0 ? (
        <ul>
          {children.map((child) => <TreeItem key={child.id} node={child} depth={depth + 1} state={state} selectedNodeID={selectedNodeID} onSelect={onSelect} onAddToReview={onAddToReview} onReviewDragStart={onReviewDragStart} metric={metric} />)}
          {more ? <li><button className="tree-more" type="button" disabled={loading} onClick={() => state.loadMore(node.id)}>Load more…</button></li> : null}
        </ul>
      ) : null}
    </li>
  );
}
