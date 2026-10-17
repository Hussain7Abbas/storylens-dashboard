import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ALL_PERMISSIONS, mockApi, NOVEL_ID } from "./fixtures";

test("novels default to characters and fetch chapter context only on opening a row", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.route("https://example.com/chapter-cover.png", (route) =>
		route.fulfill({
			contentType: "image/svg+xml",
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#6751b8"/></svg>',
		}),
	);
	await page.goto(`/novels/${NOVEL_ID}`);
	await expect(
		page.getByRole("tab", { name: "Characters", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await page.getByRole("tab", { name: "Chapters", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Chapter 1", exact: true }),
	).toBeVisible();
	await expect(page.getByText("Mira arrives at the lantern gate.")).toHaveCount(
		0,
	);
	expect(
		requests.some((request) => request.path.endsWith("/chapters/chapter-one")),
	).toBe(false);
	await page.getByRole("button", { name: "Chapter 1", exact: true }).click();
	const detail = page.getByRole("dialog", { name: "Chapter 1", exact: true });
	await expect(
		detail.getByRole("img", { name: "Chapter 1 background" }),
	).toBeVisible();
	await expect(
		detail.getByRole("heading", { name: "Chapter context" }),
	).toBeVisible();
	await expect(detail).toContainText("Mira arrives at the lantern gate.");
	await expect(detail).toContainText("An evening arrival");
	const result = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
		.analyze();
	expect(result.violations.map((item) => item.id)).toEqual([]);
	await detail.getByRole("button", { name: "Close", exact: true }).click();
	await page.getByRole("button", { name: "Chapter 2", exact: true }).click();
	await expect(page.getByRole("dialog")).toContainText(
		"No chapter background image",
	);
	await expect(page.getByRole("dialog")).toContainText(
		"No AI context has been generated",
	);
});

test("chapter tabs have keyboard navigation and preserve the selected tab in the URL", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.goto(`/novels/${NOVEL_ID}`);
	await page.getByRole("tab", { name: "Characters", exact: true }).focus();
	await page.keyboard.press("ArrowRight");
	await expect(page).toHaveURL(/tab=chapters/);
	await expect(
		page.getByRole("tab", { name: "Chapters", exact: true }),
	).toBeFocused();
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Chapter 1", exact: true }),
	).toBeVisible();
	await page.getByRole("tab", { name: "Chapters", exact: true }).press("Home");
	await expect(
		page.getByRole("tab", { name: "Characters", exact: true }),
	).toHaveAttribute("aria-selected", "true");
});

test("chapter permission controls list access and detail access independently", async ({
	page,
}) => {
	const requests = await mockApi(page, {
		signedIn: true,
		permissions: ALL_PERMISSIONS.filter(
			(key) => key !== "GET /api/admin/novels/:id/chapters/:chapterId",
		),
	});
	await page.goto(`/novels/${NOVEL_ID}?tab=chapters`);
	await expect(page.getByText("Chapter 1", { exact: true })).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Chapter 1", exact: true }),
	).toHaveCount(0);
	expect(
		requests.some((request) => request.path.endsWith("/chapters/chapter-one")),
	).toBe(false);
});
