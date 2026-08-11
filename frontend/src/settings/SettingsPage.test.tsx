import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { settingsFixture as defaultSettings } from "../test/settings";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
	it("organises all settings into five accessible vertical tabs", () => {
		const markup = renderToStaticMarkup(
			<SettingsPage
				settings={defaultSettings}
				defaults={defaultSettings}
				loading={false}
				saving={false}
				onSave={vi.fn(async () => true)}
				onCancel={vi.fn()}
				onRetry={vi.fn()}
			/>,
		);

		expect(markup.match(/role="tab"/g)).toHaveLength(5);
		expect(markup).toContain('role="tablist" aria-orientation="vertical"');
		expect(markup).toMatch(
			/id="settings-tab-appearance"[^>]*aria-selected="true"/,
		);
		expect(markup).toMatch(
			/id="settings-tab-colour"[^>]*aria-selected="false"[^>]*tabindex="-1"/,
		);
		expect(markup).toMatch(
			/id="settings-panel-appearance"[^>]*role="tabpanel"/,
		);
		expect(markup).toMatch(
			/id="settings-panel-colour"[^>]*role="tabpanel"[^>]*hidden/,
		);
		expect(markup).toContain("Chart item budget");
		expect(markup).toContain("Directories expanded per ring");
		expect(markup).toContain("Minimum visible segment width");
		expect(markup).toContain("Balanced · 0.75°");
		expect(markup).toContain("Show individual files");
		expect(markup).toContain("Spiky gaps (recommended)");
		expect(markup).toMatch(
			/<option value="single">Single Colour<\/option><option value="rainbow">Rainbow Wash<\/option><option value="branch" selected="">Folder Branches<\/option><option value="size">Size Gradient<\/option><option value="file-type">File Type<\/option>/,
		);
		expect(markup).toContain("1,200 items");
	});

	it("shows persistence failures without hiding the form", () => {
		const markup = renderToStaticMarkup(
			<SettingsPage
				settings={defaultSettings}
				defaults={defaultSettings}
				loading={false}
				saving={false}
				error="Settings could not be loaded"
				onSave={vi.fn(async () => false)}
				onCancel={vi.fn()}
				onRetry={vi.fn()}
			/>,
		);

		expect(markup).toContain('role="alert"');
		expect(markup).toContain("Settings could not be loaded");
		expect(markup).toContain("Save settings");
	});
});
