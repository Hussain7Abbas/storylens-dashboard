import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { errorMessage } from "@/api/axios-instance";
import {
	getGetConfigsQueryKey,
	useDeleteConfigsByKey,
	useGetConfigs,
	usePutConfigs,
} from "@/api/generated/endpoints/admin-configs";
import type { GetConfigs200DataItem } from "@/api/generated/schemas";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/page";
import { SearchInput } from "@/components/ui/search-input";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";

type Config = GetConfigs200DataItem;

// Keys the backend reads; shown as hints when adding a config.
const KNOWN_KEYS: Record<string, string> = {
	Review_Version:
		"Extension version waiting for Chrome Web Store review. The backend deploys itself once the store publishes it.",
	Lens_Price_USD:
		"Price of one lens in US dollars, up to 6 decimals (default 0.01). Missing or invalid: buying lenses is unavailable.",
	AI_Lens_Balance:
		"Remaining whole lenses available for approved sales and dashboard gifts. Edit with the dollar converter in the AI tab; missing means zero.",
	Lens_Trial_Gift:
		"Lenses each new registered reader gets once (default 10). 0 gives nothing and shows no celebration.",
	Lens_Request_Min:
		"Legacy setting; requests now have a fixed minimum of 500 lenses.",
	Lens_Request_Max:
		"Legacy setting; requests now allow up to 2147483647 lenses (PostgreSQL Int).",
	Lens_Pending_Requests_Max:
		"Pending lens requests one reader may have at a time, 1–20 (default 3).",
	AI_Text_Model:
		"OpenRouter model for every text feature and the image brief. Choose it in the AI tab, which shows prices and whether lenses still cover the cost.",
	AI_Image_Model:
		"OpenRouter model that draws character images. Choose it in the AI tab.",
	AI_Reasoning_Effort:
		"Text reasoning effort: auto, none, minimal, low, medium, high, xhigh or max. Choose it in the AI tab.",
	AI_Reasoning_Token_Allowance:
		"Extra completion tokens reserved for thinking, above each feature's output limit (0–32768; default 4096).",
	AI_Image_Quality:
		"Image quality: auto, low, medium, high, xhigh or max. Choose it in the AI tab.",
	Billing_Notify_Email:
		"Email that receives each new lens request with the reader’s WhatsApp or Telegram contact. Empty: DASHBOARD_ADMIN_EMAIL.",
	AI_Cloud_Enabled:
		"true turns Story Lens Cloud AI on; false answers every cloud AI request as unavailable (default false).",
	AI_Daily_Spend_Cap_USD:
		"Optional daily OpenRouter spending cap in US dollars (UTC days). Empty: no cap.",
	AI_Reader_Max_Running:
		"Cloud AI actions one reader may run at the same time, 1–10 (default 3).",
	AI_Reader_Max_Per_10_Min:
		"Cloud AI actions one reader may start in 10 minutes, 1–500 (default 30).",
};

function ConfigForm({
	config,
	onDone,
}: {
	config: Config | null;
	onDone: () => void;
}) {
	const queryClient = useQueryClient();
	const toast = useToast();
	const [key, setKey] = useState(config?.key ?? "");
	const [value, setValue] = useState(config?.value ?? "");
	const [error, setError] = useState("");
	const save = usePutConfigs({
		mutation: {
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: getGetConfigsQueryKey(),
				});
				toast.success("Config saved");
				onDone();
			},
			onError: (reason) => setError(errorMessage(reason)),
		},
	});

	const submit = (event: FormEvent) => {
		event.preventDefault();
		setError("");
		save.mutate({
			data: {
				key: key.trim(),
				value,
				...(key.trim() === "AI_Lens_Balance"
					? {
							baseUpdatedAt:
								typeof config?.updatedAt === "string" ? config.updatedAt : null,
						}
					: {}),
			},
		});
	};

	return (
		<form onSubmit={submit} className="grid gap-4">
			<Field
				label="Key"
				hint={
					KNOWN_KEYS[key.trim()] ??
					(config
						? "Keys can’t be renamed; delete and re-add instead."
						: undefined)
				}
			>
				<input
					className="input font-mono text-sm"
					required
					list="known-config-keys"
					readOnly={config !== null}
					value={key}
					onChange={(event) => setKey(event.target.value)}
				/>
			</Field>
			<datalist id="known-config-keys">
				{Object.keys(KNOWN_KEYS).map((known) => (
					<option key={known} value={known} />
				))}
			</datalist>
			<Field label="Value">
				<textarea
					className="input font-mono text-sm"
					rows={5}
					value={value}
					onChange={(event) => setValue(event.target.value)}
				/>
			</Field>
			{error && (
				<p className="field-error" role="alert">
					{error}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<Button onClick={onDone} disabled={save.isPending}>
					Cancel
				</Button>
				<Button type="submit" variant="primary" loading={save.isPending}>
					Save config
				</Button>
			</div>
		</form>
	);
}

/** Settings → Configs: every key–value setting the API reads at runtime. */
export function ConfigsPanel() {
	const { can } = useAuth();
	const toast = useToast();
	const queryClient = useQueryClient();
	const configs = useGetConfigs();
	const [filter, setFilter] = useState("");
	const [editing, setEditing] = useState<Config | "new" | null>(null);
	const [deleting, setDeleting] = useState<Config | null>(null);
	const [deleteError, setDeleteError] = useState("");

	const closeDelete = () => {
		setDeleting(null);
		setDeleteError("");
	};
	const remove = useDeleteConfigsByKey({
		mutation: {
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: getGetConfigsQueryKey(),
				});
				toast.success("Config deleted");
				closeDelete();
			},
			onError: (reason) => setDeleteError(errorMessage(reason)),
		},
	});

	const query = filter.toLowerCase();
	const rows = (configs.data?.data ?? []).filter(
		(config) =>
			!query ||
			config.key.toLowerCase().includes(query) ||
			config.value.toLowerCase().includes(query),
	);

	return (
		<>
			<div className="card">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
					<SearchInput
						label="Filter configs"
						value={filter}
						onChange={setFilter}
					/>
					{can(PERMISSIONS.configs.save) && (
						<Button
							variant="primary"
							icon={<Plus size={16} strokeWidth={1.75} aria-hidden />}
							onClick={() => setEditing("new")}
						>
							New config
						</Button>
					)}
				</div>
				{configs.error ? (
					<ErrorState
						error={configs.error}
						onRetry={() => void configs.refetch()}
					/>
				) : !configs.data ? (
					<TableSkeleton rows={3} columns={3} />
				) : rows.length === 0 ? (
					<EmptyState title={filter ? "No configs match" : "No configs yet"} />
				) : (
					<div className="relative overflow-x-auto">
						<table className="data-table">
							<thead>
								<tr>
									<th scope="col">Key</th>
									<th scope="col">Value</th>
									<th scope="col">Updated</th>
									<th scope="col">
										<span className="sr-only">Actions</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((config) => (
									<tr key={config.id}>
										<td className="font-mono text-sm font-medium">
											{config.key}
										</td>
										<td className="max-w-md">
											<p className="line-clamp-2 break-all font-mono text-sm text-muted">
												{config.value || "—"}
											</p>
										</td>
										<td className="whitespace-nowrap text-muted">
											{formatDateTime(config.updatedAt)}
										</td>
										<td>
											<div className="flex justify-end gap-1">
												{can(PERMISSIONS.configs.save) && (
													<Button
														variant="ghost"
														iconOnly
														aria-label={`Edit ${config.key}`}
														title="Edit"
														onClick={() => setEditing(config)}
														icon={
															<Pencil
																size={16}
																strokeWidth={1.75}
																aria-hidden
															/>
														}
													/>
												)}
												{can(PERMISSIONS.configs.delete) && (
													<Button
														variant="ghost"
														iconOnly
														className="text-danger"
														aria-label={`Delete ${config.key}`}
														title="Delete"
														onClick={() => setDeleting(config)}
														icon={
															<Trash2
																size={16}
																strokeWidth={1.75}
																aria-hidden
															/>
														}
													/>
												)}
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			<Dialog
				open={editing !== null}
				onClose={() => setEditing(null)}
				title={editing === "new" ? "New config" : "Edit config"}
			>
				{editing !== null && (
					<ConfigForm
						key={editing === "new" ? "new" : editing.id}
						config={editing === "new" ? null : editing}
						onDone={() => setEditing(null)}
					/>
				)}
			</Dialog>

			<ConfirmDialog
				open={deleting !== null}
				title="Delete config?"
				confirmLabel="Delete config"
				busy={remove.isPending}
				error={deleteError}
				onClose={closeDelete}
				onConfirm={() => deleting && remove.mutate({ key: deleting.key })}
			>
				<code className="text-ink">{deleting?.key}</code> will be removed.
				Features that read it fall back to their defaults.
			</ConfirmDialog>
		</>
	);
}
