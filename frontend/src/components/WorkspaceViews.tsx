import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import type { ScanNode } from "../api/scans";

export type WorkspaceView = "chart" | "contents" | "insights";

interface WorkspaceViewsProps {
  active: WorkspaceView;
  chart: ReactNode;
  contents: ReactNode;
  insights: ReactNode;
  selectionPath: ScanNode[];
  live: boolean;
  onChange(view: WorkspaceView): void;
  onSelect(nodeID: number): void;
}

const views: WorkspaceView[] = ["chart", "contents", "insights"];
const viewLabels: Record<WorkspaceView, string> = {
  chart: "Chart",
  contents: "Contents",
  insights: "Insights",
};

export function WorkspaceViews({ active, chart, contents, insights, selectionPath, live, onChange, onSelect }: WorkspaceViewsProps) {
  const tablistRef = useRef<HTMLDivElement>(null);
  const previousActive = useRef(active);

  useEffect(() => {
    if (previousActive.current === active) return;
    previousActive.current = active;
    tablistRef.current?.querySelector<HTMLButtonElement>(`#workspace-tab-${active}`)?.focus();
  }, [active]);

  function handleTabsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = views.indexOf(active);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? views.length - 1
        : event.key === "ArrowRight"
          ? (current + 1) % views.length
          : (current - 1 + views.length) % views.length;
    const nextView = views[next];
    if (nextView) onChange(nextView);
  }

  return (
    <section
      className="workspace-views"
      aria-label="Directory workspace"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || active === "chart") return;
        event.preventDefault();
        event.stopPropagation();
        onChange("chart");
      }}
    >
      <div
        ref={tablistRef}
        className="workspace-view-tabs"
        role="tablist"
        aria-label="Directory views"
        onKeyDown={handleTabsKeyDown}
      >
        {views.map((view) => (
          <button
            id={`workspace-tab-${view}`}
            key={view}
            type="button"
            role="tab"
            aria-selected={active === view}
            aria-controls={`workspace-view-${view}`}
            tabIndex={active === view ? 0 : -1}
            onClick={() => onChange(view)}
          >
            {viewLabels[view]}
          </button>
        ))}
        <span>{active === "chart" ? "Visual overview" : "Esc returns to Chart"}</span>
      </div>
      {selectionPath.length > 0 ? (
        <nav className="breadcrumbs" aria-label="Directory path">
          {selectionPath.map((item, index) => (
            <span key={item.id}>
              {index > 0 ? <span aria-hidden="true">›</span> : null}
              <button type="button" disabled={live} onClick={() => onSelect(item.id)}>
                {item.name}
              </button>
            </span>
          ))}
        </nav>
      ) : null}
      <div className="workspace-view-panels">
        <div
          id="workspace-view-chart"
          role="tabpanel"
          aria-labelledby="workspace-tab-chart"
          hidden={active !== "chart"}
        >
          {chart}
        </div>
        <div
          id="workspace-view-contents"
          role="tabpanel"
          aria-labelledby="workspace-tab-contents"
          hidden={active !== "contents"}
        >
          {contents}
        </div>
        <div
          id="workspace-view-insights"
          role="tabpanel"
          aria-labelledby="workspace-tab-insights"
          hidden={active !== "insights"}
        >
          {insights}
        </div>
      </div>
    </section>
  );
}
