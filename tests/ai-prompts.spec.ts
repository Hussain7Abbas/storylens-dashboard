import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { aiInstructions, mockApi } from "./fixtures";

const definitions = [
	{
		field: "keywordPrompt",
		key: "AI_Keyword_Prompt",
		title: "Keyword generation",
	},
	{ field: "imagePrompt", key: "AI_Image_Prompt", title: "Character images" },
	{
		field: "chapterCoverPrompt",
		key: "AI_Chapter_Cover_Prompt",
		title: "Chapter covers",
	},
	{
		field: "chapterContextPrompt",
		key: "AI_Chapter_Context_Prompt",
		title: "Chapter context",
	},
	{
		field: "pageSummaryPrompt",
		key: "AI_Page_Summary_Prompt",
		title: "Page summary",
	},
] as const;

test("edits all five shared templates and saves blank as the default", async ({
	page,
}, testInfo) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await mockApi(page, { signedIn: true });
	const data = structuredClone(aiInstructions);
	const writes: unknown[] = [];
	await page.route("**/api/admin/ai-instructions/", (route) =>
		route.fulfill({ json: data }),
	);
	await page.route("**/api/admin/configs/", async (route) => {
		if (route.request().method() !== "PUT") return route.fallback();
		const body = route.request().postDataJSON();
		writes.push(body);
		const definition = definitions.find((item) => item.key === body.key);
		if (!definition) throw new Error("unexpected prompt config");
		const updatedAt = "2026-10-18T12:00:00.000Z";
		data.prompts[definition.field] =
			body.value || data.defaults[definition.field];
		data.revisions[definition.field] = updatedAt;
		await route.fulfill({
			json: {
				key: body.key,
				value: body.value,
				updatedAt,
				createdAt: updatedAt,
			},
		});
	});
	await page.goto("/settings?tab=ai");
	const card = page.getByRole("region", { name: "AI prompts", exact: true });
	for (const definition of definitions) {
		const editor = card
			.locator("details")
			.filter({ has: page.locator("summary", { hasText: definition.title }) });
		await editor.locator("summary").click();
		const textarea = editor.getByLabel(`${definition.title} prompt`, {
			exact: true,
		});
		await expect(textarea).toHaveAttribute("maxlength", "20000");
		await textarea.fill(`Custom ${definition.field}\nKeep Arabic: ارسم المشهد`);
		await editor
			.getByRole("button", { name: "Save prompt", exact: true })
			.click();
		await expect(
			editor.getByRole("button", { name: "Save prompt", exact: true }),
		).toBeDisabled();
		expect(writes.at(-1)).toEqual({
			key: definition.key,
			value: `Custom ${definition.field}\nKeep Arabic: ارسم المشهد`,
			baseUpdatedAt: null,
		});
		await editor.getByRole("button", { name: "Reset to default" }).click();
		await expect(textarea).toHaveValue(data.defaults[definition.field]);
		expect(writes).toHaveLength(definitions.indexOf(definition) + 1);
		await textarea.fill("");
		await editor
			.getByRole("button", { name: "Save prompt", exact: true })
			.click();
		await expect(textarea).toHaveValue(data.defaults[definition.field]);
		expect(writes.at(-1)).toEqual({
			key: definition.key,
			value: "",
			baseUpdatedAt: "2026-10-18T12:00:00.000Z",
		});
		await editor.locator("summary").click();
		// Keep one entry per definition for the next iteration's unsent reset check.
		writes.pop();
	}
	await card.locator("summary").first().click();
	for (const theme of ["light", "dark"]) {
		await page.evaluate(
			(value) => (document.documentElement.dataset.theme = value),
			theme,
		);
		expect(
			(
				await new AxeBuilder({ page })
					.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
					.analyze()
			).violations,
		).toEqual([]);
	}
	await card.screenshot({ path: testInfo.outputPath("ai-prompts.png") });
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
});

test("retains a rejected draft and reloads a concurrent edit explicitly", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.route("**/api/admin/configs/", (route) =>
		route.request().method() === "PUT"
			? route.fulfill({
					status: 409,
					json: { message: "This AI prompt changed. Reload it before saving." },
				})
			: route.fallback(),
	);
	await page.goto("/settings?tab=ai");
	const card = page.getByRole("region", { name: "AI prompts", exact: true });
	await card.locator("summary").first().click();
	const textarea = card.getByLabel("Keyword generation prompt", {
		exact: true,
	});
	await textarea.fill("My unsaved draft");
	await card.getByRole("button", { name: "Save prompt", exact: true }).click();
	await expect(card.getByRole("alert")).toContainText("changed");
	await expect(textarea).toHaveValue("My unsaved draft");
	await page.route("**/api/admin/ai-instructions/", (route) =>
		route.fulfill({
			json: {
				...aiInstructions,
				prompts: {
					...aiInstructions.prompts,
					keywordPrompt: "Another admin’s change",
				},
				revisions: {
					...aiInstructions.revisions,
					keywordPrompt: "2026-10-18T13:00:00.000Z",
				},
			},
		}),
	);
	await card.getByRole("button", { name: "Reload saved prompt" }).click();
	await expect(textarea).toHaveValue("Another admin’s change");
	await expect(card.getByRole("alert")).toHaveCount(0);
});

test("prompt readers can open AI settings but cannot save or reset", async ({
	page,
}) => {
	await mockApi(page, {
		signedIn: true,
		permissions: ["GET /api/admin/ai-instructions/"],
	});
	await page.goto("/settings?tab=ai");
	await expect(
		page.getByRole("tab", { name: "AI", exact: true }),
	).toBeVisible();
	const card = page.getByRole("region", { name: "AI prompts", exact: true });
	await card.locator("summary").first().click();
	await expect(
		card.getByLabel("Keyword generation prompt", { exact: true }),
	).toHaveJSProperty("readOnly", true);
	await expect(
		card.getByRole("button", { name: /Save prompt|Reset to default/ }),
	).toHaveCount(0);
});
