import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { PERMISSIONS } from "../src/lib/permissions";
import { mockApi, novels } from "./fixtures";

const imageUrl =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=";
const image = {
	name: "portrait.png",
	mimeType: "image/png",
	buffer: Buffer.from(imageUrl.split(",")[1] ?? "", "base64"),
};

async function openImageForm(
	page: Page,
	kind: "novel" | "keyword" | "alias" | "version",
) {
	await page.goto(`/novels/${novels[0]?.id}`);
	if (kind === "novel") {
		await page.goto("/novels");
		await page.getByRole("button", { name: /Edit.*Lantern/ }).click();
	} else {
		const name =
			kind === "keyword"
				? "Edit ميرا"
				: kind === "alias"
					? "Edit alias Mira Vale"
					: "Edit ميرا Version Ch. 50+";
		await page.getByRole("button", { name, exact: true }).click();
	}
	return page.getByRole("dialog");
}
async function drag(page: Page, mimeType = "image/png", count = 1) {
	return page.evaluateHandle(
		({ mimeType, count }) => {
			const dt = new DataTransfer();
			for (let index = 0; index < count; index++)
				dt.items.add(
					new File(
						["fixture"],
						mimeType === "image/png" ? "portrait.png" : "notes.txt",
						{ type: mimeType },
					),
				);
			return dt;
		},
		{ mimeType, count },
	);
}

for (const kind of ["novel", "keyword", "alias", "version"] as const) {
	test(`${kind} uses the 100px image drop area with delete and saved image clearing`, async ({
		page,
	}) => {
		const requests = await mockApi(page, { signedIn: true });
		let uploads = 0;
		await page.route("**/api/admin/files/upload", async (route) => {
			uploads++;
			expect(route.request().headers().authorization).toBe("Bearer test-token");
			expect(route.request().postDataBuffer()?.toString()).toContain(
				'filename="portrait.png"',
			);
			await route.fulfill({ json: { id: "uploaded-image", url: imageUrl } });
		});
		const dialog = await openImageForm(page, kind);
		const area = dialog.locator(".image-drop-area");
		await expect(area).toBeVisible();
		expect((await area.boundingBox())?.height).toBe(100);
		await area.scrollIntoViewIfNeeded();
		const dt = await drag(page);
		await area.dispatchEvent("dragenter", { dataTransfer: dt });
		await expect(area).toHaveAttribute("data-drag", "accept");
		await expect(area).toContainText("Drop your image here");
		await area.dispatchEvent("drop", { dataTransfer: dt });
		await expect(area).toContainText("portrait.png");
		await expect(
			dialog.getByRole("img", {
				name: kind === "novel" ? "Cover image" : "Image",
				exact: true,
			}),
		).toHaveAttribute("src", imageUrl);
		await dialog
			.getByRole("button", {
				name: kind === "novel" ? "Delete cover image" : "Delete image",
				exact: true,
			})
			.click();
		await expect(
			dialog.getByRole("img", {
				name: kind === "novel" ? "Cover image" : "Image",
				exact: true,
			}),
		).toHaveCount(0);
		await expect(area).toBeFocused();
		await dialog
			.getByRole("button", { name: "Save changes", exact: true })
			.click();
		await expect(dialog).not.toBeVisible();
		expect(uploads).toBe(1);
		expect(
			requests.some(
				(request) =>
					request.method === "PUT" &&
					(request.body as { imageId?: string | null })?.imageId === null,
			),
		).toBe(true);
	});
}

test("picker is keyboard accessible; invalid drops and upload failures preserve the current image", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	let uploads = 0;
	await page.route("**/api/admin/files/upload", async (route) => {
		uploads++;
		await route.fulfill({ status: 500, json: { message: "Upload failed" } });
	});
	const dialog = await openImageForm(page, "keyword");
	const area = dialog.locator(".image-drop-area");
	const preview = dialog.getByRole("img", { name: "Image", exact: true });
	const previous = await preview.getAttribute("src");
	const bad = await drag(page, "text/plain");
	await area.dispatchEvent("dragenter", { dataTransfer: bad });
	await expect(area).toHaveAttribute("data-drag", "reject");
	await area.dispatchEvent("drop", { dataTransfer: bad });
	await expect(dialog.getByRole("alert")).toHaveText("Choose an image file.");
	await area.dispatchEvent("drop", {
		dataTransfer: await drag(page, "image/png", 2),
	});
	await expect(dialog.getByRole("alert")).toHaveText(
		"Choose one image at a time.",
	);
	await dialog
		.locator('input[type="file"]')
		.setInputFiles({ ...image, buffer: Buffer.alloc(8 * 1024 * 1024 + 1) });
	await expect(dialog.getByRole("alert")).toHaveText(
		"Images must be 8 MB or smaller.",
	);
	expect(uploads).toBe(0);
	await area.focus();
	const [chooser] = await Promise.all([
		page.waitForEvent("filechooser"),
		area.press("Enter"),
	]);
	await chooser.setFiles(image);
	await expect(dialog.getByRole("alert")).toHaveText("Upload failed");
	await expect(preview).toHaveAttribute("src", previous ?? "");
	await expect(area).toBeEnabled();
	const accessibility = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
		.analyze();
	expect(accessibility.violations).toEqual([]);
});

test("uploading blocks duplicate drops and clearing until it finishes", async ({
	page,
}) => {
	await mockApi(page, { signedIn: true });
	let finish: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		finish = resolve;
	});
	let uploads = 0;
	await page.route("**/api/admin/files/upload", async (route) => {
		uploads++;
		await gate;
		await route.fulfill({ json: { id: "uploaded-image", url: imageUrl } });
	});
	const dialog = await openImageForm(page, "keyword");
	const area = dialog.locator(".image-drop-area");
	const dt = await drag(page);
	await area.dispatchEvent("drop", { dataTransfer: dt });
	await expect(area).toBeDisabled();
	await expect(
		dialog.getByRole("button", { name: "Delete image", exact: true }),
	).toBeDisabled();
	await expect(
		dialog.getByRole("button", { name: "Save changes" }),
	).toBeDisabled();
	await area.dispatchEvent("drop", { dataTransfer: dt });
	await expect.poll(() => uploads).toBe(1);
	finish();
	await expect(area).toBeEnabled();
	await expect(area).toContainText("portrait.png");
});

test("a role without upload permission cannot pick, drop or clear images", async ({
	page,
}) => {
	const requests = await mockApi(page, {
		signedIn: true,
		permissions: [
			PERMISSIONS.novels.view,
			PERMISSIONS.novels.keywords,
			PERMISSIONS.keywords.update,
			PERMISSIONS.versions.update,
			PERMISSIONS.keywords.categories,
			PERMISSIONS.keywords.natures,
		],
	});
	const dialog = await openImageForm(page, "keyword");
	const area = dialog.locator(".image-drop-area");
	await expect(area).toBeDisabled();
	await expect(
		dialog.getByText("Your role can’t upload images."),
	).toBeVisible();
	await area.dispatchEvent("drop", { dataTransfer: await drag(page) });
	await expect(
		dialog.getByRole("button", { name: "Delete image", exact: true }),
	).toHaveCount(0);
	expect(
		requests.some((request) => request.path === "/api/admin/files/upload"),
	).toBe(false);
});

for (const theme of ["light", "dark"] as const) {
	test(`image drop area fits a phone and has visible feedback in ${theme} theme`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await mockApi(page, { signedIn: true });
		await page.addInitScript(
			(theme) => localStorage.setItem("storylens-dashboard-theme", theme),
			theme,
		);
		const dialog = await openImageForm(page, "keyword");
		const area = dialog.locator(".image-drop-area");
		await area.scrollIntoViewIfNeeded();
		const box = await area.boundingBox();
		expect(box?.height).toBe(100);
		expect(box?.x).toBeGreaterThanOrEqual(0);
		expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
		// A touch-generated hover can already use the accent border after opening the form.
		const initial = await area.evaluate(
			(element) => getComputedStyle(element).boxShadow,
		);
		await area.dispatchEvent("dragenter", { dataTransfer: await drag(page) });
		await expect
			.poll(() =>
				area.evaluate((element) => getComputedStyle(element).boxShadow),
			)
			.not.toBe(initial);
		await expect(area).toHaveCSS("border-top-style", "solid");
		await dialog.screenshot({
			path: testInfo.outputPath(`image-upload-${theme}.png`),
		});
		await area.dispatchEvent("dragleave");
		await expect(area).toHaveAttribute("data-drag", "idle");
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect(area).toHaveCSS("transition-property", "none");
		const accessibility = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
			.analyze();
		expect(accessibility.violations).toEqual([]);
	});
}

for (const kind of ["keyword", "alias", "version"] as const) {
	test(`${kind} saves an editable image prompt from a collapsed section`, async ({
		page,
	}, testInfo) => {
		const requests = await mockApi(page, { signedIn: true });
		const dialog = await openImageForm(page, kind);
		const prompt = dialog.getByLabel("Image Description", { exact: true });
		await expect(prompt).not.toBeVisible();
		await dialog
			.locator("summary")
			.filter({ hasText: /^Image Description$/ })
			.click();
		await expect(prompt).toBeVisible();
		await expect(prompt).toHaveCSS("height", "100px");
		await prompt.fill("Watercolor portrait. Silver hair, green cloak.");
		const copy = dialog.getByRole("button", {
			name: "Copy prompt",
			exact: true,
		});
		await expect(copy).toHaveText("");
		const editor = dialog.locator(".image-prompt-editor");
		const section = dialog
			.locator("summary")
			.filter({ hasText: /^Image Description$/ });
		if (testInfo.project.name === "chromium") {
			await section.focus();
			await page.mouse.move(0, 0);
			await expect(copy).toHaveCSS("opacity", "0");
			await editor.hover();
			await expect(copy).toHaveCSS("opacity", "1");
			await section.focus();
			await page.mouse.move(0, 0);
			await copy.focus();
			await expect(copy).toHaveCSS("opacity", "1");
		} else await expect(copy).toHaveCSS("opacity", "1");
		await dialog.getByRole("button", { name: "Expand", exact: true }).click();
		await expect(prompt).toHaveCSS("height", "320px");
		await expect(
			dialog.getByRole("button", { name: "Collapse", exact: true }),
		).toHaveAttribute("aria-expanded", "true");
		await dialog.getByRole("button", { name: "Collapse", exact: true }).click();
		await expect(prompt).toHaveCSS("height", "100px");
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect(copy).toHaveCSS("transition-property", "none");

		await expect(
			dialog.getByRole("button", { name: "Copy prompt", exact: true }),
		).toBeVisible();
		if (kind === "keyword")
			await dialog.screenshot({
				path: testInfo.outputPath("image-prompt.png"),
			});
		await dialog
			.getByRole("button", { name: "Save changes", exact: true })
			.click();
		await expect(
			page.getByText(
				kind === "keyword"
					? "Keyword updated"
					: kind === "alias"
						? "Alias updated"
						: "Version updated",
				{ exact: true },
			),
		).toBeVisible();
		expect(
			requests.some(
				(request) =>
					request.method === "PUT" &&
					(request.body as { imageDescription?: string })?.imageDescription ===
						"Watercolor portrait. Silver hair, green cloak.",
			),
		).toBe(true);
	});
}
