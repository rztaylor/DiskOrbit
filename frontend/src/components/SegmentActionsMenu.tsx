import { useEffect, useRef, useState } from "react";

import type { ChartDatum } from "../visualization/tree";
import { ItemActionIcon } from "./ItemActionIcon";

export interface SegmentMenuState {
  segment: ChartDatum;
  x: number;
  y: number;
}

interface SegmentActionsMenuProps {
  state: SegmentMenuState;
  live: boolean;
  onClose(restoreFocus?: boolean): void;
  onFocus(nodeID: number): void;
  onPin(): void;
  onReveal(nodeID: number): void;
  onAddToReview(nodeID: number): void;
  onOpenInsights(nodeID: number): void;
}

export function SegmentActionsMenu({ state, live, onClose, onFocus, onPin, onReveal, onAddToReview, onOpenInsights }: SegmentActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string>();
  const nodeID = state.segment.nodeID;
  const directory = state.segment.kind === "directory" && nodeID !== undefined;

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    function dismiss(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      onClose(false);
    }
    document.addEventListener("click", dismiss, true);
    return () => document.removeEventListener("click", dismiss, true);
  }, [onClose]);

  async function copyPath() {
    if (!state.segment.path) return;
    try {
      await navigator.clipboard.writeText(state.segment.path);
      setMessage("Path copied");
    } catch {
      setMessage("Could not copy the path");
    }
  }

  const style = {
    left: `min(${state.x}px, calc(100vw - 244px))`,
    top: `min(${state.y}px, calc(100vh - 270px))`,
  };
  return (
    <div
      ref={menuRef}
      className="segment-menu"
      role="menu"
      aria-label={`Actions for ${state.segment.name}`}
      style={style}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if (!menuRef.current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const items = [...menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
        if (items.length === 0) return;
        event.preventDefault();
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
        items[next]?.focus();
      }}
    >
      <header><strong>{state.segment.name}</strong><span>{state.segment.kind}</span></header>
      <button role="menuitem" type="button" onClick={() => { onPin(); onClose(false); }}>Keep details visible</button>
      <button role="menuitem" type="button" disabled={nodeID === undefined} onClick={() => { if (nodeID !== undefined) onAddToReview(nodeID); onClose(false); }}>
        <ItemActionIcon kind="review" />Add to Review list
      </button>
      <button role="menuitem" type="button" disabled={!directory || live} onClick={() => { if (nodeID !== undefined) onFocus(nodeID); onClose(false); }}>
        <ItemActionIcon kind="view" />Focus in chart
      </button>
      <button role="menuitem" type="button" disabled={nodeID === undefined} onClick={() => { if (nodeID !== undefined) onReveal(nodeID); onClose(false); }}>
        <ItemActionIcon kind="reveal" />Reveal in file manager
      </button>
      <button role="menuitem" type="button" disabled={!directory || live} onClick={() => { if (nodeID !== undefined) onOpenInsights(nodeID); onClose(false); }}>File breakdown and reports…</button>
      <button role="menuitem" type="button" disabled={!state.segment.path} onClick={() => void copyPath()}>Copy full path</button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
