import { BookImage } from "lucide-react";
import { useState } from "react";
import {
	useGetNovelsByIdChapters,
	useGetNovelsByIdChaptersByChapterId,
} from "@/api/generated/endpoints/admin-novels";
import { Dialog } from "@/components/ui/dialog";
import {
	EmptyState,
	ErrorState,
	Forbidden,
	TableSkeleton,
} from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatNumber } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";

function label(key: string) {
	if (key === "entityKey") return "Entity";
	if (key === "sceneId") return "Scene";
	if (key === "stateChanges") return "Lasting changes";
	return key
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/^./, (text) => text.toUpperCase());
}

function contextLabels(context: unknown): Map<string, string> {
	const names = new Map<string, string>();
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
		} else if (value && typeof value === "object") {
			if (
				"entityKey" in value &&
				typeof value.entityKey === "string" &&
				"name" in value &&
				typeof value.name === "string"
			)
				names.set(value.entityKey, value.name);
			if (
				"id" in value &&
				typeof value.id === "string" &&
				"title" in value &&
				typeof value.title === "string"
			)
				names.set(value.id, value.title);
			for (const item of Object.values(value)) visit(item);
		}
	};
	visit(context);
	return names;
}

/** Context is validated on the server; render all observations as plain React text. */
function ContextValue({
	value,
	names,
}: {
	value: unknown;
	names: Map<string, string>;
}) {
	if (value === null) return <span className="text-muted">Cleared</span>;
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	)
		return (
			<span className="whitespace-pre-wrap break-words" dir="auto">
				{String(value)}
			</span>
		);
	if (Array.isArray(value))
		return value.length ? (
			<div className="grid gap-3">
				{value.map((item: unknown, index) => (
					<div
						key={`item-${index + 1}`}
						className="rounded-lg border border-line p-3"
					>
						<ContextValue value={item} names={names} />
					</div>
				))}
			</div>
		) : (
			<span className="text-muted">None recorded</span>
		);
	if (typeof value === "object")
		return (
			<dl className="grid gap-2">
				{Object.entries(value)
					.filter(
						([key, item]) =>
							!["schemaVersion", "id", "keywordId"].includes(key) &&
							item !== "",
					)
					.map(([key, item]) => (
						<div key={key}>
							<dt className="mb-1 text-xs font-semibold text-muted">
								{label(key)}
							</dt>
							<dd>
								<ContextValue
									value={
										(key === "entityKey" || key === "sceneId") &&
										typeof item === "string"
											? (names.get(item) ?? item)
											: item
									}
									names={names}
								/>
							</dd>
						</div>
					))}
			</dl>
		);
	return null;
}

function ChapterDetail({
	novelId,
	chapterId,
}: {
	novelId: string;
	chapterId: string;
}) {
	const detail = useGetNovelsByIdChaptersByChapterId(novelId, chapterId);
	if (detail.error)
		return (
			<ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
		);
	if (!detail.data) return <TableSkeleton rows={4} columns={1} />;
	const chapter = detail.data;
	return (
		<div className="grid gap-6">
			<section aria-label="Chapter background">
				{chapter.image ? (
					<img
						src={chapter.image.url}
						alt={`Chapter ${chapter.number} background`}
						className="h-auto w-full rounded-lg"
					/>
				) : (
					<div className="rounded-lg bg-wash p-8 text-center text-sm text-muted">
						No chapter background image
					</div>
				)}
			</section>
			<section
				aria-labelledby="chapter-context-heading"
				className="grid gap-3 text-sm"
			>
				<h3 id="chapter-context-heading" className="text-base font-semibold">
					Chapter context
				</h3>
				{chapter.context ? (
					<ContextValue
						value={chapter.context}
						names={contextLabels(chapter.context)}
					/>
				) : (
					<p className="text-muted">
						No AI context has been generated for this chapter.
					</p>
				)}
			</section>
		</div>
	);
}

const PAGE_SIZE = 20;
export function ChaptersSection({ novelId }: { novelId: string }) {
	const { can } = useAuth();
	const [page, setPage] = useState(1);
	const [selected, setSelected] = useState<{
		id: string;
		number: number;
	} | null>(null);
	const chapters = useGetNovelsByIdChapters(
		novelId,
		{ page, pageSize: PAGE_SIZE },
		{ query: { enabled: can(PERMISSIONS.novels.chapters) } },
	);
	const canOpen = can(PERMISSIONS.novels.chapter);
	if (!can(PERMISSIONS.novels.chapters)) return <Forbidden />;
	return (
		<section className="card">
			<div className="border-b border-line p-4">
				<h2 className="font-semibold">Chapters</h2>
				<p className="text-sm text-muted">
					Open a chapter to view its full background image and AI context.
				</p>
			</div>
			{chapters.error ? (
				<ErrorState
					error={chapters.error}
					onRetry={() => void chapters.refetch()}
				/>
			) : !chapters.data ? (
				<TableSkeleton rows={4} columns={4} />
			) : !chapters.data.data.length ? (
				<EmptyState title="No chapters yet" />
			) : (
				<>
					<div className="relative overflow-x-auto">
						<table className="data-table data-table-stack">
							<thead>
								<tr>
									<th scope="col">Background</th>
									<th scope="col">Chapter</th>
									<th scope="col">Name</th>
									<th scope="col">Updated</th>
								</tr>
							</thead>
							<tbody>
								{chapters.data.data.map((chapter) => (
									<tr
										key={chapter.id}
										className={
											canOpen ? "cursor-pointer hover:bg-wash" : undefined
										}
										onClick={() => {
											if (canOpen)
												setSelected({
													id: chapter.id,
													number: Number(chapter.number),
												});
										}}
									>
										<td data-label="Background">
											<div className="grid h-14 w-24 place-items-center overflow-hidden rounded-md bg-wash text-muted">
												{chapter.image ? (
													<img
														src={chapter.image.url}
														alt=""
														loading="lazy"
														className="size-full object-cover"
													/>
												) : (
													<BookImage
														size={20}
														strokeWidth={1.75}
														aria-label="No background image"
													/>
												)}
											</div>
										</td>
										<td data-label="Chapter">
											{canOpen ? (
												<button
													type="button"
													className="font-medium text-accent hover:underline"
													onClick={(event) => {
														event.stopPropagation();
														setSelected({
															id: chapter.id,
															number: Number(chapter.number),
														});
													}}
												>
													Chapter {formatNumber(Number(chapter.number))}
												</button>
											) : (
												<span>
													Chapter {formatNumber(Number(chapter.number))}
												</span>
											)}
										</td>
										<td data-label="Name" dir="auto">
											{chapter.name || "—"}
										</td>
										<td data-label="Updated" className="text-muted">
											{formatDateTime(chapter.updatedAt)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<Pagination
						page={page}
						pageSize={PAGE_SIZE}
						total={chapters.data.total}
						onPage={setPage}
					/>
				</>
			)}
			<Dialog
				open={selected !== null}
				title={`Chapter ${selected?.number ?? ""}`}
				size="lg"
				onClose={() => setSelected(null)}
			>
				{selected && canOpen && (
					<ChapterDetail
						key={selected.id}
						novelId={novelId}
						chapterId={selected.id}
					/>
				)}
			</Dialog>
		</section>
	);
}
