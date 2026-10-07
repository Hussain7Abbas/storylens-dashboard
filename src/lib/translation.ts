/** Languages novel and keyword names are stored in (`nameAr`/`nameEn`). */
export type Language = "ar" | "en";

export const LANGUAGE_LABELS: Record<Language, string> = {
	ar: "Arabic",
	en: "English",
};

type Named = { nameAr?: string | null; nameEn?: string | null };

export function nameKey(language: Language): "nameAr" | "nameEn" {
	return language === "ar" ? "nameAr" : "nameEn";
}

export function nameIn(item: Named, language: Language): string | null {
	return item[nameKey(language)] ?? null;
}

/** Both names for dashboard lists and dialogs, which manage every language. */
export function bothNames(item: Named): string {
	return (
		[item.nameEn, item.nameAr].filter((name) => name?.trim()).join(" · ") ||
		"Untitled"
	);
}

export function otherLanguage(language: Language): Language {
	return language === "ar" ? "en" : "ar";
}

const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/u;
const LATIN_LETTER = /(?=\p{L})\p{Script=Latin}/u;

/** The language a name is written in, from its script; null when it has no letters. */
export function scriptLanguage(text: string): Language | null {
	if (ARABIC_LETTER.test(text)) return "ar";
	if (LATIN_LETTER.test(text)) return "en";
	return null;
}

/**
 * A keyword's names by the language they are written in. Keywords from before
 * names were translated keep English names in `nameAr`, so a lone name goes by
 * its script; with both names the columns are trusted.
 */
export function namesByScript(item: Named): Record<Language, string | null> {
	const ar = item.nameAr || null;
	const en = item.nameEn || null;
	if (ar && en) return { ar, en };
	const name = ar ?? en;
	if (!name) return { ar: null, en: null };
	const language = scriptLanguage(name) ?? (ar ? "ar" : "en");
	return language === "ar" ? { ar: name, en: null } : { ar: null, en: name };
}

/** True when a lone name sits in the other language's column. */
export function isMisfiled(item: Named): boolean {
	return namesByScript(item).ar !== (item.nameAr || null);
}

/**
 * A keyword named in one language: its name, the language it is written in
 * (`source`) and the one it lacks (`target`). Null when it has both or neither.
 */
export function singleName(
	item: Named,
): { name: string; source: Language; target: Language } | null {
	if (!item.nameAr === !item.nameEn) return null;
	const names = namesByScript(item);
	const source: Language = names.ar ? "ar" : "en";
	return {
		name: names[source] ?? "",
		source,
		target: otherLanguage(source),
	};
}
