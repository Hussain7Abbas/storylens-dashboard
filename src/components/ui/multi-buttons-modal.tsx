import type { ComponentProps, ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";

export type MultiButtonsModalButton = {
	id: string;
	label: ReactNode;
	onClick: () => void;
	variant?: ComponentProps<typeof Button>["variant"];
	disabled?: boolean;
	loading?: boolean;
	autoFocus?: boolean;
};

/** Shared confirmation shell for any number of explicit actions. */
export function MultiButtonsModal({
	open,
	title,
	children,
	buttons,
	busy = false,
	error,
	onClose,
}: {
	open: boolean;
	title: string;
	children?: ReactNode;
	buttons: readonly MultiButtonsModalButton[];
	busy?: boolean;
	error?: string;
	onClose: () => void;
}) {
	return (
		<Dialog
			open={open}
			onClose={() => {
				if (!busy) onClose();
			}}
			title={title}
			size="sm"
			dismissible={!busy}
			footer={buttons.map(({ id, label, autoFocus, ...button }) => (
				<Button
					key={id}
					{...button}
					type="button"
					disabled={busy || button.disabled}
					autoFocus={autoFocus}
				>
					{label}
				</Button>
			))}
		>
			<div className="text-sm leading-relaxed text-muted">{children}</div>
			{error && (
				<p className="field-error mt-4" role="alert">
					{error}
				</p>
			)}
		</Dialog>
	);
}
