import type { Page, Route } from "@playwright/test";

// Minimal mocked dashboard API. Paths match `/api/admin/...` on any origin.
export const ALL_PERMISSIONS = [
	"GET /api/admin/stats/",
	"GET /api/admin/users/",
	"GET /api/admin/users/:id",
	"POST /api/admin/users/",
	"PUT /api/admin/users/:id",
	"DELETE /api/admin/users/:id",
	"DELETE /api/admin/users/:id/sessions",
	"GET /api/admin/roles/",
	"GET /api/admin/roles/:id",
	"POST /api/admin/roles/",
	"PUT /api/admin/roles/:id",
	"DELETE /api/admin/roles/:id",
	"GET /api/admin/permissions/",
	"GET /api/admin/novels/",
	"GET /api/admin/novels/:id",
	"GET /api/admin/novels/:id/keywords",
	"POST /api/admin/novels/",
	"PUT /api/admin/novels/:id",
	"DELETE /api/admin/novels/:id",
	"POST /api/admin/files/upload",
	"GET /api/admin/keywords/",
	"POST /api/admin/keywords/",
	"PUT /api/admin/keywords/:id",
	"POST /api/admin/keywords/:id/link",
	"POST /api/admin/keywords/:id/alias",
	"POST /api/admin/keywords/:id/version",
	"DELETE /api/admin/keywords/:id",
	"GET /api/admin/keyword-categories/",
	"GET /api/admin/keyword-natures/",
	"POST /api/admin/keyword-aliases/",
	"PUT /api/admin/keyword-aliases/:id",
	"DELETE /api/admin/keyword-aliases/:id",
	"POST /api/admin/keyword-versions/",
	"PUT /api/admin/keyword-versions/:id",
	"DELETE /api/admin/keyword-versions/:id",
	"GET /api/admin/configs/",
	"PUT /api/admin/configs/",
	"DELETE /api/admin/configs/:key",
	"PUT /api/admin/auth/me",
	"PUT /api/admin/auth/password",
	"GET /api/admin/billing/requests",
	"POST /api/admin/billing/requests/:id/approve",
	"POST /api/admin/billing/requests/:id/reject",
	"GET /api/admin/billing/summary",
	"GET /api/admin/users/:id/lenses",
	"POST /api/admin/users/:id/lenses/gifts",
	"POST /api/admin/users/:id/lenses/adjustments",
	"GET /api/admin/ai-pricing/",
	"PUT /api/admin/ai-pricing/:key",
	"GET /api/admin/ai-models/",
];

const now = "2026-09-28T12:00:00.000Z";

export function adminUser(permissions = ALL_PERMISSIONS) {
	return {
		id: "admin-id",
		email: "admin@storylens.local",
		username: "admin",
		name: "Super Admin",
		isGuest: false,
		isUser: false,
		isAdmin: true,
		portal: "admin",
		role: { id: "role-super", slug: "super-admin", name: "Super Admin" },
		permissions,
	};
}

export const roles = [
	{
		id: "role-guest",
		slug: "guest",
		name: "Guest",
		description: "Limited reader access.",
		portal: "user",
		isSystem: true,
		createdAt: now,
		updatedAt: now,
		userCount: 0,
		permissionIds: [],
	},
	{
		id: "role-super",
		slug: "super-admin",
		name: "Super Admin",
		description: "Full dashboard access.",
		portal: "admin",
		isSystem: true,
		createdAt: now,
		updatedAt: now,
		userCount: 1,
		permissionIds: ["p-admin-1"],
	},
	{
		id: "role-reader",
		slug: "reader",
		name: "Reader",
		description: "Registered reader.",
		portal: "user",
		isSystem: true,
		createdAt: now,
		updatedAt: now,
		userCount: 3,
		permissionIds: ["p-user-1"],
	},
];

export const permissions = {
	admin: [
		{
			id: "p-admin-1",
			key: "GET /api/admin/users/",
			portal: "admin",
			group: "users",
			method: "GET",
			path: "/api/admin/users/",
			description: "List users",
		},
	],
	user: [
		{
			id: "p-user-1",
			key: "GET /api/user/novels/",
			portal: "user",
			group: "novels",
			method: "GET",
			path: "/api/user/novels/",
			description: "List novels",
		},
		{
			id: "p-user-2",
			key: "POST /api/user/novels/",
			portal: "user",
			group: "novels",
			method: "POST",
			path: "/api/user/novels/",
			description: "Add a novel",
		},
		{
			id: "p-user-3",
			key: "user:moderate",
			portal: "user",
			group: "moderation",
			method: null,
			path: null,
			description: "Moderate shared data",
		},
	],
};

const json = (route: Route, body: unknown, status = 200) =>
	route.fulfill({
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	});

const NOVEL_ID = "11111111-1111-4111-8111-111111111111";
export const KEYWORD_IDS = {
	mira: "22222222-2222-4222-8222-222222222222",
	lanternAr: "33333333-3333-4333-8333-333333333333",
	lanternEn: "44444444-4444-4444-8444-444444444444",
};

export const novels = [
	{
		id: NOVEL_ID,
		nameAr: "أرشيف الفانوس",
		nameEn: "The Lantern Archive",
		descriptionAr: null,
		descriptionEn: null,
		context: null,
		slugs: ["lantern-archive"],
		imageId: null,
		image: null,
		createdById: null,
		createdBy: null,
		createdAt: now,
		updatedAt: now,
		counts: { chapters: 0, keywords: 3, replacements: 0 },
	},
];

export const keywords = [
	{
		id: KEYWORD_IDS.mira,
		novelId: NOVEL_ID,
		nameAr: "ميرا",
		nameEn: null,
		description: "حارسة الأرشيف",
		aliases: [],
	},
	{
		id: KEYWORD_IDS.lanternAr,
		novelId: NOVEL_ID,
		nameAr: "الفانوس",
		nameEn: null,
		description: null,
		aliases: [],
	},
	{
		id: KEYWORD_IDS.lanternEn,
		novelId: NOVEL_ID,
		nameAr: null,
		nameEn: "The Lantern",
		description: "A glowing relic",
		aliases: [],
	},
];

const style = (id: string, nameEn: string, color: string) => ({
	id,
	nameEn,
	nameAr: null,
	color,
	description: null,
	createdAt: now,
	updatedAt: now,
});

export const categories = [style("cat-person", "Person", "#6554c0")];
export const natures = [style("nat-ally", "Ally", "#26705e")];

function version(
	id: string,
	keywordId: string,
	startingChapter: number,
	endingChapter: number | null,
	extra: Partial<{
		description: string;
		category: ReturnType<typeof style>;
		nature: ReturnType<typeof style>;
		image: { id: string; url: string };
	}> = {},
) {
	return {
		id,
		keywordId,
		startingChapter,
		endingChapter,
		description: extra.description ?? null,
		categoryId: extra.category?.id ?? null,
		category: extra.category ?? null,
		natureId: extra.nature?.id ?? null,
		nature: extra.nature ?? null,
		imageId: extra.image?.id ?? null,
		image: extra.image
			? {
					...extra.image,
					type: "Image",
					provider_image_id: extra.image.id,
					delete_url: "",
					userId: null,
					createdAt: now,
					updatedAt: now,
				}
			: null,
		createdById: null,
		createdAt: now,
		updatedAt: now,
	};
}

/** The novel profile's keywords: one named in both languages with a later version and an alias. */
/** One alias shape, so every keyword's `aliases` share it and tests can add one. */
const miraVale = {
	id: "alias-mira-vale",
	keywordId: KEYWORD_IDS.mira,
	nameAr: null as string | null,
	nameEn: "Mira Vale" as string | null,
	description: null as string | null,
	matchingType: "FULL",
	fuzzyMatchArabicCharacters: true,
	overrideStyle: false,
	categoryId: null as string | null,
	category: null as (typeof categories)[number] | null,
	natureId: null as string | null,
	nature: null as (typeof natures)[number] | null,
	imageId: null as string | null,
	image: null as { id: string; url: string } | null,
	createdById: null as string | null,
	createdAt: now,
	updatedAt: now,
};

export type FixtureAlias = typeof miraVale;

export const keywordDetails = [
	{
		id: KEYWORD_IDS.mira,
		novelId: NOVEL_ID,
		nameAr: "ميرا",
		nameEn: "Mira",
		matchingType: "FULL",
		fuzzyMatchArabicCharacters: true,
		createdById: "admin-id",
		createdBy: { id: "admin-id", username: "admin" },
		createdAt: now,
		updatedAt: now,
		versions: [
			version("v-mira-0", KEYWORD_IDS.mira, 0, 49, {
				description: "حارسة الأرشيف",
				category: categories[0],
				nature: natures[0],
				image: {
					id: "img-mira",
					url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
				},
			}),
			version("v-mira-50", KEYWORD_IDS.mira, 50, null, {
				description: "The archive's new keeper",
			}),
		],
		aliases: [miraVale],
	},
	{
		id: KEYWORD_IDS.lanternAr,
		novelId: NOVEL_ID,
		nameAr: "الفانوس",
		nameEn: null,
		matchingType: "PARTIAL",
		// Saved with alif variants off, to check edits keep it.
		fuzzyMatchArabicCharacters: false,
		createdById: null,
		createdBy: null,
		createdAt: now,
		updatedAt: now,
		versions: [version("v-lantern-ar", KEYWORD_IDS.lanternAr, 0, null)],
		aliases: [] as FixtureAlias[],
	},
	{
		id: KEYWORD_IDS.lanternEn,
		novelId: NOVEL_ID,
		nameAr: null,
		nameEn: "The Lantern",
		matchingType: "FULL",
		fuzzyMatchArabicCharacters: true,
		createdById: null,
		createdBy: null,
		createdAt: now,
		updatedAt: now,
		versions: [
			version("v-lantern-en", KEYWORD_IDS.lanternEn, 0, null, {
				description: "A glowing relic",
			}),
		],
		aliases: [] as FixtureAlias[],
	},
];

/** Mocks the paired desktop client on 127.0.0.1 with a fixed AI answer. */
export async function mockDesktopClient(page: Page) {
	const prompts: string[] = [];
	await page.addInitScript(() =>
		localStorage.setItem(
			"storylens-dashboard-desktop-client",
			JSON.stringify({ port: 47000, token: "pair", model: "m", effort: "low" }),
		),
	);
	await page.route("http://127.0.0.1:47000/**", async (route) => {
		const body = route.request().postDataJSON() as {
			prompt: string;
			responseLanguage: string;
		};
		prompts.push(body.prompt);
		const answer =
			body.responseLanguage === "en"
				? [
						{ id: KEYWORD_IDS.mira, translation: "Mira", matchId: null },
						{
							id: KEYWORD_IDS.lanternAr,
							translation: "Lantern",
							matchId: KEYWORD_IDS.lanternEn,
						},
					]
				: [
						{
							id: KEYWORD_IDS.lanternEn,
							translation: "الفانوس",
							matchId: null,
						},
					];
		return json(route, { output: JSON.stringify(answer) });
	});
	return prompts;
}

const reader = {
	id: "reader-id",
	email: "mira@example.com",
	username: "mira",
	name: "Mira Vale",
	lensBalance: 42,
	isGuest: false,
};

/** Lens requests: Mira asked twice (the second after changing her email), Rowan once. */
export function billingRequests() {
	const base = {
		unitPriceUsd: "0.010000",
		note: null as string | null,
		locale: "en",
		rejectionReason: null as string | null,
		reviewedAt: null as string | null,
		cancelledAt: null as string | null,
		reviewedBy: null as { id: string; name: string; email: string } | null,
		createdAt: now,
	};
	return [
		{
			...base,
			id: "req-whatsapp",
			lenses: 500,
			totalUsd: "5.00",
			status: "PENDING",
			contactChannel: "WHATSAPP",
			contactHandle: "+9647701234567",
			note: "Paid by Zain Cash, ref 42",
			userEmail: "mira.old@example.com",
			user: reader,
		},
		{
			...base,
			id: "req-telegram",
			lenses: 1000,
			totalUsd: "10.00",
			status: "PENDING",
			contactChannel: "TELEGRAM",
			contactHandle: "@rowan_reads",
			userEmail: "rowan@example.com",
			user: {
				...reader,
				id: "rowan-id",
				email: "rowan@example.com",
				username: "rowan",
				name: "Rowan",
				lensBalance: 0,
			},
		},
		{
			...base,
			id: "req-done",
			lenses: 100,
			totalUsd: "1.00",
			status: "REJECTED",
			contactChannel: "WHATSAPP",
			contactHandle: "+447700900123",
			rejectionReason: "Payment not received",
			reviewedAt: now,
			reviewedBy: {
				id: "admin-id",
				name: "Super Admin",
				email: "admin@storylens.local",
			},
			userEmail: "mira@example.com",
			user: reader,
		},
	];
}

export const aiPricing = [
	{
		key: "page_summary",
		nameEn: "Summarize page",
		nameAr: "تلخيص الصفحة",
		descriptionEn: null,
		descriptionAr: null,
		lenses: 2,
		enabled: true,
		maxPromptChars: 64000,
		maxOutputTokens: 1200,
		sortOrder: 10,
		updatedById: null,
		createdAt: now,
		updatedAt: now,
	},
	{
		key: "character_image",
		nameEn: "Character image",
		nameAr: "صورة الشخصية",
		descriptionEn: null,
		descriptionAr: null,
		lenses: 3,
		enabled: true,
		maxPromptChars: 24000,
		maxOutputTokens: 400,
		sortOrder: 40,
		updatedById: null,
		createdAt: now,
		updatedAt: now,
	},
];

const textModel = (
	id: string,
	name: string,
	prompt: number,
	completion: number,
) => ({
	id,
	name,
	contextLength: 1_000_000,
	promptPerMillionUsd: prompt,
	completionPerMillionUsd: completion,
	requestUsd: 0,
	webSearchUsd: null,
	imageUsd: null,
	imageTokens: null,
	free: prompt === 0 && completion === 0,
});
const imageModel = (
	id: string,
	name: string,
	imageUsd: number,
	imageTokens: number,
) => ({
	id,
	name,
	contextLength: null,
	promptPerMillionUsd: 0,
	completionPerMillionUsd: 0,
	requestUsd: 0,
	webSearchUsd: null,
	imageUsd,
	imageTokens,
	free: false,
});

/** OpenRouter's model list as `GET /api/admin/ai-models/` returns it. */
export const aiModels = {
	text: [
		textModel("deepseek/deepseek-v4-flash", "DeepSeek: V4 Flash", 0.042, 0.084),
		textModel("google/gemini-2.5-flash", "Google: Gemini 2.5 Flash", 0.3, 2.5),
		textModel("openai/gpt-5-pro", "OpenAI: GPT-5 Pro", 15, 120),
	],
	image: [
		imageModel(
			"bytedance-seed/seedream-5-0-flash",
			"ByteDance Seed: Seedream 5.0 Flash",
			0.018,
			4175,
		),
		imageModel(
			"google/gemini-3-pro-image",
			"Google: Gemini 3 Pro Image",
			0.1548,
			1290,
		),
	],
	fetchedAt: now,
};

export const billingSummary = {
	days: 30,
	lensPriceUsd: "0.010000",
	requests: {
		counts: { PENDING: 2, APPROVED: 5, REJECTED: 1, CANCELLED: 0 },
		pendingLenses: 1500,
		pendingUsd: "15.00",
		approvedCount: 5,
		approvedLenses: 2600,
		approvedUsd: "26.00",
		approvedLensesAllTime: 2600,
		approvedUsdAllTime: "26.00",
	},
	lenses: {
		trial: 120,
		gifts: 50,
		purchases: 2600,
		adjustments: -1,
		spent: 845,
	},
	ai: {
		calls: 410,
		costUsd: "3.120000",
		costWithFeeUsd: "3.291600",
		dataPolicy: { deny: 410, allow: 0 },
		features: [
			{
				feature: "page_summary",
				actions: 300,
				failures: 4,
				refunds: 4,
				costUsd: "1.200000",
				averageCostUsd: "0.004220",
				lensesCharged: 592,
				valueUsd: "5.920000",
			},
			{
				feature: "character_image",
				actions: 8,
				failures: 0,
				refunds: 0,
				costUsd: "0.160000",
				averageCostUsd: "0.021100",
				lensesCharged: 24,
				valueUsd: "0.240000",
			},
		],
	},
};

/** Mocks the dashboard API; `signedIn` seeds a stored session token. */
export async function mockApi(
	page: Page,
	options: {
		signedIn?: boolean;
		permissions?: string[];
		keywords?: typeof keywords;
		profileKeywords?: typeof keywordDetails;
		/** Approvals answer 409: another admin handled the request first. */
		approveConflict?: boolean;
	} = {},
) {
	const requestRows = billingRequests();
	const configRows = [
		["Lens_Price_USD", "0.01"],
		["Lens_Trial_Gift", "10"],
		["AI_Cloud_Enabled", "true"],
		["AI_Text_Model", "google/gemini-2.5-flash"],
		["AI_Image_Model", "bytedance-seed/seedream-5-0-flash"],
	].map(([key, value]) => ({
		id: `config-${key}`,
		key,
		value,
		createdAt: now,
		updatedAt: now,
	}));
	const configValue = (key: string) =>
		configRows.find((row) => row.key === key)?.value ?? "";
	const user = adminUser(options.permissions);
	const keywordList = options.keywords ?? keywords;
	const requests: { method: string; path: string; body: unknown }[] = [];

	if (options.signedIn) {
		await page.addInitScript(() =>
			localStorage.setItem("storylens-dashboard-token", "test-token"),
		);
	}

	await page.route("**/api/admin/**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname;
		const method = request.method();
		requests.push({ method, path, body: request.postDataJSON?.() ?? null });

		if (path === "/api/admin/auth/login") {
			const body = request.postDataJSON() as { password?: string };
			return body.password === "correct-password"
				? json(route, { user, token: "test-token" })
				: json(route, { message: "Invalid email or password" }, 401);
		}
		if (path === "/api/admin/auth/me") return json(route, user);
		if (path === "/api/admin/billing/requests" && method === "GET") {
			const status = url.searchParams.get("status");
			const search = (url.searchParams.get("search") ?? "").toLowerCase();
			const data = requestRows.filter(
				(row) =>
					(!status || row.status === status) &&
					(!search ||
						[row.userEmail, row.contactHandle, row.user.email, row.user.name]
							.join(" ")
							.toLowerCase()
							.includes(search)),
			);
			const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 };
			for (const row of requestRows)
				counts[row.status as keyof typeof counts]++;
			return json(route, { data, total: data.length, counts });
		}
		const billingAction = path.match(
			/^\/api\/admin\/billing\/requests\/([^/]+)\/(approve|reject)$/,
		);
		if (billingAction && method === "POST") {
			const row = requestRows.find((item) => item.id === billingAction[1]);
			if (!row) return json(route, { message: "Request not found" }, 404);
			if (options.approveConflict && billingAction[2] === "approve") {
				return json(
					route,
					{
						message: "This request is already approved by Another Admin",
						code: "REQUEST_NOT_PENDING",
						status: "APPROVED",
					},
					409,
				);
			}
			const reviewedBy = {
				id: "admin-id",
				name: "Super Admin",
				email: user.email,
			};
			if (billingAction[2] === "approve") {
				Object.assign(row, { status: "APPROVED", reviewedAt: now, reviewedBy });
				return json(route, {
					request: row,
					transaction: {
						id: "tx-1",
						delta: row.lenses,
						balanceAfter: row.user.lensBalance + row.lenses,
					},
				});
			}
			const body = request.postDataJSON() as { reason: string };
			Object.assign(row, {
				status: "REJECTED",
				rejectionReason: body.reason,
				reviewedAt: now,
				reviewedBy,
			});
			return json(route, { request: row });
		}
		if (path === "/api/admin/billing/summary")
			return json(route, billingSummary);
		if (path === "/api/admin/ai-pricing/")
			return json(route, { data: aiPricing });
		if (path === "/api/admin/ai-models/") {
			return json(route, {
				...aiModels,
				selected: {
					text: configValue("AI_Text_Model"),
					image: configValue("AI_Image_Model"),
				},
			});
		}
		if (path.startsWith("/api/admin/ai-pricing/") && method === "PUT") {
			const key = path.split("/").at(-1);
			const feature = aiPricing.find((item) => item.key === key);
			return json(route, { ...feature, ...(request.postDataJSON() as object) });
		}
		const lensRoute = path.match(
			/^\/api\/admin\/users\/([^/]+)\/lenses(?:\/(gifts|adjustments))?$/,
		);
		if (lensRoute) {
			if (method === "GET") {
				return json(route, {
					balance: 42,
					data: [
						{
							id: "tx-gift",
							type: "ADMIN_GIFT",
							delta: 50,
							balanceAfter: 52,
							feature: null,
							note: "Thanks for testing",
							billingRequestId: null,
							createdBy: {
								id: "admin-id",
								name: "Super Admin",
								email: user.email,
							},
							createdAt: now,
						},
						{
							id: "tx-ai",
							type: "AI_CHARGE",
							delta: -10,
							balanceAfter: 42,
							feature: "page_summary",
							note: null,
							billingRequestId: null,
							createdBy: null,
							createdAt: now,
						},
					],
					page: 1,
					pageSize: 20,
					total: 2,
				});
			}
			const body = request.postDataJSON() as {
				lenses?: number;
				delta?: number;
			};
			const change = body.lenses ?? body.delta ?? 0;
			return json(route, {
				transaction: { id: "tx-new", delta: change, balanceAfter: 42 + change },
				balance: 42 + change,
			});
		}
		if (path === "/api/admin/auth/logout")
			return json(route, { success: true });
		if (path === "/api/admin/stats/") {
			return json(route, {
				users: { readers: 1280, guests: 342, dashboard: 2, newThisWeek: 57 },
				content: { novels: 14, keywords: 2310, replacements: 188 },
				roles: 4,
				configs: 1,
				recentUsers: [
					{
						id: "u1",
						username: "QuietOwl",
						email: "q@guest.storylens.local",
						isUser: true,
						isAdmin: false,
						isGuest: true,
						createdAt: now,
					},
				],
				recentNovels: [
					{
						id: "n1",
						nameAr: null,
						nameEn: "The Lantern Archive",
						createdAt: now,
					},
				],
			});
		}
		if (path === "/api/admin/users/" && method === "GET") {
			return json(route, {
				data: [
					{
						id: "admin-id",
						email: user.email,
						emailVerified: true,
						username: "admin",
						name: "Super Admin",
						image: null,
						isGuest: false,
						isUser: false,
						lensBalance: 0,
						userRoleId: null,
						userRole: null,
						isAdmin: true,
						adminRoleId: "role-super",
						adminRole: {
							id: "role-super",
							slug: "super-admin",
							name: "Super Admin",
						},
						createdAt: now,
						updatedAt: now,
					},
					{
						id: "reader-id",
						email: "mira@example.com",
						emailVerified: true,
						username: "mira",
						name: "Mira Vale",
						image: null,
						isGuest: false,
						isUser: true,
						lensBalance: 42,
						userRoleId: "role-reader",
						userRole: { id: "role-reader", slug: "reader", name: "Reader" },
						isAdmin: false,
						adminRoleId: null,
						adminRole: null,
						createdAt: now,
						updatedAt: now,
					},
				],
				total: 2,
			});
		}
		if (path === "/api/admin/users/" && method === "POST") {
			const body = request.postDataJSON() as Record<string, string>;
			return json(route, {
				...body,
				id: "new-id",
				emailVerified: true,
				image: null,
				isGuest: false,
				userRole: null,
				adminRole: null,
				createdAt: now,
				updatedAt: now,
			});
		}
		if (path.startsWith("/api/admin/users/") && method === "PUT") {
			const body = request.postDataJSON() as Record<string, unknown>;
			return json(route, {
				...body,
				id: path.split("/").at(-1),
				emailVerified: true,
				image: null,
				isGuest: false,
				userRole: null,
				adminRole: null,
				createdAt: now,
				updatedAt: now,
			});
		}
		if (path === "/api/admin/roles/") return json(route, { data: roles });
		if (path.startsWith("/api/admin/roles/") && method === "GET") {
			const role = roles.find((item) => path.endsWith(item.id));
			return role
				? json(route, role)
				: json(route, { message: "Role not found" }, 404);
		}
		if (path.startsWith("/api/admin/roles/") && method === "PUT") {
			const role = roles.find((item) => path.endsWith(item.id));
			return json(route, { ...role, ...(request.postDataJSON() as object) });
		}
		if (path === "/api/admin/permissions/") {
			const portal =
				url.searchParams.get("portal") === "user" ? "user" : "admin";
			return json(route, { data: permissions[portal] });
		}
		if (path === "/api/admin/novels/")
			return json(route, { data: novels, total: novels.length });
		if (path === `/api/admin/novels/${NOVEL_ID}/keywords`)
			return json(route, { data: options.profileKeywords ?? keywordDetails });
		if (path === `/api/admin/novels/${NOVEL_ID}`) return json(route, novels[0]);
		if (path === "/api/admin/keyword-categories/")
			return json(route, { data: categories });
		if (path === "/api/admin/keyword-natures/")
			return json(route, { data: natures });
		if (
			path.startsWith("/api/admin/keyword-aliases/") ||
			path.startsWith("/api/admin/keyword-versions/")
		) {
			return json(route, {
				id: path.split("/").at(-1) || "new-id",
				...(request.postDataJSON() as object | null),
			});
		}
		if (path === "/api/admin/keywords/" && method === "POST")
			return json(route, {
				id: "new-keyword-id",
				...(request.postDataJSON() as object),
			});
		if (path === "/api/admin/keywords/") {
			// Untranslated rows, or link candidates named only in English.
			const data =
				url.searchParams.get("has") === "en"
					? keywordList.filter((keyword) => keyword.nameEn && !keyword.nameAr)
					: keywordList;
			return json(route, { data, total: data.length });
		}
		if (path.startsWith("/api/admin/keywords/") && method !== "GET") {
			const keyword = keywordList.find((item) => path.includes(item.id));
			return json(route, { ...keyword, ...(request.postDataJSON() as object) });
		}
		if (path === "/api/admin/configs/" && method === "PUT") {
			const body = request.postDataJSON() as { key: string; value: string };
			if (
				body.key === "Lens_Price_USD" &&
				!/^\d{1,4}(\.\d{1,6})?$/.test(body.value)
			) {
				return json(
					route,
					{
						message:
							"Lens_Price_USD must be a dollar amount above 0 with up to 6 decimals, such as 0.01.",
						code: "INVALID_CONFIG_VALUE",
						key: body.key,
					},
					400,
				);
			}
			const row = configRows.find((item) => item.key === body.key);
			if (row) row.value = body.value;
			else
				configRows.push({
					id: `config-${body.key}`,
					...body,
					createdAt: now,
					updatedAt: now,
				});
			return json(route, {
				id: "config-id",
				...body,
				createdAt: now,
				updatedAt: now,
			});
		}
		if (path === "/api/admin/configs/")
			return json(route, { data: configRows });
		return json(route, { message: "Not mocked" }, 404);
	});

	return requests;
}
