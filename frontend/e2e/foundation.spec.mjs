import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");
const executable = resolve(projectRoot, "build/diskorbit");
const screenshotDir = resolve(projectRoot, ".cache/playwright-screenshots");

test("authenticated browser foundation connects and quits cleanly", async ({
	page,
}) => {
	await mkdir(screenshotDir, { recursive: true });
	const home = await mkdtemp(join(tmpdir(), "diskorbit-home-"));
	await mkdir(join(home, ".hidden-folder"));
	await mkdir(join(home, "visible-folder"));
	await writeFile(join(home, "visible-folder", "sample.txt"), "sample");
	const process = spawn(executable, ["--debug"], {
		cwd: projectRoot,
		env: isolatedProcessEnv(home),
		stdio: ["ignore", "pipe", "pipe"],
	});
	let processStderr = "";
	process.stderr.on("data", (chunk) => {
		processStderr += String(chunk);
	});

	try {
		const bootstrapURL = await waitForBootstrapURL(process);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
		await page.goto(bootstrapURL, { waitUntil: "domcontentloaded" });

		await expect(page).toHaveURL(
			(url) => url.pathname === "/" && url.hash === "",
		);
		await expect(
			page.getByRole("heading", { level: 1, name: "Choose what to explore" }),
		).toBeVisible();
		await expect(page.getByRole("heading", { name: "DiskOrbit" })).toHaveCount(
			0,
		);
		await expect(page.getByRole("heading", { name: "Volumes" })).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Choose another folder", exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Your filesystem data stays on this device."),
		).toBeVisible();
		await expect(page.getByText("Backend connected.")).toHaveCount(0);
		await expect(
			page.getByText("Private loopback connection active"),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Check connection" }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Switch to light theme" }),
		).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await expect(page.locator(".scan-launcher")).toHaveCSS(
			"border-top-width",
			"0px",
		);
		await expect(page.locator(".scan-launcher")).toHaveCSS(
			"box-shadow",
			"none",
		);
		await expect(page.locator("footer")).toHaveCount(0);
		await page.keyboard.press("Tab");
		await expect(
			page.getByRole("link", { name: "DiskOrbit home" }),
		).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(
			page.getByRole("button", { name: "Open settings" }),
		).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(
			page.getByRole("button", { name: "Switch to light theme" }),
		).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(page.getByRole("button", { name: "Quit" })).toBeFocused();

		const browserStorage = await page.evaluate(() => ({
			local: Object.keys(localStorage),
			session: Object.keys(sessionStorage),
		}));
		expect(browserStorage).toEqual({ local: [], session: [] });

		await page.evaluate(() => window.scrollTo(0, 0));
		await page.screenshot({
			path: resolve(screenshotDir, "foundation-dark.png"),
			fullPage: true,
		});
		const anotherFolder = page.getByRole("button", {
			name: /Choose another folder/,
		});
		await anotherFolder.click();
		const folderDialog = page.getByRole("dialog", {
			name: "Choose a folder to scan",
		});
		await expect(folderDialog).toBeVisible();
		await expect(
			folderDialog.getByRole("textbox", { name: "Location" }),
		).toHaveValue(home);
		await expect(
			folderDialog.getByRole("button", { name: "Scan this folder" }),
		).toBeEnabled();
		const showHidden = folderDialog.getByRole("checkbox", {
			name: "Show hidden folders",
		});
		await expect(showHidden).not.toBeChecked();
		await expect(
			folderDialog.getByRole("button", { name: "Open visible-folder" }),
		).toBeVisible();
		await expect(
			folderDialog.getByRole("button", { name: "Open .hidden-folder" }),
		).toHaveCount(0);
		await page.screenshot({
			path: resolve(screenshotDir, "folder-picker-desktop.png"),
			fullPage: false,
		});
		await page.setViewportSize({ width: 430, height: 860 });
		await expect(showHidden).not.toBeChecked();
		await page.screenshot({
			path: resolve(screenshotDir, "folder-picker-narrow.png"),
			fullPage: false,
		});
		await page.setViewportSize({ width: 1440, height: 900 });
		await showHidden.check();
		await expect(
			folderDialog.getByRole("button", { name: "Open .hidden-folder" }),
		).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(folderDialog).toBeHidden();
		await expect(anotherFolder).toBeFocused();
		await page.getByRole("button", { name: "Switch to light theme" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await expect(
			page.getByRole("button", { name: "Switch to dark theme" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Open settings" }).click();
		await expect(
			page.getByRole("heading", { level: 1, name: "Settings" }),
		).toBeVisible();
		await expect(page.getByRole("tablist")).toHaveAttribute(
			"aria-orientation",
			"vertical",
		);
		await expect(page.getByRole("tab")).toHaveCount(5);
		const appearanceTab = page.getByRole("tab", { name: /Appearance/ });
		const colourTab = page.getByRole("tab", { name: /Colour/ });
		const structureTab = page.getByRole("tab", { name: /Structure/ });
		const resolutionTab = page.getByRole("tab", { name: /Resolution/ });
		const filesTab = page.getByRole("tab", { name: /Files/ });
		await expect(appearanceTab).toHaveAttribute("aria-selected", "true");
		await expect(page.getByRole("combobox", { name: "Theme" })).toHaveValue(
			"light",
		);

		await appearanceTab.focus();
		await page.keyboard.press("ArrowDown");
		await expect(colourTab).toBeFocused();
		await expect(colourTab).toHaveAttribute("aria-selected", "true");
		await page
			.getByRole("combobox", { name: "Chart colour method" })
			.selectOption("single");
		const singleColour = page.getByLabel("Base chart colour");
		await expect(singleColour).toHaveValue("#3bb5a1");
		await setColour(singleColour, "#123456");
		await page
			.getByRole("combobox", { name: "Chart colour method" })
			.selectOption("size");
		const sizeLargeColour = page.getByLabel("Large-segment colour");
		const sizeSmallColour = page.getByLabel("Small-segment colour");
		await expect(sizeLargeColour).toHaveValue("#750000");
		await expect(sizeSmallColour).toHaveValue("#e1ff00");
		await setColour(sizeLargeColour, "#abcdef");
		await setColour(sizeSmallColour, "#654321");
		await page
			.getByRole("combobox", { name: "Chart colour method" })
			.selectOption("single");
		await expect(page.getByLabel("Base chart colour")).toHaveValue("#123456");
		await page
			.getByRole("combobox", { name: "Chart colour method" })
			.selectOption("file-type");
		await page
			.getByRole("combobox", { name: "Folder file-type dominance threshold" })
			.selectOption("70");

		await structureTab.click();
		await page
			.getByRole("combobox", { name: "Maximum rings" })
			.selectOption("10");
		await page
			.getByRole("combobox", { name: "Chart item budget" })
			.selectOption("2000");

		await resolutionTab.click();
		await expect(
			page.getByRole("combobox", { name: "Omitted content style" }),
		).toHaveValue("gaps");
		await expect(
			page.getByRole("combobox", { name: "Minimum visible segment width" }),
		).toHaveValue("0.75");
		await page
			.getByRole("combobox", { name: "Minimum visible segment width" })
			.selectOption("1");
		await expect(
			page.getByRole("combobox", { name: "Folder and file group gap" }),
		).toHaveValue("0.8");
		await expect(page.getByText("How the limits combine")).toBeVisible();

		await filesTab.click();
		await expect(
			page.getByText("Large files are often the fastest housekeeping wins."),
		).toBeVisible();
		await page.getByRole("button", { name: "Save settings" }).click();
		await expect(
			page.getByRole("heading", { level: 1, name: "Choose what to explore" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Open settings" }).click();
		await expect(appearanceTab).toHaveAttribute("aria-selected", "true");
		await colourTab.click();
		await expect(
			page.getByRole("combobox", { name: "Chart colour method" }),
		).toHaveValue("file-type");
		await expect(
			page.getByRole("combobox", {
				name: "Folder file-type dominance threshold",
			}),
		).toHaveValue("70");
		await page
			.getByRole("combobox", { name: "Chart colour method" })
			.selectOption("single");
		await expect(page.getByLabel("Base chart colour")).toHaveValue("#123456");
		await page
			.getByRole("combobox", { name: "Chart colour method" })
			.selectOption("size");
		await expect(page.getByLabel("Large-segment colour")).toHaveValue(
			"#abcdef",
		);
		await expect(page.getByLabel("Small-segment colour")).toHaveValue(
			"#654321",
		);
		await structureTab.click();
		await expect(
			page.getByRole("combobox", { name: "Maximum rings" }),
		).toHaveValue("10");
		await expect(
			page.getByRole("combobox", { name: "Chart item budget" }),
		).toHaveValue("2000");
		await resolutionTab.click();
		await expect(
			page.getByRole("combobox", { name: "Minimum visible segment width" }),
		).toHaveValue("1");
		await page.screenshot({
			path: resolve(screenshotDir, "settings-desktop.png"),
			fullPage: true,
		});
		await page.setViewportSize({ width: 430, height: 860 });
		await page.screenshot({
			path: resolve(screenshotDir, "settings-narrow.png"),
			fullPage: true,
		});
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.getByRole("link", { name: "DiskOrbit home" }).click();
		await page.screenshot({
			path: resolve(screenshotDir, "foundation-desktop.png"),
			fullPage: true,
		});
		await page.setViewportSize({ width: 430, height: 860 });
		await expect(
			page.getByRole("heading", { level: 1, name: "Choose what to explore" }),
		).toBeVisible();
		await page.screenshot({
			path: resolve(screenshotDir, "foundation-narrow.png"),
			fullPage: true,
		});
		const exit = waitForExit(process);
		await page
			.getByRole("button", { name: "Quit" })
			.click()
			.catch((error) => {
				if (!page.isClosed()) throw error;
			});
		const exitResult = await exit;
		expect(exitResult, processStderr).toMatchObject({ code: 0 });
	} finally {
		if (process.exitCode === null) {
			process.kill("SIGTERM");
			await waitForExit(process).catch(() => undefined);
		}
		await rm(home, { recursive: true, force: true });
	}
});

async function setColour(locator, value) {
	await locator.evaluate((input, colour) => {
		const setValue = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		setValue?.call(input, colour);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	}, value);
}

test("starts a local scan and renders progressive directory results", async ({
	page,
}) => {
	await mkdir(screenshotDir, { recursive: true });
	const fixture = await mkdtemp(join(tmpdir(), "diskorbit-e2e-"));
	const longInsightName = `sha256-${"0123456789abcdef".repeat(7)}.iso`;
	await mkdir(join(fixture, "documents"));
	await mkdir(join(fixture, "media"));
	await writeFile(join(fixture, "documents", "notes.txt"), "notes");
	await writeFile(join(fixture, "media", "clip.bin"), Buffer.alloc(12_000));
	await writeFile(join(fixture, "documents", longInsightName), "x");
	const process = spawn(executable, ["--debug"], {
		cwd: projectRoot,
		env: isolatedProcessEnv(fixture),
		stdio: ["ignore", "pipe", "pipe"],
	});
	let processStderr = "";
	process.stderr.on("data", (chunk) => {
		processStderr += String(chunk);
	});

	try {
		const bootstrapURL = await waitForBootstrapURL(process);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(bootstrapURL, { waitUntil: "domcontentloaded" });
		await expect(
			page.getByRole("heading", { name: "Choose what to explore" }),
		).toBeVisible();
		await expect(
			page.getByRole("combobox", { name: "Size metric" }),
		).toHaveValue("allocated");

		await expect(
			page.getByRole("button", { name: `Scan Home (${fixture})` }),
		).toBeVisible();
		await page.getByRole("button", { name: `Scan Home (${fixture})` }).click();
		await expect(page.getByText("Scan complete")).toHaveCount(0);
		await expect(
			page.getByRole("region", { name: "Scan progress" }),
		).toHaveCount(0);
		const scanRootContext = page.locator(".scan-root-context");
		await expect(scanRootContext).toBeVisible();
		await expect(scanRootContext).toHaveAttribute(
			"title",
			`Scan root: ${fixture}`,
		);
		await expect(
			page.getByRole("heading", { name: "Allocated size by directory" }),
		).toBeVisible();
		await expect(
			page.getByRole("checkbox", { name: "Show free space in chart" }),
		).toHaveCount(0);
		await expect(page.getByRole("tab", { name: "Chart" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(
			page.getByRole("img", { name: /Radial disk usage/ }),
		).toBeVisible();
		await expect(page.locator(".chart-detail .eyebrow")).toHaveText(
			"Center path",
		);
		await expect(page.locator(".detail-metric strong").first()).toHaveCSS(
			"font-size",
			"16px",
		);
		await expectViewportBoundScanWorkspace(page, { width: 1440, height: 900 });
		await expectViewportBoundScanWorkspace(page, { width: 1440, height: 650 });
		await expectViewportBoundScanWorkspace(page, { width: 1440, height: 900 });
		const chartFit = await page.evaluate(() => {
			const stage = document.querySelector(".chart-stage");
			const chart = document.querySelector(".radial-chart");
			if (!(stage instanceof HTMLElement) || !(chart instanceof SVGElement))
				return { fits: false };
			const stageBox = stage.getBoundingClientRect();
			const chartBox = chart.getBoundingClientRect();
			const style = getComputedStyle(stage);
			const inset = {
				top: Number.parseFloat(style.paddingTop),
				right: Number.parseFloat(style.paddingRight),
				bottom: Number.parseFloat(style.paddingBottom),
				left: Number.parseFloat(style.paddingLeft),
			};
			return {
				fits:
					chartBox.left >= stageBox.left + inset.left - 1 &&
					chartBox.right <= stageBox.right - inset.right + 1 &&
					chartBox.top >= stageBox.top + inset.top - 1 &&
					chartBox.bottom <= stageBox.bottom - inset.bottom + 1,
				stage: {
					left: stageBox.left,
					top: stageBox.top,
					right: stageBox.right,
					bottom: stageBox.bottom,
				},
				chart: {
					left: chartBox.left,
					top: chartBox.top,
					right: chartBox.right,
					bottom: chartBox.bottom,
				},
				inset,
			};
		});
		expect(chartFit.fits, JSON.stringify(chartFit)).toBe(true);
		await expect(
			page.getByRole("combobox", { name: "Maximum chart rings" }),
		).toHaveValue("7");
		await expect(page.getByText("Select a ring to focus")).toHaveCount(0);
		const chartStyle = page.getByRole("combobox", {
			name: "Chart colour style",
		});
		await expect(chartStyle).toHaveValue("size");
		await chartStyle.selectOption("rainbow");
		await expect(chartStyle).toHaveValue("rainbow");
		await chartStyle.selectOption("single");
		await expect(chartStyle).toHaveValue("single");
		await page.getByRole("button", { name: "Switch to dark theme" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await page.screenshot({
			path: resolve(screenshotDir, "scan-single-colour-dark.png"),
			fullPage: false,
		});
		await chartStyle.selectOption("file-type");
		await expect(chartStyle).toHaveValue("file-type");
		await expect(
			page.locator('.radial-segment[aria-label^="documents,"]'),
		).toHaveAttribute("fill", "#12a66f");
		await page.screenshot({
			path: resolve(screenshotDir, "scan-file-types-dark.png"),
			fullPage: false,
		});
		await page.getByRole("button", { name: "Switch to light theme" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await chartStyle.selectOption("branch");
		await expect(chartStyle).toHaveValue("branch");
		const visualControlHeights = await page
			.locator(".visual-select")
			.evaluateAll((controls) =>
				controls.map((control) => control.getBoundingClientRect().height),
			);
		expect(visualControlHeights).toEqual([32, 32, 32]);
		await page.getByRole("tab", { name: "Contents" }).click();
		await expect(
			page.getByRole("cell", { name: "documents", exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("cell", { name: "media", exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("region", { name: "Scan progress" }),
		).toHaveCount(0);
		await expect(
			page.getByRole("img", { name: /Radial disk usage/ }),
		).toBeHidden();
		await page.getByRole("tab", { name: "Chart" }).click();
		await page
			.getByRole("combobox", { name: "Maximum chart rings" })
			.selectOption("2");
		const clipSegment = page.locator('[aria-label^="clip.bin,"]');
		const mediaSegment = page.locator('.radial-segment[aria-label^="media,"]');
		const mediaColour = await mediaSegment.evaluate(
			(segment) => getComputedStyle(segment).fill,
		);
		const clipColour = await clipSegment.evaluate(
			(segment) => getComputedStyle(segment).fill,
		);
		await clipSegment.dispatchEvent("mouseover");
		await expect(page.locator(".chart-detail")).toContainText("clip.bin");
		await expect(page.locator(".chart-detail .eyebrow")).toHaveText(
			"Preview path",
		);
		await expect(page.locator(".chart-detail")).toContainText(
			join(fixture, "media", "clip.bin"),
		);
		await expect(page.locator(".chart-detail")).toContainText("Parent");
		await clipSegment.dispatchEvent("click");
		await clipSegment.dispatchEvent("mouseout");
		await expect(page.locator(".chart-detail .eyebrow")).toHaveText(
			"Pinned path",
		);
		await mediaSegment.dispatchEvent("contextmenu", {
			clientX: 600,
			clientY: 360,
		});
		await expect(
			page.getByRole("menu", { name: "Actions for media" }),
		).toBeVisible();
		await expect(
			page.getByRole("menuitem", { name: "Reveal in file manager" }),
		).toBeVisible();
		await expect(
			page.getByRole("menuitem", { name: "File breakdown and reports…" }),
		).toBeEnabled();
		await page.getByRole("menuitem", { name: "Focus in chart" }).focus();
		await page.keyboard.press("Escape");
		await expect(
			page.getByRole("menu", { name: "Actions for media" }),
		).toBeHidden();
		await expect(
			page.getByRole("img", { name: /Radial disk usage for diskorbit-e2e-/ }),
		).toBeVisible();
		await mediaSegment.dispatchEvent("contextmenu", {
			clientX: 600,
			clientY: 360,
		});
		await page
			.getByRole("menuitem", { name: "File breakdown and reports…" })
			.focus();
		await page.locator('.radial-segment[aria-label^="documents,"]').click();
		await expect(
			page.getByRole("menu", { name: "Actions for media" }),
		).toBeHidden();
		await expect(page.getByRole("tab", { name: "Insights" })).toHaveAttribute(
			"aria-selected",
			"false",
		);
		await expect(
			page
				.getByRole("navigation", { name: "Directory path" })
				.getByRole("button", { name: "documents" }),
		).toHaveCount(0);
		await mediaSegment.dispatchEvent("contextmenu", {
			clientX: 600,
			clientY: 360,
		});
		await page
			.getByRole("menuitem", { name: "File breakdown and reports…" })
			.click();
		await expect(page.getByRole("tab", { name: "Insights" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
		await expect(
			page
				.getByRole("navigation", { name: "Directory path" })
				.getByRole("button", { name: "media" }),
		).toBeVisible();
		await expect(page.locator(".largest-list")).toContainText("clip.bin");
		await page.keyboard.press("Escape");
		await expect(page.getByRole("tab", { name: "Chart" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(
			page.getByRole("img", { name: /Radial disk usage for media/ }),
		).toBeVisible();
		await expect(page.locator(".radial-centre__branch-accent")).toHaveCSS(
			"stroke",
			mediaColour,
		);
		await expect(clipSegment).toHaveCSS("fill", clipColour);
		await page.screenshot({
			path: resolve(screenshotDir, "scan-folder-branches-focused.png"),
			fullPage: false,
		});
		await page.getByRole("button", { name: /^Go up to / }).click();
		await expect.poll(() => processStderr).toContain('state="completed"');
		const reviewList = page.getByRole("region", { name: "Review list" });
		await expect(reviewList).toBeVisible();
		const mediaDragPoint = await mediaSegment.evaluate((segment) => {
			const bounds = segment.getBoundingClientRect();
			for (let y = 4; y < bounds.height; y += 8) {
				for (let x = 4; x < bounds.width; x += 8) {
					if (
						document.elementFromPoint(bounds.left + x, bounds.top + y) ===
						segment
					)
						return { x, y };
				}
			}
			return undefined;
		});
		expect(mediaDragPoint).toBeDefined();
		const mediaBounds = await mediaSegment.boundingBox();
		const reviewBounds = await reviewList.boundingBox();
		expect(mediaBounds).not.toBeNull();
		expect(reviewBounds).not.toBeNull();
		await page.mouse.move(
			mediaBounds.x + mediaDragPoint.x,
			mediaBounds.y + mediaDragPoint.y,
		);
		await page.mouse.down();
		await page.mouse.move(
			reviewBounds.x + reviewBounds.width / 2,
			reviewBounds.y + reviewBounds.height / 2,
			{ steps: 12 },
		);
		await expect(page.locator(".chart-drag-preview")).toBeVisible();
		await expect(reviewList).toHaveClass(/review-list--drag-ready/);
		await page.mouse.up();
		await expect(reviewList.getByText("media", { exact: true })).toBeVisible();
		await expect(reviewList.getByText(/1 item · .* measured/)).toBeVisible();
		await expect(
			reviewList.getByText("Nothing here changes your files."),
		).toHaveCount(0);
		await mediaSegment.dispatchEvent("contextmenu", {
			clientX: 600,
			clientY: 360,
		});
		await page.getByRole("menuitem", { name: "Add to Review list" }).click();
		await expect(reviewList).toContainText("media is already in Review list.");
		const reviewSeparator = page.getByRole("separator", {
			name: "Resize Review list",
		});
		await reviewSeparator.focus();
		const reviewHeight = Number(
			await reviewSeparator.getAttribute("aria-valuenow"),
		);
		await page.keyboard.press("ArrowUp");
		await expect(reviewSeparator).toHaveAttribute(
			"aria-valuenow",
			String(reviewHeight + 24),
		);
		await page
			.locator('.radial-segment[role="button"][aria-label^="media,"]')
			.focus();
		await page.keyboard.press("Enter");
		await expect(
			page
				.getByRole("navigation", { name: "Directory path" })
				.getByRole("button", { name: "media" }),
		).toBeVisible();
		await page.getByRole("tab", { name: "Contents" }).click();
		await expect(
			page.locator(".directory-panel").getByRole("heading", { name: "media" }),
		).toBeVisible();
		await expect(
			page.getByRole("cell", { name: "clip.bin", exact: true }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Add clip.bin to Review list" })
			.click();
		await expect(reviewList).toContainText(
			"clip.bin is already included by media.",
		);
		await expect(reviewList.getByText(/1 item · .* measured/)).toBeVisible();
		await reviewList
			.getByRole("button", { name: "Remove media from Review list" })
			.click();
		await page
			.getByRole("button", { name: "Add clip.bin to Review list" })
			.click();
		await expect(
			reviewList.getByText("clip.bin", { exact: true }),
		).toBeVisible();
		await expect(
			page.locator('.tree-select[aria-current="page"]'),
		).toContainText("media");
		await page.getByRole("tab", { name: "Chart" }).click();
		await page.getByRole("button", { name: /^Go up to / }).click();
		await page.getByRole("tab", { name: "Contents" }).click();
		await expect(
			page.getByRole("cell", { name: "documents", exact: true }),
		).toBeVisible();
		await page
			.locator(".directory-panel tbody tr", { hasText: "documents" })
			.dragTo(reviewList);
		await expect(
			reviewList.getByText("documents", { exact: true }),
		).toBeVisible();
		await expect(reviewList.getByText(/2 items · .* measured/)).toBeVisible();
		const fileReviewRow = reviewList.locator(".review-list__items li", {
			hasText: "clip.bin",
		});
		const directoryReviewRow = reviewList.locator(".review-list__items li", {
			hasText: "documents",
		});
		const fileRevealBounds = await fileReviewRow
			.getByRole("button", { name: "Reveal clip.bin in file manager" })
			.boundingBox();
		const directoryRevealBounds = await directoryReviewRow
			.getByRole("button", { name: "Reveal documents in file manager" })
			.boundingBox();
		const fileRemoveBounds = await fileReviewRow
			.getByRole("button", { name: "Remove clip.bin from Review list" })
			.boundingBox();
		const directoryRemoveBounds = await directoryReviewRow
			.getByRole("button", { name: "Remove documents from Review list" })
			.boundingBox();
		expect(fileRevealBounds?.x).toBe(directoryRevealBounds?.x);
		expect(fileRemoveBounds?.x).toBe(directoryRemoveBounds?.x);
		await page
			.locator(".directory-panel")
			.getByRole("button", { name: "media", exact: true })
			.click();
		await expect(
			page.locator(".directory-panel").getByRole("heading", { name: "media" }),
		).toBeVisible();
		await page
			.getByRole("navigation", { name: "Directory path" })
			.getByRole("button", { name: /^diskorbit-e2e-/ })
			.click();
		await expect(
			page.getByRole("cell", { name: "documents", exact: true }),
		).toBeVisible();
		await page
			.locator(".directory-panel")
			.getByRole("button", { name: /^Logical/ })
			.click();
		await expect(page.locator("tbody tr").first()).toContainText("documents");
		await expect(
			page
				.locator(".directory-panel")
				.getByRole("button", { name: "Reveal media in file manager" }),
		).toBeVisible();
		const mediaContentsRow = page.locator(".directory-panel tbody tr", {
			hasText: "media",
		});
		await expect(
			mediaContentsRow.locator(".item-action-icon--view"),
		).toBeVisible();
		await expect(
			mediaContentsRow.locator(".item-action-icon--review"),
		).toBeVisible();
		await expect(
			mediaContentsRow.locator(".item-action-icon--reveal"),
		).toBeVisible();
		await expect(
			reviewList.locator(".item-action-icon--view").first(),
		).toBeVisible();
		await expect(
			reviewList.locator(".item-action-icon--reveal").first(),
		).toBeVisible();
		await page.getByRole("tab", { name: "Chart" }).click();
		await expect(
			page.getByRole("img", { name: /Radial disk usage/ }),
		).toBeVisible();
		await page
			.getByRole("combobox", { name: "Size metric" })
			.selectOption("logical");
		await expect(
			page.getByRole("heading", { name: "Logical size by directory" }),
		).toBeVisible();
		await page.getByRole("tab", { name: "Insights" }).click();
		await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
		await expect(page.locator(".largest-list")).toContainText("clip.bin");
		const longInsightRow = page.locator(".largest-list li", {
			hasText: longInsightName,
		});
		await expect(longInsightRow).toBeVisible();
		await expect(longInsightRow.locator(".largest-file__extension")).toHaveText(
			".iso",
		);
		await expect(longInsightRow.locator(".largest-file__extension")).toHaveCSS(
			"flex-shrink",
			"0",
		);
		await expect(longInsightRow.locator(".largest-file__stem")).toHaveCSS(
			"text-overflow",
			"ellipsis",
		);
		const longInsightLayout = await longInsightRow.evaluate((row) => {
			const name = row.querySelector(".largest-file__name");
			const stem = row.querySelector(".largest-file__stem");
			const size = row.querySelector("b");
			const action = row.querySelector("button");
			if (
				!(name instanceof HTMLElement) ||
				!(stem instanceof HTMLElement) ||
				!(size instanceof HTMLElement) ||
				!(action instanceof HTMLElement)
			)
				return undefined;
			return {
				contained:
					name.getBoundingClientRect().right <=
						size.getBoundingClientRect().left &&
					size.getBoundingClientRect().right <=
						action.getBoundingClientRect().left,
				truncated: stem.scrollWidth > stem.clientWidth,
			};
		});
		expect(longInsightLayout).toEqual({ contained: true, truncated: true });
		await expect(
			page.getByRole("button", {
				name: `Reveal ${longInsightName} in file manager`,
			}),
		).toHaveAttribute("title", "Reveal in file manager");
		await expect(
			page.locator(".largest-list strong", { hasText: "clip.bin" }),
		).toHaveAttribute("title", join(fixture, "media", "clip.bin"));
		await expect(
			page.locator(".largest-list .item-action-icon--reveal").first(),
		).toBeVisible();
		await expect(page.locator(".extension-list")).toContainText(".bin");
		await expect(
			page.getByRole("figure", {
				name: "File extension breakdown by logical size",
			}),
		).toBeVisible();
		await expect(page.locator(".extension-waffle figcaption")).toHaveCSS(
			"font-size",
			"10px",
		);
		await expect(
			page.locator(".extension-waffle__blocks i").first(),
		).toHaveAttribute("title", ".bin");
		await expect(
			page.getByRole("button", { name: "Export JSON" }),
		).toBeEnabled();
		await expect(
			page.getByRole("button", { name: "Export CSV" }),
		).toBeEnabled();
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.screenshot({
			path: resolve(screenshotDir, "scan-insights-desktop.png"),
			fullPage: false,
		});
		await page.getByRole("tab", { name: "Chart" }).click();
		await expect(
			page.getByRole("heading", { name: "Logical size by directory" }),
		).toBeVisible();
		await expect(page.getByRole("heading", { name: "Insights" })).toBeHidden();
		await page.screenshot({
			path: resolve(screenshotDir, "scan-desktop.png"),
			fullPage: false,
		});

		await page.setViewportSize({ width: 430, height: 860 });
		await page.evaluate(() => window.scrollTo(0, 0));
		await expect(
			page.getByRole("button", { name: "Expand directory tree" }),
		).toBeVisible();
		await page.screenshot({
			path: resolve(screenshotDir, "scan-narrow.png"),
			fullPage: false,
		});
		const narrowDetail = page.locator(".chart-detail");
		await narrowDetail.scrollIntoViewIfNeeded();
		await expect(
			narrowDetail.locator(".detail-metric--file-mix strong"),
		).toHaveCSS("white-space", "normal");
		await narrowDetail.screenshot({
			path: resolve(screenshotDir, "scan-detail-narrow.png"),
		});
		await page.getByRole("tab", { name: "Contents" }).click();
		await expect(page.getByRole("table")).toBeVisible();
		await page.screenshot({
			path: resolve(screenshotDir, "scan-contents-narrow.png"),
			fullPage: false,
		});
		await page.getByRole("tab", { name: "Insights" }).click();
		const narrowExtensionKey = page.locator(".extension-waffle figcaption");
		await expect(narrowExtensionKey).toBeVisible();
		await expect(longInsightRow).toBeVisible();
		await expect
			.poll(() =>
				longInsightRow.evaluate((row) => {
					const name = row.querySelector(".largest-file__name");
					const size = row.querySelector("b");
					const action = row.querySelector("button");
					if (
						!(name instanceof HTMLElement) ||
						!(size instanceof HTMLElement) ||
						!(action instanceof HTMLElement)
					)
						return false;
					return (
						name.getBoundingClientRect().right <=
							size.getBoundingClientRect().left &&
						size.getBoundingClientRect().right <=
							action.getBoundingClientRect().left
					);
				}),
			)
			.toBe(true);
		await narrowExtensionKey.scrollIntoViewIfNeeded();
		await page.screenshot({
			path: resolve(screenshotDir, "scan-insights-narrow.png"),
			fullPage: false,
		});

		await page.getByRole("link", { name: "DiskOrbit home" }).click();
		await expect(
			page.getByRole("heading", { level: 1, name: "Choose what to explore" }),
		).toBeVisible();
		await expect(page.getByText("Scan complete")).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: `Scan Home (${fixture})` }),
		).toBeEnabled();
		await expect(
			page.getByRole("textbox", { name: "Directory path" }),
		).toHaveCount(0);

		const exit = waitForExit(process);
		await page
			.getByRole("button", { name: "Quit" })
			.click()
			.catch((error) => {
				if (!page.isClosed()) throw error;
			});
		await expect(exit).resolves.toMatchObject({ code: 0 });
	} finally {
		if (process.exitCode === null) {
			process.kill("SIGTERM");
			await waitForExit(process).catch(() => undefined);
		}
		await rm(fixture, { recursive: true, force: true });
	}
});

test("coordinates the live chart pulse with a consistent active-scan header", async ({
	page,
}) => {
	await mkdir(screenshotDir, { recursive: true });
	const home = await mkdtemp(join(tmpdir(), "diskorbit-live-home-"));
	const process = spawn(executable, ["--debug"], {
		cwd: projectRoot,
		env: isolatedProcessEnv(home),
		stdio: ["ignore", "pipe", "pipe"],
	});
	let rootFetches = 0;
	const liveScan = {
		id: "scan-live",
		path: "/Volumes/Archive",
		state: "scanning",
		revision: 1,
		progress: {
			files: 520_481,
			directories: 149_001,
			bytes: 42_000,
			warnings: 339,
			nodes: 669_482,
			elapsedMs: 8_300,
		},
		warningDetails: [],
		warningCounts: {
			permission: 339,
			changed: 0,
			metadata: 0,
			read: 0,
			other: 0,
		},
	};

	try {
		const bootstrapURL = await waitForBootstrapURL(process);
		await page.route("**/api/scans", async (route) => {
			await route.fulfill({ json: { scans: [liveScan] } });
		});
		await page.route("**/api/scans/scan-live/updates?*", async (route) => {
			await route.fulfill({ json: { revision: 1, changed: false } });
		});
		await page.route("**/api/scans/scan-live/nodes/0", async (route) => {
			rootFetches += 1;
			await route.fulfill({
				json: {
					id: 0,
					parentId: null,
					name: "Archive",
					path: "/Volumes/Archive",
					kind: "directory",
					flags: {
						warning: true,
						filesystemBoundary: false,
						allocatedSizeKnown: true,
						subtreeComplete: false,
					},
					logicalSize: 40_000 + rootFetches * 1_000,
					allocatedSize: 42_000 + rootFetches * 1_000,
					fileCount: 520_481,
					directoryCount: 149_001,
					childCount: 1,
				},
			});
		});
		await page.route(
			"**/api/scans/scan-live/nodes/0/children?*",
			async (route) => {
				await route.fulfill({
					json: {
						nodes: [
							{
								id: 1,
								parentId: 0,
								name: "Users",
								path: "/Volumes/Archive/Users",
								kind: "directory",
								flags: {
									warning: false,
									filesystemBoundary: false,
									allocatedSizeKnown: true,
									subtreeComplete: false,
								},
								logicalSize: 40_000,
								allocatedSize: 42_000,
								fileCount: 520_481,
								directoryCount: 149_000,
								childCount: 0,
							},
						],
						nextAfter: null,
						more: false,
					},
				});
			},
		);

		await page.setViewportSize({ width: 1440, height: 900 });
		await page.emulateMedia({ colorScheme: "dark" });
		await page.goto(bootstrapURL, { waitUntil: "domcontentloaded" });
		const headerContext = page.locator(".app-header__context--active");
		await expect(headerContext).toBeVisible();
		await expect(headerContext).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
		await expect(page.locator(".scan-activity-badge")).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Stop scan" })).toBeVisible();
		await expect(page.getByRole("status")).toContainText(
			"Scanning. The chart updates as files are measured.",
		);
		const pulse = page.locator(".radial-centre__scan-pulse");
		await expect(pulse).toBeVisible();
		await expect(page.locator(".radial-centre__scan-label")).toHaveText(
			"Scanning",
		);
		const chartValue = page.locator(".radial-centre__value");
		const valueBeforePulseLands = await chartValue.textContent();
		await expect
			.poll(async () => {
				const currentTime =
					(await pulse.evaluate(
						(element) => element.getAnimations()[0]?.currentTime,
					)) ?? 0;
				return currentTime > 220 ? chartValue.textContent() : undefined;
			})
			.toBe(valueBeforePulseLands);
		const headerItemHeights = await Promise.all(
			[".scan-root-context", ".header-coverage"].map(
				async (selector) =>
					(await page.locator(selector).boundingBox())?.height,
			),
		);
		expect(headerItemHeights).toEqual([30, 30]);
		await expect(page.getByRole("button", { name: "Stop scan" })).toHaveCSS(
			"height",
			"38px",
		);
		const [headerBox, rootBox, countersBox, coverageBox] = await Promise.all(
			[
				page.locator(".app-header"),
				page.locator(".scan-root-context"),
				page.locator(".scan-live-counters"),
				page.locator(".header-coverage"),
			].map((locator) => locator.boundingBox()),
		);
		expect(headerBox).not.toBeNull();
		expect(rootBox).not.toBeNull();
		expect(countersBox).not.toBeNull();
		expect(coverageBox).not.toBeNull();
		expect(
			Math.abs(
				(rootBox?.x ?? 0) + (rootBox?.width ?? 0) / 2 -
					((headerBox?.x ?? 0) + (headerBox?.width ?? 0) / 2),
			),
		).toBeLessThan(1);
		expect((countersBox?.x ?? 0) + (countersBox?.width ?? 0)).toBeLessThanOrEqual(
			(rootBox?.x ?? 0) + 1,
		);
		expect(coverageBox?.x ?? 0).toBeGreaterThanOrEqual(
			(rootBox?.x ?? 0) + (rootBox?.width ?? 0) - 1,
		);
		await page.screenshot({
			path: resolve(screenshotDir, "scan-live-desktop.png"),
			fullPage: false,
		});
		await expect(pulse).toBeHidden();
		await expect(chartValue).not.toHaveText(valueBeforePulseLands ?? "");

		await page.setViewportSize({ width: 430, height: 860 });
		await expect(headerContext).toBeVisible();
		await expect(page.locator(".radial-centre__scan-label")).toBeVisible();
		await page.screenshot({
			path: resolve(screenshotDir, "scan-live-narrow.png"),
			fullPage: false,
		});
		const valueBeforeReducedMotionUpdate = await chartValue.textContent();
		await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
		await expect(chartValue).not.toHaveText(
			valueBeforeReducedMotionUpdate ?? "",
		);
		await expect(pulse).toBeHidden();
		await expect(page.locator(".radial-centre__scan-label")).toHaveText(
			"Scanning",
		);
	} finally {
		if (process.exitCode === null) {
			process.kill("SIGTERM");
			await waitForExit(process).catch(() => undefined);
		}
		await rm(home, { recursive: true, force: true });
	}
});

test("presents scan errors and bounded warning details in an accessible drawer", async ({
	page,
}) => {
	await mkdir(screenshotDir, { recursive: true });
	const home = await mkdtemp(join(tmpdir(), "diskorbit-issues-home-"));
	const process = spawn(executable, ["--debug"], {
		cwd: projectRoot,
		env: isolatedProcessEnv(home),
		stdio: ["ignore", "pipe", "pipe"],
	});

	try {
		const bootstrapURL = await waitForBootstrapURL(process);
		await page.route("**/api/scans", async (route) => {
			await route.fulfill({
				json: {
					scans: [
						{
							id: "scan-issues",
							path: "/Volumes/Archive",
							state: "failed",
							revision: 4,
							progress: {
								files: 63,
								directories: 5,
								bytes: 4096,
								warnings: 3,
								nodes: 68,
								elapsedMs: 830,
							},
							warningDetails: [
								{
									kind: "permission",
									path: "/Volumes/Archive/private/tiny-001.bin",
									operation: "read_directory",
									message: "permission denied",
								},
								{
									kind: "changed",
									path: "/Volumes/Archive/missing.bin",
									operation: "stat",
									message: "file disappeared",
								},
							],
							warningCounts: {
								permission: 2,
								changed: 1,
								metadata: 0,
								read: 0,
								other: 0,
							},
							capacity: { total: 16_000, available: 4_000 },
							error:
								"The selected volume became unavailable before the scan completed.",
						},
					],
				},
			});
		});
		await page.route("**/api/scans/scan-issues/updates?*", async (route) => {
			await route.fulfill({ json: { revision: 4, changed: false } });
		});
		await page.route(
			"**/api/scans/scan-issues/nodes/0/children?*",
			async (route) => {
				await route.fulfill({
					json: {
						nodes: [
							{
								id: 1,
								parentId: 0,
								name: "Archive data",
								path: "/Volumes/Archive/Archive data",
								kind: "directory",
								flags: {
									warning: false,
									filesystemBoundary: false,
									allocatedSizeKnown: true,
									subtreeComplete: true,
								},
								logicalSize: 11_000,
								allocatedSize: 7_000,
								fileCount: 12,
								directoryCount: 4,
								childCount: 0,
							},
							{
								id: 2,
								parentId: 0,
								name: "Private",
								path: "/Volumes/Archive/private",
								kind: "directory",
								flags: {
									warning: false,
									filesystemBoundary: false,
									allocatedSizeKnown: true,
									subtreeComplete: false,
								},
								logicalSize: 1_000,
								allocatedSize: 1_000,
								fileCount: 51,
								directoryCount: 1,
								childCount: 51,
							},
						],
						nextAfter: null,
						more: false,
					},
				});
			},
		);
		await page.route(
			"**/api/scans/scan-issues/nodes/2/children?*",
			async (route) => {
				await route.fulfill({
					json: {
						nodes: Array.from({ length: 51 }, (_, index) => ({
							id: index + 3,
							parentId: 2,
							name:
								index === 0
									? "visible.bin"
									: `tiny-${String(index).padStart(3, "0")}.bin`,
							path:
								index === 0
									? "/Volumes/Archive/private/visible.bin"
									: `/Volumes/Archive/private/tiny-${String(index).padStart(3, "0")}.bin`,
							kind: "file",
							flags: {
								warning: index === 1,
								filesystemBoundary: false,
								allocatedSizeKnown: true,
								subtreeComplete: index !== 1,
							},
							logicalSize: index === 0 ? 10 : 0,
							allocatedSize: index === 0 ? 10 : 0,
							fileCount: 1,
							directoryCount: 0,
							childCount: 0,
						})),
						nextAfter: null,
						more: false,
					},
				});
			},
		);
		await page.route("**/api/scans/scan-issues/nodes/2", async (route) => {
			await route.fulfill({
				json: {
					id: 2,
					parentId: 0,
					name: "Private",
					path: "/Volumes/Archive/private",
					kind: "directory",
					flags: {
						warning: false,
						filesystemBoundary: false,
						allocatedSizeKnown: true,
						subtreeComplete: false,
					},
					logicalSize: 1_000,
					allocatedSize: 1_000,
					fileCount: 51,
					directoryCount: 1,
					childCount: 51,
				},
			});
		});
		await page.route("**/api/scans/scan-issues/nodes/0", async (route) => {
			await route.fulfill({
				json: {
					id: 0,
					parentId: null,
					name: "Archive",
					path: "/Volumes/Archive",
					kind: "directory",
					flags: {
						warning: true,
						filesystemBoundary: false,
						allocatedSizeKnown: true,
						subtreeComplete: false,
					},
					logicalSize: 12_000,
					allocatedSize: 8_000,
					fileCount: 63,
					directoryCount: 5,
					childCount: 2,
				},
			});
		});
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(bootstrapURL, { waitUntil: "domcontentloaded" });

		const freeSpace = page.getByRole("checkbox", {
			name: "Show free space in chart",
		});
		await expect(
			page.getByRole("combobox", { name: "Size metric" }),
		).toHaveValue("allocated");
		await expect(freeSpace).toBeEnabled();
		await page
			.getByRole("combobox", { name: "Size metric" })
			.selectOption("logical");
		await expect(freeSpace).toBeDisabled();
		await page
			.getByRole("combobox", { name: "Size metric" })
			.selectOption("allocated");
		await expect(freeSpace).toBeEnabled();
		await freeSpace.check();
		const freeSegment = page.getByRole("img", {
			name: /Free space, 4 kB, 25% of volume/,
		});
		await expect(freeSegment).toBeVisible();
		await freeSegment.focus();
		await expect(page.locator(".chart-detail")).toContainText("Free space");
		await expect(page.locator(".chart-detail")).toContainText("25%");
		await expect(
			page.getByRole("img", {
				name: /Unaccounted used space, 4 kB, 25% of volume/,
			}),
		).toBeVisible();
		await expect(
			page.getByText("Limited access", { exact: true }),
		).toBeVisible();
		await expect(page.locator(".coverage-frontier")).toHaveCount(1);
		await page.screenshot({
			path: resolve(screenshotDir, "scan-free-space-desktop.png"),
			fullPage: true,
		});

		await page.locator('.radial-segment[aria-label^="Private,"]').click();
		await expect(page.locator(".radial-centre__label")).toHaveText("Private");
		await expect(page.locator(".coverage-frontier--root")).toHaveCount(1);
		await expect(page.locator(".coverage-frontier")).toHaveCount(1);
		await expect(page.locator(".detail-metric--incomplete")).toBeVisible();
		await expect(page.locator(".chart-warning")).toHaveCSS(
			"margin-top",
			"18px",
		);
		await page.locator(".visual-panel").screenshot({
			path: resolve(screenshotDir, "scan-coverage-root-desktop.png"),
		});
		await page.getByRole("button", { name: "Go up to Archive" }).click();
		await expect(freeSpace).toBeVisible();

		const trigger = page.locator(".header-coverage");
		await expect(trigger).toBeVisible();
		await expect(trigger).toHaveAccessibleName(
			/Show failed scan coverage, \d+ issues/,
		);
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
		await trigger.click();
		const drawer = page.getByRole("dialog", { name: "Scan coverage" });
		await expect(drawer).toBeVisible();
		await expect(trigger).toHaveAttribute("aria-expanded", "true");
		await expect(drawer).toContainText(
			"The selected volume became unavailable",
		);
		await expect(drawer).toContainText("Protected locations");
		await expect(drawer).toContainText("Changed during the scan");
		await expect(trigger).toBeFocused();
		await page.screenshot({
			path: resolve(screenshotDir, "scan-issues-desktop.png"),
			fullPage: false,
		});

		await trigger.click();
		await expect(drawer).toBeHidden();
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
		await trigger.click();
		await page.mouse.click(100, 300);
		await expect(drawer).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(drawer).toBeHidden();
		await expect(trigger).toBeFocused();

		await page.setViewportSize({ width: 430, height: 420 });
		await trigger.click();
		await expect(drawer).toHaveAttribute("aria-modal", "true");
		await expect(
			page.getByRole("button", { name: "Close scan coverage" }),
		).toBeFocused();
		for (const summary of await drawer.locator("details summary").all()) {
			await summary.click();
		}
		const drawerBody = drawer.locator(".scan-issues__body");
		await expect
			.poll(() =>
				drawerBody.evaluate(
					(element) => element.scrollHeight > element.clientHeight,
				),
			)
			.toBe(true);
		await drawerBody.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
		});
		await expect
			.poll(() => drawerBody.evaluate((element) => element.scrollTop))
			.toBeGreaterThan(0);
		await page.setViewportSize({ width: 430, height: 860 });
		await page.screenshot({
			path: resolve(screenshotDir, "scan-issues-narrow.png"),
			fullPage: false,
		});
		await page.getByRole("button", { name: "Close scan coverage" }).click();
		await page.evaluate(() => window.scrollTo(0, 0));
		await expect(freeSpace).toBeVisible();
		await page.screenshot({
			path: resolve(screenshotDir, "scan-free-space-narrow.png"),
			fullPage: false,
		});

		const exit = waitForExit(process);
		await page
			.getByRole("button", { name: "Quit" })
			.click()
			.catch((error) => {
				if (!page.isClosed()) throw error;
			});
		await expect(exit).resolves.toMatchObject({ code: 0 });
	} finally {
		if (process.exitCode === null) {
			process.kill("SIGTERM");
			await waitForExit(process).catch(() => undefined);
		}
		await rm(home, { recursive: true, force: true });
	}
});

test("paginates a directory without loading every child into the browser", async ({
	page,
}) => {
	const fixture = await mkdtemp(join(tmpdir(), "diskorbit-pages-"));
	await Promise.all(
		Array.from({ length: 502 }, (_, index) =>
			writeFile(
				join(fixture, `entry-${String(index).padStart(3, "0")}.bin`),
				index < 12 ? Buffer.alloc(10_000) : "x",
			),
		),
	);
	const process = spawn(executable, ["--debug"], {
		cwd: projectRoot,
		env: isolatedProcessEnv(fixture),
		stdio: ["ignore", "pipe", "pipe"],
	});

	try {
		const bootstrapURL = await waitForBootstrapURL(process);
		await page.goto(bootstrapURL, { waitUntil: "domcontentloaded" });
		await page.getByRole("button", { name: /Choose another folder/ }).click();
		const folderDialog = page.getByRole("dialog", {
			name: "Choose a folder to scan",
		});
		await folderDialog.getByRole("textbox", { name: "Location" }).fill(fixture);
		await folderDialog
			.getByRole("textbox", { name: "Location" })
			.press("Enter");
		await expect(
			folderDialog.locator(".folder-picker__footer strong"),
		).toHaveText(fixture);
		await folderDialog
			.getByRole("button", { name: "Scan this folder" })
			.click();
		await expect(page.getByText("Scan complete")).toHaveCount(0);
		await expect(page.locator(".scan-root-context")).toBeVisible();
		await page.getByRole("tab", { name: "Contents" }).click();
		await expect(page.locator(".directory-panel .panel-heading")).toContainText(
			"500 shown · more available",
		);
		await page.getByRole("tab", { name: "Chart" }).click();
		await page
			.locator(".visual-panel")
			.screenshot({ path: resolve(screenshotDir, "scan-spiky.png") });
		await page.getByRole("tab", { name: "Contents" }).click();

		const pages = page.getByRole("navigation", { name: "Directory pages" });
		await pages.getByRole("button", { name: "Next" }).click();
		await expect(pages).toContainText("Page 2");
		await expect(page.locator(".directory-panel .panel-heading")).toContainText(
			"2 shown",
		);
		await expect(pages.getByRole("button", { name: "Next" })).toBeDisabled();
		await pages.getByRole("button", { name: "Previous" }).click();
		await expect(pages).toContainText("Page 1");

		const exit = waitForExit(process);
		await page
			.getByRole("button", { name: "Quit" })
			.click()
			.catch((error) => {
				if (!page.isClosed()) throw error;
			});
		await expect(exit).resolves.toMatchObject({ code: 0 });
	} finally {
		if (process.exitCode === null) {
			process.kill("SIGTERM");
			await waitForExit(process).catch(() => undefined);
		}
		await rm(fixture, { recursive: true, force: true });
	}
});

function waitForBootstrapURL(child) {
	return new Promise((resolveURL, reject) => {
		let stderr = "";
		const timeout = setTimeout(
			() => reject(new Error("DiskOrbit did not provide a manual browser URL")),
			10_000,
		);

		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
			const match = stderr.match(
				/Open this URL within two minutes: (http:\/\/[^\s]+)/,
			);
			if (match?.[1]) {
				clearTimeout(timeout);
				resolveURL(match[1]);
			}
		});
		child.once("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.once("exit", (code) => {
			clearTimeout(timeout);
			reject(
				new Error(
					`DiskOrbit exited before browser bootstrap (code ${String(code)})`,
				),
			);
		});
	});
}

function isolatedProcessEnv(home) {
	return {
		...globalThis.process.env,
		HOME: home,
		XDG_CONFIG_HOME: join(home, ".config"),
		PATH: "/nonexistent",
	};
}

async function expectViewportBoundScanWorkspace(page, viewport) {
	await page.setViewportSize(viewport);
	await page.evaluate(() =>
		window.scrollTo(0, document.documentElement.scrollHeight),
	);
	const layout = await page.evaluate(() => {
		const shell = document.querySelector(".app-shell--scan");
		const workspace = document.querySelector(".workspace--scan");
		if (
			!(shell instanceof HTMLElement) ||
			!(workspace instanceof HTMLElement)
		) {
			return undefined;
		}
		const shellBox = shell.getBoundingClientRect();
		const workspaceBox = workspace.getBoundingClientRect();
		return {
			documentHeight: document.documentElement.scrollHeight,
			viewportHeight: document.documentElement.clientHeight,
			scrollY: window.scrollY,
			shellTop: shellBox.top,
			shellBottom: shellBox.bottom,
			workspaceTop: workspaceBox.top,
			workspaceBottom: workspaceBox.bottom,
		};
	});
	expect(layout).toBeDefined();
	expect(layout?.documentHeight).toBe(layout?.viewportHeight);
	expect(layout?.scrollY).toBe(0);
	expect(layout?.shellTop).toBe(0);
	expect(layout?.shellBottom).toBe(viewport.height);
	expect(layout?.workspaceTop).toBeGreaterThan(0);
	expect(layout?.workspaceBottom).toBe(viewport.height);
}

function waitForExit(child) {
	if (child.exitCode !== null) {
		return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
	}
	return new Promise((resolveExit, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("DiskOrbit did not exit")),
			15_000,
		);
		child.once("exit", (code, signal) => {
			clearTimeout(timeout);
			resolveExit({ code, signal });
		});
		child.once("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
	});
}
