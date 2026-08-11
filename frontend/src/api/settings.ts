import type { SizeMetric } from "../scans/metric";
import type { AuthenticatedFetch } from "./status";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type FileLimitMode = "count" | "size";
export type ColourMode = "branch" | "single" | "size" | "rainbow" | "file-type";
export type OmittedStyle = "gaps" | "aggregate";
export type SegmentOrder = "size" | "folders-first" | "name";

export interface ChartSettings {
	maximumDepth: number;
	nodeBudget: number;
	segmentsPerDirectory: number;
	expandedDirectoriesPerRing: number;
	minimumArcDegrees: number;
	showFiles: boolean;
	fileLimitMode: FileLimitMode;
	maximumFilesPerDirectory: number;
	minimumFileSizeBytes: number;
	showFreeSpace: boolean;
	colourMode: ColourMode;
	singleColour: string;
	sizeLargeColour: string;
	sizeSmallColour: string;
	fileTypeDominancePercent: number;
	omittedStyle: OmittedStyle;
	segmentOrder: SegmentOrder;
	fileGroupGapDegrees: number;
}

export interface Settings {
	version: 1;
	theme: ThemePreference;
	defaultMetric: SizeMetric;
	chart: ChartSettings;
}

export interface SettingsDocument {
	value: Settings;
	defaults: Settings;
}

export async function fetchSettings(
	fetcher: AuthenticatedFetch,
	signal?: AbortSignal,
): Promise<SettingsDocument> {
	const payload = await requestPayload(fetcher, "/api/settings", { signal });
	if (
		!isRecord(payload) ||
		!isSettings(payload.value) ||
		!isSettings(payload.defaults)
	)
		throw new Error("Settings response was invalid");
	return { value: payload.value, defaults: payload.defaults };
}

export async function saveSettings(
	fetcher: AuthenticatedFetch,
	settings: Settings,
): Promise<Settings> {
	const payload = await requestPayload(fetcher, "/api/settings", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(settings),
	});
	if (!isSettings(payload)) throw new Error("Settings response was invalid");
	return payload;
}

async function requestPayload(
	fetcher: AuthenticatedFetch,
	input: string,
	init?: RequestInit,
): Promise<unknown> {
	const response = await fetcher(input, { cache: "no-store", ...init });
	const payload: unknown = await response.json().catch(() => undefined);
	if (!response.ok) {
		const message =
			isRecord(payload) &&
			isRecord(payload.error) &&
			typeof payload.error.message === "string"
				? payload.error.message
				: `Settings request failed (${response.status})`;
		throw new Error(message);
	}
	return payload;
}

function isSettings(value: unknown): value is Settings {
	if (
		!isRecord(value) ||
		value.version !== 1 ||
		!isTheme(value.theme) ||
		!isMetric(value.defaultMetric) ||
		!isRecord(value.chart)
	)
		return false;
	const chart = value.chart;
	return (
		integerBetween(chart.maximumDepth, 2, 12) &&
		integerBetween(chart.nodeBudget, 200, 4000) &&
		integerBetween(chart.segmentsPerDirectory, 6, 64) &&
		integerBetween(chart.expandedDirectoriesPerRing, 2, 32) &&
		numberBetween(chart.minimumArcDegrees, 0, 5) &&
		typeof chart.showFiles === "boolean" &&
		(chart.fileLimitMode === "count" || chart.fileLimitMode === "size") &&
		integerBetween(chart.maximumFilesPerDirectory, 1, 100) &&
		integerBetween(chart.minimumFileSizeBytes, 0, 2 ** 50) &&
		typeof chart.showFreeSpace === "boolean" &&
		isColourMode(chart.colourMode) &&
		isHexColour(chart.singleColour) &&
		isHexColour(chart.sizeLargeColour) &&
		isHexColour(chart.sizeSmallColour) &&
		integerBetween(chart.fileTypeDominancePercent, 25, 90) &&
		(chart.omittedStyle === "gaps" || chart.omittedStyle === "aggregate") &&
		(chart.segmentOrder === "size" ||
			chart.segmentOrder === "folders-first" ||
			chart.segmentOrder === "name") &&
		numberBetween(chart.fileGroupGapDegrees, 0, 2)
	);
}

function isColourMode(value: unknown): value is ColourMode {
	return (
		value === "branch" ||
		value === "single" ||
		value === "size" ||
		value === "rainbow" ||
		value === "file-type"
	);
}

function isHexColour(value: unknown): value is string {
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function isTheme(value: unknown): value is ThemePreference {
	return value === "system" || value === "light" || value === "dark";
}

function isMetric(value: unknown): value is SizeMetric {
	return value === "logical" || value === "allocated";
}

function integerBetween(
	value: unknown,
	minimum: number,
	maximum: number,
): value is number {
	return (
		Number.isSafeInteger(value) &&
		(value as number) >= minimum &&
		(value as number) <= maximum
	);
}

function numberBetween(
	value: unknown,
	minimum: number,
	maximum: number,
): value is number {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		value >= minimum &&
		value <= maximum
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
