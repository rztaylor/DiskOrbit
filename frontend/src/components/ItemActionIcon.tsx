export type ItemActionIconKind = "review" | "view" | "reveal";

export function ItemActionIcon({ kind }: { kind: ItemActionIconKind }) {
	return (
		<svg
			className={`item-action-icon item-action-icon--${kind}`}
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			{kind === "review" ? (
				<>
					<path d="M4 14.5v3A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-3" />
					<path d="M8 15h8" />
					<path d="M12 3v8M8 7h8" />
				</>
			) : kind === "view" ? (
				<>
					<circle cx="10.5" cy="12" r="6.5" />
					<circle cx="10.5" cy="12" r="2" />
					<path d="M15 7.5 20 4m0 0h-4m4 0v4" />
				</>
			) : (
				<>
					<path d="M7 17 17 7" />
					<path d="M10 7h7v7" />
				</>
			)}
		</svg>
	);
}
