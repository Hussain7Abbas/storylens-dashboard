import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { errorMessage } from "@/api/axios-instance";
import { useGetAiInstructions } from "@/api/generated/endpoints/admin-ai-pricing";
import {
	getGetConfigsQueryKey,
	usePutConfigs,
} from "@/api/generated/endpoints/admin-configs";
import type { GetAiInstructions200 } from "@/api/generated/schemas";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ErrorState, TableSkeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

const PROMPTS = [
	{
		field: "keywordPrompt",
		key: "AI_Keyword_Prompt",
		title: "Keyword generation",
		hint: "Descriptions, category and nature selection for AI Add and chapter extraction.",
	},
	{
		field: "imagePrompt",
		key: "AI_Image_Prompt",
		title: "Character images",
		hint: "Portrait style and how chapter and novel details guide character images.",
	},
	{
		field: "chapterCoverPrompt",
		key: "AI_Chapter_Cover_Prompt",
		title: "Chapter covers",
		hint: "Scene selection, composition, lighting and entity references for chapter covers.",
	},
	{
		field: "chapterContextPrompt",
		key: "AI_Chapter_Context_Prompt",
		title: "Chapter context",
		hint: "Compact details useful for future images, using one previous chapter and earlier records for returning elements. The JSON schema and canonical identity rules are preserved.",
	},
	{
		field: "pageSummaryPrompt",
		key: "AI_Page_Summary_Prompt",
		title: "Page summary",
		hint: "Summary content, tone and level of detail. Output uses the reader’s selected language.",
	},
] as const;

function PromptEditor({
	definition,
	data,
	reload,
	canEdit,
}: {
	definition: (typeof PROMPTS)[number];
	data: GetAiInstructions200;
	reload: () => Promise<GetAiInstructions200 | undefined>;
	canEdit: boolean;
}) {
	const { field, key, title, hint } = definition;
	const [value, setValue] = useState(data.prompts[field]);
	const [base, setBase] = useState(data.revisions[field]);
	const [savedValue, setSavedValue] = useState(data.prompts[field]);
	const [error, setError] = useState("");
	const [reloading, setReloading] = useState(false);
	const toast = useToast();
	const client = useQueryClient();
	const save = usePutConfigs({
		mutation: {
			onSuccess: async (result) => {
				const effective = result.value.trim()
					? result.value
					: data.defaults[field];
				setValue(effective);
				setSavedValue(effective);
				setBase(String(result.updatedAt));
				setError("");
				toast.success(`${title} prompt saved`);
				await Promise.all([
					reload(),
					client.invalidateQueries({ queryKey: getGetConfigsQueryKey() }),
				]);
			},
			onError: (failure) => setError(errorMessage(failure)),
		},
	});
	const busy = save.isPending || reloading;
	async function reloadSaved() {
		setReloading(true);
		try {
			const latest = await reload();
			if (!latest) throw new Error("Prompt unavailable");
			setValue(latest.prompts[field]);
			setSavedValue(latest.prompts[field]);
			setBase(latest.revisions[field]);
			setError("");
		} catch {
			setError("Could not reload the prompt. Your draft is still here.");
		} finally {
			setReloading(false);
		}
	}
	function submit(event: FormEvent) {
		event.preventDefault();
		if (!canEdit || busy) return;
		if (value.length > data.maxLength) {
			setError(`Use at most ${data.maxLength.toLocaleString()} characters.`);
			return;
		}
		setError("");
		save.mutate({ data: { key, value: value.trim(), baseUpdatedAt: base } });
	}
	return (
		<details className="rounded-control border border-line p-4">
			<summary className="min-h-11 cursor-pointer font-medium">
				<span>{title}</span>
			</summary>
			<form onSubmit={submit} className="mt-3 grid gap-3">
				<Field
					label={`${title} prompt`}
					hint={`${hint} Blank uses the default template.`}
				>
					<textarea
						className="input min-h-48 resize-y"
						value={value}
						maxLength={data.maxLength}
						readOnly={!canEdit}
						disabled={busy}
						spellCheck={false}
						onChange={(event) => {
							setValue(event.target.value);
							setError("");
						}}
					/>
				</Field>
				{base !== data.revisions[field] && (
					<p className="text-sm text-warning">
						A newer version is available. Reload it before editing further.
					</p>
				)}
				{error && (
					<p className="field-error" role="alert">
						{error}
					</p>
				)}
				{canEdit && (
					<div className="flex flex-wrap justify-end gap-2">
						<Button
							variant="secondary"
							onClick={() => void reloadSaved()}
							disabled={busy}
						>
							Reload saved prompt
						</Button>
						<Button
							variant="secondary"
							disabled={busy || value === data.defaults[field]}
							onClick={() => {
								setValue(data.defaults[field]);
								setError("");
							}}
						>
							Reset to default
						</Button>
						<Button
							type="submit"
							variant="primary"
							loading={save.isPending}
							disabled={reloading || value === savedValue}
						>
							Save prompt
						</Button>
					</div>
				)}
			</form>
		</details>
	);
}

export function AiPromptsCard() {
	const query = useGetAiInstructions();
	const { can } = useAuth();
	if (!query.data)
		return query.isError ? (
			<ErrorState error={query.error} onRetry={() => query.refetch()} />
		) : (
			<TableSkeleton rows={3} />
		);
	const data = query.data;
	return (
		<section className="card grid gap-4 p-5" aria-label="AI prompts">
			<div>
				<h2 className="font-semibold">AI prompts</h2>
				<p className="mt-1 text-sm text-muted">
					Shared templates for Cloud and Desktop generation. Changes apply when
					a new prompt is built; saved image prompts stay editable on their
					records.
				</p>
			</div>
			{PROMPTS.map((definition) => (
				<PromptEditor
					key={definition.field}
					definition={definition}
					data={data}
					reload={async () => {
						const result = await query.refetch();
						return result.isError ? undefined : result.data;
					}}
					canEdit={can(PERMISSIONS.configs.save)}
				/>
			))}
		</section>
	);
}
