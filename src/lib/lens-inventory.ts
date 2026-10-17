import { useGetConfigs } from "@/api/generated/endpoints/admin-configs";
import { useAuth } from "@/lib/auth";
import { parseUsdToMicros } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";

export const LENS_INVENTORY_KEY = "AI_Lens_Balance";
export const MAX_LENS_INVENTORY = 999_999_999;
export function parseLensInventory(value: string | undefined): number {
	return value !== undefined && /^\d{1,9}$/.test(value.trim())
		? Number(value.trim())
		: 0;
}
/** BigInt micro-dollars preserve the converter's remainder and never round stock up. */
export function usdToLenses(
	usd: string,
	price: string | undefined,
): number | null {
	const match = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(usd.trim());
	const rate = price ? parseUsdToMicros(price) : null;
	if (!match || !rate) return null;
	const micros =
		BigInt(match[1] ?? "0") * 1_000_000n +
		BigInt((match[2] ?? "").padEnd(6, "0"));
	const lenses = micros / BigInt(rate);
	return lenses <= BigInt(MAX_LENS_INVENTORY) ? Number(lenses) : null;
}
export function lensesToUsd(
	lenses: string,
	price: string | undefined,
): string | null {
	const rate = price ? parseUsdToMicros(price) : null;
	if (!/^\d{1,9}$/.test(lenses) || !rate) return null;
	const micros = BigInt(lenses) * BigInt(rate);
	return `${micros / 1_000_000n}.${String(micros % 1_000_000n).padStart(6, "0")}`;
}
/** Lack of Config permission leaves validation to the authoritative write endpoint. */
export function useLensInventory() {
	const { can } = useAuth();
	const configs = useGetConfigs({
		query: { enabled: can(PERMISSIONS.configs.list) },
	});
	const row = configs.data?.data.find((row) => row.key === LENS_INVENTORY_KEY);
	return {
		configs,
		row,
		balance: configs.data ? parseLensInventory(row?.value) : null,
	};
}
