import { Cpu, Settings2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { AiSettingsPanel } from "@/components/settings/ai-settings";
import { CategoryVfxPanel } from "@/components/settings/category-vfx";
import { Forbidden, PageHeader } from "@/components/ui/page";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { useSearchState } from "@/lib/use-search-state";
import { ConfigsPanel } from "@/pages/configs";

type Tab = {
	id: "configs" | "ai" | "categories";
	label: string;
	icon: ReactNode;
	permission: string;
};

const TABS: Tab[] = [
	{
		id: "configs",
		label: "Configs",
		icon: <Settings2 size={16} strokeWidth={1.75} aria-hidden />,
		permission: PERMISSIONS.configs.list,
	},
	{
		id: "ai",
		label: "AI",
		icon: <Cpu size={16} strokeWidth={1.75} aria-hidden />,
		permission: PERMISSIONS.aiPricing.list,
	},
	{
		id: "categories",
		label: "Categories",
		icon: <Sparkles size={16} strokeWidth={1.75} aria-hidden />,
		permission: PERMISSIONS.keywords.categories,
	},
];

/** Settings: every config, and the AI settings (cloud switch, models, feature prices). */
export function SettingsPage() {
	const { can } = useAuth();
	const { values, set } = useSearchState(["tab"] as const);
	const tabs = TABS.filter((tab) => can(tab.permission));
	const current = tabs.find((tab) => tab.id === values.tab) ?? tabs[0];
	if (!current) return <Forbidden />;

	return (
		<>
			<PageHeader
				title="Settings"
				description="Category effects, runtime configs, and Story Lens Cloud AI: models, costs and lens prices."
			/>
			<div
				role="tablist"
				aria-label="Settings sections"
				className="mb-4 flex gap-1 border-b border-line"
			>
				{tabs.map((tab) => {
					const selected = tab.id === current.id;
					return (
						<button
							key={tab.id}
							type="button"
							role="tab"
							id={`settings-tab-${tab.id}`}
							aria-selected={selected}
							aria-controls="settings-panel"
							className={`-mb-px inline-flex min-h-10 items-center gap-2 border-b-2 px-4 text-sm font-medium ${
								selected
									? "border-accent text-accent"
									: "border-transparent text-muted hover:text-ink"
							}`}
							onClick={() => set({ tab: tab.id })}
						>
							{tab.icon}
							<span>{tab.label}</span>
						</button>
					);
				})}
			</div>
			<div
				role="tabpanel"
				id="settings-panel"
				aria-labelledby={`settings-tab-${current.id}`}
			>
				{current.id === "categories" ? (
					<CategoryVfxPanel />
				) : current.id === "configs" ? (
					<ConfigsPanel />
				) : (
					<AiSettingsPanel />
				)}
			</div>
		</>
	);
}
