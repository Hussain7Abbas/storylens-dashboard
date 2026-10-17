import { useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { type FormEvent, useState } from "react";
import { errorMessage } from "@/api/axios-instance";
import {
	getGetKeywordCategoriesQueryKey,
	useGetKeywordCategories,
	usePutKeywordCategoriesById,
} from "@/api/generated/endpoints/admin-keywords";
import type { GetKeywordCategories200DataItem } from "@/api/generated/schemas";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { ErrorState, TableSkeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { bothNames } from "@/lib/translation";

type Category = GetKeywordCategories200DataItem;
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

function CategoryVfxForm({
	category,
	close,
}: {
	category: Category;
	close: () => void;
}) {
	const [effect, setEffect] = useState<Effect>(category.wordVfx ?? "NONE");
	const [color, setColor] = useState(category.wordVfxColor ?? "");
	const [error, setError] = useState("");
	const [switchPositionWithNature, setSwitchPositionWithNature] = useState(
		category.switchPositionWithNature ?? false,
	);
	const client = useQueryClient();
	const toast = useToast();
	const save = usePutKeywordCategoriesById({
		mutation: {
			onSuccess: async () => {
				await client.invalidateQueries({
					queryKey: getGetKeywordCategoriesQueryKey(),
				});
				toast.success("Category VFX saved");
				close();
			},
			onError: (error) => {
				setError(errorMessage(error));
				void client.invalidateQueries({
					queryKey: getGetKeywordCategoriesQueryKey(),
				});
			},
		},
	});
	function submit(event: FormEvent) {
		event.preventDefault();
		if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
			setError("Enter a color as #RRGGBB, or leave it empty.");
			return;
		}
		setError("");
		save.mutate({
			id: category.id,
			data: {
				baseUpdatedAt: String(category.updatedAt),
				wordVfx: effect,
				switchPositionWithNature,
				wordVfxColor: tinted(effect) ? color || null : null,
			},
		});
	}
	return (
		<Dialog
			open
			onClose={close}
			title={`Category VFX: ${bothNames(category)}`}
			description="Words set to None use their resolved category’s effect. A word’s own effect takes priority."
		>
			<form onSubmit={submit} className="grid gap-4">
				<fieldset disabled={save.isPending} className="grid gap-4">
					<label className="flex items-center gap-3 text-sm">
						<input
							type="checkbox"
							role="switch"
							aria-checked={switchPositionWithNature}
							className="size-4 accent-[var(--accent)]"
							checked={switchPositionWithNature}
							onChange={(event) =>
								setSwitchPositionWithNature(event.target.checked)
							}
						/>
						<span>Switch position with nature</span>
					</label>
					<p className="field-hint">
						Nature colors the word; category colors the circle. Explicit word
						colors still take priority.
					</p>
					<Field label="Word VFX">
						<select
							className="input"
							value={effect}
							onChange={(event) => {
								setEffect(event.target.value as Effect);
								if (!tinted(event.target.value as Effect)) setColor("");
								setError("");
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
						<>
							<Field
								label="VFX color"
								hint="Leave empty to use each word’s highlight color."
							>
								<input
									className="input"
									placeholder="#RRGGBB"
									value={color}
									spellCheck={false}
									onChange={(event) => {
										setColor(event.target.value);
										setError("");
									}}
								/>
							</Field>
							<div className="flex flex-wrap items-center gap-3">
								<input
									type="color"
									aria-label="Choose VFX color"
									value={
										/^#[0-9a-fA-F]{6}$/.test(color) ? color : category.color
									}
									onChange={(event) => setColor(event.target.value)}
									className="h-11 w-14 cursor-pointer rounded border border-line"
								/>
								<Button
									variant="secondary"
									onClick={() => {
										setColor("");
										setError("");
									}}
								>
									Use word color
								</Button>
							</div>
						</>
					)}
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
						Save changes
					</Button>
				</div>
			</form>
		</Dialog>
	);
}

export function CategoryVfxPanel() {
	const { can } = useAuth();
	const query = useGetKeywordCategories();
	const [editing, setEditing] = useState<Category | null>(null);
	if (query.isPending) return <TableSkeleton />;
	if (query.isError)
		return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
	return (
		<>
			<section className="card p-5">
				<h2 className="font-semibold">Category VFX</h2>
				<p className="mt-1 mb-4 text-sm text-muted">
					Choose the default effect for each category. Readers can turn Word VFX
					on in Appearance settings.
				</p>
				<div className="overflow-x-auto">
					<table className="data-table data-table-stack" data-table-stack>
						<thead>
							<tr>
								<th>Category</th>
								<th>Word VFX</th>
								<th>VFX color</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{query.data.data.map((category) => (
								<tr key={category.id}>
									<td data-label="Category">{bothNames(category)}</td>
									<td data-label="Word VFX">
										{EFFECTS[category.wordVfx ?? "NONE"]}
									</td>
									<td data-label="VFX color">
										{category.wordVfxColor ?? "Word color"}
									</td>
									<td data-label="Actions">
										{can(PERMISSIONS.keywords.updateCategory) && (
											<Button
												variant="ghost"
												iconOnly
												aria-label={`Edit VFX for ${bothNames(category)}`}
												icon={
													<Pencil size={16} strokeWidth={1.75} aria-hidden />
												}
												onClick={() => setEditing(category)}
											/>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{!query.data.data.length && (
					<p className="text-sm text-muted">No categories yet.</p>
				)}
			</section>
			{editing && (
				<CategoryVfxForm
					key={editing.id}
					category={editing}
					close={() => setEditing(null)}
				/>
			)}
		</>
	);
}
