import type { ColourMode } from "../api/settings";

export const colourModeOptions: ReadonlyArray<{
	value: ColourMode;
	label: string;
}> = [
	{ value: "single", label: "Single Colour" },
	{ value: "rainbow", label: "Rainbow Wash" },
	{ value: "branch", label: "Folder Branches" },
	{ value: "size", label: "Size Gradient" },
	{ value: "file-type", label: "File Type" },
];
