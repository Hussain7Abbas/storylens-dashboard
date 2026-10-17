import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ALL_PERMISSIONS, categories, mockApi, natures } from "./fixtures";

for (const kind of ["category", "nature"] as const) {
	const plural = kind === "category" ? "categories" : "natures";
	const row = kind === "category" ? categories[0] : natures[0];
	test(`${kind} add/edit previews and shared details in both themes`, async ({
		page,
	}, testInfo) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await mockApi(page, { signedIn: true });
		const writes: { method: string; body: Record<string, unknown> }[] = [];
		await page.route(`**/api/admin/keyword-${plural}/**`, async (route) => {
			if (route.request().method() === "GET") return route.fallback();
			const body = route.request().postDataJSON();
			writes.push({ method: route.request().method(), body });
			await route.fulfill({ json: { ...row, ...body } });
		});
		await page.goto(`/settings?tab=${plural}`);
		await page
			.getByRole("button", { name: `Add ${kind}`, exact: true })
			.click();
		const dialog = page.getByRole("dialog");
		await dialog
			.getByRole("button", { name: `Add ${kind}`, exact: true })
			.click();
		await expect(dialog.getByRole("alert")).toContainText(
			"English or Arabic name",
		);
		await dialog.getByLabel("Arabic name").fill("عينة");
		await dialog.getByLabel("Color", { exact: true }).fill("#abc");
		await dialog
			.getByRole("button", { name: `Add ${kind}`, exact: true })
			.click();
		await expect(dialog.getByRole("alert")).toContainText("#RRGGBB");
		await dialog.getByLabel("Color", { exact: true }).fill("#ff6600");
		await dialog
			.getByLabel("Description", { exact: true })
			.fill("Use for magical entities.");
		await expect(
			dialog.getByText("Light background", { exact: true }),
		).toBeVisible();
		await expect(
			dialog.getByText("Dark background", { exact: true }),
		).toBeVisible();
		const samples = dialog.getByRole("img");
		await expect(samples).toHaveCount(2);
		const colored =
			kind === "category"
				? samples.first().locator("span").nth(1)
				: samples.first().locator("span").first();
		await expect(colored).toHaveCSS(
			kind === "category" ? "color" : "background-color",
			"rgb(255, 102, 0)",
		);
		if (kind === "category") {
			await dialog
				.getByRole("switch", { name: "Switch position with nature" })
				.check();
			await expect(samples.first().locator("span").first()).toHaveCSS(
				"background-color",
				"rgb(255, 102, 0)",
			);
		}
		for (const theme of ["light", "dark"]) {
			await page.evaluate(
				(value) => (document.documentElement.dataset.theme = value),
				theme,
			);
			expect(
				// User-selected samples may have low contrast; all surrounding guidance must remain readable.
				(
					await new AxeBuilder({ page })
						.exclude(".lookup-preview [role=img]")
						.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
						.analyze()
				).violations,
			).toEqual([]);
		}
		await dialog.getByLabel("Color", { exact: true }).fill("#000000");
		await expect(dialog.getByText("1.19:1 · Low contrast")).toBeVisible();
		await dialog.getByLabel("Color", { exact: true }).fill("#ff6600");
		await dialog.screenshot({
			path: testInfo.outputPath(`${kind}-preview.png`),
		});
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		await dialog
			.getByRole("button", { name: `Add ${kind}`, exact: true })
			.click();
		await expect(dialog).not.toBeVisible();
		expect(writes[0]).toMatchObject({
			method: "POST",
			body: {
				id: expect.any(String),
				nameEn: null,
				nameAr: "عينة",
				color: "#ff6600",
				description: "Use for magical entities.",
			},
		});
		await page
			.getByRole("button", { name: `Edit ${kind} ${row?.nameEn}` })
			.click();
		await expect(dialog.getByLabel("English name")).toHaveValue(
			row?.nameEn ?? "",
		);
		await dialog.getByLabel("English name").fill("Updated name");
		await dialog.getByLabel("Description", { exact: true }).fill("");
		await dialog.getByRole("button", { name: "Save changes" }).click();
		await expect(dialog).not.toBeVisible();
		expect(writes[1]).toMatchObject({
			method: "PUT",
			body: {
				baseUpdatedAt: row?.updatedAt,
				nameEn: "Updated name",
				description: null,
			},
		});
	});
}

test("nature-only permission opens Settings with read-only data", async ({
	page,
}) => {
	await mockApi(page, {
		signedIn: true,
		permissions: ["GET /api/admin/keyword-natures/"],
	});
	await page.goto("/settings?tab=natures");
	await expect(
		page.getByRole("heading", { name: "Natures", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("tab", { name: "Categories", exact: true }),
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: /Add nature|Edit nature|Delete nature/ }),
	).toHaveCount(0);
	if (await page.getByRole("button", { name: "Open menu" }).isVisible())
		await page.getByRole("button", { name: "Open menu" }).click();
	await expect(
		page.getByRole("link", { name: "Settings", exact: true }),
	).toBeVisible();
});

test("nature stale edit keeps draft and deletion failure keeps replacement dialog", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.route("**/api/admin/keyword-natures/nat-ally**", (route) =>
		route.fulfill({
			status: route.request().method() === "PUT" ? 409 : 400,
			json: { message: "Item changed or is still in use." },
		}),
	);
	await page.goto("/settings?tab=natures");
	await page.getByRole("button", { name: "Edit nature Ally" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("English name").fill("Friend");
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(dialog.getByRole("alert")).toContainText("Item changed");
	await expect(dialog.getByLabel("English name")).toHaveValue("Friend");
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Delete nature Ally" }).click();
	await dialog
		.getByRole("button", { name: "Delete nature", exact: true })
		.click();
	await expect(dialog.getByRole("alert")).toContainText("still in use");
	await expect(dialog.getByLabel("Replacement", { exact: true })).toBeVisible();
});

test("deletion sends the selected replacement only after confirmation", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true, permissions: ALL_PERMISSIONS });
	await page.route("**/api/admin/keyword-categories/", (route) =>
		route.fulfill({
			json: {
				data: [
					...categories,
					{ ...categories[0], id: "cat-place", nameEn: "Place" },
				],
			},
		}),
	);
	let deleted = "";
	await page.route(
		"**/api/admin/keyword-categories/cat-person**",
		async (route) => {
			deleted = route.request().url();
			await route.fulfill({ json: categories[0] });
		},
	);
	await page.goto("/settings?tab=categories");
	await page.getByRole("button", { name: "Delete category Person" }).click();
	expect(deleted).toBe("");
	const dialog = page.getByRole("dialog");
	await dialog
		.getByLabel("Replacement", { exact: true })
		.selectOption("cat-place");
	await dialog
		.getByRole("button", { name: "Delete category", exact: true })
		.click();
	await expect(dialog).not.toBeVisible();
	expect(new URL(deleted).searchParams.get("replacementId")).toBe("cat-place");
});
