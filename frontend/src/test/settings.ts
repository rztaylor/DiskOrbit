import type { Settings } from "../api/settings";

// settingsFixture is valid test data, not the application's default profile.
// Production defaults are owned exclusively by internal/settings.Defaults.
export const settingsFixture: Settings = {
	version: 1,
	theme: "system",
	defaultMetric: "allocated",
	chart: {
		maximumDepth: 8,
		nodeBudget: 1200,
		segmentsPerDirectory: 24,
		expandedDirectoriesPerRing: 12,
		minimumArcDegrees: 0.75,
		showFiles: true,
		fileLimitMode: "count",
		maximumFilesPerDirectory: 12,
		minimumFileSizeBytes: 100 * 1024 * 1024,
		showFreeSpace: false,
		colourMode: "branch",
		singleColour: "#167d9a",
		sizeLargeColour: "#167d9a",
		sizeSmallColour: "#e87535",
		fileTypeDominancePercent: 60,
		omittedStyle: "gaps",
		segmentOrder: "folders-first",
		fileGroupGapDegrees: 0.8,
	},
};
