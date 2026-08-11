import { useEffect, useRef, useState } from "react";

import { AppControls } from "./components/AppControls";
import { DirectoryTable } from "./components/DirectoryTable";
import { DirectoryTree } from "./components/DirectoryTree";
import { FolderPickerDialog } from "./components/FolderPickerDialog";
import { RadialChart } from "./components/RadialChart";
import { ReportsPanel } from "./components/ReportsPanel";
import { ReviewList } from "./components/ReviewList";
import { ScanActivity } from "./components/ScanActivity";
import { ScanToolbar } from "./components/ScanToolbar";
import {
	WorkspaceViews,
	type WorkspaceView,
} from "./components/WorkspaceViews";
import { useSingleserve } from "./lifecycle/useSingleserve";
import { useScanTargets } from "./platform/useScanTargets";
import type { ChartSettings } from "./api/settings";
import type { SizeMetric } from "./scans/metric";
import { useReviewList } from "./scans/useReviewList";
import { useScanWorkspace } from "./scans/useScanWorkspace";
import { SettingsPage } from "./settings/SettingsPage";
import { useSettings } from "./settings/useSettings";
import { useResolvedTheme } from "./settings/theme";
import { useVisualTree } from "./visualization/useVisualTree";

export function App() {
	const lifecycle = useSingleserve();
	const workspace = useScanWorkspace(lifecycle.ready, lifecycle.fetch);
	const settings = useSettings(lifecycle.ready, lifecycle.fetch);
	const [metric, setMetric] = useState<SizeMetric>("allocated");
	const [page, setPage] = useState<"workspace" | "settings">("workspace");
	const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chart");
	const [pickerOpen, setPickerOpen] = useState(false);
	const [reviewExpanded, setReviewExpanded] = useState(false);
	const [chartReviewDragging, setChartReviewDragging] = useState(false);
	const [browseCollapsed, setBrowseCollapsed] = useState(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia("(max-width: 1050px)").matches,
	);
	const pickerTriggerRef = useRef<HTMLButtonElement>(null);
	const appliedInitialMetric = useRef(false);
	const currentSettings = settings.value;
	const theme = useResolvedTheme(currentSettings?.theme ?? "system");
	const visual = useVisualTree(
		lifecycle.fetch,
		workspace.scan,
		workspace.selectedNode?.id ?? 0,
		metric,
		currentSettings?.chart,
	);
	const host = useScanTargets(lifecycle.ready, lifecycle.fetch);
	const terminal =
		lifecycle.state.phase === "stopped" ||
		lifecycle.state.phase === "unavailable";
	const active =
		workspace.scan?.state === "queued" ||
		workspace.scan?.state === "scanning" ||
		workspace.scan?.state === "cancelling";
	const review = useReviewList(
		lifecycle.fetch,
		workspace.scan?.id,
		active,
		workspace.scan?.revision,
	);
	const scanWorkspace = workspace.scan !== undefined && page === "workspace";

	useEffect(() => {
		if (settings.loaded && currentSettings && !appliedInitialMetric.current) {
			appliedInitialMetric.current = true;
			setMetric(currentSettings.defaultMetric);
		}
	}, [currentSettings, settings.loaded]);

	useEffect(() => {
		const previousTitle = document.title;
		if (
			workspace.scan?.state === "scanning" ||
			workspace.scan?.state === "queued"
		) {
			document.title = "Scanning… — DiskOrbit";
		} else if (workspace.scan?.state === "cancelling") {
			document.title = "Stopping scan… — DiskOrbit";
		} else {
			document.title = "DiskOrbit";
		}
		return () => {
			document.title = previousTitle;
		};
	}, [workspace.scan?.state]);

	useEffect(() => {
		setWorkspaceView("chart");
		setReviewExpanded(false);
		setChartReviewDragging(false);
	}, [workspace.scan?.id]);

	useEffect(() => {
		const query = window.matchMedia("(max-width: 1050px)");
		const collapseOnNarrow = (event: MediaQueryListEvent) => {
			if (event.matches) {
				setBrowseCollapsed(true);
				setReviewExpanded(false);
			}
		};
		query.addEventListener("change", collapseOnNarrow);
		return () => query.removeEventListener("change", collapseOnNarrow);
	}, []);

	async function saveChart(change: Partial<ChartSettings>) {
		if (!currentSettings) return;
		await settings.save({
			...currentSettings,
			chart: { ...currentSettings.chart, ...change },
		});
	}

	function closePicker() {
		setPickerOpen(false);
		requestAnimationFrame(() => pickerTriggerRef.current?.focus());
	}

	function addToReview(nodeID: number) {
		setBrowseCollapsed(false);
		setReviewExpanded(true);
		void review.addNode(nodeID);
	}

	return (
		<div
			className={`app-shell${active ? " app-shell--scanning" : ""}${scanWorkspace ? " app-shell--scan" : ""}`}
		>
			<header className={`app-header${active ? " app-header--scanning" : ""}`}>
				<a
					className="brand"
					href="/"
					aria-label="DiskOrbit home"
					aria-disabled={(page === "workspace" && active) || undefined}
					title={
						page === "settings"
							? "Return to DiskOrbit"
							: active
								? "Stop the active scan before starting another"
								: "Go to scan launcher"
					}
					onClick={(event) => {
						event.preventDefault();
						if (page === "settings") setPage("workspace");
						else workspace.returnToLauncher();
					}}
				>
					<img
						className="brand__mark"
						src="/diskorbit.png"
						alt=""
						aria-hidden="true"
					/>
					<span>DiskOrbit</span>
				</a>
				<ScanActivity scan={workspace.scan} />
				<AppControls
					disabled={!lifecycle.ready || terminal || !currentSettings}
					stopping={lifecycle.state.phase === "stopping"}
					scanState={workspace.scan?.state}
					theme={theme}
					settingsActive={page === "settings"}
					settingsDisabled={active}
					onSettings={() =>
						setPage((current) =>
							current === "settings" ? "workspace" : "settings",
						)
					}
					onStop={() => void workspace.cancel()}
					onTheme={(nextTheme) => {
						if (currentSettings)
							void settings.save({ ...currentSettings, theme: nextTheme });
					}}
					onQuit={() => void lifecycle.requestShutdown()}
				/>
			</header>

			<main className={`workspace${scanWorkspace ? " workspace--scan" : ""}`}>
				{page === "settings" && currentSettings && settings.defaults ? (
					<SettingsPage
						settings={currentSettings}
						defaults={settings.defaults}
						loading={settings.loading}
						saving={settings.saving}
						error={settings.error}
						onSave={async (next) => {
							const persisted = await settings.save(next);
							if (!persisted) return false;
							setMetric(persisted.defaultMetric);
							setPage("workspace");
							return true;
						}}
						onCancel={() => setPage("workspace")}
						onRetry={settings.retry}
					/>
				) : (
					<>
						{!currentSettings ? (
							<div
								className={`notice workspace-notice${settings.error ? " notice--error" : ""}`}
								role={settings.error ? "alert" : "status"}
							>
								<span>{settings.error ?? "Loading application settings…"}</span>
								{settings.error ? (
									<button
										className="button button--quiet"
										type="button"
										onClick={settings.retry}
									>
										Retry
									</button>
								) : null}
							</div>
						) : null}
						{!workspace.scan ? (
							<ScanToolbar
								disabled={!lifecycle.ready || terminal || !currentSettings}
								submitting={workspace.submitting}
								targets={host.targets}
								targetsLoading={host.loading}
								targetsError={host.error}
								metric={metric}
								onMetric={setMetric}
								onStart={(path) => void workspace.start(path)}
								onBrowse={() => setPickerOpen(true)}
								browseButtonRef={pickerTriggerRef}
							/>
						) : null}

						{workspace.error ? (
							<div
								className="notice notice--error workspace-notice"
								role="alert"
							>
								<span>{workspace.error}</span>
								<button
									className="button button--quiet"
									type="button"
									onClick={workspace.retry}
								>
									Retry
								</button>
							</div>
						) : null}
						{workspace.scan?.error ? (
							<p className="notice notice--error workspace-notice" role="alert">
								{workspace.scan.error}
							</p>
						) : null}

						{workspace.scan ? (
							<div className="scan-workspace">
								<div className="navigation-layout">
									{visual.tree ? (
										<DirectoryTree
											fetcher={lifecycle.fetch}
											scanID={workspace.scan.id}
											root={workspace.selectionPath[0] ?? visual.tree.node}
											selectionPath={workspace.selectionPath}
											active={active}
											metric={metric}
											selectedNodeID={workspace.selectedNode?.id ?? 0}
											onSelect={workspace.selectNode}
											collapsed={browseCollapsed}
											onCollapsedChange={(collapsed) => {
												setBrowseCollapsed(collapsed);
												if (collapsed) setReviewExpanded(false);
											}}
											onAddToReview={addToReview}
											onReviewDragStart={review.beginDrag}
											footer={
												<ReviewList
													items={review.items}
													pendingCount={review.pendingIDs.length}
													metric={metric}
													live={active}
													expanded={reviewExpanded}
													externalDragActive={chartReviewDragging}
													message={review.message}
													onExpandedChange={(expanded) => {
														if (expanded) setBrowseCollapsed(false);
														setReviewExpanded(expanded);
													}}
													onRemove={review.removeNode}
													onClear={review.clear}
													onSelect={(nodeID) => {
														workspace.selectNode(nodeID);
														setWorkspaceView("chart");
													}}
													onReveal={(nodeID) => void workspace.reveal(nodeID)}
													canAcceptDrop={review.canAcceptDrop}
													onDrop={review.drop}
												/>
											}
										/>
									) : null}
									<div className="navigation-main">
										<WorkspaceViews
											active={workspaceView}
											onChange={setWorkspaceView}
											selectionPath={workspace.selectionPath}
											live={active}
											onSelect={workspace.selectNode}
											chart={
												currentSettings ? (
													<RadialChart
														tree={visual.tree}
														loading={visual.loading}
														error={visual.error}
														visible={workspaceView === "chart"}
														selectionPath={workspace.selectionPath}
														onSelect={workspace.selectNode}
														metric={metric}
														onMetric={setMetric}
														live={active}
														activityLabel={
															workspace.scan.state === "cancelling"
																? "Stopping"
																: workspace.scan.state === "queued"
																	? "Starting"
																	: "Scanning"
														}
														settings={currentSettings.chart}
														onColourMode={(colourMode) =>
															void saveChart({ colourMode })
														}
														onDepth={(maximumDepth) =>
															void saveChart({ maximumDepth })
														}
														onShowFreeSpace={(showFreeSpace) =>
															void saveChart({ showFreeSpace })
														}
														capacity={
															workspace.selectedNode?.id === 0
																? workspace.scan.capacity
																: undefined
														}
														warningCounts={workspace.scan.warningCounts}
														onReveal={(nodeID) => void workspace.reveal(nodeID)}
														onAddToReview={addToReview}
														onReviewDragState={setChartReviewDragging}
														onOpenInsights={(nodeID) => {
															workspace.selectNode(nodeID);
															setWorkspaceView("insights");
														}}
													/>
												) : null
											}
											contents={
												<DirectoryTable
													root={workspace.selectedNode}
													nodes={workspace.children}
													truncated={workspace.childrenTruncated}
													page={workspace.childrenPage}
													canShowPrevious={workspace.canShowPreviousChildren}
													scanning={active}
													onSelect={workspace.selectNode}
													onShowNext={workspace.showNextChildren}
													onShowPrevious={workspace.showPreviousChildren}
													onReveal={(nodeID) => void workspace.reveal(nodeID)}
													onAddToReview={addToReview}
													onReviewDragStart={review.beginDrag}
													metric={metric}
												/>
											}
											insights={
												<ReportsPanel
													fetcher={lifecycle.fetch}
													scanID={workspace.scan.id}
													scanState={workspace.scan.state}
													rootID={workspace.selectedNode?.id ?? 0}
													onReveal={(nodeID) => void workspace.reveal(nodeID)}
													onAddToReview={addToReview}
													onReviewDragStart={review.beginDrag}
												/>
											}
										/>
									</div>
								</div>
							</div>
						) : (
							<EmptyWorkspace loading={workspace.loading} />
						)}
						{pickerOpen ? (
							<FolderPickerDialog
								fetcher={lifecycle.fetch}
								targets={host.targets}
								submitting={workspace.submitting}
								onClose={closePicker}
								onStart={(path) => void workspace.start(path)}
							/>
						) : null}
					</>
				)}

				{lifecycle.state.shutdownError ? (
					<p className="notice notice--error workspace-notice" role="alert">
						{lifecycle.state.shutdownError}
					</p>
				) : null}
				{terminal ? (
					<div className="terminal terminal--overlay" role="alert">
						<strong>
							{lifecycle.state.phase === "stopped"
								? "DiskOrbit has stopped."
								: "Backend connection lost."}
						</strong>
						<span>{lifecycle.state.detail}</span>
						<button
							className="button"
							type="button"
							onClick={() => window.close()}
						>
							Close tab
						</button>
					</div>
				) : null}
			</main>
		</div>
	);
}

function EmptyWorkspace({ loading }: { loading: boolean }) {
	return (
		<section className="empty-workspace" aria-labelledby="empty-title">
			<div className="empty-orbit" aria-hidden="true">
				<span className="empty-orbit__ring empty-orbit__ring--outer" />
				<span className="empty-orbit__ring empty-orbit__ring--middle" />
				<span className="empty-orbit__ring empty-orbit__ring--inner" />
				<span className="empty-orbit__core" />
			</div>
			<div className="empty-workspace__copy">
				<p className="eyebrow">Read-only by design</p>
				<h2 id="empty-title">
					{loading
						? "Checking for an existing scan…"
						: "Pick a place and watch it take shape"}
				</h2>
				<p>
					DiskOrbit measures logical size and available allocated size locally.
					It never uploads, changes, or deletes filesystem data.
				</p>
				<p className="privacy-note">
					Your filesystem data stays on this device.
				</p>
			</div>
		</section>
	);
}
