import { describe, expect, it, vi } from "vitest";

import { settingsFixture } from "../test/settings";
import { fetchSettings, saveSettings } from "./settings";

describe("settings API", () => {
	it("validates loaded settings and saves the complete document", async () => {
		const document = { value: settingsFixture, defaults: settingsFixture };
		const fetcher = vi.fn(async () => Response.json(document));
		await expect(fetchSettings(fetcher)).resolves.toEqual(document);

		const updated = { ...settingsFixture, theme: "dark" as const };
		const saveFetcher = vi.fn(async () => Response.json(updated));
		await expect(saveSettings(saveFetcher, updated)).resolves.toEqual(updated);
		expect(saveFetcher).toHaveBeenCalledWith(
			"/api/settings",
			expect.objectContaining({
				method: "PUT",
				body: JSON.stringify(updated),
			}),
		);
	});

	it("rejects settings outside the supported browser bounds", async () => {
		const fetcher = vi.fn(async () =>
			Response.json({
				value: {
					...settingsFixture,
					chart: { ...settingsFixture.chart, maximumDepth: 99 },
				},
				defaults: settingsFixture,
			}),
		);
		await expect(fetchSettings(fetcher)).rejects.toThrow(
			"Settings response was invalid",
		);
	});

	it("requires independent colours for the single and size schemes", async () => {
		const fetcher = vi.fn(async () =>
			Response.json({
				value: settingsFixture,
				defaults: {
					...settingsFixture,
					chart: { ...settingsFixture.chart, singleColour: undefined },
				},
			}),
		);
		await expect(fetchSettings(fetcher)).rejects.toThrow(
			"Settings response was invalid",
		);
	});
});
