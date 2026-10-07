import { X } from "lucide-react";
import {
	type CSSProperties,
	type KeyboardEvent,
	useDeferredValue,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { GetNovelsByIdKeywords200DataItem } from "@/api/generated/schemas";
import { fuzzyScore, normalizeForSearch } from "@/lib/fuzzy";
import { baseVersion } from "@/lib/keyword-details";
import { useNovelKeywords } from "@/lib/novel-keywords";
import { bothNames, type Language, nameIn } from "@/lib/translation";
import { Spinner } from "./spinner";

/** The description, category, nature and image a picked row carries. */
export type PickedStyle = {
	description: string | null;
	categoryId: string | null;
	natureId: string | null;
	image: { id: string; url: string } | null;
};

/** A keyword, or (from a Link or Translation picker) an alias of `keywordId`. */
export type PickedKeyword = {
	kind: "keyword" | "alias";
	id: string;
	keywordId: string;
	label: string;
	nameAr: string | null;
	nameEn: string | null;
	/** A keyword's base version's style, or an alias's own. */
	style: PickedStyle;
};

type Entry = PickedKeyword & {
	/** What the option also shows: a keyword's aliases, or the alias's keyword. */
	detail: string | null;
	texts: string[];
	aliasTexts: string[];
};

const RESULTS = 20;
const MIN_WIDTH = 224;
const MAX_HEIGHT = 240;
/** Gap between the list and its input, and between the list and the viewport edge. */
const GAP = 4;
const EDGE = 8;
/** A match on a keyword's alias ranks a little below the same match on its name. */
const ALIAS_WEIGHT = 0.9;

const normalized = (names: (string | null | undefined)[]) => [
	...new Set(names.flatMap((name) => (name ? [normalizeForSearch(name)] : []))),
];

function styleOf(row: {
	description?: string | null;
	categoryId?: string | null;
	natureId?: string | null;
	image?: { id: string; url: string } | null;
}): PickedStyle {
	return {
		description: row.description ?? null,
		categoryId: row.categoryId ?? null,
		natureId: row.natureId ?? null,
		image: row.image ? { id: row.image.id, url: row.image.url } : null,
	};
}

function keywordEntry(
	keyword: GetNovelsByIdKeywords200DataItem,
	withAliases: boolean,
): Entry {
	return {
		kind: "keyword",
		id: keyword.id,
		keywordId: keyword.id,
		label: bothNames(keyword),
		nameAr: keyword.nameAr,
		nameEn: keyword.nameEn,
		style: styleOf(baseVersion(keyword) ?? {}),
		detail: withAliases
			? keyword.aliases.map((alias) => bothNames(alias)).join(", ") || null
			: null,
		texts: normalized([keyword.nameAr, keyword.nameEn]),
		aliasTexts: withAliases
			? normalized(
					keyword.aliases.flatMap((alias) => [alias.nameAr, alias.nameEn]),
				)
			: [],
	};
}

function aliasEntries(keyword: GetNovelsByIdKeywords200DataItem): Entry[] {
	return keyword.aliases.map((alias) => {
		return {
			kind: "alias",
			id: alias.id,
			keywordId: keyword.id,
			label: bothNames(alias),
			nameAr: alias.nameAr ?? null,
			nameEn: alias.nameEn ?? null,
			style: styleOf(alias),
			detail: `Alias of ${bothNames(keyword)}`,
			texts: normalized([alias.nameAr, alias.nameEn]),
			aliasTexts: [],
		};
	});
}

/**
 * Searchable combobox over one novel's keywords in both languages, loaded once
 * and fuzzy-matched as the admin types (typos and Arabic spelling variants
 * included). `link` also offers every alias as its own result, since a keyword
 * may be the translation of an alias; `parent` (alias of, version of) offers
 * main keywords only, found by their aliases too. Versions are never offered.
 * The list is fixed to the viewport so table cells don't clip it.
 */
export function KeywordPicker({
	novelId,
	excludeId,
	mode,
	value,
	onChange,
	disabled = false,
	label,
	placeholder = "Search…",
	withinKeywordId,
	named,
	unnamed,
	targetName,
}: {
	novelId: string;
	excludeId: string;
	mode: "link" | "parent" | "siblingAlias";
	value: PickedKeyword | null;
	onChange: (value: PickedKeyword | null) => void;
	disabled?: boolean;
	label: string;
	placeholder?: string;
	/** The keyword whose aliases `siblingAlias` offers. */
	withinKeywordId?: string;
	/** Offers only rows named in this language… */
	named?: Language;
	/** …and not named in this one, so a link can only add the missing name. */
	unnamed?: Language;
	/** The surviving entry's stored name in `named`; a link cannot replace it. */
	targetName?: string | null;
}) {
	const listId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const search = normalizeForSearch(useDeferredValue(text));
	const [active, setActive] = useState(0);
	const [position, setPosition] = useState<CSSProperties>({});

	const keywords = useNovelKeywords(novelId, open);
	const index = useMemo(() => {
		const others = (keywords.data ?? []).filter(
			(keyword) => keyword.id !== excludeId,
		);
		const entries =
			mode === "siblingAlias"
				? others
						.filter((keyword) => keyword.id === withinKeywordId)
						.flatMap(aliasEntries)
				: mode === "link"
					? [
							...others.map((keyword) => keywordEntry(keyword, false)),
							...others.flatMap(aliasEntries),
						]
					: others.map((keyword) => keywordEntry(keyword, true));
		return entries.filter(
			(entry) =>
				entry.id !== excludeId &&
				(!named || !!nameIn(entry, named)) &&
				(!unnamed || !nameIn(entry, unnamed)) &&
				(!targetName?.trim() ||
					(!!named && nameIn(entry, named) === targetName.trim())),
		);
	}, [
		keywords.data,
		excludeId,
		mode,
		withinKeywordId,
		named,
		unnamed,
		targetName,
	]);
	const options = useMemo(() => {
		if (!search) return index.slice(0, RESULTS);
		return index
			.map((entry) => ({
				entry,
				score: Math.max(
					0,
					...entry.texts.map((name) => fuzzyScore(search, name)),
					...entry.aliasTexts.map(
						(alias) => fuzzyScore(search, alias) * ALIAS_WEIGHT,
					),
				),
			}))
			.filter((item) => item.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, RESULTS)
			.map((item) => item.entry);
	}, [index, search]);

	useLayoutEffect(() => {
		if (!open) return;
		const place = () => {
			const rect = inputRef.current?.getBoundingClientRect();
			if (!rect) return;
			// At least MIN_WIDTH wide, and kept inside the viewport on narrow screens.
			const room = document.documentElement.clientWidth - 2 * EDGE;
			const width = Math.min(Math.max(rect.width, MIN_WIDTH), room);
			const left = Math.max(EDGE, Math.min(rect.left, EDGE + room - width));
			// Opens upwards when the input is near the bottom of the screen.
			const height = document.documentElement.clientHeight;
			const below = height - rect.bottom - GAP - EDGE;
			const above = rect.top - GAP - EDGE;
			setPosition(
				below < MAX_HEIGHT && above > below
					? {
							bottom: height - rect.top + GAP,
							left,
							width,
							maxHeight: Math.min(MAX_HEIGHT, above),
						}
					: {
							top: rect.bottom + GAP,
							left,
							width,
							maxHeight: Math.min(MAX_HEIGHT, below),
						},
			);
		};
		place();
		window.addEventListener("resize", place);
		window.addEventListener("scroll", place, true);
		return () => {
			window.removeEventListener("resize", place);
			window.removeEventListener("scroll", place, true);
		};
	}, [open]);

	const choose = (index: number) => {
		const entry = options[index];
		if (!entry) return;
		onChange({
			kind: entry.kind,
			id: entry.id,
			keywordId: entry.keywordId,
			label: entry.label,
			nameAr: entry.nameAr,
			nameEn: entry.nameEn,
			style: entry.style,
		});
		setText("");
		setOpen(false);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setOpen(true);
			setActive((index) => Math.min(index + 1, options.length - 1));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActive((index) => Math.max(index - 1, 0));
		} else if (event.key === "Enter" && open) {
			event.preventDefault();
			choose(active);
		} else if (event.key === "Escape") {
			setOpen(false);
		}
	};

	if (value) {
		return (
			<div className="flex min-w-40 items-center gap-1">
				<span
					className="badge badge-accent max-w-48 truncate"
					title={value.label}
				>
					{value.label}
				</span>
				<button
					type="button"
					className="btn btn-ghost btn-icon"
					aria-label={`Clear ${label}`}
					title="Clear"
					disabled={disabled}
					onClick={() => onChange(null)}
				>
					<X size={14} strokeWidth={1.75} aria-hidden />
				</button>
			</div>
		);
	}

	return (
		<div className="min-w-40">
			<input
				ref={inputRef}
				className="input"
				role="combobox"
				aria-label={label}
				aria-expanded={open}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={
					open && options[active] ? `${listId}-${active}` : undefined
				}
				placeholder={placeholder}
				disabled={disabled}
				value={text}
				onFocus={() => setOpen(true)}
				onBlur={() => window.setTimeout(() => setOpen(false), 120)}
				onChange={(event) => {
					setText(event.target.value);
					setActive(0);
					setOpen(true);
				}}
				onKeyDown={onKeyDown}
			/>
			{open && (
				<div
					id={listId}
					role="listbox"
					aria-label={label}
					className="card fixed z-50 grid overflow-y-auto p-1 text-sm shadow-lg"
					style={position}
				>
					{keywords.isPending ? (
						<p className="flex items-center gap-2 px-3 py-2 text-muted">
							<Spinner /> <span>Loading keywords…</span>
						</p>
					) : keywords.error ? (
						<p className="px-3 py-2 text-danger">Keywords could not load</p>
					) : options.length === 0 ? (
						<p className="px-3 py-2 text-muted">No matching keywords</p>
					) : (
						options.map((entry, index) => (
							<button
								type="button"
								key={`${entry.kind}-${entry.id}`}
								id={`${listId}-${index}`}
								role="option"
								tabIndex={-1}
								aria-selected={index === active}
								className={`rounded-lg px-3 py-2 text-start ${index === active ? "bg-accent-soft" : ""}`}
								onMouseDown={(event) => event.preventDefault()}
								onMouseEnter={() => setActive(index)}
								onClick={() => choose(index)}
							>
								<span className="block" dir="auto">
									{entry.label}
								</span>
								{entry.detail && (
									<span
										className="block truncate text-xs text-muted"
										dir="auto"
									>
										{entry.detail}
									</span>
								)}
							</button>
						))
					)}
				</div>
			)}
		</div>
	);
}
