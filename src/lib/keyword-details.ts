import type { QueryClient } from "@tanstack/react-query";
import { getGetKeywordsQueryKey } from "@/api/generated/endpoints/admin-keywords";
import {
	getGetNovelsByIdKeywordsQueryKey,
	getGetNovelsByIdQueryKey,
	getGetNovelsQueryKey,
} from "@/api/generated/endpoints/admin-novels";
import type {
	GetKeywordCategories200DataItem,
	GetNovelsByIdKeywords200DataItem,
	GetNovelsByIdKeywords200DataItemAliasesItem,
	GetNovelsByIdKeywords200DataItemVersionsItem,
} from "@/api/generated/schemas";

export type KeywordDetail = GetNovelsByIdKeywords200DataItem;
export type KeywordAlias = GetNovelsByIdKeywords200DataItemAliasesItem;
export type KeywordVersion = GetNovelsByIdKeywords200DataItemVersionsItem;
/** Shared lookup fields used by category and nature controls. */
export type KeywordStyle = Pick<
	GetKeywordCategories200DataItem,
	"id" | "nameAr" | "nameEn" | "color"
>;

export function sortedVersions(keyword: KeywordDetail): KeywordVersion[] {
	return [...keyword.versions].sort((a, b) => startOf(a) - startOf(b));
}

/** Chapter numbers are typed loosely (`string | number`) by the generated client. */
export function startOf(version: KeywordVersion): number {
	return Number(version.startingChapter);
}

export function endOf(version: KeywordVersion): number | null {
	return version.endingChapter === null ? null : Number(version.endingChapter);
}

/** The earliest version holds the keyword's own description, category, nature and image. */
export function baseVersion(
	keyword: KeywordDetail,
): KeywordVersion | undefined {
	return sortedVersions(keyword)[0];
}

export function chapterRange(version: KeywordVersion): string {
	const end = endOf(version);
	return end === null
		? `Ch. ${startOf(version)}+`
		: `Ch. ${startOf(version)}–${end}`;
}

export function styleName(style: {
	nameEn: string | null;
	nameAr: string | null;
}) {
	return style.nameEn || style.nameAr || "Untitled";
}

/** After any keyword change: the profile list, match translations and novel counts. */
export function refreshKeywords(queryClient: QueryClient, novelId: string) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: getGetNovelsByIdKeywordsQueryKey(novelId),
		}),
		queryClient.invalidateQueries({ queryKey: getGetKeywordsQueryKey() }),
		queryClient.invalidateQueries({ queryKey: getGetNovelsQueryKey() }),
		queryClient.invalidateQueries({
			queryKey: getGetNovelsByIdQueryKey(novelId),
		}),
	]);
}
