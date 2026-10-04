import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures";

async function verifySparkles(coin: import("@playwright/test").Locator) {
	const artwork = coin.locator(".lens-coin-artwork svg");
	const original = await artwork.innerHTML();
	const bounds = await coin.boundingBox();
	await expect(coin.locator(".lens-coin-sparkles > path")).toHaveCount(3);
	await expect
		.poll(() =>
			coin.evaluate(
				(node) =>
					[...node.querySelectorAll(".lens-coin-sparkles > path")].filter(
						(path) => path.getAnimations().length === 1,
					).length,
			),
		)
		.toBe(3);
	for (const [phase, time] of [150, 450, 750].entries()) {
		const opacities = await coin.evaluate((node, currentTime) => {
			return [...node.querySelectorAll(".lens-coin-sparkles > path")].map(
				(path) => {
					const animation = path.getAnimations()[0];
					if (!animation) throw new Error("Sparkle animation is missing");
					animation.pause();
					animation.currentTime = currentTime;
					return Number(getComputedStyle(path).opacity);
				},
			);
		}, time);
		for (const [index, opacity] of opacities.entries())
			expect(opacity).toBeCloseTo(index === phase ? 0.85 : 0, 2);
		expect(await artwork.innerHTML()).toBe(original);
		expect(await coin.boundingBox()).toEqual(bounds);
		expect(
			await artwork.evaluate((node) => getComputedStyle(node).transform),
		).toBe("none");
	}
}

test("dashboard coins stay still with staggered sparkles and respect reduced motion", async ({
	page,
}) => {
	await mockApi(page);
	await page.addInitScript(() =>
		localStorage.setItem("storylens-dashboard-token", "test-token"),
	);
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page.goto("/");
	const coin = page.locator(".lens-coin-static").first();
	await verifySparkles(coin);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await expect(coin.locator(".lens-coin-artwork svg")).toBeVisible();
	await expect
		.poll(() =>
			coin.evaluate((node) =>
				[...node.querySelectorAll(".lens-coin-sparkles > path")].every(
					(path) =>
						getComputedStyle(path).animationName === "none" &&
						getComputedStyle(path).opacity === "0",
				),
			),
		)
		.toBe(true);
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await expect
		.poll(() =>
			coin
				.locator(".lens-coin-sparkles > path")
				.first()
				.evaluate((node) => getComputedStyle(node).animationName),
		)
		.toBe("lens-coin-twinkle");
});
