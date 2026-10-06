import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Check, CircleStop, EyeOff, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/api/axios-instance";
import {
	postKeywordsByIdAlias,
	postKeywordsByIdLink,
	postKeywordsByIdLinkAlias,
	postKeywordsByIdVersion,
	putKeywordsById,
	useGetKeywords,
} from "@/api/generated/endpoints/admin-keywords";
import { useGetNovels } from "@/api/generated/endpoints/admin-novels";
import type { GetKeywords200DataItem } from "@/api/generated/schemas";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import {
	KeywordPicker,
	type PickedKeyword,
} from "@/components/ui/keyword-picker";
import {
	EmptyState,
	ErrorState,
	PageHeader,
	TableSkeleton,
} from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import {
	type DesktopCapabilities,
	type DesktopSettings,
	executePrompt,
	isReady,
	loadCapabilities,
	loadDesktopSettings,
	saveDesktopSettings,
} from "@/lib/desktop-client";
import {
	baseVersion,
	type KeywordDetail,
	refreshKeywords,
} from "@/lib/keyword-details";
import { novelKeywordsQuery } from "@/lib/novel-keywords";
import { PERMISSIONS } from "@/lib/permissions";
import {
	bothNames,
	isMisfiled,
	LANGUAGE_LABELS,
	type Language,
	namesByScript,
	singleName,
} from "@/lib/translation";
import {
	buildTranslationPrompt,
	parseTranslationAnswer,
	type TranslationCandidate,
	type TranslationSuggestion,
} from "@/lib/translation-prompt";
import { useSearchState } from "@/lib/use-search-state";

type Keyword = GetKeywords200DataItem;
type Relation = "link" | "alias" | "version";

/** The admin's edits for one row; at most one relation is set. */
type Draft = {
	translation: string;
	link: PickedKeyword | null;
	alias: PickedKeyword | null;
	version: PickedKeyword | null;
};

type AiState =
	| { status: "idle" }
	| { status: "running" }
	| { status: "error"; message: string };

const PAGE_SIZE = 50;
const EMPTY_DRAFT: Draft = {
	translation: "",
	link: null,
	alias: null,
	version: null,
};

function relationOf(draft: Draft): Relation | null {
	if (draft.link) return "link";
	if (draft.alias) return "alias";
	if (draft.version) return "version";
	return null;
}

/** Keywords named only in `target`: the ones a `target`-less keyword may be linked to. */
function candidatesIn(
	keywords: KeywordDetail[],
	target: Language,
): (TranslationCandidate & { keyword: KeywordDetail })[] {
	return keywords.flatMap((keyword) => {
		const single = singleName(keyword);
		return single?.source === target
			? [{ id: keyword.id, name: single.name, keyword }]
			: [];
	});
}

function toPicked(keyword: KeywordDetail): PickedKeyword {
	const base = baseVersion(keyword);
	return {
		kind: "keyword",
		id: keyword.id,
		keywordId: keyword.id,
		label: bothNames(keyword),
		nameAr: keyword.nameAr,
		nameEn: keyword.nameEn,
		style: {
			description: base?.description ?? null,
			categoryId: base?.categoryId ?? null,
			natureId: base?.natureId ?? null,
			image: base?.image ? { id: base.image.id, url: base.image.url } : null,
		},
	};
}

/** Moves a lone name stored in the other language's column into its own. */
async function fileByScript(keyword: {
	id: string;
	nameAr: string | null;
	nameEn: string | null;
}) {
	if (!isMisfiled(keyword)) return;
	const names = namesByScript(keyword);
	await putKeywordsById(keyword.id, { nameAr: names.ar, nameEn: names.en });
}

function DesktopClientSettings({
	settings,
	onChange,
}: {
	settings: DesktopSettings;
	onChange: (settings: DesktopSettings) => void;
}) {
	const [port, setPort] = useState(settings.port ? String(settings.port) : "");
	const [token, setToken] = useState(settings.token);
	const [capabilities, setCapabilities] = useState<DesktopCapabilities>();
	const [connecting, setConnecting] = useState(false);
	const [error, setError] = useState("");
	const model = capabilities?.models.find((item) => item.id === settings.model);

	const connect = async () => {
		const next = { ...settings, port: Number(port), token: token.trim() };
		setError("");
		setConnecting(true);
		try {
			const loaded = await loadCapabilities(next);
			setCapabilities(loaded);
			const chosen =
				loaded.models.find((item) => item.id === next.model) ??
				loaded.models[0];
			onChange({
				...next,
				model: chosen?.id ?? "",
				effort: chosen?.efforts.includes(next.effort)
					? next.effort
					: (chosen?.defaultEffort ?? ""),
			});
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setConnecting(false);
		}
	};

	return (
		<details className="card p-4" open={!isReady(settings)}>
			<summary className="cursor-pointer text-sm font-semibold">
				AI (desktop client){" "}
				<span
					className={`badge ${isReady(settings) ? "badge-success" : "badge-warning"} ml-2`}
				>
					{isReady(settings)
						? `${settings.model} · ${settings.effort}`
						: "Not paired"}
				</span>
			</summary>
			<p className="mt-2 text-sm text-muted">
				Open the Story Lens desktop client’s Settings tab for its port and
				pairing token. Your browser may ask to let this site reach apps on this
				device.
			</p>
			<div className="mt-4 grid gap-4 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
				<Field label="Port">
					<input
						className="input"
						inputMode="numeric"
						value={port}
						onChange={(event) => setPort(event.target.value)}
					/>
				</Field>
				<Field label="Pairing token">
					<input
						className="input"
						type="password"
						autoComplete="off"
						value={token}
						onChange={(event) => setToken(event.target.value)}
					/>
				</Field>
				<Button loading={connecting} onClick={() => void connect()}>
					Connect
				</Button>
			</div>
			{capabilities && (
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<Field label="Model">
						<select
							className="input"
							value={settings.model}
							onChange={(event) => {
								const next = capabilities.models.find(
									(item) => item.id === event.target.value,
								);
								onChange({
									...settings,
									model: event.target.value,
									effort: next?.defaultEffort ?? "",
								});
							}}
						>
							{capabilities.models.map((item) => (
								<option key={item.id} value={item.id}>
									{item.label}
								</option>
							))}
						</select>
					</Field>
					<Field label="Effort">
						<select
							className="input"
							value={settings.effort}
							onChange={(event) =>
								onChange({ ...settings, effort: event.target.value })
							}
						>
							{(model?.efforts ?? []).map((effort) => (
								<option key={effort} value={effort}>
									{effort}
								</option>
							))}
						</select>
					</Field>
				</div>
			)}
			{error && (
				<p className="field-error mt-3" role="alert">
					{error}
				</p>
			)}
		</details>
	);
}

export function MatchTranslationsPage() {
	const { can } = useAuth();
	const toast = useToast();
	const queryClient = useQueryClient();
	const { values, page, set } = useSearchState(["novel"] as const);
	const novelId = values.novel;

	const [settings, setSettingsState] = useState(loadDesktopSettings);
	const setSettings = (next: DesktopSettings) => {
		setSettingsState(next);
		saveDesktopSettings(next);
	};

	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	// AI may replace its own earlier draft on re-suggest, but never an admin edit.
	const manuallyEdited = useRef(new Set<string>());
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [suggestions, setSuggestions] = useState<
		Record<string, TranslationSuggestion>
	>({});
	const [ignored, setIgnored] = useState<Set<string>>(new Set());
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [saving, setSaving] = useState<Set<string>>(new Set());
	const [ai, setAi] = useState<AiState>({ status: "idle" });
	const [pendingNavigation, setPendingNavigation] = useState<
		(() => void) | null
	>(null);

	const novels = useGetNovels({ pageSize: 100, sort: "name" });
	const novel = novels.data?.data.find((item) => item.id === novelId);

	const keywords = useGetKeywords(
		{ novelId, untranslated: true, page, pageSize: PAGE_SIZE },
		{ query: { enabled: !!novelId, placeholderData: (previous) => previous } },
	);
	const rows = useMemo(
		() =>
			(keywords.data?.data ?? []).filter(
				(keyword) => !ignored.has(keyword.id) && singleName(keyword),
			),
		[keywords.data, ignored],
	);

	const draftOf = (id: string): Draft => drafts[id] ?? EMPTY_DRAFT;
	const updateDraft = (id: string, patch: Partial<Draft>) => {
		manuallyEdited.current.add(id);
		setDrafts((current) => ({
			...current,
			[id]: { ...(current[id] ?? EMPTY_DRAFT), ...patch },
		}));
	};

	// AI suggestions run only when asked; cancelling aborts the request, which
	// makes the desktop client stop the model instead of finishing unseen.
	const aiRun = useRef(0);
	const aiAbort = useRef<AbortController | null>(null);
	const stopSuggesting = useCallback(() => {
		aiRun.current++;
		aiAbort.current?.abort();
		aiAbort.current = null;
		setAi({ status: "idle" });
	}, []);
	const suggest = useCallback(
		async (targets: Keyword[]) => {
			if (!novelId || !isReady(settings) || targets.length === 0) return;
			aiAbort.current?.abort();
			const controller = new AbortController();
			aiAbort.current = controller;
			const run = ++aiRun.current;
			setAi({ status: "running" });
			try {
				const all = (await queryClient.fetchQuery(novelKeywordsQuery(novelId)))
					.data;
				for (const target of ["en", "ar"] as const) {
					const sources = targets.filter(
						(keyword) => singleName(keyword)?.target === target,
					);
					if (sources.length === 0) continue;
					const candidates = candidatesIn(all, target);
					const prompt = buildTranslationPrompt({
						novelName: novel ? bothNames(novel) : "",
						target,
						candidates,
						sources: sources.map((keyword) => ({
							id: keyword.id,
							name: singleName(keyword)?.name ?? "",
							description: keyword.description,
							aliases: keyword.aliases,
						})),
					});
					const answer = parseTranslationAnswer(
						await executePrompt(settings, prompt, target, controller.signal),
						new Set(sources.map((keyword) => keyword.id)),
						new Set(candidates.map((candidate) => candidate.id)),
					);
					if (run !== aiRun.current) return;
					const matches = new Map(
						candidates.map((candidate) => [candidate.id, candidate.keyword]),
					);
					setSuggestions((current) => ({
						...current,
						...Object.fromEntries(answer),
					}));
					// Prefill rows the admin hasn't touched.
					setDrafts((current) => {
						const next = { ...current };
						for (const [id, suggestion] of answer) {
							if (manuallyEdited.current.has(id)) continue;
							const match = suggestion.matchId
								? matches.get(suggestion.matchId)
								: undefined;
							next[id] = {
								...EMPTY_DRAFT,
								translation: suggestion.translation,
								link: match ? toPicked(match) : null,
							};
						}
						return next;
					});
				}
				if (run === aiRun.current) setAi({ status: "idle" });
			} catch (reason) {
				// A cancelled run already went back to idle.
				if (run === aiRun.current && !controller.signal.aborted)
					setAi({
						status: "error",
						message: reason instanceof Error ? reason.message : String(reason),
					});
			} finally {
				if (aiAbort.current === controller) aiAbort.current = null;
			}
		},
		[novelId, novel, settings, queryClient],
	);

	// Changing novel or page, or leaving, stops a running suggestion.
	const pageKey = `${novelId}:${page}`;
	const suggestedFor = useRef(pageKey);
	useEffect(() => {
		if (suggestedFor.current === pageKey) return;
		suggestedFor.current = pageKey;
		stopSuggesting();
	}, [pageKey, stopSuggesting]);
	useEffect(
		() => () => {
			aiRun.current++;
			aiAbort.current?.abort();
		},
		[],
	);
	const unsuggested = rows.filter((keyword) => !suggestions[keyword.id]);
	const suggestedOnPage = rows.some((keyword) => suggestions[keyword.id]);

	const selectedOnPage = rows.filter((keyword) => selected.has(keyword.id));
	const allSelected = rows.length > 0 && selectedOnPage.length === rows.length;

	/** Leaving the page drops the selection, so ask first when rows are selected. */
	const guard = (navigate: () => void) => {
		if (selected.size > 0) setPendingNavigation(() => navigate);
		else navigate();
	};

	const saveRow = async (keyword: Keyword): Promise<boolean> => {
		const draft = draftOf(keyword.id);
		const single = singleName(keyword);
		if (!single) return true;
		setErrors((current) => {
			const next = { ...current };
			delete next[keyword.id];
			return next;
		});
		setSaving((current) => new Set(current).add(keyword.id));
		try {
			if (draft.link) {
				const link = draft.link;
				// An alias keeps a name per language; a keyword's lone name goes by its script.
				const taken =
					link.kind === "alias"
						? { ar: link.nameAr, en: link.nameEn }[single.source]
						: namesByScript(link)[single.source];
				if (taken && taken !== single.name) {
					throw new Error(
						link.kind === "alias"
							? `The alias “${link.label}” already has the ${LANGUAGE_LABELS[single.source]} name “${taken}”.`
							: `“${link.label}” already has the ${LANGUAGE_LABELS[single.source]} name “${taken}”. Use Alias of or Version of instead.`,
					);
				}
				if (link.kind === "alias") {
					// The row becomes the alias's name in its language, then is merged away.
					await postKeywordsByIdLinkAlias(keyword.id, { aliasId: link.id });
				} else {
					// Linking merges names by column, so both must be in the right one.
					await fileByScript(keyword);
					await fileByScript(link);
					await postKeywordsByIdLink(keyword.id, { targetId: link.id });
				}
			} else if (draft.alias) {
				await postKeywordsByIdAlias(keyword.id, { targetId: draft.alias.id });
			} else if (draft.version) {
				await postKeywordsByIdVersion(keyword.id, {
					targetId: draft.version.id,
				});
			} else {
				const translation = draft.translation.trim();
				if (!translation) {
					throw new Error(
						`Enter the ${LANGUAGE_LABELS[single.target]} name or pick a link, alias or version.`,
					);
				}
				// Both names, so a lone name filed under the wrong language moves too.
				await putKeywordsById(
					keyword.id,
					single.target === "ar"
						? { nameAr: translation, nameEn: single.name }
						: { nameAr: single.name, nameEn: translation },
				);
			}
			setSelected((current) => {
				const next = new Set(current);
				next.delete(keyword.id);
				return next;
			});
			return true;
		} catch (reason) {
			setErrors((current) => ({
				...current,
				[keyword.id]: isAxiosError(reason)
					? errorMessage(reason)
					: reason instanceof Error
						? reason.message
						: String(reason),
			}));
			return false;
		} finally {
			setSaving((current) => {
				const next = new Set(current);
				next.delete(keyword.id);
				return next;
			});
		}
	};

	const refresh = () => refreshKeywords(queryClient, novelId);

	const saveMany = async (targets: Keyword[]) => {
		let saved = 0;
		for (const keyword of targets) if (await saveRow(keyword)) saved++;
		await refresh();
		const failed = targets.length - saved;
		if (saved) toast.success(`${saved} ${saved === 1 ? "row" : "rows"} saved`);
		if (failed)
			toast.error(
				`${failed} ${failed === 1 ? "row" : "rows"} could not be saved`,
			);
	};

	const ignore = (ids: string[]) => {
		setIgnored((current) => new Set([...current, ...ids]));
		setSelected((current) => {
			const next = new Set(current);
			for (const id of ids) next.delete(id);
			return next;
		});
	};

	const canSave =
		can(PERMISSIONS.keywords.update) &&
		can(PERMISSIONS.keywords.link) &&
		can(PERMISSIONS.keywords.alias) &&
		can(PERMISSIONS.keywords.version);

	return (
		<>
			<PageHeader
				title="Match translations"
				description="Keywords named in only one language. AI suggests the missing name and whether it already exists in the other language; review each row, then save or ignore it."
			/>
			<div className="grid grid-cols-1 gap-4">
				<DesktopClientSettings settings={settings} onChange={setSettings} />

				<div className="card">
					<div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
						<Field label="Novel" className="w-full sm:max-w-sm">
							<select
								className="input"
								value={novelId}
								onChange={(event) =>
									guard(() => {
										setSelected(new Set());
										set({ novel: event.target.value, page: 1 });
									})
								}
							>
								<option value="">Choose a novel…</option>
								{(novels.data?.data ?? []).map((item) => (
									<option key={item.id} value={item.id}>
										{bothNames(item)}
									</option>
								))}
							</select>
						</Field>
						{novelId && (
							<div className="ml-auto flex flex-wrap items-center gap-2">
								{ai.status === "running" && (
									<output className="badge badge-accent">
										<Sparkles size={12} strokeWidth={1.75} aria-hidden />{" "}
										Suggesting translations…
									</output>
								)}
								{ai.status === "running" ? (
									<Button
										icon={
											<CircleStop size={16} strokeWidth={1.75} aria-hidden />
										}
										title="Stop the AI request for this page"
										onClick={stopSuggesting}
									>
										Cancel suggesting
									</Button>
								) : (
									<Button
										icon={<Sparkles size={16} strokeWidth={1.75} aria-hidden />}
										disabled={!isReady(settings) || rows.length === 0}
										title={
											!isReady(settings)
												? "Pair the desktop client first"
												: suggestedOnPage
													? "Ask the AI again for this page"
													: "Ask the AI for this page’s missing names"
										}
										onClick={() => {
											setSuggestions({});
											setAi({ status: "idle" });
											void suggest(rows);
										}}
									>
										{suggestedOnPage ? "Re-suggest page" : "Suggest page"}
									</Button>
								)}
								<Button
									variant="primary"
									icon={<Check size={16} strokeWidth={1.75} aria-hidden />}
									disabled={!canSave || selectedOnPage.length === 0}
									loading={selectedOnPage.some((keyword) =>
										saving.has(keyword.id),
									)}
									onClick={() => void saveMany(selectedOnPage)}
								>
									Save selected ({selectedOnPage.length})
								</Button>
								<Button
									icon={<EyeOff size={16} strokeWidth={1.75} aria-hidden />}
									disabled={selectedOnPage.length === 0}
									onClick={() =>
										ignore(selectedOnPage.map((keyword) => keyword.id))
									}
								>
									Ignore selected
								</Button>
							</div>
						)}
					</div>

					{ai.status === "error" && (
						<div
							className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-wash px-4 py-3 text-sm"
							role="alert"
						>
							<span className="text-danger">
								AI suggestions failed: {ai.message}
							</span>
							<Button
								icon={<RefreshCw size={16} strokeWidth={1.75} aria-hidden />}
								onClick={() => {
									setAi({ status: "idle" });
									void suggest(unsuggested);
								}}
							>
								Retry
							</Button>
						</div>
					)}
					{novelId && !isReady(settings) && (
						<p className="border-b border-line bg-wash px-4 py-3 text-sm text-muted">
							Pair the desktop client above to get AI suggestions. You can still
							translate and link rows by hand.
						</p>
					)}

					{!novelId ? (
						<EmptyState title="Choose a novel">
							Its keywords named in only Arabic or only English appear here.
						</EmptyState>
					) : keywords.error ? (
						<ErrorState
							error={keywords.error}
							onRetry={() => void keywords.refetch()}
						/>
					) : !keywords.data ? (
						<TableSkeleton columns={7} />
					) : rows.length === 0 ? (
						<EmptyState title="Nothing to match on this page">
							Every keyword here has both names, or the rest were ignored.
						</EmptyState>
					) : (
						<>
							<div className="relative overflow-x-auto">
								<table className="data-table">
									<thead>
										<tr>
											<th scope="col" className="w-10">
												<input
													type="checkbox"
													className="size-4 accent-accent"
													aria-label="Select all rows on this page"
													checked={allSelected}
													onChange={(event) =>
														setSelected(
															event.target.checked
																? new Set(rows.map((keyword) => keyword.id))
																: new Set(),
														)
													}
												/>
											</th>
											<th scope="col">Keyword</th>
											<th scope="col">Translation</th>
											<th scope="col">Link</th>
											<th scope="col">Alias of</th>
											<th scope="col">Version of</th>
											<th scope="col">
												<span className="sr-only">Actions</span>
											</th>
										</tr>
									</thead>
									<tbody>
										{rows.map((keyword) => {
											const { name, source, target } = singleName(keyword) ?? {
												name: "",
												source: "ar",
												target: "en",
											};
											const draft = draftOf(keyword.id);
											const relation = relationOf(draft);
											const suggestion = suggestions[keyword.id];
											const busy = saving.has(keyword.id);
											return (
												<tr key={keyword.id}>
													<td className="align-top">
														<input
															type="checkbox"
															className="size-4 accent-accent"
															aria-label={`Select ${name}`}
															checked={selected.has(keyword.id)}
															onChange={(event) =>
																setSelected((current) => {
																	const next = new Set(current);
																	if (event.target.checked)
																		next.add(keyword.id);
																	else next.delete(keyword.id);
																	return next;
																})
															}
														/>
													</td>
													<td className="min-w-48 align-top">
														<p className="font-medium" dir="auto" lang={source}>
															{name}
														</p>
														<p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
															<span className="badge">
																{LANGUAGE_LABELS[source]} →{" "}
																{LANGUAGE_LABELS[target]}
															</span>
															{keyword.aliases.length > 0 && (
																<span>aka {keyword.aliases.join(", ")}</span>
															)}
														</p>
														{keyword.description && (
															<p className="mt-1 line-clamp-2 max-w-72 text-xs text-muted">
																{keyword.description}
															</p>
														)}
													</td>
													<td className="min-w-48 align-top">
														<input
															className="input"
															aria-label={`${LANGUAGE_LABELS[target]} name for ${name}`}
															dir={target === "ar" ? "rtl" : "ltr"}
															lang={target}
															placeholder={
																ai.status === "running" && !suggestion
																	? "Suggesting…"
																	: `${LANGUAGE_LABELS[target]} name`
															}
															disabled={!!relation}
															value={draft.translation}
															onChange={(event) =>
																updateDraft(keyword.id, {
																	translation: event.target.value,
																})
															}
														/>
														{suggestion?.matchId &&
															draft.link?.id === suggestion.matchId && (
																<p className="mt-1 text-xs text-muted">
																	AI: probably the same as the linked keyword.
																</p>
															)}
													</td>
													<td className="align-top">
														<KeywordPicker
															novelId={novelId}
															excludeId={keyword.id}
															mode="link"
															label={`Link ${name} to its ${LANGUAGE_LABELS[target]} keyword`}
															placeholder="Search keywords…"
															value={draft.link}
															disabled={
																relation !== null && relation !== "link"
															}
															onChange={(link) =>
																updateDraft(keyword.id, { link })
															}
														/>
													</td>
													<td className="align-top">
														<KeywordPicker
															novelId={novelId}
															excludeId={keyword.id}
															mode="parent"
															label={`Make ${name} an alias of`}
															value={draft.alias}
															disabled={
																relation !== null && relation !== "alias"
															}
															onChange={(alias) =>
																updateDraft(keyword.id, { alias })
															}
														/>
													</td>
													<td className="align-top">
														<KeywordPicker
															novelId={novelId}
															excludeId={keyword.id}
															mode="parent"
															label={`Make ${name} a version of`}
															value={draft.version}
															disabled={
																relation !== null && relation !== "version"
															}
															onChange={(version) =>
																updateDraft(keyword.id, { version })
															}
														/>
													</td>
													<td className="align-top">
														<div className="flex justify-end gap-1">
															<Button
																variant="primary"
																loading={busy}
																disabled={!canSave}
																title="Save this row"
																onClick={async () => {
																	if (await saveRow(keyword)) {
																		toast.success("Row saved");
																		await refresh();
																	}
																}}
															>
																Save
															</Button>
															<Button
																title="Hide this row until you reload"
																disabled={busy}
																onClick={() => ignore([keyword.id])}
															>
																Ignore
															</Button>
														</div>
														{errors[keyword.id] && (
															<p
																className="field-error mt-1 max-w-56"
																role="alert"
															>
																{errors[keyword.id]}
															</p>
														)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
							<Pagination
								page={page}
								pageSize={PAGE_SIZE}
								total={keywords.data.total}
								onPage={(next) =>
									guard(() => {
										setSelected(new Set());
										set({ page: next });
									})
								}
							/>
						</>
					)}
				</div>
			</div>

			<ConfirmDialog
				open={pendingNavigation !== null}
				title="Discard the selection?"
				confirmLabel="Continue"
				onClose={() => setPendingNavigation(null)}
				onConfirm={() => {
					pendingNavigation?.();
					setPendingNavigation(null);
				}}
			>
				{selected.size} selected {selected.size === 1 ? "row is" : "rows are"}{" "}
				on this page. Selections apply to one page only, so they will be
				cleared. Unsaved edits in those rows stay until you reload.
			</ConfirmDialog>
		</>
	);
}
