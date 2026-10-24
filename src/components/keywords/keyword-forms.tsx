import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Maximize2, Minimize2 } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
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
import {
	descriptionIn,
	descriptionKey,
	LANGUAGE_LABELS,
	type Language,
	nameIn,
	nameKey,
} from "@/lib/translation";

type StyleValues = {
	descriptionAr: string;
	descriptionEn: string;
	categoryId: string;
	natureId: string;
	image: PickedImage | null;
	imageDescription: string;
};

type Styled = {
	description: string | null;
	imageDescription?: string | null;
	descriptionAr?: string | null;
	descriptionEn?: string | null;
	categoryId: string | null;
	natureId: string | null;
	image: { id: string; url: string } | null;
};

function styleValues(item: Styled | undefined | null): StyleValues {
	return {
		descriptionAr: descriptionIn(item, "ar") ?? "",
		descriptionEn: descriptionIn(item, "en") ?? "",
		imageDescription: item?.imageDescription ?? "",
		categoryId: item?.categoryId ?? "",
		natureId: item?.natureId ?? "",
		image: item?.image ? { id: item.image.id, url: item.image.url } : null,
	};
}

function styleBody(values: StyleValues) {
	return {
		descriptionAr: values.descriptionAr.trim() || null,
		descriptionEn: values.descriptionEn.trim() || null,
		categoryId: values.categoryId || null,
		natureId: values.natureId || null,
		imageId: values.image?.id ?? null,
		imageDescription: values.imageDescription.trim() || null,
	};
}

type Names = { nameAr: string; nameEn: string };

/** The style a picked link hands over; the merge keeps only one row's. */
function translationStyle(
	picked: PickedKeyword,
	previous: StyleValues,
	language: Language,
): StyleValues {
	return {
		...previous,
		[descriptionKey(language)]: descriptionIn(picked.style, language) ?? "",
		categoryId: picked.style.categoryId ?? "",
		natureId: picked.style.natureId ?? "",
		image: picked.style.image,
		imageDescription: picked.style.imageDescription ?? "",
	};
}

/**
 * The language tabs of a keyword or alias form. Both tabs hold the same fields,
 * each with its own language's name; the one the characters table is showing
 * opens first, and the other also offers **Link**.
 */
function LanguageTabs({
	language,
	tab,
	onTab,
	linked,
	fields,
}: {
	/** The table's language: the tab that opens first. */
	language: Language;
	tab: Language;
	onTab: (tab: Language) => void;
	linked: boolean;
	fields: (tab: Language) => ReactNode;
}) {
	const id = useId();
	return (
		<>
			<div
				role="tablist"
				aria-label="Language"
				className="flex gap-1 border-b border-line"
			>
				{(["ar", "en"] as const).map((item) => (
					<button
						key={item}
						type="button"
						role="tab"
						id={`${id}-${item}`}
						aria-selected={item === tab}
						aria-controls={`${id}-panel`}
						className={`-mb-px inline-flex min-h-10 items-center gap-2 border-b-2 px-4 text-sm font-medium ${
							item === tab
								? "border-accent text-accent"
								: "border-transparent text-muted hover:text-ink"
						}`}
						onClick={() => onTab(item)}
					>
						<span aria-hidden>{item.toUpperCase()}</span>
						<span className="sr-only">{LANGUAGE_LABELS[item]}</span>
						{item !== language && linked && (
							<>
								<Link2 size={14} strokeWidth={1.75} aria-hidden />
								<span className="sr-only">Linked</span>
							</>
						)}
					</button>
				))}
			</div>
			<div
				role="tabpanel"
				id={`${id}-panel`}
				aria-labelledby={`${id}-${tab}`}
				className="grid gap-4"
			>
				{fields(tab)}
			</div>
		</>
	);
}

/**
 * The **Link** field of the other language's tab. `Field` clones its child to
 * label it, which the picker's own combobox markup already does, so the label
 * and hint are rendered here instead.
 */
function LinkField({ children }: { children: ReactNode }) {
	return (
		<div>
			<p className="field-label">
				<span>Link</span>
			</p>
			{children}
			<p className="field-hint">
				<span>
					Optional. The entry already named in this language: saving merges it
					into this one, which takes its name, category, nature, description and
					image.
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
	language,
	values,
	onChange,
	options,
	onUploadingChange,
	inheritHint,
}: {
	language: Language;
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
					value={values[descriptionKey(language)]}
					onChange={(event) =>
						onChange({
							...values,
							[descriptionKey(language)]: event.target.value,
						})
					}
				/>
			</Field>
			<ImagePromptField
				value={values.imageDescription}
				onChange={(imageDescription) =>
					onChange({ ...values, imageDescription })
				}
			/>
			<ImageField
				label="Image"
				value={values.image}
				onChange={(image) => onChange({ ...values, image })}
				onUploadingChange={onUploadingChange}
			/>
		</>
	);
}

function ImagePromptField({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const toast = useToast();
	const id = useId();
	const [expanded, setExpanded] = useState(false);
	const [copiedValue, setCopiedValue] = useState<string>();
	return (
		<details className="rounded-lg border border-line p-3">
			<summary className="cursor-pointer text-sm font-semibold">
				<span>Image Description</span>
			</summary>
			<div className="mt-3 grid gap-2">
				<label className="field-label" htmlFor={id}>
					Image Description
				</label>
				<div className="image-prompt-editor" data-expanded={expanded}>
					<textarea
						id={id}
						aria-describedby={`${id}-hint`}
						className="input image-prompt-textarea"
						dir="auto"
						maxLength={180000}
						value={value}
						onChange={(event) => onChange(event.target.value)}
					/>
					<Button
						iconOnly
						disabled={!value.trim()}
						className="image-prompt-copy"
						aria-label="Copy prompt"
						title="Copy prompt"
						icon={
							copiedValue === value ? (
								<Check size={16} strokeWidth={1.75} aria-hidden />
							) : (
								<Copy size={16} strokeWidth={1.75} aria-hidden />
							)
						}
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(value);
								setCopiedValue(value);
								toast.success("Image description copied");
							} catch {
								toast.error(
									"Could not copy the image description. Select and copy the text below.",
								);
							}
						}}
					/>
					{!expanded && (
						<div className="image-prompt-fade">
							<Button
								variant="ghost"
								className="image-prompt-expand"
								aria-expanded={false}
								aria-controls={id}
								icon={<Maximize2 size={14} strokeWidth={1.75} aria-hidden />}
								onClick={() => setExpanded(true)}
							>
								Expand
							</Button>
						</div>
					)}
				</div>
				{expanded && (
					<Button
						variant="ghost"
						className="justify-self-end"
						aria-expanded={true}
						aria-controls={id}
						icon={<Minimize2 size={14} strokeWidth={1.75} aria-hidden />}
						onClick={() => setExpanded(false)}
					>
						Collapse
					</Button>
				)}
				<p id={`${id}-hint`} className="field-hint">
					Saved with this image and used for future AI image generation. Edit it
					before regenerating.
				</p>
			</div>
		</details>
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

/** Clearing the override restores the inherited keyword/category color. */
function MainThemeColorField({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<details className="rounded-lg border border-line p-3">
			<summary className="cursor-pointer text-sm font-semibold">
				Advance
			</summary>
			<div className="mt-3 grid gap-3">
				<Field
					label="Main Theme Color"
					hint="Override the category color for this word. Leave empty to inherit; aliases inherit their keyword’s color first."
				>
					<input
						className="input font-mono"
						placeholder="Inherit category color"
						value={value}
						onChange={(event) => onChange(event.target.value)}
					/>
				</Field>
				<div className="flex flex-wrap items-center gap-3">
					<label className="flex items-center gap-2 text-sm">
						<span>Color picker</span>
						<input
							type="color"
							aria-label="Choose main theme color"
							className="h-10 w-14 cursor-pointer rounded border border-line bg-surface"
							value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#6554c0"}
							onChange={(event) => onChange(event.target.value)}
						/>
					</label>
					<Button disabled={!value} onClick={() => onChange("")}>
						Use inherited color
					</Button>
				</div>
			</div>
		</details>
	);
}

/**
 * Names and matching of the keyword, plus its base version's details. Without
 * `keyword` it creates one in `novelId`, base version included.
 */
export function KeywordForm({
	keyword,
	novelId,
	language,
	options,
	onDone,
}: {
	keyword: KeywordDetail | null;
	novelId: string;
	/** The characters table's language: the tab that opens first. */
	language: Language;
	options: StyleOptions;
	onDone: () => void;
}) {
	const base = keyword ? baseVersion(keyword) : undefined;
	const [names, setNames] = useState<Names>({
		nameAr: keyword?.nameAr ?? "",
		nameEn: keyword?.nameEn ?? "",
	});
	const [fullWord, setFullWord] = useState(
		(keyword?.matchingType ?? "FULL") === "FULL",
	);
	const [fuzzyMatchArabicCharacters, setFuzzyMatchArabicCharacters] = useState(
		keyword?.fuzzyMatchArabicCharacters ?? true,
	);
	const [mainThemeColor, setMainThemeColor] = useState(
		keyword?.mainThemeColor ?? "",
	);
	const [style, setStyle] = useState(styleValues(base));
	const [translation, setTranslation] = useState<PickedKeyword | null>(null);
	const [uploading, setUploading] = useState(false);
	const other: Language = language === "ar" ? "en" : "ar";
	const [tab, setTab] = useState<Language>(language);
	const { busy, error, setError, run } = useSave(novelId, onDone);

	const submit = async () => {
		// A link brings that language's name itself, and the row it absorbs still
		// holds it, so the form does not send it (`assertKeywordNamesFree`).
		const saved: Names = translation
			? {
					...names,
					[nameKey(other)]: keyword ? (nameIn(keyword, other) ?? "") : "",
				}
			: names;
		const nameAr = saved.nameAr.trim() || null;
		const nameEn = saved.nameEn.trim() || null;
		if (!nameAr && !nameEn) return setError("Enter an Arabic or English name.");
		if (mainThemeColor && !/^#[0-9a-f]{6}$/i.test(mainThemeColor))
			return setError(
				"Main Theme Color must be a six-digit hex color, such as #6554c0.",
			);
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
						mainThemeColor: mainThemeColor || null,
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
				mainThemeColor: mainThemeColor || null,
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
			<LanguageTabs
				language={language}
				tab={tab}
				onTab={setTab}
				linked={!!translation}
				fields={(item) => (
					<>
						{item !== language && (
							<LinkField>
								<KeywordPicker
									novelId={novelId}
									excludeId={keyword?.id ?? ""}
									mode="parent"
									named={item}
									unnamed={language}
									targetName={keyword ? nameIn(keyword, other) : null}
									label="Link"
									placeholder="Search keywords in this language…"
									value={translation}
									onChange={(picked) => {
										setTranslation(picked);
										setNames({
											...names,
											[nameKey(item)]: picked
												? (nameIn(picked, item) ?? "")
												: keyword
													? (nameIn(keyword, item) ?? "")
													: "",
										});
										if (picked)
											setStyle(translationStyle(picked, style, other));
									}}
									disabled={busy}
								/>
							</LinkField>
						)}
						<Field
							label="Name"
							hint={
								item !== language && translation
									? "From the linked entry."
									: undefined
							}
						>
							<input
								className="input"
								dir={item === "ar" ? "rtl" : "ltr"}
								lang={item}
								maxLength={300}
								disabled={item !== language && !!translation}
								value={names[nameKey(item)]}
								onChange={(event) =>
									setNames({ ...names, [nameKey(item)]: event.target.value })
								}
							/>
						</Field>
						<FullWordToggle checked={fullWord} onChange={setFullWord} />
						{(/\p{Script=Arabic}/u.test(names.nameAr) ||
							/\p{Script=Arabic}/u.test(names.nameEn)) && (
							<FuzzyArabicToggle
								checked={fuzzyMatchArabicCharacters}
								onChange={setFuzzyMatchArabicCharacters}
							/>
						)}
						<StyleFields
							language={tab}
							values={style}
							onChange={setStyle}
							options={options}
							onUploadingChange={setUploading}
						/>
					</>
				)}
			/>
			<MainThemeColorField
				value={mainThemeColor}
				onChange={setMainThemeColor}
			/>
		</FormShell>
	);
}

/** Adds an alias to `keyword`, or edits `alias`. */
export function AliasForm({
	keyword,
	alias,
	language,
	options,
	onDone,
}: {
	keyword: KeywordDetail;
	alias: KeywordAlias | null;
	/** The characters table's language: the tab that opens first. */
	language: Language;
	options: StyleOptions;
	onDone: () => void;
}) {
	const [names, setNames] = useState<Names>({
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
	const [mainThemeColor, setMainThemeColor] = useState(
		alias?.mainThemeColor ?? "",
	);
	const [style, setStyle] = useState(styleValues(alias));
	const [translation, setTranslation] = useState<PickedKeyword | null>(null);
	const [uploading, setUploading] = useState(false);
	const other: Language = language === "ar" ? "en" : "ar";
	const [tab, setTab] = useState<Language>(language);
	const { busy, error, setError, run } = useSave(keyword.novelId, onDone);

	const submit = async () => {
		// As in the keyword form: a link brings that language's name itself.
		const saved: Names = translation
			? {
					...names,
					[nameKey(other)]: alias ? (nameIn(alias, other) ?? "") : "",
				}
			: names;
		const nameAr = saved.nameAr.trim() || null;
		const nameEn = saved.nameEn.trim() || null;
		if (!nameAr && !nameEn) return setError("Enter an Arabic or English name.");
		if (mainThemeColor && !/^#[0-9a-f]{6}$/i.test(mainThemeColor))
			return setError(
				"Main Theme Color must be a six-digit hex color, such as #6554c0.",
			);
		const body = {
			nameAr,
			nameEn,
			matchingType: fullWord ? ("FULL" as const) : ("PARTIAL" as const),
			fuzzyMatchArabicCharacters,
			mainThemeColor: mainThemeColor || null,
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
			<LanguageTabs
				language={language}
				tab={tab}
				onTab={setTab}
				linked={!!translation}
				fields={(item) => (
					<>
						{item !== language && (
							<LinkField>
								<KeywordPicker
									novelId={keyword.novelId}
									excludeId={alias?.id ?? ""}
									mode="siblingAlias"
									withinKeywordId={keyword.id}
									named={item}
									unnamed={language}
									targetName={alias ? nameIn(alias, other) : null}
									label="Link"
									placeholder="Search this keyword’s aliases…"
									value={translation}
									onChange={(picked) => {
										setTranslation(picked);
										setNames({
											...names,
											[nameKey(item)]: picked
												? (nameIn(picked, item) ?? "")
												: alias
													? (nameIn(alias, item) ?? "")
													: "",
										});
										if (picked)
											setStyle(translationStyle(picked, style, other));
									}}
									disabled={busy}
								/>
							</LinkField>
						)}
						<Field
							label="Name"
							hint={
								item !== language && translation
									? "From the linked alias."
									: undefined
							}
						>
							<input
								className="input"
								dir={item === "ar" ? "rtl" : "ltr"}
								lang={item}
								maxLength={300}
								disabled={item !== language && !!translation}
								value={names[nameKey(item)]}
								onChange={(event) =>
									setNames({ ...names, [nameKey(item)]: event.target.value })
								}
							/>
						</Field>
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
									Highlight this alias with its own category and nature instead
									of the keyword’s.
								</span>
							</span>
						</label>
						<StyleFields
							language={tab}
							values={style}
							onChange={setStyle}
							options={options}
							onUploadingChange={setUploading}
							inheritHint="Leave a field empty to use the keyword’s."
						/>
					</>
				)}
			/>
			<MainThemeColorField
				value={mainThemeColor}
				onChange={setMainThemeColor}
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
			<Field label="Arabic description">
				<textarea
					className="input"
					dir="rtl"
					rows={3}
					maxLength={5000}
					value={style.descriptionAr}
					onChange={(event) =>
						setStyle({ ...style, descriptionAr: event.target.value })
					}
				/>
			</Field>
			<StyleFields
				language="en"
				values={style}
				onChange={setStyle}
				options={options}
				onUploadingChange={setUploading}
				inheritHint="Leave a field empty to use the keyword’s."
			/>
		</FormShell>
	);
}
