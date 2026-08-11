import { useEffect, useRef, useState } from "react";

import type { ScanSnapshot, WarningKind } from "../api/scans";
import { formatCount } from "../scans/format";

interface ScanIssuesProps {
	scan: ScanSnapshot;
}

const coverageGroups: {
	kind: WarningKind;
	title: string;
	description: string;
}[] = [
	{
		kind: "permission",
		title: "Protected locations",
		description:
			"DiskOrbit does not have permission to read some contents at these locations. The operating system controls this access.",
	},
	{
		kind: "changed",
		title: "Changed during the scan",
		description:
			"These paths disappeared or changed while DiskOrbit was inspecting them.",
	},
	{
		kind: "metadata",
		title: "Metadata unavailable",
		description:
			"DiskOrbit found these entries but could not read enough metadata to measure them reliably.",
	},
	{
		kind: "read",
		title: "Other read failures",
		description:
			"These directories could not be read for a reason other than access permissions or concurrent changes.",
	},
	{
		kind: "other",
		title: "Other coverage gaps",
		description:
			"These recoverable observations did not fit one of the common categories above.",
	},
];

export function ScanIssues({ scan }: ScanIssuesProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const [openScanID, setOpenScanID] = useState<string>();
	const [modal, setModal] = useState(false);
	const open = openScanID === scan.id;
	const warningTotal = scan.progress.warnings;
	const hasDetails = warningTotal > 0 || Boolean(scan.error);
	const detailsFinal =
		scan.state === "completed" ||
		scan.state === "cancelled" ||
		scan.state === "failed";
	const coverage = coverageState(scan);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			if (modal) {
				dialog.showModal();
				requestAnimationFrame(() => closeRef.current?.focus());
			} else {
				dialog.show();
				requestAnimationFrame(() => triggerRef.current?.focus());
			}
		}
		if (!open && dialog.open) dialog.close();
	}, [modal, open]);

	useEffect(() => {
		if (!open) return;
		function closeOnEscape(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			event.preventDefault();
			setOpenScanID(undefined);
		}
		document.addEventListener("keydown", closeOnEscape);
		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [open]);

	if (!hasDetails) return null;

	const issueCount = formatCount(warningTotal);
	const issueDescription = `${coverage.label.toLowerCase()} scan coverage${warningTotal > 0 ? `, ${issueCount} issue${warningTotal === 1 ? "" : "s"}` : ""}`;
	const drawerID = `scan-issues-${scan.id}`;

	return (
		<>
			<button
				ref={triggerRef}
				className={`header-coverage header-coverage--${coverage.tone}`}
				type="button"
				aria-label={`${open ? "Hide" : "Show"} ${issueDescription}`}
				aria-controls={drawerID}
				aria-expanded={open}
				title={`${coverage.label} coverage${warningTotal > 0 ? ` · ${issueCount} issue${warningTotal === 1 ? "" : "s"}` : ""}`}
				onClick={() => {
					if (open) {
						setOpenScanID(undefined);
						return;
					}
					setModal(window.matchMedia("(max-width: 560px)").matches);
					setOpenScanID(scan.id);
				}}
			>
				<WarningIcon />
				<strong>{coverage.label}</strong>
				{warningTotal > 0 ? <span>{issueCount}</span> : null}
			</button>
			<dialog
				ref={dialogRef}
				id={drawerID}
				className="scan-issues"
				aria-labelledby="scan-issues-title"
				aria-live="off"
				aria-modal={modal || undefined}
				onCancel={(event) => {
					event.preventDefault();
					setOpenScanID(undefined);
				}}
				onClose={() => {
					setOpenScanID(undefined);
					triggerRef.current?.focus();
				}}
			>
				<div className="scan-issues__surface">
					<header className="scan-issues__header">
						<div>
							<p className="eyebrow">Scan diagnostics</p>
							<h2 id="scan-issues-title">Scan coverage</h2>
							<p>{coverageIntro(scan, coverage.label)}</p>
						</div>
						<button
							ref={closeRef}
							className="icon-button"
							type="button"
							aria-label="Close scan coverage"
							title="Close"
							onClick={() => setOpenScanID(undefined)}
						>
							<CloseIcon />
						</button>
					</header>

					<div className="scan-issues__body">
						{scan.error ? (
							<section
								className="scan-issue-section scan-issue-section--error"
								aria-labelledby="scan-error-title"
							>
								<h3 id="scan-error-title">Scan error</h3>
								<p>{scan.error}</p>
							</section>
						) : null}

						{warningTotal > 0 ? (
							<section
								className="scan-issue-section"
								aria-labelledby="scan-warnings-title"
							>
								<div className="scan-issue-section__heading">
									<div>
										<p className="eyebrow">Readable subtotal</p>
										<h3 id="scan-warnings-title">Coverage gaps</h3>
									</div>
									<span>{formatCount(warningTotal)} paths</span>
								</div>
								<p className="scan-coverage-explanation">
									The chart remains useful for readable locations, but its
									measured total is a lower bound for this scan root.
								</p>
								{coverageGroups.map((group) => {
									const count = scan.warningCounts[group.kind];
									if (count === 0) return null;
									const examples = scan.warningDetails.filter(
										(warning) => warning.kind === group.kind,
									);
									return (
										<section
											className="scan-coverage-group"
											key={group.kind}
											aria-labelledby={`coverage-${group.kind}`}
										>
											<div>
												<h4 id={`coverage-${group.kind}`}>{group.title}</h4>
												<strong>{formatCount(count)}</strong>
											</div>
											<p>{group.description}</p>
											{examples.length > 0 ? (
												<details>
													<summary>
														Show {formatCount(examples.length)} example
														{examples.length === 1 ? "" : "s"}
													</summary>
													<ol className="scan-warning-list">
														{examples.map((warning) => (
															<li
																key={`${warning.operation}:${warning.path}:${warning.message}`}
															>
																<span className="scan-warning-list__operation">
																	{warning.operation.replaceAll("_", " ")}
																</span>
																<code>{warning.path}</code>
																<p>{warning.message}</p>
															</li>
														))}
													</ol>
												</details>
											) : null}
										</section>
									);
								})}
								{!detailsFinal ? (
									<p className="scan-issues__limit">
										Coverage categories and examples will be available when the
										scan finishes.
									</p>
								) : null}
							</section>
						) : null}
					</div>
					<footer className="scan-issues__footer">
						Scan paths and diagnostics stay on this device.
					</footer>
				</div>
			</dialog>
		</>
	);
}

function coverageState(scan: ScanSnapshot): {
	label: "Full" | "Scanning" | "Partial" | "Failed";
	tone: "full" | "active" | "partial" | "failed";
} {
	if (scan.state === "failed" || scan.error)
		return { label: "Failed", tone: "failed" };
	if (scan.state === "cancelled" || scan.progress.warnings > 0)
		return { label: "Partial", tone: "partial" };
	if (
		scan.state === "queued" ||
		scan.state === "scanning" ||
		scan.state === "cancelling"
	)
		return { label: "Scanning", tone: "active" };
	return { label: "Full", tone: "full" };
}

function coverageIntro(scan: ScanSnapshot, label: string): string {
	if (label === "Failed")
		return "The scan failed before DiskOrbit could establish complete coverage.";
	return `${formatCount(scan.progress.warnings)} recoverable coverage gap${scan.progress.warnings === 1 ? "" : "s"} reported for this scan.`;
}

function WarningIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M12 3 2.8 20h18.4Z" />
			<path d="M12 9v5M12 17.5h.01" />
		</svg>
	);
}

function CloseIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="m6 6 12 12M18 6 6 18" />
		</svg>
	);
}
