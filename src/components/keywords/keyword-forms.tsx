import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useCallback, useState } from "react";
import { errorMessage } from "@/api/axios-instance";
import {
	postKeywordAliases,
	postKeywords,
	postKeywordVersions,
	putKeywordAliasesById,
	putKeywordsById,
	putKeywordVersionsById,
} from "@/api/generated/endpoints/admin-keywords";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ImageField, type PickedImage } from "@/components/ui/image-field";
import {
	KeywordPicker,
	type PickedKeyword,
} from "@/components/ui/keyword-picker";
import { useToast } from "@/components/ui/toast";
import {
	baseVersion,
	endOf,
	type KeywordAlias,
	type KeywordDetail,
	type KeywordStyle,
	type KeywordVersion,
	refreshKeywords,
	sortedVersions,
	startOf,
	styleName,
} from "@/lib/keyword-details";

type StyleValues = {
	description: string;
	categoryId: string;
	natureId: string;
	image: PickedImage | null;
};

type Styled = {
	description: string | null;
	categoryId: string | null;
	natureId: string | null;
	image: { id: string; url: string } | null;
};

function styleValues(item: Styled | undefined | null): StyleValues {
	return {
		description: item?.description ?? "",
		categoryId: item?.categoryId ?? "",
		natureId: item?.natureId ?? "",
		image: item?.image ? { id: item.image.id, url: item.image.url } : null,
	};
}

function styleBody(values: StyleValues) {
	return {
		description: values.description.trim() || null,
		categoryId: values.categoryId || null,
		natureId: values.natureId || null,
		imageId: values.image?.id ?? null,
	};
}

type Names = { nameAr: string | null; nameEn: string | null };

/**
 * Whether a row may be the saved row's translation: neither language may hold a
 * different name on both sides, since the merge keeps only one of each
 * (backend `missingNames`).
 */
function isTranslationCandidate(own: Names, other: Names): boolean {
	return (["nameAr", "nameEn"] as const).every(
		(field) => !own[field] || !other[field] || own[field] === other[field],
	);
}

const trimmed = (names: { nameAr: string; nameEn: string }): Names => ({
	nameAr: names.nameAr.trim() || null,
	nameEn: names.nameEn.trim() || null,
});

/** The style a picked translation hands over; the merge keeps only one row's. */
function translationStyle(picked: PickedKeyword): StyleValues {
	return {
		description: picked.style.description ?? "",
		categoryId: picked.style.categoryId ?? "",
		natureId: picked.style.natureId ?? "",
		image: picked.style.image,
	};
}

/**
 * Optional picker of the row that holds the saved row's other-language name.
 * `Field` clones its child to label it, which the picker's own combobox markup
 * already does, so the label and hint are rendered here instead.
 */
function TranslationLinkField({ children }: { children: ReactNode }) {
	return (
		<div>
			<p className="field-label">
				<span>Translation link</span>
			</p>
			{children}
			<p className="field-hint">
				<span>
					Optional. The entry with this one’s name in the other language: saving
					merges the two into this one and takes its category, nature,
					description and image.
				</span>
			</p>
		</div>
	);
}

export type StyleOptions = {
	categories: KeywordStyle[];
	natures: KeywordStyle[];
};

/** Category, nature, description and image, shared by keywords, aliases and versions. */
function StyleFields({
	values,
	onChange,
	options,
	onUploadingChange,
	inheritHint,
}: {
	values: StyleValues;
	onChange: (values: StyleValues) => void;
	options: StyleOptions;
	onUploadingChange: (uploading: boolean) => void;
	/** Shown when an empty field falls back to the keyword's own. */
	inheritHint?: string;
}) {
	const none = inheritHint ? "Same as the keyword" : "None";
	return (
		<>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Category">
					<select
						className="input"
						value={values.categoryId}
						onChange={(event) =>
							onChange({ ...values, categoryId: event.target.value })
						}
					>
						<option value="">{none}</option>
						{options.categories.map((category) => (
							<option key={category.id} value={category.id}>
								{styleName(category)}
							</option>
						))}
					</select>
				</Field>
				<Field label="Nature">
					<select
						className="input"
						value={values.natureId}
						onChange={(event) =>
							onChange({ ...values, natureId: event.target.value })
						}
					>
						<option value="">{none}</option>
						{options.natures.map((nature) => (
							<option key={nature.id} value={nature.id}>
								{styleName(nature)}
							</option>
						))}
					</select>
				</Field>
			</div>
			<Field label="Description" hint={inheritHint}>
				<textarea
					className="input"
					dir="auto"
					rows={3}
					maxLength={5000}
					value={values.description}
					onChange={(event) =>
						onChange({ ...values, description: event.target.value })
					}
				/>
			</Field>
			<ImageField
				label="Image"
				value={values.image}
				onChange={(image) => onChange({ ...values, image })}
				onUploadingChange={onUploadingChange}
			/>
		</>
	);
}

function FormShell({
	onSubmit,
	onCancel,
	busy,
	uploading,
	error,
	submitLabel,
	children,
}: {
	onSubmit: () => Promise<void>;
	onCancel: () => void;
	busy: boolean;
	uploading: boolean;
	error: string;
	submitLabel: string;
	children: ReactNode;
}) {
	return (
		<form
			className="grid gap-4"
			onSubmit={(event: FormEvent) => {
				event.preventDefault();
				void onSubmit();
			}}
		>
			{children}
			{error && (
				<p className="field-error" role="alert">
					{error}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<Button onClick={onCancel} disabled={busy}>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="primary"
					loading={busy}
					disabled={uploading}
				>
					{submitLabel}
				</Button>
			</div>
		</form>
	);
}

/** Runs a save, then refreshes keyword lists, toasts and closes; errors stay in the form. */
function useSave(novelId: string, onDone: () => void) {
	const queryClient = useQueryClient();
	const toast = useToast();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const run = async (save: () => Promise<unknown>, message: string) => {
		setError("");
		setBusy(true);
		try {
			await save();
			await refreshKeywords(queryClient, novelId);
			toast.success(message);
			onDone();
		} catch (reason) {
			setError(errorMessage(reason));
		} finally {
			setBusy(false);
		}
	};
	return { busy, error, setError, run };
}

function FullWordToggle({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-start gap-3 text-sm">
			<input
				type="checkbox"
				className="mt-1 size-4 accent-[var(--accent)]"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<span>
				<span className="block font-semibold">Full word match</span>
				<span className="block text-xs text-muted">
					Highlight only whole words, not the name inside longer words.
				</span>
			</span>
		</label>
	);
}

function FuzzyArabicToggle({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-start gap-3 text-sm">
			<input
				type="checkbox"
				className="mt-1 size-4 accent-[var(--accent)]"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<span>
				<span className="block font-semibold">
					Fuzzy Match Arabic Characters Variants
				</span>
				<span className="block text-xs text-muted">
					Treat ا, أ, إ, آ and ٱ as the same letter when highlighting.
				</span>
			</span>
		</label>
	);
}

/**
 * Names and matching of the keyword, plus its base version's details. Without
 * `keyword` it creates one in `novelId`, base version included.
 */
export function KeywordForm({
	keyword,
	novelId,
	options,
	onDone,
}: {
	keyword: KeywordDetail | null;
	novelId: string;
	options: StyleOptions;
	onDone: () => void;
}) {
	const base = keyword ? baseVersion(keyword) : undefined;
	const [names, setNames] = useState({
		nameAr: keyword?.nameAr ?? "",
		nameEn: keyword?.nameEn ?? "",
	});
	const [fullWord, setFullWord] = useState(
		(keyword?.matchingType ?? "FULL") === "FULL",
	);
	const [fuzzyMatchArabicCharacters, setFuzzyMatchArabicCharacters] = useState(
		keyword?.fuzzyMatchArabicCharacters ?? true,
	);
	const [style, setStyle] = useState(styleValues(base));
	const [translation, setTranslation] = useState<PickedKeyword | null>(null);
	const [uploading, setUploading] = useState(false);
	const { busy, error, setError, run } = useSave(novelId, onDone);
	const candidate = useCallback(
		(other: Names) => isTranslationCandidate(trimmed(names), other),
		[names],
	);

	const submit = async () => {
		const nameAr = names.nameAr.trim() || null;
		const nameEn = names.nameEn.trim() || null;
		if (!nameAr && !nameEn) return setError("Enter an Arabic or English name.");
		const matchingType = fullWord ? ("FULL" as const) : ("PARTIAL" as const);
		if (!keyword) {
			await run(
				() =>
					postKeywords({
						novelId,
						nameAr,
						nameEn,
						matchingType,
						fuzzyMatchArabicCharacters,
						translationKeywordId: translation?.id,
						...styleBody(style),
					}),
				"Keyword created",
			);
			return;
		}
		await run(async () => {
			await putKeywordsById(keyword.id, {
				nameAr,
				nameEn,
				matchingType,
				fuzzyMatchArabicCharacters,
				translationKeywordId: translation?.id,
			});
			if (base) await putKeywordVersionsById(base.id, styleBody(style));
			else
				await postKeywordVersions({
					keywordId: keyword.id,
					startingChapter: 0,
					...styleBody(style),
				});
		}, "Keyword updated");
	};

	return (
		<FormShell
			onSubmit={submit}
			onCancel={onDone}
			busy={busy}
			uploading={uploading}
			error={error}
			submitLabel={keyword ? "Save changes" : "Create keyword"}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Arabic name">
					<input
						className="input"
						dir="rtl"
						lang="ar"
						maxLength={300}
						value={names.nameAr}
						onChange={(event) =>
							setNames({ ...names, nameAr: event.target.value })
						}
					/>
				</Field>
				<Field label="English name">
					<input
						className="input"
						lang="en"
						maxLength={300}
						value={names.nameEn}
						onChange={(event) =>
							setNames({ ...names, nameEn: event.target.value })
						}
					/>
				</Field>
			</div>
			<FullWordToggle checked={fullWord} onChange={setFullWord} />
			{(/\p{Script=Arabic}/u.test(names.nameAr) ||
				/\p{Script=Arabic}/u.test(names.nameEn)) && (
				<FuzzyArabicToggle
					checked={fuzzyMatchArabicCharacters}
					onChange={setFuzzyMatchArabicCharacters}
				/>
			)}
			<TranslationLinkField>
				<KeywordPicker
					novelId={novelId}
					excludeId={keyword?.id ?? ""}
					mode="parent"
					label="Translation link"
					placeholder="Search the novel’s keywords…"
					value={translation}
					onChange={(picked) => {
						setTranslation(picked);
						if (picked) setStyle(translationStyle(picked));
					}}
					candidate={candidate}
					disabled={busy}
				/>
			</TranslationLinkField>
			<StyleFields
				values={style}
				onChange={setStyle}
				options={options}
				onUploadingChange={setUploading}
			/>
		</FormShell>
	);
}

/** Adds an alias to `keyword`, or edits `alias`. */
export function AliasForm({
	keyword,
	alias,
	options,
	onDone,
}: {
	keyword: KeywordDetail;
	alias: KeywordAlias | null;
	options: StyleOptions;
	onDone: () => void;
}) {
	const [names, setNames] = useState({
		nameAr: alias?.nameAr ?? "",
		nameEn: alias?.nameEn ?? "",
	});
	const [fullWord, setFullWord] = useState(
		(alias?.matchingType ?? "FULL") === "FULL",
	);
	const [fuzzyMatchArabicCharacters, setFuzzyMatchArabicCharacters] = useState(
		alias?.fuzzyMatchArabicCharacters ?? true,
	);
	const [overrideStyle, setOverrideStyle] = useState(
		alias?.overrideStyle ?? false,
	);
	const [style, setStyle] = useState(styleValues(alias));
	const [translation, setTranslation] = useState<PickedKeyword | null>(null);
	const [uploading, setUploading] = useState(false);
	const { busy, error, setError, run } = useSave(keyword.novelId, onDone);
	const candidate = useCallback(
		(other: Names) => isTranslationCandidate(trimmed(names), other),
		[names],
	);

	const submit = async () => {
		const nameAr = names.nameAr.trim() || null;
		const nameEn = names.nameEn.trim() || null;
		if (!nameAr && !nameEn) return setError("Enter an Arabic or English name.");
		const body = {
			nameAr,
			nameEn,
			matchingType: fullWord ? ("FULL" as const) : ("PARTIAL" as const),
			fuzzyMatchArabicCharacters,
			overrideStyle,
			translationAliasId: translation?.id,
			...styleBody(style),
		};
		await run(
			() =>
				alias
					? putKeywordAliasesById(alias.id, body)
					: postKeywordAliases({ keywordId: keyword.id, ...body }),
			alias ? "Alias updated" : "Alias added",
		);
	};

	return (
		<FormShell
			onSubmit={submit}
			onCancel={onDone}
			busy={busy}
			uploading={uploading}
			error={error}
			submitLabel={alias ? "Save changes" : "Add alias"}
		>
			<p className="text-sm text-muted">
				Another name the character goes by, highlighted on pages in each
				language it is named in.
			</p>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Arabic name">
					<input
						className="input"
						dir="rtl"
						lang="ar"
						maxLength={300}
						value={names.nameAr}
						onChange={(event) =>
							setNames({ ...names, nameAr: event.target.value })
						}
					/>
				</Field>
				<Field label="English name">
					<input
						className="input"
						lang="en"
						maxLength={300}
						value={names.nameEn}
						onChange={(event) =>
							setNames({ ...names, nameEn: event.target.value })
						}
					/>
				</Field>
			</div>
			<FullWordToggle checked={fullWord} onChange={setFullWord} />
			{(/\p{Script=Arabic}/u.test(names.nameAr) ||
				/\p{Script=Arabic}/u.test(names.nameEn)) && (
				<FuzzyArabicToggle
					checked={fuzzyMatchArabicCharacters}
					onChange={setFuzzyMatchArabicCharacters}
				/>
			)}
			<label className="flex items-start gap-3 text-sm">
				<input
					type="checkbox"
					className="mt-1 size-4 accent-[var(--accent)]"
					checked={overrideStyle}
					onChange={(event) => setOverrideStyle(event.target.checked)}
				/>
				<span>
					<span className="block font-semibold">Override style</span>
					<span className="block text-xs text-muted">
						Highlight this alias with its own category and nature instead of the
						keyword’s.
					</span>
				</span>
			</label>
			<TranslationLinkField>
				<KeywordPicker
					novelId={keyword.novelId}
					excludeId={alias?.id ?? ""}
					mode="siblingAlias"
					withinKeywordId={keyword.id}
					label="Translation link"
					placeholder="Search this keyword’s aliases…"
					value={translation}
					onChange={(picked) => {
						setTranslation(picked);
						if (picked) setStyle(translationStyle(picked));
					}}
					candidate={candidate}
					disabled={busy}
				/>
			</TranslationLinkField>
			<StyleFields
				values={style}
				onChange={setStyle}
				options={options}
				onUploadingChange={setUploading}
				inheritHint="Leave a field empty to use the keyword’s."
			/>
		</FormShell>
	);
}

/** Adds a later version to `keyword`, or edits `version`. */
export function VersionForm({
	keyword,
	version,
	options,
	onDone,
}: {
	keyword: KeywordDetail;
	version: KeywordVersion | null;
	options: StyleOptions;
	onDone: () => void;
}) {
	const versions = sortedVersions(keyword);
	const latest = versions.at(-1);
	const [start, setStart] = useState(
		String(version ? startOf(version) : latest ? startOf(latest) + 1 : 0),
	);
	const [end, setEnd] = useState(
		version && endOf(version) !== null ? String(endOf(version)) : "",
	);
	const [style, setStyle] = useState(styleValues(version));
	const [uploading, setUploading] = useState(false);
	const { busy, error, setError, run } = useSave(keyword.novelId, onDone);

	const submit = async () => {
		const startingChapter = Number(start);
		const endingChapter = end.trim() === "" ? null : Number(end);
		if (!Number.isInteger(startingChapter) || startingChapter < 0)
			return setError("Enter a starting chapter of 0 or more.");
		if (
			endingChapter !== null &&
			(!Number.isInteger(endingChapter) || endingChapter < startingChapter)
		)
			return setError(
				"The ending chapter must not be before the starting one.",
			);
		const body = { startingChapter, endingChapter, ...styleBody(style) };
		await run(
			() =>
				version
					? putKeywordVersionsById(version.id, body)
					: postKeywordVersions({ keywordId: keyword.id, ...body }),
			version ? "Version updated" : "Version added",
		);
	};

	return (
		<FormShell
			onSubmit={submit}
			onCancel={onDone}
			busy={busy}
			uploading={uploading}
			error={error}
			submitLabel={version ? "Save changes" : "Add version"}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="Starting chapter"
					hint={
						!version && latest
							? `After chapter ${startOf(latest)}; the current latest version then ends the chapter before.`
							: undefined
					}
				>
					<input
						className="input"
						type="number"
						inputMode="numeric"
						min={0}
						required
						value={start}
						onChange={(event) => setStart(event.target.value)}
					/>
				</Field>
				<Field
					label="Ending chapter"
					hint="Leave empty while it still applies."
				>
					<input
						className="input"
						type="number"
						inputMode="numeric"
						min={0}
						value={end}
						onChange={(event) => setEnd(event.target.value)}
					/>
				</Field>
			</div>
			<StyleFields
				values={style}
				onChange={setStyle}
				options={options}
				onUploadingChange={setUploading}
				inheritHint="Leave a field empty to use the keyword’s."
			/>
		</FormShell>
	);
}
