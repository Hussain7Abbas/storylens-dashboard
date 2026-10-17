import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";

/** Editable combobox: the selected value and model search share one control. */
export function SearchableSelect({
	label,
	options,
	value,
	disabled,
	onChange,
}: {
	label: string;
	options: { value: string; label: string; search?: string }[];
	value: string;
	disabled?: boolean;
	onChange: (value: string) => void;
}) {
	const id = useId();
	const input = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [active, setActive] = useState(0);
	const selected = options.find((option) => option.value === value);
	const shown = options.filter((option) =>
		`${option.label} ${option.search ?? option.value}`
			.toLowerCase()
			.includes(search.trim().toLowerCase()),
	);
	const move = (index: number) => {
		const next = Math.max(0, Math.min(index, shown.length - 1));
		setActive(next);
		document
			.getElementById(`${id}-option-${next}`)
			?.scrollIntoView({ block: "nearest" });
	};
	const choose = (next: string) => {
		setOpen(false);
		setSearch("");
		onChange(next);
	};
	return (
		<div className="relative grid gap-2">
			<label htmlFor={id} className="text-sm font-medium">
				{label}
			</label>
			<div className="relative">
				<input
					ref={input}
					onBlur={() => {
						setOpen(false);
						setSearch("");
					}}
					id={id}
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={open}
					aria-controls={`${id}-list`}
					aria-activedescendant={
						open && shown[active] ? `${id}-option-${active}` : undefined
					}
					className="input w-full pe-10"
					disabled={disabled}
					autoComplete="off"
					placeholder="Search models…"
					value={open ? search : (selected?.label ?? value)}
					onFocus={(event) => event.currentTarget.select()}
					onClick={() => {
						if (!open) {
							setSearch("");
							setActive(0);
							setOpen(true);
						}
					}}
					onChange={(event) => {
						setSearch(event.target.value);
						setActive(0);
						setOpen(true);
					}}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							if (open) {
								event.preventDefault();
								event.stopPropagation();
								setOpen(false);
								setSearch("");
							}
						} else if (
							["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
						) {
							if (!open && ["Home", "End"].includes(event.key)) return;
							event.preventDefault();
							setOpen(true);
							move(
								event.key === "Home"
									? 0
									: event.key === "End"
										? shown.length - 1
										: !open
											? 0
											: active + (event.key === "ArrowDown" ? 1 : -1),
							);
						} else if (event.key === "Enter" && open) {
							event.preventDefault();
							if (shown[active]) choose(shown[active].value);
						}
					}}
				/>
				<button
					type="button"
					tabIndex={-1}
					disabled={disabled}
					aria-label={`Toggle ${label.toLowerCase()} choices`}
					className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted"
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => {
						input.current?.focus();
						setOpen(!open);
						setSearch("");
						setActive(0);
					}}
				>
					<ChevronDown size={16} strokeWidth={1.75} aria-hidden />
				</button>
			</div>
			<div
				id={`${id}-list`}
				role="listbox"
				aria-label={`${label} choices`}
				hidden={!open}
				className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-[var(--control-radius)] border border-line bg-surface p-1 shadow-lg"
			>
				{shown.map((option, index) => (
					<button
						type="button"
						tabIndex={-1}
						key={option.value}
						id={`${id}-option-${index}`}
						role="option"
						aria-selected={option.value === value}
						className={`block w-full cursor-pointer rounded px-3 py-2 text-start text-sm ${index === active ? "bg-accent-soft text-accent" : "hover:bg-wash"}`}
						onPointerMove={() => setActive(index)}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => choose(option.value)}
					>
						{option.label}
					</button>
				))}
				{shown.length === 0 && (
					<div
						role="option"
						aria-selected={false}
						aria-disabled="true"
						tabIndex={-1}
						className="p-3 text-sm text-muted"
					>
						No matching models
					</div>
				)}
			</div>
		</div>
	);
}
