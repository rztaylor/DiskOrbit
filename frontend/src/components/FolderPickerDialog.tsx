import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchDirectoryListing, type DirectoryListing, type ScanTarget } from "../api/system";
import type { AuthenticatedFetch } from "../api/status";

interface FolderPickerDialogProps {
  fetcher: AuthenticatedFetch;
  targets: ScanTarget[];
  submitting: boolean;
  onClose(): void;
  onStart(path: string): void;
}

export function FolderPickerDialog({ fetcher, targets, submitting, onClose, onStart }: FolderPickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const breadcrumbRef = useRef<HTMLElement>(null);
  const requestRef = useRef<AbortController | undefined>(undefined);
  const initialPath = useMemo(() => targets.find((target) => target.kind === "home")?.path ?? targets[0]?.path ?? "", [targets]);
  const [location, setLocation] = useState(initialPath);
  const [listing, setListing] = useState<DirectoryListing>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [showHidden, setShowHidden] = useState(false);
  const places = targets.filter((target) => target.kind === "home" || target.kind === "folder");
  const volumes = targets.filter((target) => target.kind === "local-volume" || target.kind === "network-volume");

  const loadPath = useCallback(async (path: string, includeHidden: boolean) => {
    const selected = path.trim();
    if (!selected) {
      setError("Enter a directory path to browse.");
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(undefined);
    setListing(undefined);
    try {
      const next = await fetchDirectoryListing(fetcher, selected, { showHidden: includeHidden, signal: controller.signal });
      if (controller.signal.aborted) return;
      setListing(next);
      setLocation(next.path);
    } catch (reason: unknown) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "The selected directory could not be opened.");
      }
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, [fetcher]);

  const openPath = useCallback((path: string) => loadPath(path, showHidden), [loadPath, showHidden]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const focusFrame = requestAnimationFrame(() => locationRef.current?.focus());
    return () => cancelAnimationFrame(focusFrame);
  }, []);

  useEffect(() => {
    if (initialPath) void loadPath(initialPath, false);
    return () => requestRef.current?.abort();
  }, [initialPath, loadPath]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const breadcrumb = breadcrumbRef.current;
      if (breadcrumb) breadcrumb.scrollLeft = breadcrumb.scrollWidth;
    });
    return () => cancelAnimationFrame(frame);
  }, [listing?.path]);

  function submitLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void openPath(location);
  }

  function scanCurrentFolder() {
    if (!listing || loading || submitting) return;
    onStart(listing.path);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="folder-picker"
      aria-labelledby="folder-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="folder-picker__surface">
        <header className="folder-picker__header">
          <div>
            <p className="eyebrow">Read-only filesystem browser</p>
            <h2 id="folder-picker-title">Choose a folder to scan</h2>
            <p>Browse folders already available to this computer, including mounted network volumes.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close folder browser" title="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="folder-picker__body">
          <aside className="folder-picker__sidebar" aria-label="Scan locations">
            <LocationGroup title="Quick places" targets={places} currentPath={listing?.path} disabled={loading} onOpen={openPath} />
            <LocationGroup title="Volumes" targets={volumes} currentPath={listing?.path} disabled={loading} onOpen={openPath} />
            {targets.length === 0 ? <p>No automatic locations are available. Enter a path instead.</p> : null}
          </aside>

          <section className="folder-picker__browser" aria-label="Folder contents" aria-busy={loading}>
            <form className="folder-picker__location" onSubmit={submitLocation}>
              <label htmlFor="folder-picker-location">Location</label>
              <input
                ref={locationRef}
                id="folder-picker-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="/home/you or C:\\Users\\You"
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
              />
            </form>

            <div className="folder-picker__navigation">
              <nav ref={breadcrumbRef} aria-label="Folder path">
                {listing?.ancestors.map((ancestor, index) => {
                  const current = index === listing.ancestors.length - 1;
                  return current ? (
                    <span key={ancestor.path} aria-current="location" title={ancestor.path}>{ancestor.name}</span>
                  ) : (
                    <button key={ancestor.path} type="button" title={ancestor.path} onClick={() => void openPath(ancestor.path)} disabled={loading}>{ancestor.name}</button>
                  );
                })}
              </nav>
              <div>
                <button type="button" aria-label="Up one folder" title="Up one folder" disabled={!listing?.parent || loading} onClick={() => { if (listing?.parent) void openPath(listing.parent); }}>
                  <UpIcon />
                </button>
                <button type="button" aria-label="Refresh folder" title="Refresh folder" disabled={!listing || loading} onClick={() => { if (listing) void openPath(listing.path); }}>
                  <RefreshIcon />
                </button>
              </div>
            </div>

            <div className="folder-picker__entries">
              {loading ? <div className="folder-picker__message" role="status">Opening folder…</div> : null}
              {!loading && error ? <div className="folder-picker__message folder-picker__message--error" role="alert">{error}</div> : null}
              {!loading && !error && listing?.directories.length === 0 ? <div className="folder-picker__message">This folder has no subfolders.</div> : null}
              {!loading && !error && !listing ? <div className="folder-picker__message">Choose a location or enter a directory path.</div> : null}
              {!loading && !error && listing?.directories.length ? (
                <ul>
                  {listing.directories.map((directory) => (
                    <li key={directory.path}>
                      <button type="button" aria-label={`Open ${directory.name}`} title={directory.path} onClick={() => void openPath(directory.path)}>
                        <FolderIcon />
                        <span>{directory.name}</span>
                        <b aria-hidden="true">›</b>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {listing?.truncated && !loading ? <p className="folder-picker__limit" role="status">This folder was only partially listed to protect responsiveness. Enter an exact path above if the folder you need is omitted.</p> : null}
          </section>
        </div>

        <footer className="folder-picker__footer">
          <div>
            <span>Selected folder</span>
            <strong title={listing?.path}>{listing?.path ?? "None"}</strong>
          </div>
          <div>
            <label className="folder-picker__hidden">
              <input
                type="checkbox"
                checked={showHidden}
                disabled={loading || submitting}
                onChange={(event) => {
                  const checked = event.target.checked;
                  const currentPath = listing?.path ?? location;
                  setShowHidden(checked);
                  if (currentPath) void loadPath(currentPath, checked);
                }}
              />
              <span>Show hidden folders</span>
            </label>
            <button className="button button--quiet" type="button" onClick={onClose}>Cancel</button>
            <button className="button" type="button" disabled={!listing || loading || submitting} onClick={scanCurrentFolder}>
              {submitting ? "Starting…" : "Scan this folder"}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

function LocationGroup({ title, targets, currentPath, disabled, onOpen }: {
  title: string;
  targets: ScanTarget[];
  currentPath?: string;
  disabled: boolean;
  onOpen(path: string): Promise<void>;
}) {
  if (targets.length === 0) return null;
  return (
    <section className="folder-picker__locations" aria-labelledby={`folder-picker-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <h3 id={`folder-picker-${title.toLowerCase().replaceAll(" ", "-")}`}>{title}</h3>
      {targets.map((target) => (
        <button
          key={`${target.kind}:${target.path}`}
          type="button"
          className={currentPath === target.path ? "active" : undefined}
          aria-current={currentPath === target.path ? "location" : undefined}
          aria-label={`Open ${target.name} (${target.path})`}
          title={target.path}
          disabled={disabled}
          onClick={() => void onOpen(target.path)}
        >
          <LocationIcon kind={target.kind} />
          <span><strong>{target.name}</strong><small>{target.kind === "network-volume" ? "Network volume" : target.path}</small></span>
        </button>
      ))}
    </section>
  );
}

function LocationIcon({ kind }: { kind: ScanTarget["kind"] }) {
  return kind === "local-volume" || kind === "network-volume" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
  );
}

function FolderIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

function UpIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>;
}

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 8.4A7 7 0 0 1 18 7l2 5M18 15.6A7 7 0 0 1 6 17l-2-5" /></svg>;
}
