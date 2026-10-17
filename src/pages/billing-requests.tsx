import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MessageCircle, Send, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { errorMessage } from "@/api/axios-instance";
import {
	getGetBillingRequestsQueryKey,
	getGetBillingSummaryQueryKey,
	useGetBillingRequests,
	usePostBillingRequestsByIdApprove,
	usePostBillingRequestsByIdReject,
} from "@/api/generated/endpoints/admin-billing";
import { getGetConfigsQueryKey } from "@/api/generated/endpoints/admin-configs";
import type {
	GetBillingRequests200DataItem,
	GetBillingRequestsStatus,
} from "@/api/generated/schemas";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { LensPrice, lensLabel } from "@/components/ui/lens-coin";
import {
	EmptyState,
	ErrorState,
	PageHeader,
	TableSkeleton,
} from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useLensInventory } from "@/lib/lens-inventory";
import { formatLensPrice, formatUsd } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import { useSearchState } from "@/lib/use-search-state";

type Request = GetBillingRequests200DataItem;
type Status = GetBillingRequestsStatus;

const PAGE_SIZE = 20;
const TABS: Array<{ value: Status | ""; label: string }> = [
	{ value: "PENDING", label: "Pending" },
	{ value: "APPROVED", label: "Approved" },
	{ value: "REJECTED", label: "Rejected" },
	{ value: "CANCELLED", label: "Cancelled" },
	{ value: "", label: "All" },
];
const STATUS_BADGE: Record<Status, string> = {
	PENDING: "badge badge-accent",
	APPROVED: "badge badge-success",
	REJECTED: "badge badge-danger",
	CANCELLED: "badge",
};

/** A link that opens a chat with the reader, with a first message for WhatsApp. */
export function contactLink(request: Request): string {
	const { contactChannel, contactHandle } = request;
	if (contactChannel === "WHATSAPP") {
		const text = `Hi, about your Story Lens request for ${lensLabel(request.lenses)} (${formatUsd(request.totalUsd)}).`;
		return `https://wa.me/${contactHandle.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
	}
	return contactHandle.startsWith("@")
		? `https://t.me/${contactHandle.slice(1)}`
		: `https://t.me/${contactHandle}`;
}

function Contact({ request }: { request: Request }) {
	const toast = useToast();
	const channel =
		request.contactChannel === "WHATSAPP" ? "WhatsApp" : "Telegram";
	const Icon = request.contactChannel === "WHATSAPP" ? MessageCircle : Send;
	return (
		<div className="flex items-center gap-1">
			<a
				href={contactLink(request)}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
				title={`Chat on ${channel}`}
			>
				<Icon size={15} strokeWidth={1.75} aria-hidden />
				<span className="sr-only">{channel}: </span>
				<span dir="ltr">{request.contactHandle}</span>
			</a>
			<Button
				variant="ghost"
				iconOnly
				aria-label={`Copy ${channel} contact`}
				title="Copy"
				onClick={() => {
					void navigator.clipboard
						.writeText(request.contactHandle)
						.then(() => toast.success("Contact copied"));
				}}
				icon={<Copy size={14} strokeWidth={1.75} aria-hidden />}
			/>
		</div>
	);
}

function StatusCell({ request }: { request: Request }) {
	return (
		<div className="space-y-1">
			<span className={STATUS_BADGE[request.status]}>
				<span>
					{request.status.charAt(0) + request.status.slice(1).toLowerCase()}
				</span>
			</span>
			{request.reviewedBy && (
				<p className="text-xs text-muted">
					<span>
						by {request.reviewedBy.name}, {formatDateTime(request.reviewedAt)}
					</span>
				</p>
			)}
			{request.rejectionReason && (
				<p className="max-w-56 text-xs text-muted">
					<span>Reason: {request.rejectionReason}</span>
				</p>
			)}
		</div>
	);
}

function RejectForm({
	request,
	onDone,
}: {
	request: Request;
	onDone: () => void;
}) {
	const toast = useToast();
	const queryClient = useQueryClient();
	const [reason, setReason] = useState("");
	const [error, setError] = useState("");
	const reject = usePostBillingRequestsByIdReject({
		mutation: {
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: getGetBillingRequestsQueryKey(),
				});
				toast.success("Request rejected");
				onDone();
			},
			onError: (cause) => setError(errorMessage(cause)),
		},
	});
	const trimmed = reason.trim();
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (trimmed.length < 3) {
			setError("Give the reader a reason (at least 3 characters).");
			return;
		}
		setError("");
		reject.mutate({ id: request.id, data: { reason: trimmed } });
	};

	return (
		<form onSubmit={submit} noValidate className="grid gap-4">
			<p className="text-sm text-muted">
				<span>
					{lensLabel(request.lenses)} ({formatUsd(request.totalUsd)}) for{" "}
					{request.user?.name ?? request.userEmail}.
				</span>
			</p>
			<Field
				label="Reason"
				hint={`The reader sees this reason on the website and in an email. ${trimmed.length}/500`}
			>
				<textarea
					className="input"
					rows={4}
					required
					minLength={3}
					maxLength={500}
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
				<Button onClick={onDone} disabled={reject.isPending}>
					Cancel
				</Button>
				<Button type="submit" variant="danger" loading={reject.isPending}>
					Reject request
				</Button>
			</div>
		</form>
	);
}

export function BillingRequestsPage() {
	const { balance: available } = useLensInventory();
	const { can } = useAuth();
	const toast = useToast();
	const queryClient = useQueryClient();
	const { values, page, set } = useSearchState(["status", "search"] as const);
	const status = (values.status === "all" ? "" : values.status || "PENDING") as
		| Status
		| "";
	const requests = useGetBillingRequests(
		{
			page,
			pageSize: PAGE_SIZE,
			...(status ? { status } : {}),
			...(values.search ? { search: values.search } : {}),
		},
		{ query: { refetchInterval: 60_000 } },
	);
	const [approving, setApproving] = useState<Request | null>(null);
	const [approveError, setApproveError] = useState("");
	const [rejecting, setRejecting] = useState<Request | null>(null);

	const closeApprove = () => {
		setApproving(null);
		setApproveError("");
	};
	const approve = usePostBillingRequestsByIdApprove({
		mutation: {
			onSuccess: async (result) => {
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: getGetConfigsQueryKey() }),
					queryClient.invalidateQueries({
						queryKey: getGetBillingRequestsQueryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: getGetBillingSummaryQueryKey(),
					}),
				]);
				toast.success(
					`Added ${lensLabel(result.transaction.delta)}; the reader now has ${formatNumber(result.transaction.balanceAfter)}`,
				);
				closeApprove();
			},
			onError: async (cause) => {
				setApproveError(errorMessage(cause));
				await queryClient.invalidateQueries({
					queryKey: getGetBillingRequestsQueryKey(),
				});
			},
		},
	});

	const counts = requests.data?.counts;
	const rows = requests.data?.data ?? [];
	const canApprove = can(PERMISSIONS.billing.approve);
	const canReject = can(PERMISSIONS.billing.reject);

	return (
		<>
			<PageHeader
				title="Billing requests"
				description="Readers asking to buy lenses. Contact them to arrange payment, then approve to add the lenses, or reject with a reason."
			/>
			<div className="card">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
					<div
						role="tablist"
						aria-label="Request status"
						className="flex flex-wrap gap-1"
					>
						{TABS.map((tab) => {
							const selected = tab.value === status;
							const count = tab.value ? counts?.[tab.value] : undefined;
							return (
								<button
									key={tab.label}
									type="button"
									role="tab"
									aria-selected={selected}
									className={`min-h-9 rounded-[var(--control-radius)] px-3 text-sm font-medium ${
										selected
											? "bg-accent-soft text-accent"
											: "text-muted hover:bg-wash hover:text-ink"
									}`}
									onClick={() => set({ status: tab.value || "all" })}
								>
									<span>{tab.label}</span>
									{count !== undefined && (
										<span className="ms-1.5 tabular-nums">
											{formatNumber(count)}
										</span>
									)}
								</button>
							);
						})}
					</div>
					<SearchInput
						label="Search by email, contact, name or username"
						value={values.search}
						onChange={(search) => set({ search })}
					/>
				</div>
				{requests.error ? (
					<ErrorState
						error={requests.error}
						onRetry={() => void requests.refetch()}
					/>
				) : !requests.data ? (
					<TableSkeleton rows={4} columns={7} />
				) : rows.length === 0 ? (
					<EmptyState
						title={
							values.search
								? "No requests match"
								: status === "PENDING"
									? "No pending requests"
									: "No requests"
						}
					/>
				) : (
					<>
						<div className="relative overflow-x-auto">
							<table className="data-table">
								<thead>
									<tr>
										<th scope="col">Reader</th>
										<th scope="col">Contact</th>
										<th scope="col">Email</th>
										<th scope="col">Lenses</th>
										<th scope="col">Total</th>
										<th scope="col">Requested</th>
										<th scope="col">Note</th>
										<th scope="col">Status</th>
										<th scope="col">Balance</th>
										<th scope="col">
											<span className="sr-only">Actions</span>
										</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((request) => (
										<tr key={request.id}>
											<td>
												{request.user ? (
													<>
														<p className="font-medium">{request.user.name}</p>
														<p className="text-xs text-muted">
															<span>@{request.user.username}</span>
														</p>
													</>
												) : (
													<span className="text-muted">Deleted account</span>
												)}
											</td>
											<td>
												<Contact request={request} />
											</td>
											<td>
												<a
													href={`mailto:${request.user?.email ?? request.userEmail}?subject=${encodeURIComponent(`Story Lens lens request ${request.id.slice(0, 8)}`)}`}
													className="text-accent hover:underline"
												>
													{request.user?.email ?? request.userEmail}
												</a>
												{request.user &&
													request.user.email !== request.userEmail && (
														<p className="text-xs text-muted">
															<span>At request: {request.userEmail}</span>
														</p>
													)}
											</td>
											<td>
												<LensPrice lenses={request.lenses} />
											</td>
											<td className="whitespace-nowrap">
												<p className="font-medium tabular-nums">
													{formatUsd(request.totalUsd)}
												</p>
												<p className="text-xs text-muted">
													<span>
														{formatLensPrice(request.unitPriceUsd)} per lens
													</span>
												</p>
											</td>
											<td className="whitespace-nowrap text-muted">
												{formatDateTime(request.createdAt)}
											</td>
											<td className="max-w-56">
												<p
													className="line-clamp-3 text-sm text-muted"
													title={request.note ?? undefined}
												>
													{request.note || "—"}
												</p>
											</td>
											<td>
												<StatusCell request={request} />
											</td>
											<td>
												{request.user ? (
													<LensPrice lenses={request.user.lensBalance} signed />
												) : (
													"—"
												)}
											</td>
											<td>
												{request.status === "PENDING" && (
													<div className="flex justify-end gap-1">
														{canApprove && request.user && (
															<Button
																variant="primary"
																icon={
																	<Check
																		size={16}
																		strokeWidth={1.75}
																		aria-hidden
																	/>
																}
																onClick={() => setApproving(request)}
															>
																Approve
															</Button>
														)}
														{canReject && (
															<Button
																icon={
																	<X size={16} strokeWidth={1.75} aria-hidden />
																}
																onClick={() => setRejecting(request)}
															>
																Reject
															</Button>
														)}
													</div>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<Pagination
							page={page}
							pageSize={PAGE_SIZE}
							total={requests.data.total}
							onPage={(next) => set({ page: next })}
						/>
					</>
				)}
			</div>

			<ConfirmDialog
				open={approving !== null}
				title="Approve this request?"
				confirmLabel="Approve and add lenses"
				tone="primary"
				busy={approve.isPending}
				error={approveError}
				onClose={closeApprove}
				onConfirm={() => {
					if (!approving) return;
					if (available !== null && approving.lenses > available) {
						setApproveError(
							`Only ${formatNumber(available)} lenses are available to sell. Update the balance in Settings → AI.`,
						);
						return;
					}
					approve.mutate({ id: approving.id });
				}}
			>
				{approving && (
					<>
						<p>
							<span>
								Add{" "}
								<strong className="text-ink">
									{lensLabel(approving.lenses)}
								</strong>{" "}
								({formatUsd(approving.totalUsd)}) to{" "}
								<strong className="text-ink">
									{approving.user?.name ?? approving.userEmail}
								</strong>{" "}
								({approving.user?.email ?? approving.userEmail},{" "}
								{approving.contactChannel === "WHATSAPP"
									? "WhatsApp"
									: "Telegram"}{" "}
								<span dir="ltr">{approving.contactHandle}</span>)?
							</span>
						</p>
						<p className="mt-2">
							<span>Only approve after you have received the payment.</span>
							{available !== null && (
								<span className="mt-2 block">
									Available to sell: {formatNumber(available)} lenses.
								</span>
							)}
						</p>
					</>
				)}
			</ConfirmDialog>

			<Dialog
				open={rejecting !== null}
				onClose={() => setRejecting(null)}
				title="Reject this request?"
				size="sm"
			>
				{rejecting && (
					<RejectForm
						key={rejecting.id}
						request={rejecting}
						onDone={() => setRejecting(null)}
					/>
				)}
			</Dialog>
		</>
	);
}
