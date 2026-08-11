import type { RefObject } from "react";

import type { ScanTarget } from "../api/system";
import type { SizeMetric } from "../scans/metric";

interface ScanToolbarProps {
  disabled: boolean;
  submitting: boolean;
  targets: ScanTarget[];
  targetsLoading: boolean;
  targetsError?: string;
  metric: SizeMetric;
  onMetric(metric: SizeMetric): void;
  onStart(path: string): void;
  onBrowse?(): void;
  browseButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function ScanToolbar({
  disabled,
  submitting,
  targets,
  targetsLoading,
  targetsError,
  metric,
  onMetric,
  onStart,
  onBrowse,
  browseButtonRef,
}: ScanToolbarProps) {
  const choicesDisabled = disabled || submitting;
  const places = targets.filter((target) => target.kind === "home" || target.kind === "folder");
  const volumes = targets.filter((target) => target.kind === "local-volume" || target.kind === "network-volume");

  function startTarget(target: ScanTarget) {
    onStart(target.path);
  }

  return (
    <section className="scan-launcher" aria-labelledby="scan-launcher-title">
      <div className="scan-launcher__heading">
        <div>
          <p className="eyebrow">Start a local scan</p>
          <h1 id="scan-launcher-title">Choose what to explore</h1>
          <p>Familiar folders and mounted volumes found on this computer.</p>
        </div>
        <div className="scan-launcher__controls">
          <label className="metric-select">
            <span>Size</span>
            <select aria-label="Size metric" value={metric} onChange={(event) => onMetric(event.target.value as SizeMetric)}>
              <option value="logical">Logical</option>
              <option value="allocated">Allocated</option>
            </select>
          </label>
        </div>
      </div>

      <div className="scan-choice-area">
          {targetsLoading ? <ScanChoiceSkeleton /> : null}
          <ScanChoiceGroup title="Quick places" targets={places} disabled={choicesDisabled} onStart={startTarget} onBrowse={onBrowse} browseButtonRef={browseButtonRef} />
          {volumes.length > 0 ? <ScanChoiceGroup title="Volumes" targets={volumes} disabled={choicesDisabled} onStart={startTarget} /> : null}
          {!targetsLoading && targets.length === 0 ? (
            <p className="scan-choice-empty" role="status">
              {targetsError ? "Automatic choices are unavailable. You can still enter a folder below." : "No familiar scan locations were found. Enter a folder below."}
            </p>
          ) : null}
      </div>

    </section>
  );
}

function ScanChoiceGroup({ title, targets, disabled, onStart, onBrowse, browseButtonRef }: {
  title: string;
  targets: ScanTarget[];
  disabled: boolean;
  onStart(target: ScanTarget): void;
  onBrowse?(): void;
  browseButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <section className="scan-choice-group" aria-labelledby={`scan-choice-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="scan-choice-group__heading">
        <h3 id={`scan-choice-${title.toLowerCase().replaceAll(" ", "-")}`}>{title}</h3>
        <span>{targets.length} found</span>
      </div>
      <div className="scan-choice-grid">
        {targets.map((target) => (
          <button
            className={`scan-choice scan-choice--${target.kind}`}
            type="button"
            key={`${target.kind}:${target.path}`}
            disabled={disabled}
            onClick={() => onStart(target)}
            aria-label={`Scan ${target.name} (${target.path})`}
          >
            <TargetIcon kind={target.kind} />
            <span className="scan-choice__copy">
              <strong>{target.name}</strong>
              <span title={target.path}>{target.path}</span>
              {target.filesystem ? <small>{target.filesystem}</small> : null}
            </span>
            <span className="scan-choice__action" aria-hidden="true">Scan <b>↗</b></span>
          </button>
        ))}
        {onBrowse ? <button
          ref={browseButtonRef}
          className="scan-choice scan-choice--custom"
          type="button"
          disabled={disabled}
          onClick={onBrowse}
          aria-label="Choose another folder"
        >
          <span className="scan-choice__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h5l2 2h9A1.5 1.5 0 0 1 21.5 8.5v9A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5zM12 10v6M9 13h6" /></svg>
          </span>
          <span className="scan-choice__copy">
            <strong>Choose another folder</strong>
            <span>Browse this computer</span>
          </span>
          <span className="scan-choice__action" aria-hidden="true">Browse <b>↗</b></span>
        </button> : null}
      </div>
    </section>
  );
}

function ScanChoiceSkeleton() {
  return (
    <div className="scan-choice-loading" role="status">
      <span>Finding familiar folders and volumes…</span>
      <div aria-hidden="true"><i /><i /><i /></div>
    </div>
  );
}

function TargetIcon({ kind }: { kind: ScanTarget["kind"] }) {
  if (kind === "home") {
    return <span className="scan-choice__icon" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.5 12 3l8.5 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5a1.5 1.5 0 0 1-1.5-1.5z" /></svg></span>;
  }
  if (kind === "folder") {
    return <span className="scan-choice__icon" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h5l2 2h9A1.5 1.5 0 0 1 21.5 8.5v9A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5z" /></svg></span>;
  }
  if (kind === "network-volume") {
    return <span className="scan-choice__icon" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M12 7.5v4M6.8 15.8 12 11.5l5.2 4.3" /></svg></span>;
  }
  return <span className="scan-choice__icon" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="8.5" ry="3.5" /><path d="M3.5 6v6c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5V6M3.5 12v6c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5v-6" /></svg></span>;
}
