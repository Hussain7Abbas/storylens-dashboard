import { expect, test } from "@playwright/test";
import { priceCents } from "../src/lib/money";

const vectors: [number, number, number][] = [
	[1, 10_000, 1],
	[100, 10_000, 100],
	[333, 15_000, 500],
	[1, 4_000, 0],
	[1, 5_000, 1],
	[7, 1_234_567, 864],
	[50_000, 9_999_999_999, 49_999_999_995],
	[2_147_483_647, 9_999_999_999, 2_147_483_646_785_252],
	[2_147_483_646, 9_999_999_998, 2_147_483_645_570_503],
];
test("lens totals round half-up exactly, including PostgreSQL Int-sized requests", () => {
	for (const [lenses, micros, cents] of vectors)
		expect(priceCents(lenses, micros)).toBe(cents);
});
