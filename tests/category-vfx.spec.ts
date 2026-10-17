import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ALL_PERMISSIONS, categories, mockApi } from "./fixtures";

test("edits category effects and tint from Settings, validates input and supports keyboard dialog dismissal", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	const writes: unknown[] = [];
	await page.route(
		"**/api/admin/keyword-categories/cat-person",
		async (route) => {
			const body = route.request().postDataJSON();
			writes.push(body);
			await route.fulfill({ json: { ...categories[0], ...body } });
		},
	);
	await page.goto("/settings?tab=categories");
	await page.getByRole("button", { name: "Edit VFX for Person" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Word VFX", { exact: true }).selectOption("HEAT");
	await dialog.getByLabel("VFX color", { exact: true }).fill("#abc");
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(dialog.getByRole("alert")).toContainText("#RRGGBB");
	expect(writes).toEqual([]);
	await dialog.getByLabel("VFX color", { exact: true }).fill("#aabbcc");
	expect(
		(
			await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
				.analyze()
		).violations,
	).toEqual([]);
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(dialog).not.toBeVisible();
	expect(writes).toEqual([
		{
			baseUpdatedAt: categories[0]?.updatedAt,
			wordVfx: "HEAT",
			switchPositionWithNature: false,
			wordVfxColor: "#aabbcc",
		},
	]);
	await page.getByRole("button", { name: "Edit VFX for Person" }).click();
	await dialog
		.getByLabel("Word VFX", { exact: true })
		.selectOption("GLITCHING");
	await expect(dialog.getByLabel("VFX color", { exact: true })).toHaveCount(0);
	await page.keyboard.press("Escape");
	await expect(dialog).not.toBeVisible();
	await expect(
		page.getByRole("button", { name: "Edit VFX for Person" }),
	).toBeFocused();
});

test("shows categories read-only without update permission and fits a phone", async ({
	page,
}) => {
	await mockApi(page, {
		signedIn: true,
		permissions: ALL_PERMISSIONS.filter(
			(value) => value !== "PUT /api/admin/keyword-categories/:id",
		),
	});
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto("/settings?tab=categories");
	await expect(
		page.getByRole("heading", { name: "Category VFX", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Edit VFX for Person" }),
	).toHaveCount(0);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
});

test("retains draft after a concurrent category edit is rejected", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.route("**/api/admin/keyword-categories/cat-person", (route) =>
		route.fulfill({
			status: 409,
			json: { message: "Category changed. Close and reopen to reload it." },
		}),
	);
	await page.goto("/settings?tab=categories");
	await page.getByRole("button", { name: "Edit VFX for Person" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Word VFX", { exact: true }).selectOption("SPARKLES");
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(dialog.getByRole("alert")).toContainText("Category changed");
	await expect(dialog.getByLabel("Word VFX", { exact: true })).toHaveValue(
		"SPARKLES",
	);
});

test("Glare saves as a category effect without a tint", async ({ page }) => {
	await mockApi(page, { signedIn: true });
	let saved: unknown;
	await page.route(
		"**/api/admin/keyword-categories/cat-person",
		async (route) => {
			saved = route.request().postDataJSON();
			await route.fulfill({
				json: { ...categories[0], ...route.request().postDataJSON() },
			});
		},
	);
	await page.goto("/settings?tab=categories");
	await page.getByRole("button", { name: "Edit VFX for Person" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Word VFX", { exact: true }).selectOption("GLARE");
	await expect(dialog.getByLabel("VFX color", { exact: true })).toHaveCount(0);
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(dialog).not.toBeVisible();
	expect(saved).toEqual({
		baseUpdatedAt: categories[0]?.updatedAt,
		wordVfx: "GLARE",
		switchPositionWithNature: false,
		wordVfxColor: null,
	});
});

test("category position switch is saved with its existing update permission", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	let saved: unknown;
	await page.route(
		"**/api/admin/keyword-categories/cat-person",
		async (route) => {
			saved = route.request().postDataJSON();
			await route.fulfill({
				json: { ...categories[0], ...route.request().postDataJSON() },
			});
		},
	);
	await page.goto("/settings?tab=categories");
	await page.getByRole("button", { name: "Edit VFX for Person" }).click();
	const dialog = page.getByRole("dialog");
	await dialog
		.getByRole("switch", { name: "Switch position with nature" })
		.check();
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(dialog).not.toBeVisible();
	expect(saved).toMatchObject({ switchPositionWithNature: true });
});
