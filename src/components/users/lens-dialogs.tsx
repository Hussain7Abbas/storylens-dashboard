import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { errorMessage } from "@/api/axios-instance";
import { getGetBillingSummaryQueryKey } from "@/api/generated/endpoints/admin-billing";
import { getGetConfigsQueryKey } from "@/api/generated/endpoints/admin-configs";
import {
	getGetUsersByIdLensesQueryKey,
	useGetUsersByIdLenses,
	usePostUsersByIdLensesAdjustments,
	usePostUsersByIdLensesGifts,
} from "@/api/generated/endpoints/admin-lenses";
import { getGetUsersQueryKey } from "@/api/generated/endpoints/admin-users";
import type { GetUsersByIdLenses200DataItemType } from "@/api/generated/schemas";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { LensPrice, lensLabel } from "@/components/ui/lens-coin";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useLensInventory } from "@/lib/lens-inventory";

/** The reader a lens dialog is about. */
export type LensUser = {
	id: string;
	name: string;
	username: string;
	lensBalance: number;
};

const TYPE_LABELS: Record<GetUsersByIdLenses200DataItemType, string> = {
	TRIAL_GIFT: "Free trial",
	ADMIN_GIFT: "Gift",
	ADMIN_ADJUSTMENT: "Correction",
	TOP_UP: "Purchase",
	AI_CHARGE: "AI action",
	AI_REFUND: "AI refund",
};

function useRefreshLenses(userId: string) {
	const queryClient = useQueryClient();
	return () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() }),
			queryClient.invalidateQueries({ queryKey: getGetConfigsQueryKey() }),
			queryClient.invalidateQueries({
				queryKey: getGetBillingSummaryQueryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: getGetUsersByIdLensesQueryKey(userId),
			}),
		]);
}

/** Adds lenses with an optional note; the reader gets a celebration. */
export function GiftLensesForm({
	user,
	onDone,
}: {
	user: LensUser;
	onDone: () => void;
}) {
	const { balance: available } = useLensInventory();
	const toast = useToast();
	const refresh = useRefreshLenses(user.id);
	// One ID per opened dialog, so a resent gift is not added twice.
	const [id] = useState(() => crypto.randomUUID());
	const [lenses, setLenses] = useState("50");
	const [note, setNote] = useState("");
	const [error, setError] = useState("");
	const gift = usePostUsersByIdLensesGifts({
		mutation: {
			onSuccess: async (result) => {
				await refresh();
				toast.success(
					`Gave ${user.name} ${lensLabel(Number(lenses))}; balance ${formatNumber(result.balance)}`,
				);
				onDone();
			},
			onError: (cause) => setError(errorMessage(cause)),
		},
	});
	const amount = Number(lenses);
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) {
			setError("Gift between 1 and 100,000 lenses.");
			return;
		}
		if (available !== null && amount > available) {
			setError(
				`Only ${formatNumber(available)} lenses are available to gift. Update the balance in Settings → AI.`,
			);
			return;
		}
		setError("");
		gift.mutate({
			id: user.id,
			data: {
				id,
				lenses: amount,
				...(note.trim() ? { note: note.trim() } : {}),
			},
		});
	};

	return (
		<form onSubmit={submit} noValidate className="grid gap-4">
			{available !== null && (
				<p className="text-sm text-muted">
					<span>Available to gift: {formatNumber(available)} lenses</span>
				</p>
			)}
			<Field label="Lenses">
				<input
					className="input"
					type="number"
					min={1}
					max={100_000}
					step={1}
					inputMode="numeric"
					required
					value={lenses}
					onChange={(event) => setLenses(event.target.value)}
				/>
			</Field>
			<Field label="Note (optional)" hint="Shown to the reader with the gift.">
				<input
					className="input"
					maxLength={300}
					value={note}
					onChange={(event) => setNote(event.target.value)}
				/>
			</Field>
			<p className="rounded-[var(--control-radius)] bg-wash p-3 text-sm">
				<span className="text-muted">The reader will see: </span>
				<span>
					Story Lens sent you{" "}
					{Number.isFinite(amount) && amount > 0 ? lensLabel(amount) : "…"}
					{note.trim() ? ` — ${note.trim()}` : ""}
				</span>
			</p>
			{error && (
				<p className="field-error" role="alert">
					{error}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<Button onClick={onDone} disabled={gift.isPending}>
					Cancel
				</Button>
				<Button type="submit" variant="primary" loading={gift.isPending}>
					Gift lenses
				</Button>
			</div>
		</form>
	);
}

/** Adds or removes lenses with a reason kept on the dashboard; no celebration. */
export function AdjustLensesForm({
	user,
	onDone,
}: {
	user: LensUser;
	onDone: () => void;
}) {
	const toast = useToast();
	const refresh = useRefreshLenses(user.id);
	const [id] = useState(() => crypto.randomUUID());
	const [delta, setDelta] = useState("");
	const [reason, setReason] = useState("");
	const [error, setError] = useState("");
	const adjust = usePostUsersByIdLensesAdjustments({
		mutation: {
			onSuccess: async (result) => {
				await refresh();
				toast.success(
					`${user.name}'s balance is now ${formatNumber(result.balance)}`,
				);
				onDone();
			},
			onError: (cause) => setError(errorMessage(cause)),
		},
	});
	const amount = Number(delta);
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (
			!Number.isInteger(amount) ||
			amount === 0 ||
			Math.abs(amount) > 100_000
		) {
			setError(
				"Enter a whole number of lenses, positive to add or negative to remove.",
			);
			return;
		}
		if (user.lensBalance + amount < 0) {
			setError(
				`The balance is ${formatNumber(user.lensBalance)}; it can't go below zero.`,
			);
			return;
		}
		if (reason.trim().length < 3) {
			setError("Give a reason (at least 3 characters).");
			return;
		}
		setError("");
		adjust.mutate({
			id: user.id,
			data: { id, delta: amount, reason: reason.trim() },
		});
	};

	return (
		<form onSubmit={submit} noValidate className="grid gap-4">
			<p className="text-sm text-muted">
				<span>Current balance: </span>
				<LensPrice lenses={user.lensBalance} signed />
			</p>
			<Field label="Change" hint="For example 50 to add or -50 to remove.">
				<input
					className="input"
					type="number"
					step={1}
					inputMode="numeric"
					required
					value={delta}
					onChange={(event) => setDelta(event.target.value)}
				/>
			</Field>
			<Field
				label="Reason"
				hint="Kept on the dashboard; not shown to the reader."
			>
				<input
					className="input"
					required
					minLength={3}
					maxLength={300}
					value={reason}
					onChange={(event) => setReason(event.target.value)}
				/>
			</Field>
			{error && (
				<p className="field-error" role="alert">
					{error}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<Button onClick={onDone} disabled={adjust.isPending}>
					Cancel
				</Button>
				<Button type="submit" variant="primary" loading={adjust.isPending}>
					Save correction
				</Button>
			</div>
		</form>
	);
}

const HISTORY_PAGE = 20;

/** Every change to a reader's balance, newest first. */
export function LensHistory({ user }: { user: LensUser }) {
	const [page, setPage] = useState(1);
	const history = useGetUsersByIdLenses(user.id, {
		page,
		pageSize: HISTORY_PAGE,
	});

	if (history.error)
		return (
			<ErrorState
				error={history.error}
				onRetry={() => void history.refetch()}
			/>
		);
	if (!history.data) return <TableSkeleton rows={4} columns={4} />;
	if (history.data.data.length === 0)
		return <EmptyState title="No lens changes yet" />;

	return (
		<div>
			<p className="mb-3 text-sm">
				<span className="text-muted">Balance </span>
				<LensPrice lenses={history.data.balance} signed />
			</p>
			<div className="relative overflow-x-auto">
				<table className="data-table data-table-stack">
					<thead>
						<tr>
							<th scope="col">Change</th>
							<th scope="col">What</th>
							<th scope="col">Balance after</th>
							<th scope="col">When</th>
						</tr>
					</thead>
					<tbody>
						{history.data.data.map((row) => (
							<tr key={row.id}>
								<td data-label="Change">
									<LensPrice lenses={row.delta} signed />
								</td>
								<td data-label="What">
									<p>
										<span>
											{TYPE_LABELS[row.type]}
											{row.feature ? ` · ${row.feature}` : ""}
										</span>
									</p>
									{(row.note || row.createdBy) && (
										<p className="text-xs text-muted">
											<span>
												{row.note ?? ""}
												{row.note && row.createdBy ? " — " : ""}
												{row.createdBy ? `by ${row.createdBy.name}` : ""}
											</span>
										</p>
									)}
								</td>
								<td data-label="Balance after" className="tabular-nums">
									{formatNumber(row.balanceAfter)}
								</td>
								<td data-label="When" className="whitespace-nowrap text-muted">
									{formatDateTime(row.createdAt)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<Pagination
				page={page}
				pageSize={HISTORY_PAGE}
				total={history.data.total}
				onPage={setPage}
			/>
		</div>
	);
}
