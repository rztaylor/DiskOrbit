import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ScanSnapshot } from "../api/scans";
import { ScanIssues } from "./ScanIssues";

const scan: ScanSnapshot = {
	id: "scan-1",
	path: "/data",
	state: "failed",
	revision: 3,
	progress: {
		files: 1,
		directories: 2,
		bytes: 3,
		warnings: 4,
		nodes: 3,
		elapsedMs: 10,
	},
	warningDetails: [
		{
			kind: "permission",
			path: "/data/private",
			operation: "read_directory",
			message: "permission denied",
		},
	],
	warningCounts: { permission: 4, changed: 0, metadata: 0, read: 0, other: 0 },
	error: "the root became unavailable",
};

describe("ScanIssues", () => {
	it("combines fatal errors with grouped, bounded coverage examples", () => {
		const markup = renderToStaticMarkup(<ScanIssues scan={scan} />);

		expect(markup).toContain(
			'aria-label="Show failed scan coverage, 4 issues"',
		);
		expect(markup).toContain('aria-expanded="false"');
		expect(markup).toContain('aria-controls="scan-issues-scan-1"');
		expect(markup).toContain("Scan coverage");
		expect(markup).toContain("the root became unavailable");
		expect(markup).toContain("Protected locations");
		expect(markup).toContain(
			"DiskOrbit does not have permission to read some contents at these locations.",
		);
		expect(markup).toContain("read directory");
		expect(markup).toContain("/data/private");
		expect(markup).toContain("Show 1 example");
	});

	it("keeps a zero-issue scan visually quiet", () => {
		const markup = renderToStaticMarkup(
			<ScanIssues
				scan={{
					...scan,
					state: "completed",
					progress: { ...scan.progress, warnings: 0 },
					warningDetails: [],
					error: undefined,
				}}
			/>,
		);

		expect(markup).toBe("");
		expect(markup).not.toContain("<dialog");
	});

	it("does not describe active warning details as discarded", () => {
		const markup = renderToStaticMarkup(
			<ScanIssues
				scan={{
					...scan,
					state: "scanning",
					progress: { ...scan.progress, warnings: 2 },
					warningDetails: [],
					warningCounts: {
						permission: 0,
						changed: 0,
						metadata: 0,
						read: 0,
						other: 0,
					},
					error: undefined,
				}}
			/>,
		);

		expect(markup).toContain(
			"Coverage categories and examples will be available when the scan finishes.",
		);
	});
});
