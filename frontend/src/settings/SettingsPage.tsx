import {
	useEffect,
	useState,
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
} from "react";

import type { Settings } from "../api/settings";
import { formatBytes } from "../scans/format";
import {
	fileCategoryColour,
	fileCategoryLabel,
	fileCategoryOrder,
} from "../visualization/fileTypes";
import { colourModeOptions } from "./colourModes";

interface SettingsPageProps {
	settings: Settings;
	defaults: Settings;
	loading: boolean;
	saving: boolean;
	error?: string;
	onSave(settings: Settings): Promise<boolean>;
	onCancel(): void;
	onRetry(): void;
}

type SettingsTab =
	| "appearance"
	| "colour"
	| "structure"
	| "resolution"
	| "files";

const settingsTabs: { id: SettingsTab; label: string; description: string }[] =
	[
		{
			id: "appearance",
			label: "Appearance",
			description: "Theme and measurement",
		},
		{ id: "colour", label: "Colour", description: "Chart colour encoding" },
		{ id: "structure", label: "Structure", description: "Rings and expansion" },
		{
			id: "resolution",
			label: "Resolution",
			description: "Segments and geometry",
		},
		{ id: "files", label: "Files", description: "Large-file visibility" },
	];

export function SettingsPage({
	settings,
	defaults,
	loading,
	saving,
	error,
	onSave,
	onCancel,
	onRetry,
}: SettingsPageProps) {
	const [draft, setDraft] = useState(settings);
	const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");

	useEffect(() => setDraft(settings), [settings]);

	async function submit(event: FormEvent) {
		event.preventDefault();
		await onSave(draft);
	}

	const chart = draft.chart;
	const updateChart = (change: Partial<Settings["chart"]>) => {
		setDraft((current) => ({
			...current,
			chart: { ...current.chart, ...change },
		}));
	};

	function navigateTabs(
		event: KeyboardEvent<HTMLButtonElement>,
		index: number,
	) {
		let nextIndex: number | undefined;
		if (event.key === "ArrowDown" || event.key === "ArrowRight")
			nextIndex = (index + 1) % settingsTabs.length;
		else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
			nextIndex = (index - 1 + settingsTabs.length) % settingsTabs.length;
		else if (event.key === "Home") nextIndex = 0;
		else if (event.key === "End") nextIndex = settingsTabs.length - 1;
		if (nextIndex === undefined) return;
		event.preventDefault();
		const next = settingsTabs[nextIndex];
		if (!next) return;
		setActiveTab(next.id);
		document.getElementById(`settings-tab-${next.id}`)?.focus();
	}

	return (
		<section className="settings-page" aria-labelledby="settings-title">
			<div className="settings-page__heading">
				<div>
					<p className="eyebrow">Preferences</p>
					<h1 id="settings-title">Settings</h1>
					<p className="settings-page__intro">
						Choose how DiskOrbit looks and how much detail it loads into the
						radial chart.
					</p>
				</div>
				<aside
					className="settings-page__summary"
					aria-label="Current chart workload"
				>
					<span>Current chart ceiling</span>
					<strong>
						{chart.maximumDepth} rings · {chart.nodeBudget.toLocaleString()}{" "}
						items
					</strong>
					<small>
						Limits are shared across the chart, not applied to every ring.
					</small>
				</aside>
			</div>

			{error ? (
				<div className="notice notice--error settings-notice" role="alert">
					<span>{error}</span>
					<button
						className="button button--quiet"
						type="button"
						onClick={onRetry}
					>
						Retry
					</button>
				</div>
			) : null}

			<form className="settings-form" onSubmit={submit}>
				<div className="settings-form__body">
					<nav className="settings-tabs" aria-label="Settings categories">
						<div role="tablist" aria-orientation="vertical">
							{settingsTabs.map((tab, index) => (
								<button
									key={tab.id}
									id={`settings-tab-${tab.id}`}
									type="button"
									role="tab"
									aria-selected={activeTab === tab.id}
									aria-controls={`settings-panel-${tab.id}`}
									tabIndex={activeTab === tab.id ? 0 : -1}
									onClick={() => setActiveTab(tab.id)}
									onKeyDown={(event) => navigateTabs(event, index)}
								>
									<span>{String(index + 1).padStart(2, "0")}</span>
									<strong>{tab.label}</strong>
									<small>{tab.description}</small>
								</button>
							))}
						</div>
					</nav>
					<div className="settings-panels">
						<SettingsSection
							active={activeTab === "appearance"}
							id="appearance"
							eyebrow="Appearance"
							title="Look and measurement"
							description="These choices become the starting point each time DiskOrbit opens."
						>
							<SettingsField
								label="Theme"
								description="Follow your computer automatically, or always use a light or dark interface."
							>
								<select
									aria-label="Theme"
									value={draft.theme}
									onChange={(event) => {
										setDraft({
											...draft,
											theme: event.target.value as Settings["theme"],
										});
									}}
								>
									<option value="system">Use system setting</option>
									<option value="light">Always light</option>
									<option value="dark">Always dark</option>
								</select>
							</SettingsField>
							<SettingsField
								label="Default size measurement"
								description="Allocated size is space reserved on disk. Logical size is the file content length and can differ for sparse or compressed files."
							>
								<select
									aria-label="Default size measurement"
									value={draft.defaultMetric}
									onChange={(event) => {
										setDraft({
											...draft,
											defaultMetric: event.target
												.value as Settings["defaultMetric"],
										});
									}}
								>
									<option value="allocated">Allocated size</option>
									<option value="logical">Logical size</option>
								</select>
							</SettingsField>
							<ToggleField
								label="Show free space when available"
								description="For a whole volume in Allocated size mode, include free capacity and any host-reported used space the scan could not account for. This has no effect for folders or unknown capacities."
								checked={chart.showFreeSpace}
								onChange={(showFreeSpace) => updateChart({ showFreeSpace })}
							/>
						</SettingsSection>

						<SettingsSection
							active={activeTab === "colour"}
							id="colour"
							eyebrow="Colour"
							title="Chart colour encoding"
							description="Colour can identify directory branches, relative size, position, or broad file types—not just decorate the chart."
						>
							<SettingsField
								label="Colour method"
								description="Folder Branches keeps each directory's colour stable as you focus deeper and gives its children related hues. The other methods encode a specific visual property."
							>
								<select
									aria-label="Chart colour method"
									value={chart.colourMode}
									onChange={(event) =>
										updateChart({
											colourMode: event.target
												.value as Settings["chart"]["colourMode"],
										})
									}
								>
									{colourModeOptions.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</SettingsField>
							{chart.colourMode === "single" || chart.colourMode === "size" ? (
								<SettingsField
									label={
										chart.colourMode === "size"
											? "Large-segment colour"
											: "Base colour"
									}
									description={
										chart.colourMode === "size"
											? "Larger slices move towards this colour."
											: "All complete segments use lighter and darker shades of this colour."
									}
								>
									<input
										className="colour-input"
										type="color"
										aria-label={
											chart.colourMode === "size"
												? "Large-segment colour"
												: "Base chart colour"
										}
										value={
											chart.colourMode === "size"
												? chart.sizeLargeColour
												: chart.singleColour
										}
										onChange={(event) =>
											updateChart(
												chart.colourMode === "size"
													? { sizeLargeColour: event.target.value }
													: { singleColour: event.target.value },
											)
										}
									/>
								</SettingsField>
							) : null}
							{chart.colourMode === "size" ? (
								<SettingsField
									label="Small-segment colour"
									description="Smaller slices move towards this colour; the blend is based on each slice's share of its parent."
								>
									<input
										className="colour-input"
										type="color"
										aria-label="Small-segment colour"
										value={chart.sizeSmallColour}
										onChange={(event) =>
											updateChart({ sizeSmallColour: event.target.value })
										}
									/>
								</SettingsField>
							) : null}
							{chart.colourMode === "file-type" ? (
								<>
									<SettingsField
										label="Folder dominance threshold"
									description="A folder receives a type colour when that group exceeds this share of its measured logical bytes. The complete retained subtree is used even when the chart omits visual detail."
									>
										<select
											aria-label="Folder file-type dominance threshold"
											value={chart.fileTypeDominancePercent}
											onChange={(event) =>
												updateChart({
													fileTypeDominancePercent: Number(event.target.value),
												})
											}
										>
											{[25, 33, 40, 50, 60, 70, 80, 90].map((value) => (
												<option key={value} value={value}>
													{value}% of folder
												</option>
											))}
										</select>
									</SettingsField>
									<aside
										className="file-category-guide"
										aria-label="File type colour groups"
									>
										{fileCategoryOrder.map((category) => (
											<span key={category}>
												<i
													style={{ background: fileCategoryColour(category) }}
													aria-hidden="true"
												/>
												{fileCategoryLabel(category)}
											</span>
										))}
									</aside>
								</>
							) : null}
						</SettingsSection>

						<SettingsSection
							active={activeTab === "structure"}
							id="structure"
							eyebrow="Structure"
							title="Rings and expansion"
							description="These controls decide how deep DiskOrbit looks and how broadly it expands each level."
						>
							<SettingsField
								label="Maximum rings"
								description="The deepest number of directory levels to request. A shallower folder naturally produces fewer rings."
							>
								<select
									aria-label="Maximum rings"
									value={chart.maximumDepth}
									onChange={(event) =>
										updateChart({ maximumDepth: Number(event.target.value) })
									}
								>
									{range(2, 12).map((value) => (
										<option key={value} value={value}>
											{value} rings
										</option>
									))}
								</select>
							</SettingsField>
							<SettingsField
								label="Chart item budget"
								description="A hard ceiling for loaded chart items. Higher values preserve more branches, but use more memory and take longer to lay out."
							>
								<select
									aria-label="Chart item budget"
									value={chart.nodeBudget}
									onChange={(event) =>
										updateChart({ nodeBudget: Number(event.target.value) })
									}
								>
									{[200, 400, 800, 1200, 2000, 3000, 4000].map((value) => (
										<option key={value} value={value}>
											{value.toLocaleString()} items
										</option>
									))}
								</select>
							</SettingsField>
							<SettingsField
								label="Directories expanded per ring"
								description="How many of the largest directories can continue into another ring. Increasing this shows more parallel branches; reducing it favours the largest paths."
							>
								<select
									aria-label="Directories expanded per ring"
									value={chart.expandedDirectoriesPerRing}
									onChange={(event) =>
										updateChart({
											expandedDirectoriesPerRing: Number(event.target.value),
										})
									}
								>
									{[2, 4, 8, 12, 16, 24, 32].map((value) => (
										<option key={value} value={value}>
											{value} directories
										</option>
									))}
								</select>
							</SettingsField>
						</SettingsSection>

						<SettingsSection
							active={activeTab === "resolution"}
							id="resolution"
							eyebrow="Resolution"
							title="Segments and small items"
							description="Tune the balance between recognizable structure and fine detail within each directory."
						>
							<SettingsField
								label="Segments per directory"
								description="The most named slices shown inside one directory. Remaining content is still counted at the parent and follows the omitted-content style below."
							>
								<select
									aria-label="Segments per directory"
									value={chart.segmentsPerDirectory}
									onChange={(event) =>
										updateChart({
											segmentsPerDirectory: Number(event.target.value),
										})
									}
								>
									{[6, 8, 12, 18, 24, 36, 48, 64].map((value) => (
										<option key={value} value={value}>
											{value} segments
										</option>
									))}
								</select>
							</SettingsField>
							<SettingsField
								label="Minimum visible segment width"
								description="Scanned entries narrower than this angle in the complete chart are omitted, including their deeper detail. Set Off to rely only on the other budgets."
							>
								<select
									aria-label="Minimum visible segment width"
									value={chart.minimumArcDegrees}
									onChange={(event) =>
										updateChart({
											minimumArcDegrees: Number(event.target.value),
										})
									}
								>
									<option value="0">Off</option>
									<option value="0.25">Very fine · 0.25°</option>
									<option value="0.5">Fine · 0.5°</option>
									<option value="0.75">Balanced · 0.75°</option>
									<option value="1">Clear · 1°</option>
									<option value="2">Wide · 2°</option>
								</select>
							</SettingsField>
							<SettingsField
								label="Omitted content style"
								description="Choose how omitted detail appears. Spiky gaps stop at the parent ring; an Other segment fills the combined share when it is wide enough to remain visible."
							>
								<select
									aria-label="Omitted content style"
									value={chart.omittedStyle}
									onChange={(event) =>
										updateChart({
											omittedStyle: event.target
												.value as Settings["chart"]["omittedStyle"],
										})
									}
								>
									<option value="gaps">Spiky gaps (recommended)</option>
									<option value="aggregate">Fill with an Other segment</option>
								</select>
							</SettingsField>
							<SettingsField
								label="Segment order"
								description="Largest first emphasizes heavy hitters. Folders first creates a clear boundary before individual files. Name order gives stable alphabetical placement."
							>
								<select
									aria-label="Chart segment order"
									value={chart.segmentOrder}
									onChange={(event) =>
										updateChart({
											segmentOrder: event.target
												.value as Settings["chart"]["segmentOrder"],
										})
									}
								>
									<option value="size">Largest first</option>
									<option value="folders-first">Folders, then files</option>
									<option value="name">Name (A–Z)</option>
								</select>
							</SettingsField>
							<SettingsField
								label="Folder/file group gap"
								description="Adds background-coloured separation before the first visible file group. This applies only when folders are ordered before files."
								disabled={chart.segmentOrder !== "folders-first"}
							>
								<select
									aria-label="Folder and file group gap"
									disabled={chart.segmentOrder !== "folders-first"}
									value={chart.fileGroupGapDegrees}
									onChange={(event) =>
										updateChart({
											fileGroupGapDegrees: Number(event.target.value),
										})
									}
								>
									<option value="0">No extra gap</option>
									<option value="0.4">Subtle · 0.4°</option>
									<option value="0.8">Balanced · 0.8°</option>
									<option value="1.2">Clear · 1.2°</option>
									<option value="2">Wide · 2°</option>
								</select>
							</SettingsField>
							<div className="settings-guidance">
								<strong>How the limits combine</strong>
								<p>
									DiskOrbit reserves room for later rings, expands the largest
									directories first, then applies the per-directory segment and
									minimum-angle limits. With spiky gaps, omitted bytes remain
									represented by the solid parent ring but are intentionally not
									expanded into the next ring.
								</p>
							</div>
						</SettingsSection>

						<SettingsSection
							active={activeTab === "files"}
							id="files"
							eyebrow="Files"
							title="Large-file visibility"
							description="Large files are often the fastest housekeeping wins. Choose whether they appear beside folders in the chart."
						>
							<ToggleField
								label="Show individual files"
								description="When off, file bytes remain counted at the parent but only directory segments are named."
								checked={chart.showFiles}
								onChange={(showFiles) => updateChart({ showFiles })}
							/>
							<SettingsField
								label="File limit method"
								description="Use a count to show the largest few files in every directory, or a size threshold to show every loaded file above that size."
								disabled={!chart.showFiles}
							>
								<select
									aria-label="File limit method"
									disabled={!chart.showFiles}
									value={chart.fileLimitMode}
									onChange={(event) =>
										updateChart({
											fileLimitMode: event.target
												.value as Settings["chart"]["fileLimitMode"],
										})
									}
								>
									<option value="count">Largest files by count</option>
									<option value="size">Files above a size</option>
								</select>
							</SettingsField>
							{chart.fileLimitMode === "count" ? (
								<SettingsField
									label="Files per directory"
									description="The maximum number of individual files that can be named within each directory, before the general segment limit is applied."
									disabled={!chart.showFiles}
								>
									<select
										aria-label="Files per directory"
										disabled={!chart.showFiles}
										value={chart.maximumFilesPerDirectory}
										onChange={(event) =>
											updateChart({
												maximumFilesPerDirectory: Number(event.target.value),
											})
										}
									>
										{[1, 3, 6, 12, 24, 48, 72, 100].map((value) => (
											<option key={value} value={value}>
												{value} files
											</option>
										))}
									</select>
								</SettingsField>
							) : (
								<SettingsField
									label="Minimum individual file size"
									description="Only files at least this large receive their own named segment. Smaller files remain included in Other."
									disabled={!chart.showFiles}
								>
									<select
										aria-label="Minimum individual file size"
										disabled={!chart.showFiles}
										value={chart.minimumFileSizeBytes}
										onChange={(event) =>
											updateChart({
												minimumFileSizeBytes: Number(event.target.value),
											})
										}
									>
										{[
											0,
											1024 ** 2,
											10 * 1024 ** 2,
											100 * 1024 ** 2,
											1024 ** 3,
											10 * 1024 ** 3,
											100 * 1024 ** 3,
										].map((value) => (
											<option key={value} value={value}>
												{value === 0 ? "Any size" : formatBytes(value)}
											</option>
										))}
									</select>
								</SettingsField>
							)}
						</SettingsSection>
					</div>
				</div>

				<div className="settings-actions">
					<p>Save returns to the current workspace.</p>
					<div>
						<button
							className="button button--quiet"
							type="button"
							disabled={saving}
							onClick={() => {
								setDraft(defaults);
							}}
						>
							Restore defaults
						</button>
						<button
							className="button button--quiet"
							type="button"
							disabled={saving}
							onClick={onCancel}
						>
							Cancel
						</button>
						<button
							className="button"
							type="submit"
							disabled={loading || saving}
						>
							{saving ? "Saving…" : "Save settings"}
						</button>
					</div>
				</div>
			</form>
		</section>
	);
}

function SettingsSection({
	active,
	id,
	eyebrow,
	title,
	description,
	children,
}: {
	active: boolean;
	id: SettingsTab;
	eyebrow: string;
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<section
			className="settings-section"
			id={`settings-panel-${id}`}
			role="tabpanel"
			aria-labelledby={`settings-tab-${id}`}
			hidden={!active}
		>
			<header>
				<p className="eyebrow">{eyebrow}</p>
				<h2>{title}</h2>
				<p className="settings-section__description">{description}</p>
			</header>
			<div className="settings-section__fields">{children}</div>
		</section>
	);
}

function SettingsField({
	label,
	description,
	disabled = false,
	children,
}: {
	label: string;
	description: string;
	disabled?: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={`settings-field${disabled ? " settings-field--disabled" : ""}`}
		>
			<span>
				<strong>{label}</strong>
				<small>{description}</small>
			</span>
			{children}
		</div>
	);
}

function ToggleField({
	label,
	description,
	checked,
	onChange,
}: {
	label: string;
	description: string;
	checked: boolean;
	onChange(value: boolean): void;
}) {
	return (
		<label className="settings-field settings-field--toggle">
			<span>
				<strong>{label}</strong>
				<small>{description}</small>
			</span>
			<input
				type="checkbox"
				role="switch"
				aria-checked={checked}
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
			/>
		</label>
	);
}

function range(start: number, end: number): number[] {
	return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
