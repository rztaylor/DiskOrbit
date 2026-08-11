import type { ScanState } from "../api/scans";
import type { AuthenticatedFetch } from "../api/status";
import { splitFileName } from "../reports/fileName";
import { useReports } from "../reports/useReports";
import { formatBytes, formatCount } from "../scans/format";
import { ItemActionIcon } from "./ItemActionIcon";

interface ReportsPanelProps {
  fetcher: AuthenticatedFetch;
  scanID: string;
  scanState: ScanState;
  rootID: number;
  onReveal(nodeID: number): void;
  onAddToReview(nodeID: number): void;
  onReviewDragStart(nodeID: number, dataTransfer: DataTransfer): void;
}

const reportColours = ["#f06b32", "#e09f3e", "#2a9d8f", "#577590", "#9b5de5", "#ef476f", "#43aa8b", "#f9c74f"];

export function ReportsPanel({ fetcher, scanID, scanState, rootID, onReveal, onAddToReview, onReviewDragStart }: ReportsPanelProps) {
  const enabled = scanState === "completed" || scanState === "cancelled" || scanState === "failed";
  const reports = useReports(fetcher, scanID, rootID, enabled);
  const maximumExtension = reports.extensions?.entries[0]?.logicalSize ?? 0;
  return (
    <section className="reports-panel" aria-labelledby="reports-heading">
      <div className="panel-heading">
        <div><p className="eyebrow">Local reports</p><h2 id="reports-heading">Insights</h2></div>
        <div className="report-actions">
          <button className="button button--quiet" type="button" disabled={!enabled || reports.exporting !== undefined} onClick={() => void reports.exportAs("json")}>{reports.exporting === "json" ? "Exporting…" : "Export JSON"}</button>
          <button className="button button--quiet" type="button" disabled={!enabled || reports.exporting !== undefined} onClick={() => void reports.exportAs("csv")}>{reports.exporting === "csv" ? "Exporting…" : "Export CSV"}</button>
        </div>
      </div>
      {!enabled ? <p className="report-message" role="status">Reports become available when the current scan reaches a terminal state.</p> : null}
      {reports.loading ? <p className="report-message" role="status">Calculating bounded local reports…</p> : null}
      {reports.error ? <div className="report-message report-message--error" role="alert">{reports.error}<button className="text-button" type="button" onClick={reports.retry}>Retry</button></div> : null}
      {reports.summary && reports.extensions ? (
        <div className="report-grid">
          <article className="report-card">
            <div className="report-card__heading"><h3>Largest files</h3><span>{formatCount(reports.summary.files)} files beneath selection</span></div>
            <p className="report-scope" title={reports.summary.path}>{reports.summary.path}</p>
            <ol className="largest-list">
              {reports.largest.map((file) => {
                const name = splitFileName(file.name);
                return (
                  <li key={file.nodeId} draggable onDragStart={(event) => onReviewDragStart(file.nodeId, event.dataTransfer)}>
                    <div>
                      <strong className="largest-file__name" title={file.path}>
                        <span className="largest-file__stem">{name.stem}</span>
                        {name.extension ? <span className="largest-file__extension">{name.extension}</span> : null}
                      </strong>
                    </div>
                    <b>{formatBytes(file.logicalSize)}</b>
                    <button className="item-action" type="button" title="Add to Review list" onClick={() => onAddToReview(file.nodeId)} aria-label={`Add ${file.name} to Review list`}>
                      <ItemActionIcon kind="review" />
                    </button>
                    <button className="item-action" type="button" title="Reveal in file manager" onClick={() => onReveal(file.nodeId)} aria-label={`Reveal ${file.name} in file manager`}>
                      <ItemActionIcon kind="reveal" />
                    </button>
                  </li>
                );
              })}
            </ol>
            {reports.largest.length === 0 ? <p className="report-empty">No regular files were observed.</p> : null}
          </article>
          <article className="report-card">
            <div className="report-card__heading"><h3>File extensions</h3><span>{reports.extensions.truncated ? "Smaller groups combined" : "Exact groups"}</span></div>
            <ExtensionWaffle entries={reports.extensions.entries} />
            <ol className="extension-list">
              {reports.extensions.entries.map((entry) => (
                <li key={entry.extension}>
                  <div><span>{entry.extension}</span><b>{formatBytes(entry.logicalSize)}</b></div>
                  <div className="extension-bar"><i style={{ width: `${maximumExtension > 0 ? Math.max(1, entry.logicalSize / maximumExtension * 100) : 0}%` }} /></div>
                  <small>{formatCount(entry.files)} file{entry.files === 1 ? "" : "s"}</small>
                </li>
              ))}
            </ol>
          </article>
        </div>
      ) : null}
    </section>
  );
}

function ExtensionWaffle({ entries }: { entries: NonNullable<ReturnType<typeof useReports>["extensions"]>["entries"] }) {
  const leading = entries.slice(0, reportColours.length - 1);
  const remainder = entries.slice(reportColours.length - 1).reduce((sum, entry) => sum + entry.logicalSize, 0);
  const visible = remainder > 0 ? [...leading, { extension: "Other", logicalSize: remainder, files: 0 }] : leading;
  const total = visible.reduce((sum, entry) => sum + entry.logicalSize, 0);
  if (total === 0 || visible.length === 0) return null;
  const cells = Array.from({ length: 80 }, (_, index) => {
    const target = ((index + 0.5) / 80) * total;
    let cumulative = 0;
    const category = visible.findIndex((entry) => {
      cumulative += entry.logicalSize;
      return target <= cumulative;
    });
    return Math.max(0, category);
  });
  return (
    <figure className="extension-waffle" aria-label="File extension breakdown by logical size">
      <div className="extension-waffle__blocks" aria-hidden="true">
        {cells.map((category, index) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: this fixed decorative grid has no item identity or local state.
            key={`${category}-${index}`}
            title={visible[category]?.extension}
            style={{ background: reportColours[category] }}
          />
        ))}
      </div>
      <figcaption>
        {visible.map((entry, index) => (
          <span key={entry.extension} title={entry.extension}>
            <i style={{ background: reportColours[index] }} aria-hidden="true" />
            {entry.extension}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
