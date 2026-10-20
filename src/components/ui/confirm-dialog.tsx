import type { ReactNode } from "react";
import { MultiButtonsModal } from "./multi-buttons-modal";

/** Asks before a destructive or irreversible action. */
export function ConfirmDialog({
	open,
	title,
	children,
	confirmLabel,
	tone = "danger",
	busy = false,
	error,
	onConfirm,
	onClose,
}: {
	open: boolean;
	title: string;
	children: ReactNode;
	confirmLabel: string;
	/** `primary` for confirmations that are not destructive (approving a request). */
	tone?: "danger" | "primary";
	busy?: boolean;
	error?: string;
	onConfirm: () => void;
	onClose: () => void;
}) {
	return (
		<MultiButtonsModal
			open={open}
			title={title}
			busy={busy}
			error={error}
			onClose={onClose}
			buttons={[
				{ id: "cancel", label: "Cancel", onClick: onClose, autoFocus: true },
				{
					id: "confirm",
					label: confirmLabel,
					variant: tone,
					loading: busy,
					onClick: onConfirm,
				},
			]}
		>
			{children}
		</MultiButtonsModal>
	);
}
