import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ScanSnapshot } from "../api/scans";
import { ScanActivity } from "./ScanActivity";

describe("ScanActivity", () => {
	it("makes an active scan persistent and explicit in the header", () => {
		const markup = renderToStaticMarkup(
			<ScanActivity scan={scan("scanning")} />,
		);
		expect(markup).toContain("app-header__context--active");
		expect(markup).toContain(">1</span> files");
		expect(markup).toContain(">1</span> folders");
		expect(markup).toContain(">·</span>");
		expect(markup).toContain("Scan root:");
		expect(markup).toContain("/Users/example");
		expect(markup).not.toContain("Stop scan");
	});

	it("keeps successful completion quiet around the scan root", () => {
		const markup = renderToStaticMarkup(
			<ScanActivity scan={scan("completed")} />,
		);
		expect(markup).toContain("/Users/example");
		expect(markup).toContain("Scan root:");
		expect(markup).not.toContain("Scan complete");
		expect(markup).not.toContain("files ·");
		expect(markup).not.toContain("Stop scan");
		expect(markup).not.toContain("app-header__context--active");
	});
});

function scan(state: ScanSnapshot["state"]): ScanSnapshot {
	return {
		id: "scan-1",
		path: "/Users/example",
		state,
		revision: 1,
		progress: {
			files: 1,
			directories: 1,
			bytes: 10,
			warnings: 0,
			nodes: 2,
			elapsedMs: 20,
		},
		warningDetails: [],
		warningCounts: {
			permission: 0,
			changed: 0,
			metadata: 0,
			read: 0,
			other: 0,
		},
	};
}
