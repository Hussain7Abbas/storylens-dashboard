// Permission keys of the dashboard API (`METHOD /api/admin/...`), as the
// backend syncs them from its routes. The API enforces them; the dashboard
// uses them only to hide pages and actions a role cannot use.
export const PERMISSIONS = {
	overview: "GET /api/admin/stats/",
	users: {
		list: "GET /api/admin/users/",
		view: "GET /api/admin/users/:id",
		create: "POST /api/admin/users/",
		update: "PUT /api/admin/users/:id",
		delete: "DELETE /api/admin/users/:id",
		signOut: "DELETE /api/admin/users/:id/sessions",
	},
	roles: {
		list: "GET /api/admin/roles/",
		view: "GET /api/admin/roles/:id",
		create: "POST /api/admin/roles/",
		update: "PUT /api/admin/roles/:id",
		delete: "DELETE /api/admin/roles/:id",
		permissions: "GET /api/admin/permissions/",
	},
	novels: {
		list: "GET /api/admin/novels/",
		view: "GET /api/admin/novels/:id",
		keywords: "GET /api/admin/novels/:id/keywords",
		chapters: "GET /api/admin/novels/:id/chapters",
		chapter: "GET /api/admin/novels/:id/chapters/:chapterId",
		create: "POST /api/admin/novels/",
		update: "PUT /api/admin/novels/:id",
		delete: "DELETE /api/admin/novels/:id",
		upload: "POST /api/admin/files/upload",
	},
	keywords: {
		list: "GET /api/admin/keywords/",
		create: "POST /api/admin/keywords/",
		update: "PUT /api/admin/keywords/:id",
		delete: "DELETE /api/admin/keywords/:id",
		link: "POST /api/admin/keywords/:id/link",
		alias: "POST /api/admin/keywords/:id/alias",
		version: "POST /api/admin/keywords/:id/version",
		categories: "GET /api/admin/keyword-categories/",
		updateCategory: "PUT /api/admin/keyword-categories/:id",
		natures: "GET /api/admin/keyword-natures/",
	},
	aliases: {
		create: "POST /api/admin/keyword-aliases/",
		update: "PUT /api/admin/keyword-aliases/:id",
		delete: "DELETE /api/admin/keyword-aliases/:id",
	},
	versions: {
		create: "POST /api/admin/keyword-versions/",
		update: "PUT /api/admin/keyword-versions/:id",
		delete: "DELETE /api/admin/keyword-versions/:id",
	},
	billing: {
		requests: "GET /api/admin/billing/requests",
		approve: "POST /api/admin/billing/requests/:id/approve",
		reject: "POST /api/admin/billing/requests/:id/reject",
		summary: "GET /api/admin/billing/summary",
	},
	lenses: {
		history: "GET /api/admin/users/:id/lenses",
		gift: "POST /api/admin/users/:id/lenses/gifts",
		adjust: "POST /api/admin/users/:id/lenses/adjustments",
	},
	aiPricing: {
		list: "GET /api/admin/ai-pricing/",
		update: "PUT /api/admin/ai-pricing/:key",
	},
	aiModels: {
		list: "GET /api/admin/ai-models/",
	},
	configs: {
		list: "GET /api/admin/configs/",
		save: "PUT /api/admin/configs/",
		delete: "DELETE /api/admin/configs/:key",
	},
	account: {
		update: "PUT /api/admin/auth/me",
		password: "PUT /api/admin/auth/password",
	},
} as const;

/** Role slug that always holds every admin permission. */
export const SUPER_ADMIN_ROLE = "super-admin";
