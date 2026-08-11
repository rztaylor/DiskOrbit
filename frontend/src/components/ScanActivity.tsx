import type { ScanSnapshot } from "../api/scans";
import { formatCount } from "../scans/format";
import { ScanIssues } from "./ScanIssues";

interface ScanActivityProps {
	scan?: ScanSnapshot;
}

export function ScanActivity({ scan }: ScanActivityProps) {
	if (!scan) return <div className="app-header__context" />;
	const active =
		scan.state === "queued" ||
		scan.state === "scanning" ||
		scan.state === "cancelling";
	return (
		<div
			className={`app-header__context${active ? " app-header__context--active" : ""}`}
		>
			{active ? (
				<span className="scan-live-counters">
					<span className="scan-live-counter">
						<span className="scan-live-counter__value">
							{formatCount(scan.progress.files)}
						</span>{" "}
						files
					</span>
					<span aria-hidden="true">·</span>
					<span className="scan-live-counter">
						<span className="scan-live-counter__value">
							{formatCount(scan.progress.directories)}
						</span>{" "}
						folders
					</span>
				</span>
			) : null}
			<span className="scan-root-context" title={`Scan root: ${scan.path}`}>
				<span className="scan-root-path">
					<TargetIcon />
					<span className="visually-hidden">Scan root: </span>
					<span>{scan.path}</span>
				</span>
			</span>
			<ScanIssues scan={scan} />
			{scan.state === "cancelled" ? (
				<span className="scan-terminal-badge">Cancelled</span>
			) : null}
		</div>
	);
}

function TargetIcon() {
	return (
		<svg className="scan-root-icon" viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="7.5" />
			<circle cx="12" cy="12" r="2.5" />
			<path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
		</svg>
	);
}
