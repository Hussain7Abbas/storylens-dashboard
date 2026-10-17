import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { aiModels, mockApi } from "./fixtures";

async function expectAccessible(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
		.analyze();
	expect(
		results.violations.map((violation) => `${violation.id}: ${violation.help}`),
	).toEqual([]);
}

/** Rewrites text like Google Translate: each text node becomes <font> wrappers. */
async function translatePage(scope: import("@playwright/test").Locator) {
	await scope.evaluate((root) => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		const texts: Text[] = [];
		while (walker.nextNode()) texts.push(walker.currentNode as Text);
		for (const text of texts) {
			if (!text.nodeValue?.trim()) continue;
			const outer = document.createElement("font");
			const inner = document.createElement("font");
			inner.textContent = text.nodeValue;
			outer.append(inner);
			text.replaceWith(outer);
		}
	});
}

test("billing requests show the reader's contact and email, pending first", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.goto("/billing-requests");
	await expect(
		page.getByRole("heading", { name: "Billing requests" }),
	).toBeVisible();
	await expect(page.getByRole("tab", { name: /Pending/ })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	const mira = page.getByRole("row", { name: /Mira Vale/ });
	await expect(
		mira.getByRole("link", { name: /\+9647701234567/ }),
	).toHaveAttribute("href", /^https:\/\/wa\.me\/9647701234567\?text=/);
	await expect(
		mira.getByRole("link", { name: "mira@example.com" }),
	).toBeVisible();
	await expect(
		mira.getByText("At request: mira.old@example.com"),
	).toBeVisible();
	await expect(mira.getByText("$5.00")).toBeVisible();
	await expect(mira.getByText("Paid by Zain Cash, ref 42")).toBeVisible();
	const rowan = page.getByRole("row", { name: /Rowan/ });
	await expect(
		rowan.getByRole("link", { name: /@rowan_reads/ }),
	).toHaveAttribute("href", "https://t.me/rowan_reads");
	await expect(page.getByText("Payment not received")).toHaveCount(0);
	const nav = page.getByRole("navigation", { name: "Main" });
	if (await nav.isVisible()) {
		await expect(
			nav.getByRole("link", { name: /Billing requests/ }),
		).toContainText("2");
	}
	await expectAccessible(page);
});

test("approving asks first, then adds the lenses", async ({ page }) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/billing-requests");
	await page
		.getByRole("row", { name: /Mira Vale/ })
		.getByRole("button", { name: "Approve" })
		.click();
	const dialog = page.getByRole("dialog", { name: "Approve this request?" });
	await expect(dialog).toContainText("500 lenses");
	await expect(dialog).toContainText("$5.00");
	await expect(dialog).toContainText("+9647701234567");
	await expect(dialog).toContainText(
		"Only approve after you have received the payment.",
	);
	await translatePage(dialog);
	await dialog.getByRole("button", { name: "Approve and add lenses" }).click();
	await expect(page.getByText(/Added 500 lenses/)).toBeVisible();
	expect(
		requests.filter(
			(request) =>
				request.method === "POST" &&
				request.path === "/api/admin/billing/requests/req-whatsapp/approve",
		),
	).toHaveLength(1);
	await expect(page.getByRole("row", { name: /Mira Vale/ })).toHaveCount(0);
});

test("an approval someone else already handled explains itself", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true, approveConflict: true });
	await page.goto("/billing-requests");
	await page
		.getByRole("row", { name: /Rowan/ })
		.getByRole("button", { name: "Approve" })
		.click();
	const dialog = page.getByRole("dialog", { name: "Approve this request?" });
	await dialog.getByRole("button", { name: "Approve and add lenses" }).click();
	await expect(dialog.getByRole("alert")).toHaveText(
		"This request is already approved by Another Admin",
	);
});

test("rejecting needs a reason the reader will see", async ({ page }) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/billing-requests");
	await page
		.getByRole("row", { name: /Rowan/ })
		.getByRole("button", { name: "Reject" })
		.click();
	const dialog = page.getByRole("dialog", { name: "Reject this request?" });
	await dialog.getByLabel("Reason").fill("no");
	await dialog.getByRole("button", { name: "Reject request" }).click();
	await expect(dialog.getByRole("alert")).toContainText(
		"at least 3 characters",
	);
	await dialog.getByLabel("Reason").fill("Payment did not arrive");
	await dialog.getByRole("button", { name: "Reject request" }).click();
	await expect(page.getByText("Request rejected")).toBeVisible();
	const reject = requests.find((request) =>
		request.path.endsWith("/req-telegram/reject"),
	);
	expect(reject?.body).toEqual({ reason: "Payment did not arrive" });

	await page.getByRole("tab", { name: /Rejected/ }).click();
	await expect(page).toHaveURL(/status=REJECTED/);
	await expect(page.getByText("Reason: Payment did not arrive")).toBeVisible();
});

test("search filters requests by contact", async ({ page }) => {
	await mockApi(page, { signedIn: true });
	await page.goto("/billing-requests");
	await page
		.getByLabel("Search by email, contact, name or username")
		.fill("rowan_reads");
	await expect(page).toHaveURL(/search=rowan_reads/);
	await expect(page.getByRole("row", { name: /Mira Vale/ })).toHaveCount(0);
	await expect(page.getByRole("row", { name: /Rowan/ })).toBeVisible();
});

test("roles without billing permissions see neither the pages nor the actions", async ({
	page,
}) => {
	await mockApi(page, {
		signedIn: true,
		permissions: ["GET /api/admin/users/"],
	});
	await page.goto("/billing-requests");
	await expect(
		page.getByRole("heading", { name: "You don’t have access to this page" }),
	).toBeVisible();
	await page.goto("/users");
	await expect(page.getByRole("button", { name: /Gift lenses/ })).toHaveCount(
		0,
	);
});

test("gifts show the reader what they will see and send a fresh ID", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/users");
	await expect(page.getByRole("row", { name: /Mira Vale/ })).toContainText(
		"42",
	);
	await page.getByRole("button", { name: "Gift lenses to mira" }).click();
	const dialog = page.getByRole("dialog", { name: "Gift lenses to Mira Vale" });
	await dialog.getByLabel("Lenses").fill("25");
	await dialog.getByLabel("Note (optional)").fill("Welcome back");
	await expect(dialog).toContainText(
		"Story Lens sent you 25 lenses — Welcome back",
	);
	await dialog.getByRole("button", { name: "Gift lenses" }).click();
	await expect(page.getByText(/Gave Mira Vale 25 lenses/)).toBeVisible();
	const gift = requests.find((request) =>
		request.path.endsWith("/lenses/gifts"),
	);
	expect(gift?.body).toMatchObject({ lenses: 25, note: "Welcome back" });
	expect((gift?.body as { id: string }).id).toMatch(/^[0-9a-f-]{36}$/);
});

test("corrections cannot take a balance below zero", async ({ page }) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/users");
	await page
		.getByRole("button", { name: "Correct mira's lens balance" })
		.click();
	const dialog = page.getByRole("dialog", {
		name: "Correct Mira Vale's balance",
	});
	await dialog.getByLabel("Change").fill("-50");
	await dialog.getByLabel("Reason").fill("Double approval");
	await dialog.getByRole("button", { name: "Save correction" }).click();
	await expect(dialog.getByRole("alert")).toContainText("can't go below zero");
	expect(
		requests.some((request) => request.path.endsWith("/adjustments")),
	).toBe(false);
	await dialog.getByLabel("Change").fill("-2");
	await dialog.getByRole("button", { name: "Save correction" }).click();
	await expect(page.getByText(/balance is now 40/)).toBeVisible();
});

test("lens history lists gifts and AI charges", async ({ page }) => {
	await mockApi(page, { signedIn: true });
	await page.goto("/users");
	await page.getByRole("button", { name: "Lens history of mira" }).click();
	const dialog = page.getByRole("dialog", {
		name: "Lens history of Mira Vale",
	});
	await expect(dialog).toContainText("Thanks for testing");
	await expect(dialog).toContainText("by Super Admin");
	await expect(dialog).toContainText("AI action · page_summary");
	await expectAccessible(page);
});

test("settings has a Configs tab and an AI tab; old addresses redirect", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.goto("/configs");
	await expect(page).toHaveURL(/\/settings\?tab=configs$/);
	await expect(page.getByRole("tab", { name: "Configs" })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await expect(page.getByText("Lens_Price_USD")).toBeVisible();
	await page.getByRole("tab", { name: "AI" }).click();
	await expect(page).toHaveURL(/tab=ai/);
	await expect(page.getByRole("heading", { name: "Models" })).toBeVisible();
	await page.goto("/ai-pricing");
	await expect(page).toHaveURL(/\/settings\?tab=ai$/);
	const nav = page.getByRole("navigation", { name: "Main" });
	if (await nav.isVisible()) {
		await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
		await expect(nav.getByRole("link", { name: "Configs" })).toHaveCount(0);
	}
});

test("the model pickers show prices and save the choice as a config", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/settings?tab=ai");
	const models = page.getByRole("region", { name: "Models" });
	await expect(models.getByLabel("Text model", { exact: true })).toHaveValue(
		/Gemini/,
	);
	await expect(models).toContainText("$0.30 / 1M tokens");
	await expect(models).toContainText("$2.50 / 1M tokens");
	await expect(models.getByLabel("Image model", { exact: true })).toHaveValue(
		/Seedream/,
	);
	await expect(models).toContainText("$0.018");
	await expect(models).toContainText("4,175 image tokens");
	await expect(
		models.getByRole("row", { name: /Summarize page/ }),
	).toContainText("Covers the cost");

	await models
		.getByRole("combobox", { name: "Text model", exact: true })
		.fill("deepseek");
	await models.getByRole("option", { name: /DeepSeek/ }).click();
	await expect(page.getByText("Text model saved")).toBeVisible();
	const saved = requests.find(
		(request) =>
			request.method === "PUT" &&
			(request.body as { key?: string } | null)?.key === "AI_Text_Model",
	);
	expect(saved?.body).toEqual({
		key: "AI_Text_Model",
		value: "deepseek/deepseek-v4-flash",
	});
	await expect(models).toContainText("$0.042 / 1M tokens");
	await expectAccessible(page);
});

test("a model that would lose money warns and asks before saving", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/settings?tab=ai");
	const models = page.getByRole("region", { name: "Models" });
	await models
		.getByRole("combobox", { name: "Text model", exact: true })
		.fill("GPT-5 Pro");
	await models.getByRole("option").filter({ hasText: "GPT-5 Pro" }).click();
	const dialog = page.getByRole("dialog", {
		name: "Use a model that loses money?",
	});
	await expect(dialog).toContainText("Summarize page");
	await expect(models.getByRole("alert")).toContainText(
		"Raise the lens price to at least",
	);
	await expect(
		models.getByRole("row", { name: /Summarize page/ }),
	).toContainText("Loses money");
	await dialog.getByRole("button", { name: "Cancel" }).click();
	expect(
		requests.some(
			(request) =>
				request.method === "PUT" && request.path === "/api/admin/configs/",
		),
	).toBe(false);
	await expect(models.getByLabel("Text model", { exact: true })).toHaveValue(
		/Gemini/,
	);

	await models
		.getByRole("combobox", { name: "Image model", exact: true })
		.fill("Gemini 3 Pro Image");
	await models
		.getByRole("option")
		.filter({ hasText: "Gemini 3 Pro Image" })
		.click();
	const imageDialog = page.getByRole("dialog", {
		name: "Use a model that loses money?",
	});
	await expect(imageDialog).toContainText("Character image");
	await imageDialog.getByRole("button", { name: "Use it anyway" }).click();
	await expect(page.getByText("Image model saved")).toBeVisible();
});

test("feature prices validate and save", async ({ page }) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/settings?tab=ai");
	await expect(page.getByRole("form", { name: "Summarize page" })).toHaveCount(
		0,
	);
	await page.getByRole("button", { name: "Edit Summarize page price" }).click();
	const summary = page.getByRole("form", { name: "Summarize page" });
	await expect(summary).toContainText("300 actions");
	await summary.getByLabel("Lenses per action").fill("-1");
	await summary.getByRole("button", { name: "Save" }).click();
	await expect(summary.getByRole("alert")).toContainText("0 to 10,000");
	await summary.getByLabel("Lenses per action").fill("3");
	await summary.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Summarize page saved")).toBeVisible();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(page.getByRole("row", { name: /Summarize page/ })).toContainText(
		"3",
	);
	const put = requests.find(
		(request) => request.path === "/api/admin/ai-pricing/page_summary",
	);
	expect(put?.body).toMatchObject({ lenses: 3, enabled: true });
	expect(put?.body).not.toHaveProperty("model");
});

test("configs show billing hints and the API's validation message", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.goto("/settings?tab=configs");
	await page.getByRole("button", { name: "Edit Lens_Price_USD" }).click();
	const dialog = page.getByRole("dialog", { name: "Edit config" });
	await expect(dialog).toContainText("Price of one lens in US dollars");
	await dialog.getByLabel("Value").fill("abc");
	await dialog.getByRole("button", { name: "Save config" }).click();
	await expect(dialog.getByRole("alert")).toContainText(
		"Lens_Price_USD must be a dollar amount",
	);
});

test("the overview sums up lens sales and AI cost", async ({ page }) => {
	await mockApi(page, { signedIn: true });
	await page.goto("/");
	const section = page.getByRole("region", {
		name: "Lenses and cloud AI, last 30 days",
	});
	await expect(section).toContainText("Pending requests");
	await expect(section).toContainText("$26.00");
	await expect(section).toContainText("845");
	await expect(section).toContainText("$3.29");
});

test("billing pages fit a 375 px screen", async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await mockApi(page, { signedIn: true });
	for (const path of ["/billing-requests", "/settings?tab=ai"]) {
		await page.goto(path);
		await expect(page.locator("h1")).toBeVisible();
		const overflow = await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		);
		expect(overflow).toBeLessThanOrEqual(0);
	}
});

test("reasoning effort and token allowance save, update estimates and reload", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/settings?tab=ai");
	const models = page.getByRole("region", { name: "Models" });
	const row = models.getByRole("row", { name: /Character image/ });
	await expect(
		models.getByLabel("Reasoning effort", { exact: true }),
	).toHaveValue("none");
	await models
		.getByLabel("Reasoning effort", { exact: true })
		.selectOption("medium");
	const confirm = page.getByRole("dialog", {
		name: "Use settings that lose money?",
	});
	await expect(confirm).toBeVisible();
	expect(
		requests.some(
			(r) => (r.body as { key?: string } | null)?.key === "AI_Reasoning_Effort",
		),
	).toBe(false);
	await confirm.getByRole("button", { name: "Use it anyway" }).click();
	await expect(page.getByText("Generation setting saved")).toBeVisible();
	expect(
		requests.find(
			(r) =>
				r.method === "PUT" &&
				(r.body as { key?: string } | null)?.key === "AI_Reasoning_Effort",
		)?.body,
	).toEqual({ key: "AI_Reasoning_Effort", value: "medium" });
	await expect(row).toContainText("Loses money");
	await models.getByLabel("Reasoning token allowance").fill("0");
	await models.getByRole("button", { name: "Save token allowance" }).click();
	await expect(row).toContainText("Thin margin");
	expect(
		requests.find(
			(r) =>
				r.method === "PUT" &&
				(r.body as { key?: string } | null)?.key ===
					"AI_Reasoning_Token_Allowance",
		)?.body,
	).toEqual({ key: "AI_Reasoning_Token_Allowance", value: "0" });
	await page.reload();
	await expect(
		models.getByLabel("Reasoning effort", { exact: true }),
	).toHaveValue("medium");
	await expect(models.getByLabel("Reasoning token allowance")).toHaveValue("0");
	await expectAccessible(page);
});

test("image quality saves only supported options and hides unpriced estimates", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/settings?tab=ai");
	const models = page.getByRole("region", { name: "Models" });
	await expect(
		models.getByLabel("Image quality", { exact: true }),
	).toBeDisabled();
	await models
		.getByRole("combobox", { name: "Image model", exact: true })
		.fill("Sunburst");
	await models.getByRole("option").filter({ hasText: "Sunburst" }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Use it anyway" })
		.click();
	await expect(page.getByText("Image model saved")).toBeVisible();
	await models
		.getByLabel("Image quality", { exact: true })
		.selectOption("high");
	await expect(page.getByText("Generation setting saved")).toBeVisible();
	expect(
		requests.find(
			(r) =>
				r.method === "PUT" &&
				(r.body as { key?: string } | null)?.key === "AI_Image_Quality",
		)?.body,
	).toEqual({ key: "AI_Image_Quality", value: "high" });
	await expect(models).toContainText(
		"A reliable image price for this quality is unavailable",
	);
	await expect(
		models.getByRole("row", { name: /Character image/ }),
	).toContainText("Unknown");
	await expectAccessible(page);
});

test("generation controls respect config save permissions", async ({
	page,
}) => {
	await mockApi(page, {
		signedIn: true,
		permissions: [
			"GET /api/admin/configs/",
			"GET /api/admin/ai-models/",
			"GET /api/admin/ai-pricing/",
			"GET /api/admin/billing/summary",
		],
	});
	await page.goto("/settings?tab=ai");
	await expect(
		page.getByLabel("Reasoning effort", { exact: true }),
	).toBeDisabled();
	await expect(page.getByLabel("Reasoning token allowance")).toBeDisabled();
	await expect(
		page.getByLabel("Image quality", { exact: true }),
	).toBeDisabled();
});

for (const theme of ["light", "dark"] as const) {
	test(`generation controls show model capabilities in ${theme} mode`, async ({
		page,
	}, testInfo) => {
		await page.emulateMedia({ colorScheme: theme });
		await mockApi(page, { signedIn: true });
		await page.route("**/api/admin/ai-models/**", (route) =>
			route.fulfill({
				json: {
					...aiModels,
					text: aiModels.text.map((model) => ({
						...model,
						reasoningMandatory: true,
						reasoningEfforts: ["low", "high"],
					})),
					selected: {
						text: "google/gemini-2.5-flash",
						image: "bytedance-seed/seedream-5-0-flash",
					},
				},
			}),
		);
		await page.goto("/settings?tab=ai");
		const models = page.getByRole("region", { name: "Models" });
		const effort = models.getByLabel("Reasoning effort", { exact: true });
		await expect(effort).toHaveValue("auto");
		expect(await effort.locator("option").allTextContents()).toEqual([
			"Auto (model default)",
			"Low",
			"High",
		]);
		await expect(models).toContainText("This model always reasons");
		await expect(models).toContainText(
			"The saved effort is unavailable for this model",
		);
		await expectAccessible(page);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		await models.screenshot({
			path: `/tmp/storylens-generation-${theme}-${testInfo.project.name}.png`,
		});
	});
}

test("available balance converts dollars to whole lenses and saves its revision", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/settings?tab=ai");
	const balance = page.getByRole("region", { name: "Available lens balance" });
	await expect(balance).toContainText("10,000");
	await balance.getByLabel("Balance in dollars").fill("1.005");
	await expect(
		balance.getByLabel("Available lenses", { exact: true }),
	).toHaveValue("100");
	await balance.getByRole("button", { name: "Save balance" }).click();
	await expect(page.getByText("Available lens balance saved")).toBeVisible();
	expect(
		requests.find(
			(request) =>
				request.method === "PUT" &&
				(request.body as { key?: string } | null)?.key === "AI_Lens_Balance",
		)?.body,
	).toEqual({
		key: "AI_Lens_Balance",
		value: "100",
		baseUpdatedAt: "2026-09-28T12:00:00.000Z",
	});
	await balance.getByLabel("Available lenses", { exact: true }).fill("42");
	await expect(balance.getByLabel("Balance in dollars")).toHaveValue(
		"0.420000",
	);
	await expectAccessible(page);
});

test("a stale balance edit stays visible and requires reloading", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.route("**/api/admin/configs/", (route) =>
		route.request().method() === "PUT"
			? route.fulfill({
					status: 409,
					contentType: "application/json",
					body: JSON.stringify({
						code: "CONFIG_STALE",
						message: "The available balance changed. Reload it before saving.",
					}),
				})
			: route.fallback(),
	);
	await page.goto("/settings?tab=ai");
	const balance = page.getByRole("region", { name: "Available lens balance" });
	await balance.getByLabel("Available lenses", { exact: true }).fill("123");
	await balance.getByRole("button", { name: "Save balance" }).click();
	await expect(balance.getByRole("alert")).toContainText("balance changed");
	await expect(
		balance.getByLabel("Available lenses", { exact: true }),
	).toHaveValue("123");
	await expect(
		balance.getByRole("button", { name: "Save balance" }),
	).toBeDisabled();
	await balance.getByRole("button", { name: "Reload balance" }).click();
	await expect(
		balance.getByLabel("Available lenses", { exact: true }),
	).toHaveValue("10000");
});

test("gifts and sales validate against available lenses before submitting", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true, availableLenses: 10 });
	await page.goto("/users");
	await page.getByRole("button", { name: "Gift lenses to mira" }).click();
	const gift = page.getByRole("dialog", { name: "Gift lenses to Mira Vale" });
	await expect(gift).toContainText("Available to gift: 10 lenses");
	await gift.getByLabel("Lenses", { exact: true }).fill("11");
	await gift.getByRole("button", { name: "Gift lenses", exact: true }).click();
	await expect(gift.getByRole("alert")).toContainText("Only 10 lenses");
	expect(
		requests.some((request) => request.path.endsWith("/lenses/gifts")),
	).toBe(false);
	await gift.getByRole("button", { name: "Cancel", exact: true }).click();
	await page.goto("/billing-requests");
	await page
		.getByRole("row", { name: /Mira Vale/ })
		.getByRole("button", { name: "Approve", exact: true })
		.click();
	const approve = page.getByRole("dialog", { name: "Approve this request?" });
	await approve.getByRole("button", { name: "Approve and add lenses" }).click();
	await expect(approve.getByRole("alert")).toContainText("Only 10 lenses");
	expect(requests.some((request) => request.path.endsWith("/approve"))).toBe(
		false,
	);
});

test("model search supports keyboard selection, empty results and Escape", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.goto("/settings?tab=ai");
	const model = page.getByRole("combobox", { name: "Text model", exact: true });
	await model.fill("missing provider");
	await expect(
		page.getByRole("option", { name: "No matching models" }),
	).toBeVisible();
	await model.press("Escape");
	await expect(model).toHaveValue(/Gemini/);
	await model.fill("deepseek");
	await model.press("ArrowDown");
	await model.press("Enter");
	await expect(page.getByText("Text model saved")).toBeVisible();
	await expect(model).toHaveValue(/DeepSeek/);
	await model.click();
	await expectAccessible(page);
});

test("feature editing remains available when the model catalogue fails", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.route("**/api/admin/ai-models/**", (route) =>
		route.fulfill({
			status: 503,
			contentType: "application/json",
			body: JSON.stringify({ message: "Model catalogue unavailable" }),
		}),
	);
	await page.goto("/settings?tab=ai");
	await page.getByRole("button", { name: "Edit Summarize page price" }).click();
	await expect(
		page.getByRole("dialog", { name: "Edit Summarize page price" }),
	).toBeVisible();
});
