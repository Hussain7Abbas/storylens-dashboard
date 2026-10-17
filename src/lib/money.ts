/**
 * Money is integer micro-dollars (1 USD = 1,000,000) and cents, as in the API
 * (`apps/backend/src/lib/billing/money.ts`); `priceCents` uses the same half-up
 * rounding and test vectors.
 */

const MICROS_PER_USD = 1_000_000;
const USD = /^(\d{1,4})(?:\.(\d{1,6}))?$/;

export function parseUsdToMicros(text: string): number | null {
	const match = USD.exec(text.trim());
	if (!match) return null;
	return (
		Number(match[1]) * MICROS_PER_USD + Number((match[2] ?? "").padEnd(6, "0"))
	);
}

/** `lenses × price`, rounded half-up to cents. */
export function priceCents(lenses: number, priceMicros: number): number {
	return Number(
		(BigInt(lenses) * BigInt(priceMicros) + BigInt(5_000)) / BigInt(10_000),
	);
}

const usd = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

/** `500` → `$5.00`. */
export function formatCents(cents: number): string {
	return usd.format(cents / 100);
}

/** A decimal string from the API (`"5.00"`, `"0.010000"`) as dollars. */
export function formatUsd(
	value: string | null | undefined,
	digits = 2,
): string {
	if (value === null || value === undefined || value === "") return "—";
	const amount = Number(value);
	if (!Number.isFinite(amount)) return "—";
	return new Intl.NumberFormat("en", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: digits,
		maximumFractionDigits: Math.max(digits, 6),
	}).format(amount);
}

/** A per-lens price such as `$0.01` (trailing zeros trimmed, at least cents). */
export function formatLensPrice(value: string | null | undefined): string {
	if (!value) return "—";
	const trimmed = Number(value).toFixed(6).replace(/0+$/, "");
	const decimals = Math.max(2, trimmed.split(".")[1]?.length ?? 0);
	return formatUsd(value, decimals);
}
