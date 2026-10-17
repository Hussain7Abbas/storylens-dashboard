import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "@/api/axios-instance";
import {
	getGetConfigsQueryKey,
	usePutConfigs,
} from "@/api/generated/endpoints/admin-configs";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { LensPrice } from "@/components/ui/lens-coin";
import { ErrorState, TableSkeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import {
	LENS_INVENTORY_KEY,
	lensesToUsd,
	MAX_LENS_INVENTORY,
	usdToLenses,
	useLensInventory,
} from "@/lib/lens-inventory";
import { formatLensPrice, formatUsd } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";

export function LensBalanceCard() {
	const { can } = useAuth();
	const { configs, row, balance } = useLensInventory();
	const queryClient = useQueryClient();
	const toast = useToast();
	const price = configs.data?.data.find(
		(row) => row.key === "Lens_Price_USD",
	)?.value;
	const [draft, setDraft] = useState<{
		lenses: string;
		usd: string;
		baseUpdatedAt: string | null;
	} | null>(null);
	const [error, setError] = useState("");
	const [stale, setStale] = useState(false);
	const save = usePutConfigs({
		mutation: {
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: getGetConfigsQueryKey(),
				});
				setDraft(null);
				setStale(false);
				setError("");
				toast.success("Available lens balance saved");
			},
			onError: async (cause) => {
				setError(errorMessage(cause));
				setStale(true);
				await configs.refetch();
			},
		},
	});
	const lenses = draft?.lenses ?? String(balance ?? 0);
	const usd = draft?.usd ?? lensesToUsd(lenses, price) ?? "";
	const baseUpdatedAt = draft
		? draft.baseUpdatedAt
		: typeof row?.updatedAt === "string"
			? row.updatedAt
			: null;
	const disabled = !can(PERMISSIONS.configs.save) || save.isPending;
	return (
		<section
			className="card grid gap-4 p-5"
			aria-labelledby="lens-balance-heading"
		>
			<div>
				<h2 id="lens-balance-heading" className="text-base font-semibold">
					Available lens balance
				</h2>
				<p className="text-sm text-muted">
					Your remaining stock to sell or gift. Approved sales and dashboard
					gifts deduct it; readers spending lenses on AI leaves it unchanged.
				</p>
			</div>
			{configs.error ? (
				<ErrorState
					error={configs.error}
					onRetry={() => void configs.refetch()}
				/>
			) : balance === null ? (
				<TableSkeleton rows={1} columns={2} />
			) : (
				<>
					<p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
						<LensPrice lenses={balance} />
						<span className="text-sm font-normal text-muted">
							{formatUsd(lensesToUsd(String(balance), price))} at{" "}
							{formatLensPrice(price)} per lens
						</span>
					</p>
					{!row && (
						<p className="text-sm text-muted">
							Set your available balance before approving sales or issuing
							gifts.
						</p>
					)}
					<form
						className="grid gap-4"
						noValidate
						onSubmit={(event) => {
							event.preventDefault();
							if (
								!/^\d{1,9}$/.test(lenses) ||
								Number(lenses) > MAX_LENS_INVENTORY
							) {
								setError("Enter a whole balance from 0 to 999,999,999 lenses.");
								return;
							}
							if (usd && usdToLenses(usd, price) === null) {
								setError(
									"Enter a valid dollar amount with up to 6 decimals, within the lens balance limit.",
								);
								return;
							}
							setError("");
							save.mutate({
								data: { key: LENS_INVENTORY_KEY, value: lenses, baseUpdatedAt },
							});
						}}
					>
						<div className="grid gap-4 sm:grid-cols-2">
							<Field
								label="Balance in dollars"
								hint={`Convert at ${formatLensPrice(price)} per lens. Fractions of a lens round down; this does not check your OpenRouter balance.`}
							>
								<input
									className="input"
									inputMode="decimal"
									value={usd}
									disabled={disabled || lensesToUsd("1", price) === null}
									onChange={(event) => {
										const next = event.target.value;
										const converted = usdToLenses(next, price);
										setDraft({
											usd: next,
											lenses: converted === null ? "" : String(converted),
											baseUpdatedAt,
										});
									}}
								/>
							</Field>
							<Field
								label="Available lenses"
								hint="Saving replaces your remaining balance; it does not add to it."
							>
								<input
									className="input"
									type="number"
									min={0}
									max={MAX_LENS_INVENTORY}
									step={1}
									value={lenses}
									disabled={disabled}
									onChange={(event) => {
										const next = event.target.value;
										setDraft({
											lenses: next,
											usd: lensesToUsd(next, price) ?? "",
											baseUpdatedAt,
										});
									}}
								/>
							</Field>
						</div>
						{error && (
							<p className="field-error" role="alert">
								{error}
							</p>
						)}
						<div className="flex flex-wrap justify-end gap-2">
							{draft && (
								<Button
									disabled={save.isPending}
									onClick={() => {
										setDraft(null);
										setError("");
										setStale(false);
										void configs.refetch();
									}}
								>
									Reload balance
								</Button>
							)}
							{can(PERMISSIONS.configs.save) && (
								<Button
									type="submit"
									variant="primary"
									disabled={!draft || stale}
									loading={save.isPending}
								>
									Save balance
								</Button>
							)}
						</div>
					</form>
				</>
			)}
		</section>
	);
}
