import {
	BookOpen,
	Languages,
	LayoutDashboard,
	LogOut,
	Menu,
	Monitor,
	Moon,
	ReceiptText,
	Settings2,
	ShieldCheck,
	Sun,
	UserRound,
	Users,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { useGetBillingRequests } from "@/api/generated/endpoints/admin-billing";
import { useAuth, useCurrentUser } from "@/lib/auth";
import { initials } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { type ThemePreference, useTheme } from "@/lib/theme";

type NavItem = {
	to: string;
	label: string;
	icon: ReactNode;
	/** Shown when the role holds any of these. */
	permissions: string[];
};

const ICON = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;

const NAV: NavItem[] = [
	{
		to: "/",
		label: "Overview",
		icon: <LayoutDashboard {...ICON} />,
		permissions: [PERMISSIONS.overview],
	},
	{
		to: "/users",
		label: "Users",
		icon: <Users {...ICON} />,
		permissions: [PERMISSIONS.users.list],
	},
	{
		to: "/roles",
		label: "Roles",
		icon: <ShieldCheck {...ICON} />,
		permissions: [PERMISSIONS.roles.list],
	},
	{
		to: "/novels",
		label: "Novels",
		icon: <BookOpen {...ICON} />,
		permissions: [PERMISSIONS.novels.list],
	},
	{
		to: "/translations",
		label: "Match translations",
		icon: <Languages {...ICON} />,
		permissions: [PERMISSIONS.keywords.list],
	},
	{
		to: "/billing-requests",
		label: "Billing requests",
		icon: <ReceiptText {...ICON} />,
		permissions: [PERMISSIONS.billing.requests],
	},
	{
		to: "/settings",
		label: "Settings",
		icon: <Settings2 {...ICON} />,
		permissions: [
			PERMISSIONS.configs.list,
			PERMISSIONS.aiPricing.list,
			PERMISSIONS.aiPrompts.read,
			PERMISSIONS.keywords.categories,
			PERMISSIONS.keywords.natures,
		],
	},
];

const THEMES: { value: ThemePreference; label: string; icon: ReactNode }[] = [
	{
		value: "system",
		label: "System theme",
		icon: <Monitor size={16} strokeWidth={1.75} aria-hidden />,
	},
	{
		value: "light",
		label: "Light theme",
		icon: <Sun size={16} strokeWidth={1.75} aria-hidden />,
	},
	{
		value: "dark",
		label: "Dark theme",
		icon: <Moon size={16} strokeWidth={1.75} aria-hidden />,
	},
];

function Brand() {
	return (
		<div className="flex items-center gap-3 px-2">
			<img
				src="/logo.png"
				alt=""
				width={36}
				height={36}
				className="size-9 rounded-lg"
			/>
			<div className="leading-tight">
				<p className="font-semibold">Story Lens</p>
				<p className="text-xs text-muted">Dashboard</p>
			</div>
		</div>
	);
}

function ThemeSwitch() {
	const { preference, choose } = useTheme();
	return (
		<fieldset className="flex rounded-[var(--control-radius)] bg-wash p-1">
			<legend className="sr-only">Color theme</legend>
			{THEMES.map((theme) => (
				<label
					key={theme.value}
					title={theme.label}
					className={`grid h-8 flex-1 place-items-center rounded-lg transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)] ${
						preference === theme.value
							? "bg-surface text-accent shadow-[var(--shadow-sm)]"
							: "text-muted hover:text-ink"
					}`}
				>
					<input
						type="radio"
						name="theme"
						value={theme.value}
						checked={preference === theme.value}
						onChange={() => choose(theme.value)}
						className="sr-only"
						aria-label={theme.label}
					/>
					{theme.icon}
				</label>
			))}
		</fieldset>
	);
}

/** Pending lens requests, refreshed every minute, for the sidebar badge. */
function usePendingRequests(enabled: boolean): number {
	const { data } = useGetBillingRequests(
		{ status: "PENDING", pageSize: 1 },
		{ query: { enabled, refetchInterval: 60_000 } },
	);
	return data?.counts.PENDING ?? 0;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
	const { can, signOut } = useAuth();
	const user = useCurrentUser();
	const items = NAV.filter((item) => item.permissions.some((key) => can(key)));
	const pending = usePendingRequests(can(PERMISSIONS.billing.requests));

	return (
		<div className="flex h-full flex-col gap-6 px-4 py-5">
			<Brand />
			<nav aria-label="Main" className="flex-1">
				<ul className="space-y-1">
					{items.map((item) => (
						<li key={item.to}>
							<NavLink
								to={item.to}
								end={item.to === "/"}
								onClick={onNavigate}
								className={({ isActive }) =>
									`flex min-h-10 items-center gap-3 rounded-[var(--control-radius)] px-3 text-sm font-medium transition-colors ${
										isActive
											? "bg-accent-soft text-accent"
											: "text-muted hover:bg-wash hover:text-ink"
									}`
								}
							>
								{item.icon}
								<span className="flex-1">{item.label}</span>
								{item.to === "/billing-requests" && pending > 0 && (
									<span className="badge badge-accent tabular-nums">
										<span className="sr-only">Pending: </span>
										<span>{pending}</span>
									</span>
								)}
							</NavLink>
						</li>
					))}
				</ul>
			</nav>
			<div className="space-y-3">
				<ThemeSwitch />
				<div className="flex items-center gap-3 rounded-[var(--control-radius)] border border-line p-2">
					<span
						aria-hidden
						className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-on-accent"
					>
						{initials(user.name)}
					</span>
					<div className="min-w-0 flex-1 leading-tight">
						<p className="truncate text-sm font-semibold">{user.name}</p>
						<p className="truncate text-xs text-muted">
							{user.role?.name ?? "No role"}
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					<NavLink
						to="/account"
						onClick={onNavigate}
						className={({ isActive }) =>
							`btn flex-1 ${isActive ? "btn-secondary border-accent text-accent" : "btn-secondary"}`
						}
					>
						<UserRound size={16} strokeWidth={1.75} aria-hidden />
						Account
					</NavLink>
					<button
						type="button"
						className="btn btn-ghost btn-icon"
						onClick={() => void signOut()}
						aria-label="Sign out"
						title="Sign out"
					>
						<LogOut size={16} strokeWidth={1.75} aria-hidden />
					</button>
				</div>
			</div>
		</div>
	);
}

export function AppShell() {
	const [menuOpen, setMenuOpen] = useState(false);

	// Links close the mobile drawer through `onNavigate`; Escape closes it too.
	useEffect(() => {
		if (!menuOpen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMenuOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [menuOpen]);

	return (
		<div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
			>
				Skip to content
			</a>

			<aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">
				<Sidebar />
			</aside>

			<header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-2 backdrop-blur lg:hidden">
				<Brand />
				<button
					type="button"
					className="btn btn-ghost btn-icon"
					aria-label="Open menu"
					aria-expanded={menuOpen}
					aria-controls="mobile-menu"
					onClick={() => setMenuOpen(true)}
				>
					<Menu size={20} strokeWidth={1.75} aria-hidden />
				</button>
			</header>

			{menuOpen && (
				<div className="fixed inset-0 z-40 lg:hidden">
					<button
						type="button"
						aria-label="Close menu"
						className="absolute inset-0 bg-black/45"
						onClick={() => setMenuOpen(false)}
					/>
					<div
						id="mobile-menu"
						role="dialog"
						aria-modal="true"
						aria-label="Menu"
						className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-[var(--shadow)]"
					>
						<button
							type="button"
							className="btn btn-ghost btn-icon absolute top-4 right-3"
							aria-label="Close menu"
							onClick={() => setMenuOpen(false)}
						>
							<X size={18} strokeWidth={1.75} aria-hidden />
						</button>
						<Sidebar onNavigate={() => setMenuOpen(false)} />
					</div>
				</div>
			)}

			<main id="main" className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
				<div className="mx-auto max-w-6xl">
					<Outlet />
				</div>
			</main>
		</div>
	);
}
