import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, test } from "@playwright/test";
import {
	KEYWORD_IDS,
	keywordDetails,
	keywords,
	mockApi,
	mockDesktopClient,
	novels,
} from "./fixtures";

async function expectAccessible(page: import("@playwright/test").Page) {
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

test("signed-out visitors land on sign-in, which offers no registration", async ({
	page,
}) => {
	await mockApi(page);
	await page.goto("/users");
	await expect(page).toHaveURL(/\/login$/);
	await expect(
		page.getByRole("heading", { name: "Story Lens Dashboard" }),
	).toBeVisible();
	await expect(page.getByLabel("Email")).toHaveAttribute(
		"autocomplete",
		"username",
	);
	await expect(page.getByLabel("Password")).toHaveAttribute(
		"autocomplete",
		"current-password",
	);
	await expect(
		page.getByRole("link", { name: /register|sign up|create account/i }),
	).toHaveCount(0);
	await expectAccessible(page);
});

test("a wrong password shows the API error and a correct one signs in", async ({
	page,
}) => {
	await mockApi(page);
	await page.goto("/login");
	await page.getByLabel("Email").fill("admin@storylens.local");
	await page.getByLabel("Password").fill("wrong");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByRole("alert")).toHaveText("Invalid email or password");

	await page.getByLabel("Password").fill("correct-password");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
	await expect(page.getByText("1,280")).toBeVisible();
	expect(
		await page.evaluate(() =>
			localStorage.getItem("storylens-dashboard-token"),
		),
	).toBe("test-token");
});

for (const theme of ["light", "dark"] as const) {
	test(`overview and users are accessible in ${theme} mode`, async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme: theme });
		await mockApi(page, { signedIn: true });
		await page.goto("/");
		await expect(page.getByText("The Lantern Archive")).toBeVisible();
		await expectAccessible(page);
		await page.goto("/users");
		await expect(page.getByText("Mira Vale")).toBeVisible();
		await expectAccessible(page);
	});
}

test("one new user can get both reader and dashboard access", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/users");
	await page.getByRole("button", { name: "New user" }).click();
	const dialog = page.getByRole("dialog", { name: "New user" });
	await dialog.getByLabel("Display name").fill("Rowan Reed");
	await dialog.getByLabel("Username").fill("rowan");
	await dialog.getByLabel("Email").fill("rowan@example.com");
	await dialog.getByLabel("Password").fill("a-strong-password");
	const dashboard = dialog.getByRole("group", { name: "Dashboard access" });
	await expect(dashboard.getByLabel("Role")).toHaveValue("role-super");
	const reader = dialog.getByRole("group", { name: "Reader access" });
	await reader.getByRole("checkbox").check();
	await expect(reader.getByLabel("Role")).toHaveValue("role-reader");
	await dialog.getByRole("button", { name: "Create user" }).click();
	await expect(
		page.getByRole("status").filter({ hasText: "User created" }),
	).toBeVisible();
	const created = requests.find(
		(request) =>
			request.method === "POST" && request.path === "/api/admin/users/",
	);
	expect(created?.body).toMatchObject({
		isUser: true,
		userRoleId: "role-reader",
		isAdmin: true,
		adminRoleId: "role-super",
		username: "rowan",
	});
});

test("signing in survives a page translator rewriting the form", async ({
	page,
}) => {
	await mockApi(page);
	await page.goto("/login");
	await page.getByLabel("Email").fill("admin@storylens.local");
	await page.getByLabel("Password").fill("correct-password");
	await translatePage(page.locator("body"));
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
	await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
});

test("saving survives a page translator rewriting button labels", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.goto("/users");
	await page.getByRole("button", { name: "Edit mira" }).click();
	const dialog = page.getByRole("dialog", { name: "Edit user" });
	await dialog.getByLabel("Display name").fill("Mira V.");
	await translatePage(dialog);
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(
		page.getByRole("status").filter({ hasText: "User updated" }),
	).toBeVisible();
	await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
});

test("the list shows each account's access and roles", async ({ page }) => {
	await mockApi(page, { signedIn: true });
	await page.goto("/users");
	await expect(page.getByText("Dashboard · Super Admin")).toBeVisible();
	await expect(page.getByText("Reader · Reader")).toBeVisible();
});

test("pages and actions follow the role's permissions", async ({ page }) => {
	await mockApi(page, {
		signedIn: true,
		permissions: ["GET /api/admin/users/"],
	});
	await page.goto("/");
	// Without the overview permission, home redirects to the first allowed page.
	await expect(page).toHaveURL(/\/users$/);
	await expect(page.getByRole("button", { name: "New user" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);
	const nav = page.getByRole("navigation", { name: "Main" });
	if (await nav.isVisible()) {
		await expect(nav.getByRole("link")).toHaveText(["Users"]);
	}
	await page.goto("/configs");
	await expect(
		page.getByRole("heading", { name: "You don’t have access to this page" }),
	).toBeVisible();
});

test("the role editor saves the selected reader permissions", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto("/roles/role-reader");
	await expect(page.getByRole("heading", { name: "Reader" })).toBeVisible();
	await page.getByRole("checkbox", { name: "Novels", exact: true }).check();
	await expect(page.getByText("2 of 3 selected")).toBeVisible();
	await page.getByRole("button", { name: "Save role" }).click();
	await expect(page).toHaveURL(/\/roles$/);
	const saved = requests.find((request) => request.method === "PUT");
	expect(saved?.body).toMatchObject({
		permissionIds: ["p-user-1", "p-user-2"],
	});
});

test("match translations suggests names and saves a row, a link and a bulk selection", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	const prompts = await mockDesktopClient(page);
	await page.goto(`/translations?novel=${novels[0]?.id}`);

	// Nothing is sent to the AI until the admin asks.
	const mira = page.getByRole("textbox", { name: "English name for ميرا" });
	await expect(mira).toHaveValue("");
	expect(prompts).toHaveLength(0);
	await page.getByRole("button", { name: "Suggest page" }).click();
	await expect(mira).toHaveValue("Mira");
	await expect(
		page.getByRole("button", { name: "Re-suggest page" }),
	).toBeVisible();
	// The AI matched "الفانوس" to the English-only "The Lantern", so it prefills Link.
	const lanternRow = page
		.getByRole("row")
		.filter({ has: page.getByRole("checkbox", { name: "Select الفانوس" }) });
	await expect(lanternRow.getByText("The Lantern")).toBeVisible();
	await expect(
		page.getByRole("textbox", { name: "English name for الفانوس" }),
	).toBeDisabled();
	await expect(
		page.getByRole("combobox", { name: "Make الفانوس an alias of" }),
	).toBeDisabled();
	expect(prompts).toHaveLength(2);

	await page
		.getByRole("row")
		.filter({ has: mira })
		.getByRole("button", { name: "Save" })
		.click();
	await expect(page.getByText("Row saved")).toBeVisible();
	expect(requests).toContainEqual({
		method: "PUT",
		path: `/api/admin/keywords/${KEYWORD_IDS.mira}`,
		body: { nameAr: "ميرا", nameEn: "Mira" },
	});

	await page.getByRole("checkbox", { name: "Select الفانوس" }).check();
	await page.getByRole("checkbox", { name: "Select The Lantern" }).check();
	await page.getByRole("button", { name: "Save selected (2)" }).click();
	await expect(page.getByText("2 rows saved")).toBeVisible();
	expect(requests).toContainEqual({
		method: "POST",
		path: `/api/admin/keywords/${KEYWORD_IDS.lanternAr}/link`,
		body: { targetId: KEYWORD_IDS.lanternEn },
	});
	expect(requests).toContainEqual({
		method: "PUT",
		path: `/api/admin/keywords/${KEYWORD_IDS.lanternEn}`,
		body: { nameAr: "الفانوس", nameEn: "The Lantern" },
	});

	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});

test("the link picker fuzzy-searches keywords in both languages", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.goto(`/translations?novel=${novels[0]?.id}`);
	const link = page.getByRole("combobox", {
		name: "Link ميرا to its English keyword",
	});
	// A typo still finds the English keyword.
	await link.fill("lantren");
	await expect(
		page.getByRole("option", { name: "The Lantern", exact: true }),
	).toBeVisible();
	// Arabic keywords are searchable too, by a word inside the name.
	await link.fill("فانوس");
	await expect(
		page.getByRole("option", { name: "الفانوس", exact: true }),
	).toBeVisible();
	await link.fill("zzzz");
	await expect(page.getByText("No matching keywords")).toBeVisible();

	await link.fill("the lantern");
	await page.getByRole("option", { name: "The Lantern", exact: true }).click();
	await expect(
		page.getByRole("combobox", { name: "Make ميرا an alias of" }),
	).toBeDisabled();
	await expect(
		page.getByRole("combobox", { name: "Make ميرا a version of" }),
	).toBeDisabled();
	await expect(
		page.getByRole("textbox", { name: "English name for ميرا" }),
	).toBeDisabled();
});

test("an English name stored as Arabic asks for the Arabic name and is refiled on save", async ({
	page,
}) => {
	const misfiled = {
		id: "55555555-5555-4555-8555-555555555555",
		novelId: novels[0]?.id ?? "",
		nameAr: "Bull Demon",
		nameEn: null,
		description: null,
		aliases: [],
	};
	const requests = await mockApi(page, {
		signedIn: true,
		keywords: [...keywords, misfiled],
	});
	await page.goto(`/translations?novel=${novels[0]?.id}`);
	const row = page
		.getByRole("row")
		.filter({ has: page.getByRole("checkbox", { name: "Select Bull Demon" }) });
	await expect(row.getByText("English → Arabic")).toBeVisible();
	const input = row.getByRole("textbox", {
		name: "Arabic name for Bull Demon",
	});
	await expect(input).toHaveAttribute("placeholder", "Arabic name");
	await input.fill("شيطان الثور");
	await row.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Row saved")).toBeVisible();
	expect(requests).toContainEqual({
		method: "PUT",
		path: `/api/admin/keywords/${misfiled.id}`,
		body: { nameAr: "شيطان الثور", nameEn: "Bull Demon" },
	});
});

test("the desktop client port defaults to the client's port", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.goto(`/translations?novel=${novels[0]?.id}`);
	await expect(page.getByLabel("Port")).toHaveValue("43127");
});

test("cancel suggesting aborts the AI request", async ({ page }) => {
	await mockApi(page, { signedIn: true });
	await page.addInitScript(() =>
		localStorage.setItem(
			"storylens-dashboard-desktop-client",
			JSON.stringify({ port: 47000, token: "pair", model: "m", effort: "low" }),
		),
	);
	// The desktop client never answers, like a model still thinking.
	await page.route("http://127.0.0.1:47000/**", () => {});
	await page.goto(`/translations?novel=${novels[0]?.id}`);

	await page.getByRole("button", { name: "Suggest page" }).click();
	await expect(page.getByText("Suggesting translations…")).toBeVisible();
	const aborted = page.waitForEvent("requestfailed", (request) =>
		request.url().includes("/ExecutePrompt"),
	);
	await page.getByRole("button", { name: "Cancel suggesting" }).click();
	expect((await aborted).failure()?.errorText).toMatch(/abort/i);
	await expect(page.getByText("Suggesting translations…")).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Suggest page" }),
	).toBeEnabled();
	await expect(page.getByRole("alert")).toHaveCount(0);
});

test("re-suggesting replaces AI drafts but keeps manually edited names", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.addInitScript(() =>
		localStorage.setItem(
			"storylens-dashboard-desktop-client",
			JSON.stringify({ port: 47000, token: "pair", model: "m", effort: "low" }),
		),
	);
	let englishRuns = 0;
	await page.route("http://127.0.0.1:47000/**", async (route) => {
		const body = route.request().postDataJSON() as { responseLanguage: string };
		if (body.responseLanguage === "en") englishRuns++;
		const answer =
			body.responseLanguage === "en"
				? [
						{ id: KEYWORD_IDS.mira, translation: `Mira ${englishRuns}` },
						{
							id: KEYWORD_IDS.lanternAr,
							translation: `Lantern ${englishRuns}`,
						},
					]
				: [];
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ output: JSON.stringify(answer) }),
		});
	});
	await page.goto(`/translations?novel=${novels[0]?.id}`);
	await page.getByRole("button", { name: "Suggest page" }).click();
	const mira = page.getByRole("textbox", { name: "English name for ميرا" });
	const lantern = page.getByRole("textbox", {
		name: "English name for الفانوس",
	});
	await expect(mira).toHaveValue("Mira 1");
	await expect(lantern).toHaveValue("Lantern 1");
	await mira.fill("My Mira");
	await page.getByRole("button", { name: "Re-suggest page" }).click();
	await expect(lantern).toHaveValue("Lantern 2");
	await expect(mira).toHaveValue("My Mira");
});

test("a novel row opens its profile with characters in the chosen language", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.goto("/novels");
	await page.getByRole("cell", { name: /lantern-archive/ }).click();
	await expect(page).toHaveURL(`/novels/${novels[0]?.id}`);
	await expect(
		page.getByRole("heading", { name: /The Lantern Archive/i }),
	).toBeVisible();

	const table = page.getByRole("table");
	// Arabic by default: keywords with an Arabic name only.
	await expect(table.getByText("ميرا", { exact: true })).toBeVisible();
	await expect(table.getByText("الفانوس", { exact: true })).toBeVisible();
	await expect(table.getByText("The Lantern", { exact: true })).toHaveCount(0);
	const lantern = table.getByRole("row").filter({ hasText: "الفانوس" });
	await expect(lantern.getByText("En missing")).toBeVisible();

	// Versions and aliases sit under their keyword.
	await expect(table.getByText("Mira Vale")).toBeVisible();
	await expect(table.getByText("Ch. 0–49")).toBeVisible();
	await expect(table.getByText("Ch. 50+")).toBeVisible();

	await page.getByText("EN", { exact: true }).click();
	await expect(page).toHaveURL(/lang=en/);
	await expect(table.getByText("The Lantern", { exact: true })).toBeVisible();
	await expect(table.getByText("الفانوس", { exact: true })).toHaveCount(0);
	await expectAccessible(page);
});

test("character filters and the full search narrow the table", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	await page.goto(`/novels/${novels[0]?.id}`);
	const table = page.getByRole("table");
	const rows = table.locator("tbody > tr:not(.bg-wash\\/40)");
	await expect(rows).toHaveCount(2);

	// A typo in an alias still finds its keyword.
	await page
		.getByRole("searchbox", { name: "Search all columns" })
		.fill("mira vlae");
	await expect(rows).toHaveCount(1);
	await expect(table.getByText("ميرا", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Clear filters" }).click();
	await expect(rows).toHaveCount(2);

	await page.getByLabel("Filter by category").selectOption("cat-person");
	await expect(rows).toHaveCount(1);
	await page.getByLabel("Filter by category").selectOption("none");
	await expect(table.getByText("الفانوس", { exact: true })).toBeVisible();
	await page.getByLabel("Filter by category").selectOption("");

	await page.getByLabel("Filter by match").selectOption("PARTIAL");
	await expect(rows).toHaveCount(1);
	await page.getByLabel("Filter by match").selectOption("");
	await page.getByLabel("Filter by languages").selectOption("both");
	await expect(rows).toHaveCount(1);
	await page.getByLabel("Filter by languages").selectOption("");
	await page.getByLabel("Filter by image").selectOption("without");
	await expect(table.getByText("الفانوس", { exact: true })).toBeVisible();
	await expect(rows).toHaveCount(1);
});

/**
 * Fills a character form's name on one language tab. The tab of the characters
 * table's language (Arabic by default) opens first; the other one also has Link.
 */
async function fillName(
	dialog: Locator,
	language: "ar" | "en",
	value: string,
): Promise<void> {
	await dialog
		.getByRole("tab", { name: language === "ar" ? "Arabic" : "English" })
		.click();
	await dialog.getByLabel("Name", { exact: true }).fill(value);
}

test("character actions add an alias and a version, edit and delete", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto(`/novels/${novels[0]?.id}`);

	await page.getByRole("button", { name: "Add an alias to ميرا" }).click();
	let dialog = page.getByRole("dialog", { name: "Add an alias to ميرا" });
	await fillName(dialog, "en", "The Keeper");
	await dialog.getByRole("button", { name: "Add alias" }).click();
	await expect(page.getByText("Alias added")).toBeVisible();
	expect(requests).toContainEqual(
		expect.objectContaining({
			method: "POST",
			path: "/api/admin/keyword-aliases/",
			body: expect.objectContaining({
				keywordId: KEYWORD_IDS.mira,
				nameAr: null,
				nameEn: "The Keeper",
				matchingType: "FULL",
			}),
		}),
	);

	await page.getByRole("button", { name: "Add a version to ميرا" }).click();
	dialog = page.getByRole("dialog", { name: "Add a version to ميرا" });
	await expect(dialog.getByLabel("Starting chapter")).toHaveValue("51");
	await dialog.getByRole("button", { name: "Add version" }).click();
	await expect(page.getByText("Version added")).toBeVisible();
	expect(requests).toContainEqual(
		expect.objectContaining({
			method: "POST",
			path: "/api/admin/keyword-versions/",
			body: expect.objectContaining({
				keywordId: KEYWORD_IDS.mira,
				startingChapter: 51,
				endingChapter: null,
			}),
		}),
	);

	await page.getByRole("button", { name: "Edit ميرا", exact: true }).click();
	dialog = page.getByRole("dialog", { name: "Edit ميرا" });
	await expect(dialog.getByLabel("Category")).toHaveValue("cat-person");
	await fillName(dialog, "en", "Mira the Keeper");
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Keyword updated")).toBeVisible();
	expect(requests).toContainEqual({
		method: "PUT",
		path: `/api/admin/keywords/${KEYWORD_IDS.mira}`,
		body: {
			nameAr: "ميرا",
			nameEn: "Mira the Keeper",
			matchingType: "FULL",
			fuzzyMatchArabicCharacters: true,
		},
	});
	expect(requests).toContainEqual(
		expect.objectContaining({
			method: "PUT",
			path: "/api/admin/keyword-versions/v-mira-0",
			body: expect.objectContaining({
				categoryId: "cat-person",
				natureId: "nat-ally",
				imageId: "img-mira",
			}),
		}),
	);

	// The base version can't be deleted; a later one can.
	await expect(
		page.getByRole("button", { name: "Delete ميرا Base version Ch. 0–49" }),
	).toBeDisabled();

	await page.getByRole("button", { name: "Delete ميرا", exact: true }).click();
	dialog = page.getByRole("dialog", { name: "Delete keyword?" });
	await expect(dialog).toContainText("2 versions and 1 aliases");
	await dialog.getByRole("button", { name: "Delete keyword" }).click();
	await expect(page.getByText("Keyword deleted")).toBeVisible();
	expect(requests).toContainEqual(
		expect.objectContaining({
			method: "DELETE",
			path: `/api/admin/keywords/${KEYWORD_IDS.mira}`,
		}),
	);
});

test("a new keyword is created with its base details", async ({ page }) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto(`/novels/${novels[0]?.id}`);
	await page.getByRole("button", { name: "New keyword" }).click();
	const dialog = page.getByRole("dialog", { name: "New keyword" });
	await dialog.getByRole("button", { name: "Create keyword" }).click();
	await expect(dialog.getByRole("alert")).toHaveText(
		"Enter an Arabic or English name.",
	);
	await fillName(dialog, "en", "Old Bell");
	await dialog.getByLabel("Category").selectOption("cat-person");
	await dialog.getByLabel("Description").fill("Rings at dawn");
	await dialog.getByText("Full word match").click();
	await dialog.getByRole("button", { name: "Create keyword" }).click();
	await expect(page.getByText("Keyword created")).toBeVisible();
	expect(requests).toContainEqual({
		method: "POST",
		path: "/api/admin/keywords/",
		body: {
			novelId: novels[0]?.id,
			nameAr: null,
			nameEn: "Old Bell",
			matchingType: "PARTIAL",
			fuzzyMatchArabicCharacters: true,
			description: "Rings at dawn",
			categoryId: "cat-person",
			natureId: null,
			imageId: null,
		},
	});
});

test("Arabic names offer alif variant matching, on by default", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto(`/novels/${novels[0]?.id}`);
	await page.getByRole("button", { name: "New keyword" }).click();
	const dialog = page.getByRole("dialog", { name: "New keyword" });
	const variants = dialog.getByLabel("Fuzzy Match Arabic Characters Variants");
	await fillName(dialog, "en", "Amal");
	await expect(variants).toHaveCount(0);
	await fillName(dialog, "ar", "أمل");
	await expect(variants).toBeChecked();
	await variants.uncheck();
	await dialog.getByRole("button", { name: "Create keyword" }).click();
	await expect(page.getByText("Keyword created")).toBeVisible();
	expect(requests).toContainEqual(
		expect.objectContaining({
			method: "POST",
			path: "/api/admin/keywords/",
			body: expect.objectContaining({
				nameAr: "أمل",
				nameEn: "Amal",
				fuzzyMatchArabicCharacters: false,
			}),
		}),
	);

	await page.getByRole("button", { name: "Add an alias to ميرا" }).click();
	const alias = page.getByRole("dialog", { name: "Add an alias to ميرا" });
	await fillName(alias, "ar", "إميرا");
	await expect(
		alias.getByLabel("Fuzzy Match Arabic Characters Variants"),
	).toBeChecked();
	await alias.getByRole("button", { name: "Add alias" }).click();
	await expect(page.getByText("Alias added")).toBeVisible();
	expect(requests).toContainEqual(
		expect.objectContaining({
			method: "POST",
			path: "/api/admin/keyword-aliases/",
			body: expect.objectContaining({
				nameAr: "إميرا",
				fuzzyMatchArabicCharacters: true,
			}),
		}),
	);
});

test("editing keeps a keyword's saved alif variant setting", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto(`/novels/${novels[0]?.id}`);
	await page.getByRole("button", { name: "Edit الفانوس", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Edit الفانوس" });
	await expect(
		dialog.getByLabel("Fuzzy Match Arabic Characters Variants"),
	).not.toBeChecked();
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Keyword updated")).toBeVisible();
	expect(requests).toContainEqual({
		method: "PUT",
		path: `/api/admin/keywords/${KEYWORD_IDS.lanternAr}`,
		body: {
			nameAr: "الفانوس",
			nameEn: null,
			matchingType: "PARTIAL",
			fuzzyMatchArabicCharacters: false,
		},
	});
});

test("the link picker offers aliases in both languages; alias of and version of offer keywords only", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto(`/translations?novel=${novels[0]?.id}`);

	const parent = page.getByRole("combobox", {
		name: "Make الفانوس an alias of",
	});
	await parent.fill("vale");
	// Found through its alias, but only the keyword itself is offered.
	await expect(page.getByRole("option", { name: /Mira · ميرا/ })).toBeVisible();
	await expect(page.getByRole("option", { name: /Alias of/ })).toHaveCount(0);
	await parent.fill("");
	await parent.blur();

	const link = page.getByRole("combobox", {
		name: "Link الفانوس to its English keyword",
	});
	const linkList = page.getByRole("listbox", {
		name: "Link الفانوس to its English keyword",
	});
	await link.fill("vale");
	const aliasOption = linkList.getByRole("option", { name: /Mira Vale/ });
	await expect(aliasOption).toContainText("Alias of Mira · ميرا");
	await link.fill("ميرا");
	await expect(
		linkList.getByRole("option", { name: /^Mira · ميرا$/ }),
	).toBeVisible();
	await link.fill("vale");
	await aliasOption.click();
	await expect(
		page.getByRole("combobox", { name: "Make الفانوس an alias of" }),
	).toBeDisabled();

	const row = page
		.getByRole("row")
		.filter({ has: page.getByRole("checkbox", { name: "Select الفانوس" }) });
	await row.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Row saved")).toBeVisible();
	expect(requests).toContainEqual({
		method: "POST",
		path: `/api/admin/keywords/${KEYWORD_IDS.lanternAr}/link-alias`,
		body: { aliasId: "alias-mira-vale" },
	});
});

test("linking to an alias that already has a name in that language is refused", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto(`/translations?novel=${novels[0]?.id}`);
	const link = page.getByRole("combobox", {
		name: "Link The Lantern to its Arabic keyword",
	});
	await link.fill("vale");
	await page.getByRole("option", { name: /Mira Vale/ }).click();
	const row = page.getByRole("row").filter({
		has: page.getByRole("checkbox", { name: "Select The Lantern" }),
	});
	await row.getByRole("button", { name: "Save" }).click();
	await expect(row.getByRole("alert")).toHaveText(
		"The alias “Mira Vale” already has the English name “Mira Vale”.",
	);
	expect(requests.some((request) => request.path.endsWith("/link-alias"))).toBe(
		false,
	);
});

test("an alias's translation is edited on the novel profile", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto(`/novels/${novels[0]?.id}`);
	await page.getByRole("button", { name: "Edit alias Mira Vale" }).click();
	const dialog = page.getByRole("dialog", { name: "Edit alias" });
	await fillName(dialog, "ar", "ميرا فيل");
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Alias updated")).toBeVisible();
	expect(requests).toContainEqual(
		expect.objectContaining({
			method: "PUT",
			path: "/api/admin/keyword-aliases/alias-mira-vale",
			body: expect.objectContaining({
				nameAr: "ميرا فيل",
				nameEn: "Mira Vale",
			}),
		}),
	);
});

test("renaming an alias in one language keeps the other language's name", async ({
	page,
}) => {
	const profileKeywords = structuredClone(keywordDetails);
	const alias = profileKeywords[0]?.aliases[0];
	if (!alias) throw new Error("Missing alias fixture");
	alias.nameAr = "ميرا فيل";
	alias.nameEn = "Mira Vale";
	const requests = await mockApi(page, { signedIn: true, profileKeywords });
	await page.goto(`/novels/${novels[0]?.id}`);
	await page.getByRole("button", { name: "Edit alias Mira Vale" }).click();
	const dialog = page.getByRole("dialog", { name: "Edit alias" });
	await fillName(dialog, "ar", "ميرا الجديدة");
	// The other tab keeps its own language's name.
	await dialog.getByRole("tab", { name: "English" }).click();
	await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
		"Mira Vale",
	);
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Alias updated")).toBeVisible();
	expect(requests).toContainEqual(
		expect.objectContaining({
			method: "PUT",
			path: "/api/admin/keyword-aliases/alias-mira-vale",
			body: expect.objectContaining({
				nameAr: "ميرا الجديدة",
				nameEn: "Mira Vale",
			}),
		}),
	);
});

test("a keyword's Link tab merges the other language's keyword on save", async ({
	page,
}) => {
	const requests = await mockApi(page, { signedIn: true });
	await page.goto(`/novels/${novels[0]?.id}`);
	await page.getByRole("button", { name: "Edit الفانوس", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Edit الفانوس" });

	// The table's language opens first and has no Link; the other tab does.
	await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
		"الفانوس",
	);
	await expect(dialog.getByRole("combobox", { name: "Link" })).toHaveCount(0);
	await dialog.getByRole("tab", { name: "English" }).click();
	const link = dialog.getByRole("combobox", { name: "Link" });

	await link.fill("lantern");
	// Mira is named in Arabic too, so it cannot be this Arabic keyword's translation.
	await expect(page.getByRole("option", { name: /^Mira · ميرا$/ })).toHaveCount(
		0,
	);
	await page.getByRole("option", { name: "The Lantern" }).click();
	// The link fills this tab's name and hands over its style: the merge keeps one row.
	const name = dialog.getByLabel("Name", { exact: true });
	await expect(name).toHaveValue("The Lantern");
	await expect(name).toBeDisabled();
	await expect(dialog.getByLabel("Description")).toHaveValue("A glowing relic");

	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Keyword updated")).toBeVisible();
	// The merged keyword still holds that name, so only the link is sent.
	expect(requests).toContainEqual({
		method: "PUT",
		path: `/api/admin/keywords/${KEYWORD_IDS.lanternAr}`,
		body: {
			nameAr: "الفانوس",
			nameEn: null,
			matchingType: "PARTIAL",
			fuzzyMatchArabicCharacters: false,
			translationKeywordId: KEYWORD_IDS.lanternEn,
		},
	});
	expect(requests).toContainEqual(
		expect.objectContaining({
			method: "PUT",
			path: "/api/admin/keyword-versions/v-lantern-ar",
			body: expect.objectContaining({ description: "A glowing relic" }),
		}),
	);
});

for (const kind of ["keyword", "alias"] as const) {
	test(`a bilingual ${kind} offers no conflicting Link`, async ({ page }) => {
		const profileKeywords = structuredClone(keywordDetails);
		const mira = profileKeywords[0];
		const vale = mira?.aliases[0];
		if (!mira || !vale) throw new Error("Missing alias fixture");
		if (kind === "alias") {
			vale.nameAr = "ميرا فيل";
			mira.aliases.push({
				...structuredClone(vale),
				id: "alias-en-only",
				nameAr: null,
				nameEn: "The Keeper",
			});
		}
		await mockApi(page, { signedIn: true, profileKeywords });
		await page.goto(`/novels/${novels[0]?.id}`);
		await page
			.getByRole("button", {
				name: kind === "keyword" ? "Edit ميرا" : /^Edit alias Mira Vale/,
				exact: true,
			})
			.click();
		const dialog = page.getByRole("dialog", {
			name: kind === "keyword" ? "Edit ميرا" : "Edit alias",
			exact: true,
		});
		await dialog.getByRole("tab", { name: "English" }).click();
		await dialog.getByRole("combobox", { name: "Link" }).click();
		await expect(page.getByText("No matching keywords")).toBeVisible();
		await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);
	});

	test(`a ${kind} Link still requires a name in the saved payload`, async ({
		page,
	}) => {
		const profileKeywords = structuredClone(keywordDetails);
		const mira = profileKeywords[0];
		const vale = mira?.aliases[0];
		if (!mira || !vale) throw new Error("Missing alias fixture");
		if (kind === "alias") {
			mira.aliases.push({
				...structuredClone(vale),
				id: "alias-ar-only",
				nameAr: "ميرا فيل",
				nameEn: null,
			});
		}
		const requests = await mockApi(page, { signedIn: true, profileKeywords });
		await page.goto(
			`/novels/${novels[0]?.id}${kind === "alias" ? "?lang=en" : ""}`,
		);
		await page
			.getByRole("button", {
				name: kind === "keyword" ? "Edit الفانوس" : "Edit alias Mira Vale",
				exact: true,
			})
			.click();
		const dialog = page.getByRole("dialog", {
			name: kind === "keyword" ? "Edit الفانوس" : "Edit alias",
			exact: true,
		});
		await dialog.getByLabel("Name", { exact: true }).fill("");
		await dialog
			.getByRole("tab", { name: kind === "keyword" ? "English" : "Arabic" })
			.click();
		await dialog.getByRole("combobox", { name: "Link" }).click();
		await page
			.getByRole("option", {
				name: kind === "keyword" ? "The Lantern" : "ميرا فيل",
			})
			.click();
		await dialog.getByRole("button", { name: "Save changes" }).click();
		await expect(dialog.getByRole("alert")).toHaveText(
			"Enter an Arabic or English name.",
		);
		expect(
			requests.filter(
				(request) => request.method === "PUT" || request.method === "POST",
			),
		).toHaveLength(0);
	});
}

test("an alias's Link offers only its keyword's aliases in that language", async ({
	page,
}) => {
	const profileKeywords = structuredClone(keywordDetails);
	const mira = profileKeywords[0];
	const vale = mira?.aliases[0];
	if (!mira || !vale) throw new Error("Missing alias fixture");
	// A second alias of the same keyword, named only in the other language.
	mira.aliases.push({
		...structuredClone(vale),
		id: "alias-mira-ar",
		nameAr: "ميرا فيل",
		nameEn: null,
	});
	const requests = await mockApi(page, { signedIn: true, profileKeywords });
	// The English table opens the English tab first, so Link sits in the Arabic one.
	await page.goto(`/novels/${novels[0]?.id}?lang=en`);
	await page.getByRole("button", { name: "Edit alias Mira Vale" }).click();
	const dialog = page.getByRole("dialog", { name: "Edit alias" });
	await expect(dialog.getByRole("combobox", { name: "Link" })).toHaveCount(0);
	await dialog.getByRole("tab", { name: "Arabic" }).click();

	await dialog.getByRole("combobox", { name: "Link" }).click();
	// Keywords and other keywords' aliases are never offered, only siblings.
	await expect(page.getByRole("option", { name: /^Mira · ميرا$/ })).toHaveCount(
		0,
	);
	await page.getByRole("option", { name: "ميرا فيل" }).click();
	await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
		"ميرا فيل",
	);
	await dialog.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Alias updated")).toBeVisible();
	expect(requests).toContainEqual(
		expect.objectContaining({
			method: "PUT",
			path: "/api/admin/keyword-aliases/alias-mira-vale",
			body: expect.objectContaining({
				nameAr: null,
				nameEn: "Mira Vale",
				translationAliasId: "alias-mira-ar",
			}),
		}),
	);
});
