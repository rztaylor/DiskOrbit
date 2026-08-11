import {
	arc,
	hierarchy,
	hsl,
	interpolateHsl,
	partition,
	schemeTableau10,
	type HierarchyNode,
	type HierarchyRectangularNode,
} from "d3";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChartSettings, ColourMode } from "../api/settings";
import type { DiskCapacity, ScanNode, WarningCounts } from "../api/scans";
import { formatBytes, formatCount, formatPercent } from "../scans/format";
import { metricLabel, type SizeMetric } from "../scans/metric";
import { colourModeOptions } from "../settings/colourModes";
import {
	fileCategoryColour,
	fileCategoryLabel,
	fileCategoryOrder,
} from "../visualization/fileTypes";
import {
	chartOptionsFromSettings,
	findChartPath,
	toChartDatum,
	type ChartDatum,
	type VisualTreeNode,
	withDiskCapacity,
} from "../visualization/tree";
import {
	maximumVisualDepth,
	minimumVisualDepth,
} from "../visualization/useVisualTree";
import {
	SegmentActionsMenu,
	type SegmentMenuState,
} from "./SegmentActionsMenu";

interface RadialChartProps {
	tree?: VisualTreeNode;
	loading: boolean;
	error?: string;
	visible?: boolean;
	selectionPath: ScanNode[];
	onSelect(nodeID: number): void;
	metric: SizeMetric;
	onMetric(metric: SizeMetric): void;
	live: boolean;
	activityLabel?: "Starting" | "Scanning" | "Stopping";
	settings: ChartSettings;
	onColourMode(colourMode: ColourMode): void;
	onDepth(depth: number): void;
	onShowFreeSpace(show: boolean): void;
	capacity?: DiskCapacity;
	warningCounts?: WarningCounts;
	onReveal(nodeID: number): void;
	onAddToReview(nodeID: number): void;
	onReviewDragState(active: boolean): void;
	onOpenInsights(nodeID: number): void;
}

const size = 620;
const radius = size / 2 - 18;
const centreRadius = 68;
const scanUpdatePulseDurationMs = 420;

export function RadialChart({
	tree,
	loading,
	error,
	visible = true,
	selectionPath,
	onSelect,
	metric,
	onMetric,
	live,
	activityLabel = "Scanning",
	settings,
	onColourMode,
	onDepth,
	onShowFreeSpace,
	capacity,
	warningCounts,
	onReveal,
	onAddToReview,
	onReviewDragState,
	onOpenInsights,
}: RadialChartProps) {
	const [showFreeSpace, setShowFreeSpace] = useState(settings.showFreeSpace);
	const [displayedTree, setDisplayedTree] = useState(tree);
	const displayedTreeRef = useRef(tree);
	const pendingTreeRef = useRef<VisualTreeNode | undefined>(undefined);
	const [scanPulse, setScanPulse] = useState(0);
	const [scanPulseActive, setScanPulseActive] = useState(false);
	const chartOptions = useMemo(
		() => chartOptionsFromSettings(settings),
		[settings],
	);
	const freeSpaceActive =
		showFreeSpace && metric === "allocated" && capacity !== undefined;
	const chartSize = freeSpaceActive ? capacity.total : undefined;
	const baseChartRoot = useMemo(
		() =>
			displayedTree
				? toChartDatum(displayedTree, chartOptions, metric, chartSize)
				: undefined,
		[chartOptions, chartSize, displayedTree, metric],
	);
	const chartRoot = useMemo(
		() =>
			baseChartRoot && freeSpaceActive && capacity
				? withDiskCapacity(baseChartRoot, capacity)
				: baseChartRoot,
		[baseChartRoot, capacity, freeSpaceActive],
	);
	const [hoveredKey, setHoveredKey] = useState<string>();
	const [pinnedKey, setPinnedKey] = useState<string>();
	const [menu, setMenu] = useState<SegmentMenuState>();
	const [menuReturnFocus, setMenuReturnFocus] = useState<
		HTMLElement | SVGElement
	>();
	const reviewDrag = useRef<
		| {
				startX: number;
				startY: number;
				segment: ChartDatum;
				active: boolean;
		  }
		| undefined
	>(undefined);
	const suppressClick = useRef<string | undefined>(undefined);
	const onAddToReviewRef = useRef(onAddToReview);
	const onReviewDragStateRef = useRef(onReviewDragState);
	const [dragPreview, setDragPreview] = useState<{
		name: string;
		x: number;
		y: number;
	}>();
	const chartStageRef = useRef<HTMLDivElement>(null);
	const [chartPixels, setChartPixels] = useState<number>();

	useEffect(
		() => setShowFreeSpace(settings.showFreeSpace),
		[settings.showFreeSpace],
	);

	useEffect(() => {
		if (!tree) {
			displayedTreeRef.current = undefined;
			pendingTreeRef.current = undefined;
			setDisplayedTree(undefined);
			setScanPulseActive(false);
			return;
		}
		const showImmediately =
			!live ||
			!visible ||
			displayedTreeRef.current === undefined ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (showImmediately) {
			displayedTreeRef.current = tree;
			pendingTreeRef.current = undefined;
			setDisplayedTree(tree);
			setScanPulseActive(false);
			return;
		}
		if (displayedTreeRef.current === tree) return;
		pendingTreeRef.current = tree;
		setScanPulse((current) => current + 1);
		setScanPulseActive(true);
	}, [live, tree, visible]);

	function finishScanPulse() {
		const pendingTree = pendingTreeRef.current;
		if (pendingTree) {
			displayedTreeRef.current = pendingTree;
			pendingTreeRef.current = undefined;
			setDisplayedTree(pendingTree);
		}
		setScanPulseActive(false);
	}

	onAddToReviewRef.current = onAddToReview;
	onReviewDragStateRef.current = onReviewDragState;

	useEffect(() => {
		function move(event: MouseEvent) {
			const drag = reviewDrag.current;
			if (!drag) return;
			if (
				!drag.active &&
				Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7
			)
				return;
			if (!drag.active) {
				drag.active = true;
				onReviewDragStateRef.current(true);
			}
			event.preventDefault();
			setDragPreview({
				name: drag.segment.name,
				x: event.clientX,
				y: event.clientY,
			});
		}

		function finish(event: MouseEvent, cancelled = false) {
			const drag = reviewDrag.current;
			if (!drag) return;
			reviewDrag.current = undefined;
			setDragPreview(undefined);
			if (!drag.active) return;
			suppressClick.current = drag.segment.key;
			window.setTimeout(() => {
				if (suppressClick.current === drag.segment.key)
					suppressClick.current = undefined;
			}, 0);
			onReviewDragStateRef.current(false);
			if (cancelled || drag.segment.nodeID === undefined) return;
			const target = document.elementFromPoint(event.clientX, event.clientY);
			if (target instanceof Element && target.closest(".review-list"))
				onAddToReviewRef.current(drag.segment.nodeID);
		}

		const cancel = () => {
			const drag = reviewDrag.current;
			if (!drag) return;
			reviewDrag.current = undefined;
			setDragPreview(undefined);
			if (drag.active) onReviewDragStateRef.current(false);
		};
		document.addEventListener("mousemove", move, { passive: false });
		document.addEventListener("mouseup", finish);
		window.addEventListener("blur", cancel);
		return () => {
			document.removeEventListener("mousemove", move);
			document.removeEventListener("mouseup", finish);
			window.removeEventListener("blur", cancel);
			if (reviewDrag.current?.active) onReviewDragStateRef.current(false);
			reviewDrag.current = undefined;
		};
	}, []);

	useEffect(() => {
		if (!visible) return;
		const stage = chartStageRef.current;
		if (!stage) return;
		const measuredStage: HTMLDivElement = stage;
		function measure() {
			const style = getComputedStyle(measuredStage);
			const width =
				measuredStage.clientWidth -
				Number.parseFloat(style.paddingLeft) -
				Number.parseFloat(style.paddingRight);
			const height =
				measuredStage.clientHeight -
				Number.parseFloat(style.paddingTop) -
				Number.parseFloat(style.paddingBottom);
			const next = Math.max(0, Math.floor(Math.min(width, height)));
			setChartPixels((current) => (current === next ? current : next));
		}
		const observer = new ResizeObserver(measure);
		observer.observe(measuredStage);
		measure();
		return () => observer.disconnect();
	}, [visible]);

	const focused = chartRoot;
	const layout = useMemo(
		() => (focused ? createLayout(focused, settings) : undefined),
		[focused, settings],
	);
	const focusedBranchColour =
		settings.colourMode === "branch" && layout && selectionPath.length > 1
			? branchColour(layout, selectionPath)
			: undefined;
	const hovered =
		hoveredKey && chartRoot
			? findChartPath(chartRoot, hoveredKey)?.at(-1)
			: undefined;
	const pinned =
		pinnedKey && chartRoot
			? findChartPath(chartRoot, pinnedKey)?.at(-1)
			: undefined;
	const detail = hovered ?? pinned ?? focused;
	const parent = selectionPath.at(-2);
	const canNavigateUp = !live && parent !== undefined;
	const hasData =
		(focused?.size ?? 0) > 0 || (freeSpaceActive && (capacity?.total ?? 0) > 0);
	const segments =
		layout
			?.descendants()
			.filter((node) => node.depth > 0 && node.x1 > node.x0) ?? [];
	const coverageFrontiers =
		live || !layout
			? []
			: findCoverageFrontiers(
					layout.descendants().filter((node) => node.x1 > node.x0),
				);
	const coverageFrontierKeys = new Set(
		coverageFrontiers.map((frontier) => frontier.node.data.key),
	);
	const hasCoverageFrontier = coverageFrontiers.length > 0;
	const permissionOnly = Boolean(
		warningCounts &&
			warningCounts.permission > 0 &&
			warningTotal(warningCounts) === warningCounts.permission,
	);
	const limitedAccessMessage = permissionOnly
		? "DiskOrbit does not have permission to read some contents beyond this point."
		: "Some contents beyond this point could not be read.";

	function navigateUp() {
		if (!canNavigateUp || !parent) return;
		onSelect(parent.id);
		setHoveredKey(undefined);
	}

	function openMenu(
		segment: ChartDatum,
		x: number,
		y: number,
		returnFocus?: HTMLElement | SVGElement,
	) {
		setPinnedKey(segment.key);
		setMenuReturnFocus(returnFocus);
		setMenu({ segment, x, y });
	}

	function closeMenu(restoreFocus = true) {
		setMenu(undefined);
		if (restoreFocus) requestAnimationFrame(() => menuReturnFocus?.focus());
	}

	function beginReviewDrag(
		event: React.MouseEvent<SVGPathElement>,
		segment: ChartDatum,
	) {
		if (event.button !== 0 || segment.nodeID === undefined) return;
		event.preventDefault();
		reviewDrag.current = {
			startX: event.clientX,
			startY: event.clientY,
			segment,
			active: false,
		};
	}

	return (
		<section className="visual-panel" aria-labelledby="visual-heading">
			<div className="panel-heading visual-heading">
				<div>
					<p className="eyebrow">Radial usage</p>
					<h2 id="visual-heading">{metricLabel(metric)} by directory</h2>
				</div>
				<div className="visual-tools">
					{live || loading ? (
						<span>
							{live
								? loading
									? "Live scan · updating…"
									: "Live scan"
								: "Updating…"}
						</span>
					) : null}
					<label className="visual-select">
						<span>Size</span>
						<select
							aria-label="Size metric"
							value={metric}
							onChange={(event) => onMetric(event.target.value as SizeMetric)}
						>
							<option value="allocated">Allocated</option>
							<option value="logical">Logical</option>
						</select>
					</label>
					<label className="visual-select">
						<span>Style</span>
						<select
							aria-label="Chart colour style"
							value={settings.colourMode}
							onChange={(event) =>
								onColourMode(event.target.value as ColourMode)
							}
						>
							{colourModeOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
					{capacity ? (
						<label
							className="free-space-toggle"
							title={
								metric === "allocated"
									? "Include host-reported used and available filesystem capacity"
									: "Free space is available in Allocated size mode"
							}
						>
							<input
								type="checkbox"
								aria-label="Show free space in chart"
								checked={freeSpaceActive}
								disabled={metric !== "allocated"}
								onChange={(event) => {
									setShowFreeSpace(event.target.checked);
									onShowFreeSpace(event.target.checked);
								}}
							/>
							<span>Free space</span>
						</label>
					) : null}
					<label
						className="visual-select"
						title="Maximum directory levels shown as rings; broad charts may still be constrained by the item budget"
					>
						<span>Max rings</span>
						<select
							aria-label="Maximum chart rings"
							value={settings.maximumDepth}
							onChange={(event) => onDepth(Number(event.target.value))}
						>
							{Array.from(
								{ length: maximumVisualDepth - minimumVisualDepth + 1 },
								(_, index) => minimumVisualDepth + index,
							).map((value) => (
								<option key={value} value={value}>
									{value}
								</option>
							))}
						</select>
					</label>
				</div>
			</div>
			<div className="visual-body">
				<div ref={chartStageRef} className="chart-stage">
					{live ? (
						<span className="visually-hidden" role="status">
							{activityLabel}. The chart updates as files are measured.
						</span>
					) : null}
					{error ? (
						<p className="chart-empty" role="alert">
							{error}
						</p>
					) : null}
					{!error && (!layout || !hasData) ? (
						<p className="chart-empty" role="status">
							{loading
								? "Building the radial view…"
								: metric === "allocated" && focused?.allocatedSize === undefined
									? "Allocated-size measurement is unavailable for this directory."
									: "No file bytes to visualise in this directory."}
						</p>
					) : null}
					{layout && hasData ? (
						<svg
							className="radial-chart"
							viewBox={`0 0 ${size} ${size}`}
							style={
								chartPixels === undefined
									? undefined
									: { width: chartPixels, height: chartPixels }
							}
							role="img"
							aria-label={`${live ? "Live radial" : "Radial"} disk usage for ${focused?.name ?? "scan root"}`}
						>
							{hasCoverageFrontier ? (
								<defs>
									<pattern
										id="coverage-frontier-pattern"
										width="6"
										height="6"
										patternUnits="userSpaceOnUse"
										patternTransform="rotate(35)"
									>
										<rect width="6" height="6" fill="var(--chart-pending)" />
										<path d="M0 0V6" stroke="var(--warn)" strokeWidth="2" />
									</pattern>
								</defs>
							) : null}
							<g transform={`translate(${size / 2},${size / 2})`}>
								{segments.map((node) => {
									const selectable =
										!live &&
										node.data.kind === "directory" &&
										node.data.nodeID !== undefined;
									const capacityKind =
										node.data.kind === "free" ||
										node.data.kind === "unaccounted";
									const focusable = selectable || capacityKind;
									const actionable = node.data.nodeID !== undefined;
									const frontier = coverageFrontierKeys.has(node.data.key);
									const label =
										capacityKind && capacity
											? `${node.data.name}, ${formatBytes(node.data.size)}, ${formatPercent(node.data.size, capacity.total)} of volume`
											: `${node.data.name}, ${formatBytes(node.data.size)}, ${node.data.complete ? "complete" : live ? "scanning" : frontier ? limitedAccessMessage : "partial coverage"}`;
									return (
										// biome-ignore lint/a11y/noStaticElementInteractions: selectable SVG segments receive an explicit button role and keyboard behavior.
										<path
											key={node.data.key}
											className={`radial-segment radial-segment--${node.data.kind}${!node.data.complete && live ? " radial-segment--pending" : ""}${!node.data.complete && !live ? " radial-segment--partial" : ""}`}
											d={segmentArc(node) ?? undefined}
											fill={
												node.data.kind === "free"
													? "var(--chart-free)"
													: node.data.kind === "unaccounted"
														? "var(--chart-unaccounted)"
														: !node.data.complete && live
															? "var(--chart-pending)"
															: segmentColour(node, settings, selectionPath)
											}
											tabIndex={focusable || actionable ? 0 : undefined}
											role={selectable || actionable ? "button" : "img"}
											aria-haspopup={actionable ? "menu" : undefined}
											aria-label={label}
											onMouseDown={(event) => beginReviewDrag(event, node.data)}
											onMouseEnter={() => setHoveredKey(node.data.key)}
											onMouseLeave={() => setHoveredKey(undefined)}
											onFocus={() => setHoveredKey(node.data.key)}
											onBlur={() => setHoveredKey(undefined)}
											onClick={() => {
												if (suppressClick.current === node.data.key) {
													suppressClick.current = undefined;
													return;
												}
												if (selectable && node.data.nodeID !== undefined) {
													onSelect(node.data.nodeID);
													setHoveredKey(undefined);
												} else if (actionable) setPinnedKey(node.data.key);
											}}
											onContextMenu={(event) => {
												if (!actionable) return;
												event.preventDefault();
												openMenu(
													node.data,
													event.clientX,
													event.clientY,
													event.currentTarget,
												);
											}}
											onKeyDown={(event) => {
												if (
													actionable &&
													(event.key === "ContextMenu" ||
														(event.shiftKey && event.key === "F10"))
												) {
													event.preventDefault();
													const bounds =
														event.currentTarget.getBoundingClientRect();
													openMenu(
														node.data,
														bounds.left + bounds.width / 2,
														bounds.top + bounds.height / 2,
														event.currentTarget,
													);
													return;
												}
												if (
													(selectable || actionable) &&
													(event.key === "Enter" || event.key === " ")
												) {
													event.preventDefault();
													if (selectable && node.data.nodeID !== undefined)
														onSelect(node.data.nodeID);
													else setPinnedKey(node.data.key);
													setHoveredKey(undefined);
												}
											}}
										>
											<title>{label.replaceAll(", ", " · ")}</title>
										</path>
									);
								})}
								{coverageFrontiers.map((frontier) => (
									<path
										key={frontier.key}
										className={`coverage-frontier${frontier.node.depth === 0 ? " coverage-frontier--root" : ""}`}
										d={coverageFrontierArc(frontier) ?? undefined}
										fill="url(#coverage-frontier-pattern)"
									/>
								))}
								{/* biome-ignore lint/a11y/noStaticElementInteractions: the SVG centre receives button semantics only when upward navigation is available. */}
								<g
									className={`radial-centre-control${live ? " radial-centre-control--scanning" : canNavigateUp ? " radial-centre-control--active" : ""}`}
									role={canNavigateUp ? "button" : undefined}
									tabIndex={canNavigateUp ? 0 : undefined}
									aria-label={
										canNavigateUp ? `Go up to ${parent.name}` : undefined
									}
									onClick={navigateUp}
									onKeyDown={(event) => {
										if (
											canNavigateUp &&
											(event.key === "Enter" || event.key === " ")
										) {
											event.preventDefault();
											navigateUp();
										}
									}}
								>
									<circle className="radial-centre" r={centreRadius} />
									{focusedBranchColour ? (
										<circle
											className="radial-centre__branch-accent"
											r={centreRadius - 2}
											style={{ stroke: focusedBranchColour }}
										/>
									) : null}
									{scanPulseActive ? (
										<circle
											key={scanPulse}
											className="radial-centre__scan-pulse"
											data-update={scanPulse}
											r={centreRadius}
											style={{
												animationDuration: `${scanUpdatePulseDurationMs}ms`,
											}}
											onAnimationEnd={finishScanPulse}
										/>
									) : null}
									<text
										className={
											live
												? "radial-centre__scan-label"
												: "radial-centre__label"
										}
										textAnchor="middle"
										y="-8"
									>
										{live ? activityLabel : truncate(focused?.name ?? "", 16)}
									</text>
									<text
										className="radial-centre__value"
										textAnchor="middle"
										y="14"
									>
										{formatBytes(focused?.size ?? 0)}
										{!live && focused && !focused.complete ? " measured" : ""}
									</text>
									{canNavigateUp ? (
										<text
											className="radial-centre__action"
											textAnchor="middle"
											y="37"
										>
											Go up
										</text>
									) : null}
								</g>
							</g>
						</svg>
					) : null}
					{live || freeSpaceActive || hasCoverageFrontier ? (
						<div className="scan-colour-key">
							{live ? (
								<>
									<span>
										<i
											className="scan-colour-key__pending"
											aria-hidden="true"
										/>
										Scanning
									</span>
									<span>
										<i
											className="scan-colour-key__complete"
											aria-hidden="true"
										/>
										Complete
									</span>
								</>
							) : null}
							{hasCoverageFrontier ? (
								<span>
									<i className="scan-colour-key__coverage" aria-hidden="true" />
									Limited access
								</span>
							) : null}
							{freeSpaceActive &&
							chartRoot?.children?.some(
								(child) => child.kind === "unaccounted",
							) ? (
								<span>
									<i
										className="scan-colour-key__unaccounted"
										aria-hidden="true"
									/>
									Unaccounted used
								</span>
							) : null}
							{freeSpaceActive ? (
								<span>
									<i className="scan-colour-key__free" aria-hidden="true" />
									Free
								</span>
							) : null}
						</div>
					) : null}
					{settings.colourMode === "file-type" && layout ? (
						<aside className="file-type-key" aria-label="File type colours">
							{fileCategoryOrder.map((category) => {
								const label = fileCategoryLabel(category);
								return (
									<span key={category} title={label}>
										<i
											style={{ background: fileCategoryColour(category) }}
											aria-hidden="true"
										/>
										{label}
									</span>
								);
							})}
						</aside>
					) : null}
				</div>
				<ChartDetail
					detail={detail}
					focused={focused}
					pinned={detail === pinned}
					metric={metric}
					live={live}
					capacity={freeSpaceActive ? capacity : undefined}
					limitedAccessMessage={limitedAccessMessage}
					onActions={(event) => {
						if (!detail) return;
						const bounds = event.currentTarget.getBoundingClientRect();
						openMenu(
							detail,
							bounds.right - 220,
							bounds.bottom + 6,
							event.currentTarget,
						);
					}}
				/>
			</div>
			{menu ? (
				<SegmentActionsMenu
					state={menu}
					live={live}
					onClose={closeMenu}
					onFocus={(nodeID) => {
						onSelect(nodeID);
						setPinnedKey(undefined);
					}}
					onPin={() => setPinnedKey(menu.segment.key)}
					onReveal={onReveal}
					onAddToReview={onAddToReview}
					onOpenInsights={onOpenInsights}
				/>
			) : null}
			{dragPreview ? (
				<div
					className="chart-drag-preview"
					style={{ left: dragPreview.x + 12, top: dragPreview.y + 12 }}
				>
					<strong>{dragPreview.name}</strong>
					<span>Drop in Review list</span>
				</div>
			) : null}
		</section>
	);
}

function ChartDetail({
	detail,
	focused,
	pinned,
	metric,
	live,
	capacity,
	limitedAccessMessage,
	onActions,
}: {
	detail?: ChartDatum;
	focused?: ChartDatum;
	pinned: boolean;
	metric: SizeMetric;
	live: boolean;
	capacity?: DiskCapacity;
	limitedAccessMessage: string;
	onActions(event: React.MouseEvent<HTMLButtonElement>): void;
}) {
	if (!detail)
		return (
			<aside className="chart-detail">
				<p>Hover a segment for details.</p>
			</aside>
		);
	if ((detail.kind === "free" || detail.kind === "unaccounted") && capacity) {
		return (
			<aside className="chart-detail chart-detail--capacity" aria-live="polite">
				<p className="eyebrow">Filesystem capacity</p>
				<h3>{detail.name}</h3>
				<p className="chart-detail__path">{detail.path}</p>
				<div className="detail-hero">
					<span>{detail.kind === "free" ? "Available" : "Unaccounted"}</span>
					<strong>{formatBytes(detail.size)}</strong>
				</div>
				<div className="detail-metrics">
					<DetailMetric
						label="Volume capacity"
						value={formatBytes(capacity.total)}
						tone="size"
					/>
					<DetailMetric
						label="Volume share"
						value={formatPercent(detail.size, capacity.total)}
						tone="share"
					/>
				</div>
			</aside>
		);
	}
	return (
		<aside className="chart-detail" aria-live="polite">
			<div className="chart-detail__heading">
				<div>
					<p className="eyebrow">
						{detail === focused
							? "Center path"
							: pinned
								? "Pinned path"
								: "Preview path"}
					</p>
					<h3>{detail.name}</h3>
				</div>
				{detail.nodeID !== undefined ? (
					<button
						className="detail-actions"
						type="button"
						aria-label={`Actions for ${detail.name}`}
						aria-haspopup="menu"
						onClick={onActions}
					>
						•••
					</button>
				) : null}
			</div>
			<p className="chart-detail__path">
				{detail.path ??
					(detail.kind === "other"
						? "Aggregated smaller or unloaded entries"
						: detail.kind)}
			</p>
			<div className="detail-hero">
				<span>{metricLabel(metric)}</span>
				<strong>
					{formatBytes(
						metric === "allocated"
							? (detail.allocatedSize ?? detail.size)
							: detail.logicalSize,
					)}
				</strong>
			</div>
			<div className="detail-metrics">
				<DetailMetric
					label={metric === "allocated" ? "Logical" : "Allocated"}
					value={
						metric === "allocated"
							? formatBytes(detail.logicalSize)
							: detail.allocatedSize === undefined
								? "—"
								: formatBytes(detail.allocatedSize)
					}
					tone="size"
				/>
				<DetailMetric
					label="Parent share"
					value={
						detail.parentSize === undefined
							? "Root"
							: formatPercent(detail.size, detail.parentSize)
					}
					tone="share"
				/>
				<DetailMetric
					label="Files"
					value={formatCount(detail.fileCount)}
					tone="files"
				/>
				<DetailMetric
					label="Directories"
					value={formatCount(detail.directoryCount)}
					tone="directories"
				/>
				<DetailMetric
					label="Current root"
					value={formatPercent(detail.size, focused?.size ?? 0)}
					tone="root"
				/>
				{detail.omittedSize !== undefined ? (
					<DetailMetric
						label="Not expanded"
						value={formatBytes(detail.omittedSize)}
						tone="omitted"
					/>
				) : null}
				<DetailMetric
					label="Coverage"
					value={
						detail.complete ? "Complete" : live ? "Scanning" : "Incomplete"
					}
					tone="coverage"
					status={
						detail.complete ? "complete" : live ? "scanning" : "incomplete"
					}
				/>
				{detail.fileCategory || detail.dominantCategory ? (
					<DetailMetric
						label={detail.kind === "file" ? "File type" : "Visible file mix"}
						value={fileCategoryLabel(
							detail.fileCategory ?? detail.dominantCategory ?? "other",
						)}
						tone="file-mix"
					/>
				) : null}
			</div>
			{!live && !detail.complete ? (
				<p className="chart-warning">{limitedAccessMessage}</p>
			) : detail.warning ? (
				<p className="chart-warning">Some contents could not be read.</p>
			) : null}
			{!live && detail !== focused && detail.kind === "directory" ? (
				<p className="chart-hint">
					Select the segment to make this directory the visual root.
				</p>
			) : null}
		</aside>
	);
}

type DetailMetricTone =
	| "size"
	| "share"
	| "files"
	| "directories"
	| "root"
	| "coverage"
	| "omitted"
	| "file-mix";

type DetailMetricStatus = "complete" | "scanning" | "incomplete";

function DetailMetric({
	label,
	value,
	tone,
	status,
}: {
	label: string;
	value: string;
	tone: DetailMetricTone;
	status?: DetailMetricStatus;
}) {
	return (
		<div
			className={`detail-metric detail-metric--${tone}${status ? ` detail-metric--${status}` : ""}`}
		>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function createLayout(
	data: ChartDatum,
	settings: ChartSettings,
): HierarchyRectangularNode<ChartDatum> {
	const root = hierarchy(data)
		.sum((item) =>
			item.children?.length
				? (item.layoutRemainder ?? 0)
				: (item.layoutSize ?? item.size),
		)
		.sort(chartOrder(settings));
	const layout = partition<ChartDatum>().size([Math.PI * 2, root.height + 1])(
		root,
	);
	if (
		settings.segmentOrder === "folders-first" &&
		settings.fileGroupGapDegrees > 0
	) {
		const gap = (settings.fileGroupGapDegrees * Math.PI) / 180;
		for (const parent of layout.descendants()) {
			const children = parent.children ?? [];
			const firstFile = children.findIndex(
				(child) => child.data.kind === "file",
			);
			if (
				firstFile > 0 &&
				children
					.slice(0, firstFile)
					.some((child) => child.data.kind === "directory")
			) {
				const file = children[firstFile];
				if (file) file.data.padAngle = Math.max(0.006, gap);
			}
		}
	}
	return layout;
}

function chartOrder(settings: ChartSettings) {
	return (
		left: HierarchyNode<ChartDatum>,
		right: HierarchyNode<ChartDatum>,
	): number => {
		if (settings.segmentOrder === "name")
			return left.data.name.localeCompare(right.data.name);
		if (settings.segmentOrder === "folders-first") {
			const rank = kindRank(left.data.kind) - kindRank(right.data.kind);
			if (rank !== 0) return rank;
		}
		return (
			(right.value ?? 0) - (left.value ?? 0) ||
			left.data.name.localeCompare(right.data.name)
		);
	};
}

function kindRank(kind: ChartDatum["kind"]): number {
	if (kind === "directory") return 0;
	if (kind === "file") return 1;
	return 2;
}

const segmentArc = arc<HierarchyRectangularNode<ChartDatum>>()
	.startAngle((node) => node.x0)
	.endAngle((node) => node.x1)
	.padAngle((node) =>
		Math.min((node.x1 - node.x0) / 3, node.data.padAngle ?? 0.006),
	)
	.padRadius(radius / 2)
	.innerRadius(segmentInnerRadius)
	.outerRadius(segmentOuterRadius);

interface CoverageFrontier {
	key: string;
	node: HierarchyRectangularNode<ChartDatum>;
	x0: number;
	x1: number;
}

const coverageFrontierArc = arc<CoverageFrontier>()
	.startAngle((frontier) => frontier.x0)
	.endAngle((frontier) => frontier.x1)
	.padAngle((frontier) =>
		Math.min(
			(frontier.x1 - frontier.x0) / 3,
			frontier.node.data.padAngle ?? 0.006,
		),
	)
	.padRadius(radius / 2)
	.innerRadius((frontier) =>
		frontier.node.depth === 0
			? centreRadius
			: Math.max(
					segmentInnerRadius(frontier.node),
					segmentOuterRadius(frontier.node) - 6,
				),
	)
	.outerRadius((frontier) =>
		frontier.node.depth === 0
			? centreRadius + 6
			: segmentOuterRadius(frontier.node),
	);

function segmentInnerRadius(
	node: HierarchyRectangularNode<ChartDatum>,
): number {
	return (
		centreRadius + ((node.y0 - 1) / rootHeight(node)) * (radius - centreRadius)
	);
}

function segmentOuterRadius(
	node: HierarchyRectangularNode<ChartDatum>,
): number {
	return (
		centreRadius +
		((node.y1 - 1) / rootHeight(node)) * (radius - centreRadius) -
		1
	);
}

function findCoverageFrontiers(
	nodes: HierarchyRectangularNode<ChartDatum>[],
): CoverageFrontier[] {
	const frontiers: CoverageFrontier[] = [];
	for (const node of nodes) {
		if (
			node.data.complete ||
			(node.data.kind !== "directory" && node.data.kind !== "other")
		) {
			continue;
		}
		const children = (node.children ?? [])
			.filter((child) => child.x1 > child.x0)
			.sort((left, right) => left.x0 - right.x0);
		let cursor = node.x0;
		let index = 0;
		for (const child of children) {
			if (child.x0 > cursor) {
				frontiers.push(coverageFrontier(node, cursor, child.x0, index++));
			}
			cursor = Math.max(cursor, child.x1);
		}
		if (cursor < node.x1) {
			frontiers.push(coverageFrontier(node, cursor, node.x1, index));
		}
	}
	return frontiers;
}

function coverageFrontier(
	node: HierarchyRectangularNode<ChartDatum>,
	x0: number,
	x1: number,
	index: number,
): CoverageFrontier {
	return {
		key: `coverage-${node.data.key}-${index}`,
		node,
		x0,
		x1,
	};
}

function warningTotal(counts: WarningCounts): number {
	return (
		counts.permission +
		counts.changed +
		counts.metadata +
		counts.read +
		counts.other
	);
}

function segmentColour(
	node: HierarchyRectangularNode<ChartDatum>,
	settings: ChartSettings,
	selectionPath: ScanNode[],
): string {
	switch (settings.colourMode) {
		case "single":
			return singleHueColour(node, settings.singleColour);
		case "size":
			return sizeEncodedColour(
				node,
				settings.sizeLargeColour,
				settings.sizeSmallColour,
			);
		case "rainbow":
			return rainbowColour(node);
		case "file-type": {
			const category = node.data.fileCategory ?? node.data.dominantCategory;
			return category
				? fileCategoryColour(category)
				: "var(--chart-uncategorised)";
		}
		default:
			return branchColour(node, selectionPath);
	}
}

function branchColour(
	node: HierarchyRectangularNode<ChartDatum>,
	selectionPath: ScanNode[],
): string {
	const path = [
		...selectionPath.slice(0, -1).map(({ kind, name }) => ({ kind, name })),
		...node
			.ancestors()
			.reverse()
			.map(({ data }) => ({ kind: data.kind, name: data.name })),
	];
	const branch = path[1] ?? path[0];
	const baseHash = branch ? stableHash(branch.name) : 0;
	const colour = hsl(
		schemeTableau10[baseHash % schemeTableau10.length] ?? "#4e79a7",
	);
	let hueShift = 0;
	let lightnessShift = 0;
	let saturationShift = 0;
	for (let index = 2; index < path.length; index += 1) {
		const entry = path[index];
		if (!entry) continue;
		const scale = 0.48 ** (index - 2);
		if (entry.kind === "directory") {
			hueShift += signedHash(`${entry.name}:hue`) * 24 * scale;
			lightnessShift += signedHash(`${entry.name}:lightness`) * 0.08 * scale;
			saturationShift += signedHash(`${entry.name}:saturation`) * 0.045 * scale;
		} else if (index === path.length - 1) {
			lightnessShift += signedHash(`${entry.name}:leaf`) * 0.055;
		}
	}
	colour.h =
		((Number.isNaN(colour.h) ? 210 : colour.h) +
			Math.max(-36, Math.min(36, hueShift)) +
			360) %
		360;
	colour.l = Math.max(0.32, Math.min(0.72, colour.l + lightnessShift));
	colour.s = Math.max(0.48, Math.min(0.76, colour.s + saturationShift));
	return colour.formatHex();
}

function stableHash(value: string): number {
	return [...value].reduce(
		(value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
		0,
	);
}

function signedHash(value: string): number {
	return ((stableHash(value) & 0xffff) / 0xffff) * 2 - 1;
}

function singleHueColour(
	node: HierarchyRectangularNode<ChartDatum>,
	base: string,
): string {
	const colour = hsl(base);
	const shadeLightness = [0.28, 0.6, 0.36, 0.74, 0.32, 0.52, 0.44, 0.67];
	const siblingIndex = Math.max(0, node.parent?.children?.indexOf(node) ?? 0);
	const depth = Math.min(5, Math.max(0, node.depth - 1));
	const shade =
		shadeLightness[(siblingIndex + depth * 3) % shadeLightness.length] ??
		colour.l;
	const baseShift = Math.max(-0.08, Math.min(0.08, (colour.l - 0.5) * 0.3));
	const share = Math.max(
		0,
		Math.min(
			1,
			node.data.parentSize ? node.data.size / node.data.parentSize : 1,
		),
	);
	colour.l = Math.min(
		0.8,
		Math.max(
			0.28,
			shade + baseShift + depth * 0.008 + (1 - Math.sqrt(share)) * 0.03,
		),
	);
	colour.s = Math.max(0.46, colour.s - depth * 0.012);
	return colour.formatHex();
}

function sizeEncodedColour(
	node: HierarchyRectangularNode<ChartDatum>,
	large: string,
	small: string,
): string {
	const share = Math.max(
		0,
		Math.min(
			1,
			node.data.parentSize ? node.data.size / node.data.parentSize : 1,
		),
	);
	const colour = hsl(interpolateHsl(small, large)(Math.sqrt(share)));
	colour.l = Math.min(0.76, colour.l + Math.min(4, node.depth - 1) * 0.025);
	return colour.formatHex();
}

function rainbowColour(node: HierarchyRectangularNode<ChartDatum>): string {
	const angle = (node.x0 + node.x1) / 2 / (Math.PI * 2);
	return hsl(
		(angle * 330 + 15) % 360,
		0.62,
		Math.min(0.72, 0.46 + Math.min(5, node.depth - 1) * 0.045),
	).formatHex();
}

function rootHeight(node: HierarchyRectangularNode<ChartDatum>): number {
	return Math.max(1, node.ancestors().at(-1)?.height ?? 1);
}

function truncate(value: string, maximum: number): string {
	return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}
