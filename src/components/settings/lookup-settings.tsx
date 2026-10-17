import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { errorMessage } from "@/api/axios-instance";
import {
	deleteKeywordCategoriesById,
	deleteKeywordNaturesById,
	getGetKeywordCategoriesQueryKey,
	getGetKeywordNaturesQueryKey,
	postKeywordCategories,
	postKeywordNatures,
	putKeywordCategoriesById,
	putKeywordNaturesById,
	useGetKeywordCategories,
	useGetKeywordNatures,
} from "@/api/generated/endpoints/admin-keywords";
import type {
	GetKeywordCategories200DataItem,
	GetKeywordNatures200DataItem,
} from "@/api/generated/schemas";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { ErrorState, TableSkeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { bothNames } from "@/lib/translation";
import { LookupColorPreview } from "./lookup-color-preview";

type Kind = "category" | "nature";
type Lookup = GetKeywordCategories200DataItem | GetKeywordNatures200DataItem;
const EFFECTS = {
	NONE: "None",
	SPARKLES: "Sparkles",
	HEAT: "Heat",
	SHAKING: "Shaking",
	GLITCHING: "Glitching",
	GLARE: "Glare",
} as const;
type Effect = keyof typeof EFFECTS;
const tinted = (effect: Effect) => effect === "SPARKLES" || effect === "HEAT";
const validColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);
const queryKey = (kind: Kind) =>
	kind === "category"
		? getGetKeywordCategoriesQueryKey()
		: getGetKeywordNaturesQueryKey();
const title = (kind: Kind) => (kind === "category" ? "Category" : "Nature");

function ColorField({
	label,
	value,
	onChange,
	optional = false,
}: {
	label: string;
	value: string;
	onChange: (color: string) => void;
	optional?: boolean;
}) {
	return (
		<div className="grid grid-cols-[1fr_auto] items-start gap-3">
			<Field
				label={label}
				hint={
					optional
						? "Leave empty to use the word’s highlight color."
						: "Six-digit hex color (#RRGGBB)."
				}
			>
				<input
					className="input"
					value={value}
					spellCheck={false}
					placeholder="#RRGGBB"
					onChange={(event) => onChange(event.target.value)}
				/>
			</Field>
			<input
				type="color"
				aria-label={`Choose ${label.toLowerCase()}`}
				value={validColor(value) ? value : "#6554c0"}
				onChange={(event) => onChange(event.target.value)}
				className="mt-7 h-11 w-14 cursor-pointer rounded border border-line"
			/>
		</div>
	);
}

function LookupForm({
	kind,
	row,
	close,
}: {
	kind: Kind;
	row: Lookup | null;
	close: () => void;
}) {
	const category = row && "wordVfx" in row ? row : null;
	const [createId] = useState(() => crypto.randomUUID());
	const [nameEn, setNameEn] = useState(row?.nameEn ?? "");
	const [nameAr, setNameAr] = useState(row?.nameAr ?? "");
	const [color, setColor] = useState(row?.color ?? "#6554c0");
	const [description, setDescription] = useState(row?.description ?? "");
	const [effect, setEffect] = useState<Effect>(category?.wordVfx ?? "NONE");
	const [vfxColor, setVfxColor] = useState(category?.wordVfxColor ?? "");
	const [swapped, setSwapped] = useState(
		category?.switchPositionWithNature ?? false,
	);
	const [error, setError] = useState("");
	const client = useQueryClient();
	const toast = useToast();
	const save = useMutation({
		mutationFn: async () => {
			const data = {
				nameEn: nameEn.trim() || null,
				nameAr: nameAr.trim() || null,
				color,
				description: description.trim() || null,
			};
			if (kind === "category") {
				const appearance = {
					...data,
					wordVfx: effect,
					wordVfxColor: tinted(effect) ? vfxColor || null : null,
					switchPositionWithNature: swapped,
				};
				return row
					? putKeywordCategoriesById(row.id, {
							...appearance,
							baseUpdatedAt: String(row.updatedAt),
						})
					: postKeywordCategories({ id: createId, ...appearance });
			}
			return row
				? putKeywordNaturesById(row.id, {
						...data,
						baseUpdatedAt: String(row.updatedAt),
					})
				: postKeywordNatures({ id: createId, ...data });
		},
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: queryKey(kind) });
			toast.success(`${title(kind)} saved`);
			close();
		},
		onError: (error) => {
			setError(errorMessage(error));
			void client.invalidateQueries({ queryKey: queryKey(kind) });
		},
	});
	function submit(event: FormEvent) {
		event.preventDefault();
		if (!nameEn.trim() && !nameAr.trim()) {
			setError("Enter an English or Arabic name.");
			return;
		}
		if (
			!validColor(color) ||
			(tinted(effect) && vfxColor && !validColor(vfxColor))
		) {
			setError("Enter colors as #RRGGBB.");
			return;
		}
		setError("");
		save.mutate();
	}
	return (
		<Dialog
			open
			onClose={() => !save.isPending && close()}
			title={`${row ? "Edit" : "Add"} ${kind}`}
			description="Shared defaults used by readers and AI keyword suggestions."
		>
			<form className="grid gap-4" onSubmit={submit}>
				<fieldset className="grid min-w-0 gap-4" disabled={save.isPending}>
					<div className="grid gap-4 sm:grid-cols-2">
						<Field label="English name">
							<input
								className="input"
								value={nameEn}
								onChange={(event) => setNameEn(event.target.value)}
							/>
						</Field>
						<Field
							label="Arabic name"
							hint="At least one language is required."
						>
							<input
								className="input"
								dir="rtl"
								value={nameAr}
								onChange={(event) => setNameAr(event.target.value)}
							/>
						</Field>
					</div>
					<ColorField label="Color" value={color} onChange={setColor} />
					<LookupColorPreview kind={kind} color={color} swapped={swapped} />
					{kind === "category" && (
						<>
							<label className="flex min-h-11 items-center gap-3 text-sm">
								<input
									type="checkbox"
									role="switch"
									aria-checked={swapped}
									className="size-4 accent-[var(--accent)]"
									checked={swapped}
									onChange={(event) => setSwapped(event.target.checked)}
								/>
								<span>Switch position with nature</span>
							</label>
							<p className="field-hint">
								Nature colors the word; category colors the circle. Explicit
								word colors still take priority.
							</p>
							<Field
								label="Word VFX"
								hint="Words with their own effect keep it; otherwise they use the category’s effect."
							>
								<select
									className="input"
									value={effect}
									onChange={(event) => {
										const next = event.target.value as Effect;
										setEffect(next);
										if (!tinted(next)) setVfxColor("");
									}}
								>
									{Object.entries(EFFECTS).map(([value, label]) => (
										<option key={value} value={value}>
											{label}
										</option>
									))}
								</select>
							</Field>
							{tinted(effect) && (
								<div className="grid gap-2">
									<ColorField
										label="VFX color"
										value={vfxColor}
										onChange={setVfxColor}
										optional
									/>
									<Button
										variant="secondary"
										className="justify-self-start"
										onClick={() => setVfxColor("")}
									>
										Use word color
									</Button>
								</div>
							)}
						</>
					)}
					<Field
						label="Description"
						hint={`Explain when AI should use this ${kind}.`}
					>
						<textarea
							className="input min-h-24"
							maxLength={1000}
							value={description}
							onChange={(event) => setDescription(event.target.value)}
						/>
					</Field>
				</fieldset>
				{error && (
					<p role="alert" className="field-error">
						{error}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button variant="secondary" onClick={close} disabled={save.isPending}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" loading={save.isPending}>
						{row ? "Save changes" : `Add ${kind}`}
					</Button>
				</div>
			</form>
		</Dialog>
	);
}

function DeleteLookupDialog({
	kind,
	row,
	rows,
	close,
}: {
	kind: Kind;
	row: Lookup;
	rows: Lookup[];
	close: () => void;
}) {
	const [replacementId, setReplacementId] = useState("");
	const client = useQueryClient();
	const toast = useToast();
	const remove = useMutation({
		mutationFn: () =>
			kind === "category"
				? deleteKeywordCategoriesById(row.id, {
						replacementId: replacementId || undefined,
					})
				: deleteKeywordNaturesById(row.id, {
						replacementId: replacementId || undefined,
					}),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: queryKey(kind) });
			toast.success(`${title(kind)} deleted`);
			close();
		},
	});
	return (
		<ConfirmDialog
			open
			title={`Delete ${kind}`}
			confirmLabel={`Delete ${kind}`}
			busy={remove.isPending}
			error={remove.isError ? errorMessage(remove.error) : undefined}
			onClose={() => !remove.isPending && close()}
			onConfirm={() => remove.mutate()}
		>
			<p className="mb-4">
				<span>Delete </span>
				<strong>{bothNames(row)}</strong>
				<span>
					? If it is in use, choose a replacement to move all linked keywords,
					versions and aliases.
				</span>
			</p>
			<Field
				label="Replacement"
				hint="Without a replacement, only an unused item can be deleted."
			>
				<select
					className="input"
					value={replacementId}
					disabled={remove.isPending}
					onChange={(event) => setReplacementId(event.target.value)}
				>
					<option value="">None (unused only)</option>
					{rows
						.filter((item) => item.id !== row.id)
						.map((item) => (
							<option key={item.id} value={item.id}>
								{bothNames(item)}
							</option>
						))}
				</select>
			</Field>
		</ConfirmDialog>
	);
}

function LookupList({ kind, rows }: { kind: Kind; rows: Lookup[] }) {
	const { can } = useAuth();
	const [editing, setEditing] = useState<{ row: Lookup | null } | null>(null);
	const [deleting, setDeleting] = useState<Lookup | null>(null);
	const permissions =
		kind === "category"
			? {
					create: PERMISSIONS.keywords.createCategory,
					update: PERMISSIONS.keywords.updateCategory,
					delete: PERMISSIONS.keywords.deleteCategory,
				}
			: {
					create: PERMISSIONS.keywords.createNature,
					update: PERMISSIONS.keywords.updateNature,
					delete: PERMISSIONS.keywords.deleteNature,
				};
	return (
		<>
			<section className="card p-5">
				<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 className="font-semibold">
							{kind === "category" ? "Categories" : "Natures"}
						</h2>
						<p className="mt-1 text-sm text-muted">
							Shared names, colors and AI guidance
							{kind === "category" ? ", with default word effects." : "."}
						</p>
					</div>
					{can(permissions.create) && (
						<Button
							variant="primary"
							icon={<Plus size={16} strokeWidth={1.75} aria-hidden />}
							onClick={() => setEditing({ row: null })}
						>
							Add {kind}
						</Button>
					)}
				</div>
				<div className="overflow-x-auto">
					<table className="data-table data-table-stack" data-table-stack>
						<thead>
							<tr>
								<th>Name</th>
								<th>Color</th>
								<th>Description</th>
								{kind === "category" && <th>Word VFX</th>}
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.id}>
									<td data-label="Name">{bothNames(row)}</td>
									<td data-label="Color">
										<span className="inline-flex items-center gap-2">
											<span
												aria-hidden
												className="size-4 shrink-0 rounded-full border border-line"
												style={{ backgroundColor: row.color }}
											/>
											<span>{row.color}</span>
										</span>
									</td>
									<td data-label="Description">
										<p className="max-w-sm whitespace-pre-wrap break-words">
											{row.description || "—"}
										</p>
									</td>
									{kind === "category" && (
										<td data-label="Word VFX">
											{"wordVfx" in row
												? EFFECTS[row.wordVfx ?? "NONE"]
												: "None"}
										</td>
									)}
									<td data-label="Actions">
										<div className="flex gap-1">
											{can(permissions.update) && (
												<Button
													variant="ghost"
													iconOnly
													aria-label={`Edit ${kind} ${bothNames(row)}`}
													icon={
														<Pencil size={16} strokeWidth={1.75} aria-hidden />
													}
													onClick={() => setEditing({ row })}
												/>
											)}
											{can(permissions.delete) && (
												<Button
													variant="ghost"
													iconOnly
													aria-label={`Delete ${kind} ${bothNames(row)}`}
													icon={
														<Trash2 size={16} strokeWidth={1.75} aria-hidden />
													}
													onClick={() => setDeleting(row)}
												/>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{!rows.length && (
					<p className="text-sm text-muted">
						{kind === "category" ? "No categories yet." : "No natures yet."}
					</p>
				)}
			</section>
			{editing && (
				<LookupForm
					key={editing.row?.id ?? "new"}
					kind={kind}
					row={editing.row}
					close={() => setEditing(null)}
				/>
			)}
			{deleting && (
				<DeleteLookupDialog
					kind={kind}
					row={deleting}
					rows={rows}
					close={() => setDeleting(null)}
				/>
			)}
		</>
	);
}

export function CategoriesPanel() {
	const query = useGetKeywordCategories();
	if (query.isPending) return <TableSkeleton />;
	if (query.isError)
		return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
	return <LookupList kind="category" rows={query.data.data} />;
}
export function NaturesPanel() {
	const query = useGetKeywordNatures();
	if (query.isPending) return <TableSkeleton />;
	if (query.isError)
		return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
	return <LookupList kind="nature" rows={query.data.data} />;
}
