import { useRef, useState, type PointerEvent } from "react";

import { formatBytes, formatCount } from "../scans/format";
import { metricLabel, nodeSize, type SizeMetric } from "../scans/metric";
import type { ReviewItem } from "../scans/useReviewList";
import { ItemActionIcon } from "./ItemActionIcon";

interface ReviewListProps {
	items: ReviewItem[];
	pendingCount: number;
	metric: SizeMetric;
	live: boolean;
	expanded: boolean;
	externalDragActive: boolean;
	message?: string;
	onExpandedChange(expanded: boolean): void;
	onRemove(nodeID: number): void;
	onClear(): void;
	onSelect(nodeID: number): void;
	onReveal(nodeID: number): void;
	canAcceptDrop(dataTransfer: DataTransfer): boolean;
	onDrop(dataTransfer: DataTransfer): void;
}

const minimumHeight = 170;
const maximumHeight = 520;

export function ReviewList({
	items,
	pendingCount,
	metric,
	live,
	expanded,
	externalDragActive,
	message,
	onExpandedChange,
	onRemove,
	onClear,
	onSelect,
	onReveal,
	canAcceptDrop,
	onDrop,
}: ReviewListProps) {
	const [height, setHeight] = useState(250);
	const [dragOver, setDragOver] = useState(false);
	const resize = useRef<{ y: number; height: number } | undefined>(undefined);
	const measured = items.reduce(
		(total, item) => total + (nodeSize(item.node, metric) ?? 0),
		0,
	);
	const unknown = items.filter(
		(item) => nodeSize(item.node, metric) === undefined,
	).length;
	const count = items.length;
	const summary =
		count === 0
			? "Empty"
			: `${formatCount(count)} ${count === 1 ? "item" : "items"} · ${formatBytes(measured)} measured${unknown > 0 ? ` · ${formatCount(unknown)} unknown` : ""}`;

	function acceptDrag(event: React.DragEvent<HTMLElement>) {
		if (!canAcceptDrop(event.dataTransfer)) return false;
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
		setDragOver(true);
		return true;
	}

	function finishDrop(event: React.DragEvent<HTMLElement>) {
		if (!canAcceptDrop(event.dataTransfer)) return;
		event.preventDefault();
		setDragOver(false);
		onExpandedChange(true);
		onDrop(event.dataTransfer);
	}

	function resizePointerDown(event: PointerEvent<HTMLHRElement>) {
		resize.current = { y: event.clientY, height };
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function resizePointerMove(event: PointerEvent<HTMLHRElement>) {
		if (
			!resize.current ||
			!event.currentTarget.hasPointerCapture(event.pointerId)
		)
			return;
		setHeight(clamp(resize.current.height + resize.current.y - event.clientY));
	}

	return (
		<section
			className={`review-list${expanded ? " review-list--expanded" : ""}${externalDragActive ? " review-list--drag-ready" : ""}${dragOver ? " review-list--drag-over" : ""}`}
			style={expanded ? { height } : undefined}
			aria-labelledby="review-list-heading"
			onDragEnter={acceptDrag}
			onDragOver={acceptDrag}
			onDragLeave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null))
					setDragOver(false);
			}}
			onDrop={finishDrop}
		>
			{expanded ? (
				<hr
					className="review-list__separator"
					aria-label="Resize Review list"
					aria-orientation="horizontal"
					aria-valuemin={minimumHeight}
					aria-valuemax={maximumHeight}
					aria-valuenow={height}
					tabIndex={0}
					onPointerDown={resizePointerDown}
					onPointerMove={resizePointerMove}
					onPointerUp={(event) => {
						resize.current = undefined;
						event.currentTarget.releasePointerCapture(event.pointerId);
					}}
					onKeyDown={(event) => {
						if (
							event.key !== "ArrowUp" &&
							event.key !== "ArrowDown" &&
							event.key !== "Home" &&
							event.key !== "End"
						)
							return;
						event.preventDefault();
						setHeight((current) =>
							event.key === "Home"
								? minimumHeight
								: event.key === "End"
									? maximumHeight
									: clamp(current + (event.key === "ArrowUp" ? 24 : -24)),
						);
					}}
				/>
			) : null}
			<button
				className="review-list__summary"
				type="button"
				aria-expanded={expanded}
				aria-controls="review-list-contents"
				onClick={() => onExpandedChange(!expanded)}
			>
				<span className="review-list__mark" aria-hidden="true">
					◎
				</span>
				<span>
					<strong id="review-list-heading">Review list</strong>
					<small>{summary}</small>
				</span>
				<b aria-hidden="true">{expanded ? "⌄" : "⌃"}</b>
			</button>
			<div
				id="review-list-contents"
				className="review-list__contents"
				hidden={!expanded}
			>
				<div className="review-list__toolbar">
					<span>
						{metricLabel(metric)} ·{" "}
						{live ? "provisional while scanning" : "measured at scan time"}
					</span>
					<button type="button" disabled={count === 0} onClick={onClear}>
						Clear list
					</button>
				</div>
				{count === 0 ? (
					<div className="review-list__empty">
						<strong>
							{pendingCount > 0 ? "Adding item…" : "Drag files or folders here"}
						</strong>
						<span>Or use “Add to Review list” from any item menu.</span>
						<small>Nothing here changes your files.</small>
					</div>
				) : (
					<ul className="review-list__items">
						{items.map((item) => {
							const size = nodeSize(item.node, metric);
							const status =
								live && !item.node.flags.subtreeComplete
									? "Scanning"
									: !item.node.flags.subtreeComplete
										? "Partial"
										: undefined;
							return (
								<li key={item.node.id}>
									<div>
										<strong title={item.node.path ?? item.node.name}>
											{item.node.name}
										</strong>
										<small>
											{size === undefined
												? "Size unavailable"
												: formatBytes(size)}
											{status ? ` · ${status}` : ""}
										</small>
									</div>
									{item.node.kind === "directory" ? (
										<button
											className="item-action item-action--view"
											type="button"
											title="View in DiskOrbit"
											aria-label={`View ${item.node.name} in DiskOrbit`}
											onClick={() => onSelect(item.node.id)}
										>
											<ItemActionIcon kind="view" />
										</button>
									) : null}
									<button
										className="item-action item-action--reveal"
										type="button"
										title="Reveal in file manager"
										aria-label={`Reveal ${item.node.name} in file manager`}
										onClick={() => onReveal(item.node.id)}
									>
										<ItemActionIcon kind="reveal" />
									</button>
									<button
										className="review-list__remove"
										type="button"
										title="Remove from Review list"
										aria-label={`Remove ${item.node.name} from Review list`}
										onClick={() => onRemove(item.node.id)}
									>
										×
									</button>
								</li>
							);
						})}
					</ul>
				)}
				{pendingCount > 0 && count > 0 ? (
					<p className="review-list__pending">
						Adding {formatCount(pendingCount)}…
					</p>
				) : null}
				{message ? (
					<p className="review-list__message" role="status">
						{message}
					</p>
				) : null}
			</div>
		</section>
	);
}

function clamp(value: number): number {
	return Math.min(maximumHeight, Math.max(minimumHeight, value));
}
