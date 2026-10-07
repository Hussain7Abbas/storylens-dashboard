import { useQueryClient } from "@tanstack/react-query";
import {
	CornerDownRight,
	History,
	Pencil,
	Plus,
	Tag,
	Trash2,
	UserRound,
} from "lucide-react";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import { errorMessage } from "@/api/axios-instance";
import {
	deleteKeywordAliasesById,
	deleteKeywordsById,
	deleteKeywordVersionsById,
} from "@/api/generated/endpoints/admin-keywords";
import {
	AliasForm,
	KeywordForm,
	type StyleOptions,
	VersionForm,
} from "@/components/keywords/keyword-forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { fuzzyScore, normalizeForSearch } from "@/lib/fuzzy";
import {
	chapterRange,
	type KeywordAlias,
	type KeywordDetail,
	type KeywordStyle,
	type KeywordVersion,
	refreshKeywords,
	sortedVersions,
	styleName,
} from "@/lib/keyword-details";
import { PERMISSIONS } from "@/lib/permissions";
import {
	bothNames,
	LANGUAGE_LABELS,
	type Language,
	namesByScript,
} from "@/lib/translation";
import { useSearchState } from "@/lib/use-search-state";

const PAGE_SIZE = 25;
const FILTER_KEYS = [
	"lang",
	"q",
	"image",
	"name",
	"languages",
	"category",
	"nature",
	"description",
	"match",
	"addedBy",
] as const;

type Editing =
	| { kind: "keyword"; keyword: KeywordDetail | null }
	| { kind: "alias"; keyword: KeywordDetail; alias: KeywordAlias | null }
	| { kind: "version"; keyword: KeywordDetail; version: KeywordVersion | null };

type Deleting =
	| { kind: "keyword"; keyword: KeywordDetail }
	| { kind: "alias"; keyword: KeywordDetail; alias: KeywordAlias }
	| { kind: "version"; keyword: KeywordDetail; version: KeywordVersion };

type Row = {
	keyword: KeywordDetail;
	names: Record<Language, string | null>;
	base: KeywordVersion | undefined;
	versions: KeywordVersion[];
	/** Normalized short fields (names, aliases, styles, creator) for fuzzy matching. */
	shortText: string[];
	nameText: string[];
	/** Normalized descriptions, matched by substring (fuzzy is too slow on long text). */
	descriptionText: string;
};

const EMPTY = "—";

function bestScore(query: string, texts: string[]): number {
	return Math.max(0, ...texts.map((text) => fuzzyScore(query, text)));
}

function toRow(keyword: KeywordDetail): Row {
	const versions = sortedVersions(keyword);
	const base = versions[0];
	const names = namesByScript(keyword);
	const styles = [...versions, ...keyword.aliases].flatMap((item) =>
		[item.category, item.nature].flatMap((style) =>
			style ? [styleName(style)] : [],
		),
	);
	const nameText = [
		names.ar,
		names.en,
		...keyword.aliases.flatMap((alias) => [alias.nameAr, alias.nameEn]),
	].flatMap((name) => (name ? [normalizeForSearch(name)] : []));
	return {
		keyword,
		names,
		base,
		versions,
		nameText,
		shortText: [
			...nameText,
			...styles.map(normalizeForSearch),
			...(keyword.createdBy
				? [normalizeForSearch(keyword.createdBy.username)]
				: []),
		],
		descriptionText: normalizeForSearch(
			[...versions, ...keyword.aliases]
				.map((item) => item.description ?? "")
				.join(" "),
		),
	};
}

function StyleChip({
	style,
	inherited = false,
}: {
	style: KeywordStyle | null | undefined;
	inherited?: boolean;
}) {
	if (!style) return <span className="text-muted">{EMPTY}</span>;
	return (
		<span
			className={`inline-flex items-center gap-1.5 whitespace-nowrap ${inherited ? "text-muted italic" : ""}`}
			title={inherited ? "Same as the keyword" : undefined}
		>
			<span
				className="size-2.5 shrink-0 rounded-full"
				style={{ background: style.color }}
				aria-hidden
			/>
			<span>{styleName(style)}</span>
		</span>
	);
}

function Thumbnail({
	image,
	label,
	small = false,
}: {
	image: { url: string } | null | undefined;
	label: string;
	small?: boolean;
}) {
	const size = small ? "size-8" : "size-11";
	return (
		<div
			className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-wash text-muted`}
		>
			{image ? (
				<img
					src={image.url}
					alt={label}
					loading="lazy"
					className="size-full object-cover"
				/>
			) : (
				<UserRound size={small ? 14 : 18} strokeWidth={1.75} aria-hidden />
			)}
		</div>
	);
}

function Languages({ names }: { names: Record<Language, string | null> }) {
	return (
		<span className="flex gap-1">
			{(["ar", "en"] as const).map((language) => {
				const label = language === "ar" ? "Ar" : "En";
				return names[language] ? (
					<span
						key={language}
						className="badge badge-success"
						title={`${LANGUAGE_LABELS[language]}: ${names[language]}`}
					>
						{label}
					</span>
				) : (
					<span
						key={language}
						className="badge text-muted line-through"
						title={`No ${LANGUAGE_LABELS[language]} name`}
					>
						{label}
						<span className="sr-only"> missing</span>
					</span>
				);
			})}
		</span>
	);
}

function Description({
	text,
	inherited = false,
}: {
	text: string | null | undefined;
	inherited?: boolean;
}) {
	if (!text) return <span className="text-muted">{EMPTY}</span>;
	return (
		<p
			className={`line-clamp-2 max-w-72 text-xs ${inherited ? "text-muted italic" : ""}`}
			dir="auto"
			title={text}
		>
			{text}
		</p>
	);
}

function IconAction({
	label,
	icon,
	onClick,
	danger = false,
	disabled = false,
	title,
}: {
	label: string;
	icon: ReactNode;
	onClick: () => void;
	danger?: boolean;
	disabled?: boolean;
	title?: string;
}) {
	return (
		<Button
			variant="ghost"
			iconOnly
			className={danger ? "text-danger" : ""}
			aria-label={label}
			title={title ?? label}
			disabled={disabled}
			onClick={onClick}
			icon={icon}
		/>
	);
}

const icon = (Icon: typeof Pencil) => (
	<Icon size={16} strokeWidth={1.75} aria-hidden />
);

function FilterField({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="min-w-0">
			<p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
				{label}
			</p>
			{children}
		</div>
	);
}

function FilterSelect({
	label,
	value,
	onChange,
	options,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	options: { value: string; label: string }[];
}) {
	return (
		<FilterField label={label}>
			<select
				className="input"
				aria-label={`Filter by ${label.toLowerCase()}`}
				value={value}
				onChange={(event) => onChange(event.target.value)}
			>
				<option value="">All</option>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</FilterField>
	);
}

/**
 * A novel's characters (keywords): Arabic/English switch, full search, one
 * filter per column, and each keyword's versions and aliases nested below it
 * as in the extension.
 */
export function CharactersSection({
	novelId,
	keywords,
	options,
}: {
	novelId: string;
	keywords: KeywordDetail[];
	options: StyleOptions;
}) {
	const { can } = useAuth();
	const toast = useToast();
	const queryClient = useQueryClient();
	const { values, page, set } = useSearchState(FILTER_KEYS);
	const language: Language = values.lang === "en" ? "en" : "ar";
	const [editing, setEditing] = useState<Editing | null>(null);
	const [deleting, setDeleting] = useState<Deleting | null>(null);
	const [deleteBusy, setDeleteBusy] = useState(false);
	const [deleteError, setDeleteError] = useState("");

	const rows = useMemo(() => keywords.map(toRow), [keywords]);
	const creators = useMemo(() => {
		const byId = new Map<string, string>();
		for (const { keyword } of rows)
			if (keyword.createdBy)
				byId.set(keyword.createdBy.id, keyword.createdBy.username);
		return [...byId].map(([value, label]) => ({ value, label }));
	}, [rows]);

	const filtered = useMemo(() => {
		const q = normalizeForSearch(values.q);
		const name = normalizeForSearch(values.name);
		const description = normalizeForSearch(values.description);
		const scored = rows.flatMap((row) => {
			const { keyword, names, base } = row;
			if (!names[language]) return [];
			if (values.languages === "both" && !(names.ar && names.en)) return [];
			if (values.languages === "ar-only" && !(names.ar && !names.en)) return [];
			if (values.languages === "en-only" && !(names.en && !names.ar)) return [];
			const matchesStyle = (filter: string, id: string | null | undefined) =>
				!filter || (filter === "none" ? !id : id === filter);
			if (!matchesStyle(values.category, base?.categoryId)) return [];
			if (!matchesStyle(values.nature, base?.natureId)) return [];
			if (values.image === "with" && !base?.image) return [];
			if (values.image === "without" && base?.image) return [];
			if (values.match && keyword.matchingType !== values.match) return [];
			if (
				values.addedBy &&
				(values.addedBy === "none"
					? keyword.createdBy
					: keyword.createdBy?.id !== values.addedBy)
			)
				return [];
			if (description && !row.descriptionText.includes(description)) return [];
			let score = 0;
			if (name) {
				score = bestScore(name, row.nameText);
				if (!score) return [];
			}
			if (q) {
				const found = Math.max(
					bestScore(q, row.shortText),
					row.descriptionText.includes(q) ? 30 : 0,
				);
				if (!found) return [];
				score += found;
			}
			return [{ row, score }];
		});
		const collator = new Intl.Collator(language);
		return scored
			.sort(
				(a, b) =>
					b.score - a.score ||
					collator.compare(
						a.row.names[language] ?? "",
						b.row.names[language] ?? "",
					),
			)
			.map((entry) => entry.row);
	}, [rows, values, language]);

	const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const current = Math.min(page, pages);
	const visible = filtered.slice(
		(current - 1) * PAGE_SIZE,
		current * PAGE_SIZE,
	);
	const filtering = FILTER_KEYS.some((key) => key !== "lang" && values[key]);

	const closeDelete = () => {
		setDeleting(null);
		setDeleteError("");
	};
	const confirmDelete = async () => {
		if (!deleting) return;
		setDeleteBusy(true);
		setDeleteError("");
		try {
			if (deleting.kind === "keyword")
				await deleteKeywordsById(deleting.keyword.id);
			else if (deleting.kind === "alias")
				await deleteKeywordAliasesById(deleting.alias.id);
			else await deleteKeywordVersionsById(deleting.version.id);
			await refreshKeywords(queryClient, novelId);
			toast.success(
				deleting.kind === "keyword"
					? "Keyword deleted"
					: deleting.kind === "alias"
						? "Alias deleted"
						: "Version deleted",
			);
			closeDelete();
		} catch (reason) {
			setDeleteError(errorMessage(reason));
		} finally {
			setDeleteBusy(false);
		}
	};

	const nameOf = (row: Row) =>
		row.names[language] ?? row.names.ar ?? row.names.en ?? "Untitled";
	const labelOf = (keyword: KeywordDetail) =>
		namesByScript(keyword)[language] ??
		keyword.nameAr ??
		keyword.nameEn ??
		"Untitled";

	return (
		<section className="card" aria-labelledby="characters-heading">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
				<div>
					<h2 id="characters-heading" className="text-lg font-semibold">
						Characters
					</h2>
					<p className="text-sm text-muted">
						{filtered.length} of {rows.length} keywords
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					{can(PERMISSIONS.keywords.create) && (
						<Button
							variant="primary"
							icon={icon(Plus)}
							onClick={() => setEditing({ kind: "keyword", keyword: null })}
						>
							New keyword
						</Button>
					)}
					<fieldset className="flex rounded-[var(--control-radius)] border border-line p-0.5">
						<legend className="sr-only">Language</legend>
						{(["ar", "en"] as const).map((item) => (
							<label
								key={item}
								className={`cursor-pointer rounded-[calc(var(--control-radius)-2px)] px-4 py-1.5 text-sm font-semibold ${language === item ? "bg-accent text-on-accent" : "text-muted hover:text-ink"}`}
							>
								<input
									type="radio"
									name="characters-language"
									className="sr-only"
									checked={language === item}
									onChange={() => set({ lang: item === "ar" ? "" : item })}
								/>
								<span aria-hidden>{item.toUpperCase()}</span>
								<span className="sr-only">{LANGUAGE_LABELS[item]}</span>
							</label>
						))}
					</fieldset>
				</div>
			</div>

			<div className="grid gap-3 border-b border-line p-4">
				<div className="flex flex-wrap items-center gap-3">
					<SearchInput
						label="Search all columns"
						placeholder="Search names, aliases, descriptions, styles…"
						value={values.q}
						onChange={(q) => set({ q })}
					/>
					{filtering && (
						<Button
							variant="ghost"
							onClick={() =>
								set(
									Object.fromEntries(
										FILTER_KEYS.filter((key) => key !== "lang").map((key) => [
											key,
											"",
										]),
									),
								)
							}
						>
							Clear filters
						</Button>
					)}
				</div>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
					<FilterSelect
						label="Image"
						value={values.image}
						onChange={(image) => set({ image })}
						options={[
							{ value: "with", label: "With image" },
							{ value: "without", label: "Without image" },
						]}
					/>
					<FilterField label="Character">
						<SearchInput
							label="Filter by character name"
							placeholder="Name or alias"
							value={values.name}
							onChange={(name) => set({ name })}
						/>
					</FilterField>
					<FilterSelect
						label="Languages"
						value={values.languages}
						onChange={(languages) => set({ languages })}
						options={[
							{ value: "both", label: "Ar and En" },
							{ value: "ar-only", label: "Ar only" },
							{ value: "en-only", label: "En only" },
						]}
					/>
					<FilterSelect
						label="Category"
						value={values.category}
						onChange={(category) => set({ category })}
						options={[
							{ value: "none", label: "No category" },
							...options.categories.map((category) => ({
								value: category.id,
								label: styleName(category),
							})),
						]}
					/>
					<FilterSelect
						label="Nature"
						value={values.nature}
						onChange={(nature) => set({ nature })}
						options={[
							{ value: "none", label: "No nature" },
							...options.natures.map((nature) => ({
								value: nature.id,
								label: styleName(nature),
							})),
						]}
					/>
					<FilterField label="Description">
						<SearchInput
							label="Filter by description"
							placeholder="Contains…"
							value={values.description}
							onChange={(description) => set({ description })}
						/>
					</FilterField>
					<FilterSelect
						label="Match"
						value={values.match}
						onChange={(match) => set({ match })}
						options={[
							{ value: "FULL", label: "Full word" },
							{ value: "PARTIAL", label: "Partial" },
						]}
					/>
					<FilterSelect
						label="Added by"
						value={values.addedBy}
						onChange={(addedBy) => set({ addedBy })}
						options={[{ value: "none", label: "Unknown" }, ...creators]}
					/>
				</div>
			</div>

			{visible.length === 0 ? (
				<EmptyState title="No characters found">
					{rows.length === 0
						? "This novel has no keywords yet."
						: `Try another filter, or switch to ${LANGUAGE_LABELS[language === "ar" ? "en" : "ar"]}.`}
				</EmptyState>
			) : (
				<>
					<div className="relative overflow-x-auto">
						<table className="data-table">
							<thead>
								<tr>
									<th scope="col">Image</th>
									<th scope="col">Character</th>
									<th scope="col">Languages supported</th>
									<th scope="col">Category</th>
									<th scope="col">Nature</th>
									<th scope="col">Description</th>
									<th scope="col">Match</th>
									<th scope="col">Added by</th>
									<th scope="col">Actions</th>
								</tr>
							</thead>
							<tbody>
								{visible.map((row) => {
									const { keyword, base, versions } = row;
									const name = nameOf(row);
									const other =
										row.names[language === "ar" ? "en" : "ar"] ?? null;
									return (
										<Fragment key={keyword.id}>
											<tr>
												<td>
													<Thumbnail image={base?.image} label={name} />
												</td>
												<td className="min-w-44">
													<p className="font-medium" dir="auto" lang={language}>
														{name}
													</p>
													{other && (
														<p className="text-xs text-muted" dir="auto">
															{other}
														</p>
													)}
													<p className="text-xs text-muted">
														{[
															versions.length > 1 &&
																`${versions.length} versions`,
															keyword.aliases.length > 0 &&
																`${keyword.aliases.length} ${keyword.aliases.length === 1 ? "alias" : "aliases"}`,
														]
															.filter(Boolean)
															.join(" · ")}
													</p>
												</td>
												<td>
													<Languages names={row.names} />
												</td>
												<td>
													<StyleChip style={base?.category} />
												</td>
												<td>
													<StyleChip style={base?.nature} />
												</td>
												<td>
													<Description text={base?.description} />
												</td>
												<td className="whitespace-nowrap">
													{keyword.matchingType === "FULL"
														? "Full word"
														: "Partial"}
												</td>
												<td className="whitespace-nowrap">
													<p>{keyword.createdBy?.username ?? EMPTY}</p>
													<p className="text-xs text-muted">
														{formatDate(keyword.createdAt)}
													</p>
												</td>
												<td>
													<div className="flex gap-1">
														{can(PERMISSIONS.keywords.update) &&
															can(PERMISSIONS.versions.update) && (
																<IconAction
																	label={`Edit ${name}`}
																	title="Edit"
																	icon={icon(Pencil)}
																	onClick={() =>
																		setEditing({ kind: "keyword", keyword })
																	}
																/>
															)}
														{can(PERMISSIONS.keywords.delete) && (
															<IconAction
																label={`Delete ${name}`}
																title="Delete"
																danger
																icon={icon(Trash2)}
																onClick={() =>
																	setDeleting({ kind: "keyword", keyword })
																}
															/>
														)}
														{can(PERMISSIONS.aliases.create) && (
															<IconAction
																label={`Add an alias to ${name}`}
																title="Add alias"
																icon={icon(Tag)}
																onClick={() =>
																	setEditing({
																		kind: "alias",
																		keyword,
																		alias: null,
																	})
																}
															/>
														)}
														{can(PERMISSIONS.versions.create) && (
															<IconAction
																label={`Add a version to ${name}`}
																title="Add version"
																icon={icon(History)}
																onClick={() =>
																	setEditing({
																		kind: "version",
																		keyword,
																		version: null,
																	})
																}
															/>
														)}
													</div>
												</td>
											</tr>
											{versions.length > 1 &&
												versions.map((version) => {
													const isBase = version.id === base?.id;
													const label = `${isBase ? "Base version" : "Version"} ${chapterRange(version)}`;
													return (
														<tr key={version.id} className="bg-wash/40">
															<td>
																<div className="flex items-center gap-1 pl-2">
																	<CornerDownRight
																		size={14}
																		strokeWidth={1.75}
																		className="text-muted"
																		aria-hidden
																	/>
																	<Thumbnail
																		small
																		image={version.image}
																		label={`${name}, ${label}`}
																	/>
																</div>
															</td>
															<td>
																<p className="text-xs font-semibold text-muted uppercase">
																	{isBase ? "Base version" : "Version"}
																</p>
																<p className="text-sm">
																	{chapterRange(version)}
																</p>
															</td>
															<td />
															<td>
																<StyleChip
																	style={version.category ?? base?.category}
																	inherited={!version.category}
																/>
															</td>
															<td>
																<StyleChip
																	style={version.nature ?? base?.nature}
																	inherited={!version.nature}
																/>
															</td>
															<td>
																<Description
																	text={
																		version.description ?? base?.description
																	}
																	inherited={!version.description}
																/>
															</td>
															<td />
															<td />
															<td>
																<div className="flex gap-1">
																	{can(PERMISSIONS.versions.update) && (
																		<IconAction
																			label={`Edit ${name} ${label}`}
																			title="Edit version"
																			icon={icon(Pencil)}
																			onClick={() =>
																				setEditing({
																					kind: "version",
																					keyword,
																					version,
																				})
																			}
																		/>
																	)}
																	{can(PERMISSIONS.versions.delete) && (
																		<IconAction
																			label={`Delete ${name} ${label}`}
																			title={
																				isBase
																					? "The base version can’t be deleted"
																					: "Delete version"
																			}
																			danger
																			disabled={isBase}
																			icon={icon(Trash2)}
																			onClick={() =>
																				setDeleting({
																					kind: "version",
																					keyword,
																					version,
																				})
																			}
																		/>
																	)}
																</div>
															</td>
														</tr>
													);
												})}
											{keyword.aliases.map((alias) => {
												const names = {
													ar: alias.nameAr ?? null,
													en: alias.nameEn ?? null,
												};
												const label = bothNames(alias);
												return (
													<tr key={alias.id} className="bg-wash/40">
														<td>
															<div className="flex items-center gap-1 pl-2">
																<CornerDownRight
																	size={14}
																	strokeWidth={1.75}
																	className="text-muted"
																	aria-hidden
																/>
																<Thumbnail
																	small
																	image={alias.image}
																	label={label}
																/>
															</div>
														</td>
														<td>
															<p className="text-xs font-semibold text-muted uppercase">
																Alias
															</p>
															{[names.en, names.ar].map(
																(item) =>
																	item && (
																		<p
																			key={item}
																			className="text-sm"
																			dir="auto"
																		>
																			{item}
																		</p>
																	),
															)}
														</td>
														<td>
															<Languages names={names} />
														</td>
														<td>
															<StyleChip
																style={alias.category ?? base?.category}
																inherited={!alias.category}
															/>
														</td>
														<td>
															<StyleChip
																style={alias.nature ?? base?.nature}
																inherited={!alias.nature}
															/>
														</td>
														<td>
															<Description
																text={alias.description ?? base?.description}
																inherited={!alias.description}
															/>
														</td>
														<td className="whitespace-nowrap">
															<p>
																{alias.matchingType === "FULL"
																	? "Full word"
																	: "Partial"}
															</p>
															{alias.overrideStyle && (
																<span className="badge badge-accent">
																	Own style
																</span>
															)}
														</td>
														<td />
														<td>
															<div className="flex gap-1">
																{can(PERMISSIONS.aliases.update) && (
																	<IconAction
																		label={`Edit alias ${label}`}
																		title="Edit alias"
																		icon={icon(Pencil)}
																		onClick={() =>
																			setEditing({
																				kind: "alias",
																				keyword,
																				alias,
																			})
																		}
																	/>
																)}
																{can(PERMISSIONS.aliases.delete) && (
																	<IconAction
																		label={`Delete alias ${label}`}
																		title="Delete alias"
																		danger
																		icon={icon(Trash2)}
																		onClick={() =>
																			setDeleting({
																				kind: "alias",
																				keyword,
																				alias,
																			})
																		}
																	/>
																)}
															</div>
														</td>
													</tr>
												);
											})}
										</Fragment>
									);
								})}
							</tbody>
						</table>
					</div>
					<Pagination
						page={current}
						pageSize={PAGE_SIZE}
						total={filtered.length}
						onPage={(next) => set({ page: next })}
					/>
				</>
			)}

			<Dialog
				open={editing !== null}
				onClose={() => setEditing(null)}
				size="lg"
				title={
					!editing
						? ""
						: editing.kind === "keyword"
							? editing.keyword
								? `Edit ${labelOf(editing.keyword)}`
								: "New keyword"
							: editing.kind === "alias"
								? editing.alias
									? "Edit alias"
									: `Add an alias to ${labelOf(editing.keyword)}`
								: editing.version
									? "Edit version"
									: `Add a version to ${labelOf(editing.keyword)}`
				}
			>
				{editing?.kind === "keyword" && (
					<KeywordForm
						key={editing.keyword?.id ?? "new"}
						keyword={editing.keyword}
						novelId={novelId}
						language={language}
						options={options}
						onDone={() => setEditing(null)}
					/>
				)}
				{editing?.kind === "alias" && (
					<AliasForm
						key={editing.alias?.id ?? `new-${editing.keyword.id}`}
						keyword={editing.keyword}
						alias={editing.alias}
						language={language}
						options={options}
						onDone={() => setEditing(null)}
					/>
				)}
				{editing?.kind === "version" && (
					<VersionForm
						key={editing.version?.id ?? `new-${editing.keyword.id}`}
						keyword={editing.keyword}
						version={editing.version}
						options={options}
						onDone={() => setEditing(null)}
					/>
				)}
			</Dialog>

			<ConfirmDialog
				open={deleting !== null}
				title={
					deleting?.kind === "alias"
						? "Delete alias?"
						: deleting?.kind === "version"
							? "Delete version?"
							: "Delete keyword?"
				}
				confirmLabel={
					deleting?.kind === "alias"
						? "Delete alias"
						: deleting?.kind === "version"
							? "Delete version"
							: "Delete keyword"
				}
				busy={deleteBusy}
				error={deleteError}
				onClose={closeDelete}
				onConfirm={() => void confirmDelete()}
			>
				{deleting?.kind === "keyword" && (
					<span>
						<strong className="text-ink">{labelOf(deleting.keyword)}</strong>{" "}
						<span>
							and its {deleting.keyword.versions.length} versions and{" "}
							{deleting.keyword.aliases.length} aliases will be deleted for
							every reader. Replacements that used it keep their text. This
							can’t be undone.
						</span>
					</span>
				)}
				{deleting?.kind === "alias" && (
					<span>
						The alias{" "}
						<strong className="text-ink">{bothNames(deleting.alias)}</strong>{" "}
						<span>
							of {labelOf(deleting.keyword)} will no longer be highlighted.
						</span>
					</span>
				)}
				{deleting?.kind === "version" && (
					<span>
						<strong className="text-ink">
							{chapterRange(deleting.version)}
						</strong>{" "}
						<span>
							of {labelOf(deleting.keyword)} will be deleted. Earlier versions
							keep their chapter ranges.
						</span>
					</span>
				)}
			</ConfirmDialog>
		</section>
	);
}
