import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { errorMessage } from "@/api/axios-instance";
import {
	getAiModels,
	getGetAiModelsQueryKey,
	getGetAiPricingQueryKey,
	useGetAiModels,
	useGetAiPricing,
	usePutAiPricingByKey,
} from "@/api/generated/endpoints/admin-ai-pricing";
import { useGetBillingSummary } from "@/api/generated/endpoints/admin-billing";
import {
	getGetConfigsQueryKey,
	useGetConfigs,
	usePutConfigs,
} from "@/api/generated/endpoints/admin-configs";
import type {
	GetAiPricing200DataItem,
	GetBillingSummary200AiFeaturesItem,
} from "@/api/generated/schemas";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { LensPrice } from "@/components/ui/lens-coin";
import { ErrorState, TableSkeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import {
	estimateFeature,
	type FeatureEstimate,
	formatSmallUsd,
	HEALTHY_MARGIN,
	type ImageModel,
	perMillion,
	requiredLensPrice,
	type TextModel,
} from "@/lib/ai-cost";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatLensPrice, formatUsd } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";

type Feature = GetAiPricing200DataItem;
type Stats = GetBillingSummary200AiFeaturesItem;

const DEFAULT_TEXT_MODEL = "google/gemini-2.5-flash";
const DEFAULT_IMAGE_MODEL = "bytedance-seed/seedream-5-0-flash";
/** Averages from fewer actions than this are too noisy to judge a price. */
const MIN_ACTIONS = 20;

const VERDICT: Record<
	FeatureEstimate["verdict"],
	{ badge: string; label: string }
> = {
	ok: { badge: "badge badge-success", label: "Covers the cost" },
	thin: { badge: "badge badge-warning", label: "Thin margin" },
	loss: { badge: "badge badge-danger", label: "Loses money" },
	free: { badge: "badge", label: "Free: you pay it" },
	unknown: { badge: "badge", label: "Unknown" },
};

function useConfigValues() {
	const { can } = useAuth();
	const configs = useGetConfigs({
		query: { enabled: can(PERMISSIONS.configs.list) },
	});
	const value = (key: string) =>
		configs.data?.data.find((row) => row.key === key)?.value;
	return { configs, value };
}

/** Saves one config row, refreshing configs and the model list's selection. */
function useSaveConfig(
	onSaved: (key: string) => void,
	onError: (message: string) => void,
) {
	const queryClient = useQueryClient();
	return usePutConfigs({
		mutation: {
			onSuccess: async (saved) => {
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: getGetConfigsQueryKey() }),
					queryClient.invalidateQueries({ queryKey: getGetAiModelsQueryKey() }),
				]);
				onSaved(saved.key);
			},
			onError: (cause) => onError(errorMessage(cause)),
		},
	});
}

function CloudSwitch() {
	const { can } = useAuth();
	const toast = useToast();
	const { value } = useConfigValues();
	const [error, setError] = useState("");
	const save = useSaveConfig(
		() => toast.success("Cloud AI setting saved"),
		setError,
	);
	const enabled = value("AI_Cloud_Enabled") === "true";
	return (
		<section className="card grid gap-3 p-5" aria-labelledby="cloud-heading">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 id="cloud-heading" className="text-base font-semibold">
						Story Lens Cloud AI
					</h2>
					<p className="text-sm text-muted">
						<span>
							{enabled
								? "On: readers can run AI features with lenses."
								: "Off: every cloud AI request answers that it is unavailable."}
						</span>
					</p>
				</div>
				{can(PERMISSIONS.configs.save) && (
					<Button
						variant={enabled ? "secondary" : "primary"}
						loading={save.isPending}
						onClick={() =>
							save.mutate({
								data: {
									key: "AI_Cloud_Enabled",
									value: enabled ? "false" : "true",
								},
							})
						}
					>
						{enabled ? "Turn cloud AI off" : "Turn cloud AI on"}
					</Button>
				)}
			</div>
			<p className="text-sm text-muted">
				<span>
					Lens price {formatLensPrice(value("Lens_Price_USD"))} · trial gift{" "}
					{value("Lens_Trial_Gift") ?? "—"} lenses · daily spend cap{" "}
					{value("AI_Daily_Spend_Cap_USD")
						? formatUsd(value("AI_Daily_Spend_Cap_USD"))
						: "none"}{" "}
					(change these in the Configs tab)
				</span>
			</p>
			{error && (
				<p className="field-error" role="alert">
					{error}
				</p>
			)}
		</section>
	);
}

/** A searchable native select of OpenRouter models. */
function ModelPicker<M extends TextModel | ImageModel>({
	label,
	models,
	value,
	describe,
	disabled,
	onChange,
}: {
	label: string;
	models: M[];
	value: string;
	describe: (model: M) => string;
	disabled: boolean;
	onChange: (id: string) => void;
}) {
	const [filter, setFilter] = useState("");
	const query = filter.trim().toLowerCase();
	const shown = models.filter(
		(model) =>
			model.id === value ||
			!query ||
			model.id.toLowerCase().includes(query) ||
			model.name.toLowerCase().includes(query),
	);
	const missing = value !== "" && !models.some((model) => model.id === value);
	const id = label.toLowerCase().replace(/\s+/g, "-");
	return (
		<div className="grid gap-2">
			<label htmlFor={id} className="text-sm font-medium">
				{label}
			</label>
			<input
				className="input"
				type="search"
				aria-label={`Search ${label.toLowerCase()}s`}
				placeholder={`Search ${models.length} models`}
				value={filter}
				onChange={(event) => setFilter(event.target.value)}
			/>
			<select
				id={id}
				className="input"
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}
			>
				{missing && (
					<option value={value}>{value} (not listed by OpenRouter)</option>
				)}
				{shown.map((model) => (
					<option key={model.id} value={model.id}>
						{`${model.name} — ${describe(model)}`}
					</option>
				))}
			</select>
			{missing && (
				<p className="text-sm text-danger" role="note">
					<span>OpenRouter no longer lists this model; pick another one.</span>
				</p>
			)}
		</div>
	);
}

function TextPricing({ model }: { model?: TextModel }) {
	if (!model) return null;
	return (
		<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
			<div>
				<dt className="text-muted">Input</dt>
				<dd>{perMillion(model.promptPerMillionUsd)}</dd>
			</div>
			<div>
				<dt className="text-muted">Output</dt>
				<dd>{perMillion(model.completionPerMillionUsd)}</dd>
			</div>
			<div>
				<dt className="text-muted">Context</dt>
				<dd>
					{model.contextLength
						? `${formatNumber(model.contextLength)} tokens`
						: "—"}
				</dd>
			</div>
			<div>
				<dt className="text-muted">Per request</dt>
				<dd>{model.requestUsd ? formatSmallUsd(model.requestUsd) : "—"}</dd>
			</div>
		</dl>
	);
}

function ImagePricing({ model }: { model?: ImageModel }) {
	if (!model) return null;
	return (
		<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
			<div>
				<dt className="text-muted">Per image (estimate)</dt>
				<dd>{formatSmallUsd(model.imageUsd)}</dd>
			</div>
			<div>
				<dt className="text-muted">Assumes</dt>
				<dd>
					{model.imageTokens
						? `${formatNumber(model.imageTokens)} image tokens`
						: "—"}
				</dd>
			</div>
		</dl>
	);
}

/** Estimated cost of each feature with the chosen models against what its lenses are worth. */
function CostTable({
	estimates,
	names,
	stats,
	lensPriceUsd,
}: {
	estimates: FeatureEstimate[];
	names: Record<string, string>;
	stats: Stats[];
	lensPriceUsd: number | null;
}) {
	const needed = requiredLensPrice(estimates);
	const losing = estimates.filter((estimate) => estimate.verdict === "loss");
	const increase =
		needed && lensPriceUsd
			? (needed.breakEvenUsd / lensPriceUsd - 1) * 100
			: null;
	return (
		<div className="grid gap-3">
			{losing.length > 0 && (
				<div
					role="alert"
					className="flex gap-3 rounded-[var(--control-radius)] border border-danger/40 bg-danger/10 p-3 text-sm"
				>
					<AlertTriangle
						size={18}
						strokeWidth={1.75}
						aria-hidden
						className="mt-0.5 shrink-0 text-danger"
					/>
					<div className="grid gap-1">
						<p className="font-medium">
							<span>
								These models lose money on{" "}
								{losing
									.map((estimate) => names[estimate.key] ?? estimate.key)
									.join(", ")}
								.
							</span>
						</p>
						{needed && lensPriceUsd !== null && (
							<p>
								<span>
									Raise the lens price to at least{" "}
									{formatSmallUsd(needed.breakEvenUsd)} (now{" "}
									{formatSmallUsd(lensPriceUsd)}
									{increase !== null && increase > 0
										? `, +${Math.ceil(increase)}%`
										: ""}
									), or raise those features' lenses as suggested below.
								</span>
							</p>
						)}
					</div>
				</div>
			)}
			{needed && lensPriceUsd !== null && losing.length === 0 && (
				<p className="text-sm text-muted">
					<span>
						Lens price now {formatSmallUsd(lensPriceUsd)}. Break-even needs at
						least {formatSmallUsd(needed.breakEvenUsd)}; a {HEALTHY_MARGIN}×
						margin needs {formatSmallUsd(needed.healthyUsd)}
						{lensPriceUsd < needed.healthyUsd
							? ` (+${Math.ceil((needed.healthyUsd / lensPriceUsd - 1) * 100)}%)`
							: ""}
						.
					</span>
				</p>
			)}
			<div className="relative overflow-x-auto">
				<table className="data-table data-table-stack">
					<thead>
						<tr>
							<th scope="col">Feature</th>
							<th scope="col">Lenses</th>
							<th scope="col">Worth</th>
							<th scope="col">Estimated cost</th>
							<th scope="col">Real average (30 days)</th>
							<th scope="col">Status</th>
							<th scope="col">Suggested lenses</th>
						</tr>
					</thead>
					<tbody>
						{estimates.map((estimate) => {
							const real = stats.find((row) => row.feature === estimate.key);
							const verdict = VERDICT[estimate.verdict];
							return (
								<tr key={estimate.key}>
									<td data-label="Feature" className="font-medium">
										{names[estimate.key] ?? estimate.key}
									</td>
									<td data-label="Lenses">
										<LensPrice lenses={estimate.lenses} />
									</td>
									<td data-label="Worth" className="tabular-nums">
										{formatSmallUsd(estimate.valueUsd)}
									</td>
									<td data-label="Estimated cost" className="tabular-nums">
										{formatSmallUsd(estimate.costUsd)}
									</td>
									<td
										data-label="Real average (30 days)"
										className="tabular-nums text-muted"
									>
										{real && real.actions > 0
											? `${formatSmallUsd(Number(real.averageCostUsd))} (${formatNumber(real.actions)})`
											: "—"}
									</td>
									<td data-label="Status">
										<span className={verdict.badge}>
											<span>{verdict.label}</span>
										</span>
									</td>
									<td data-label="Suggested lenses" className="tabular-nums">
										{estimate.breakEvenLenses === null
											? "—"
											: `${formatNumber(estimate.breakEvenLenses)} to break even · ${formatNumber(estimate.healthyLenses ?? 0)} for ${HEALTHY_MARGIN}×`}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<p className="text-xs text-muted">
				<span>
					Estimates use typical requests (for example 10,000 input tokens for a
					chapter) and include OpenRouter's ~5.5% fee; real averages come from
					recorded actions.
				</span>
			</p>
		</div>
	);
}

/** Picks the text and image models (configs `AI_Text_Model`, `AI_Image_Model`). */
function ModelsCard({
	features,
	stats,
}: {
	features: Feature[];
	stats: Stats[];
}) {
	const { can } = useAuth();
	const toast = useToast();
	const queryClient = useQueryClient();
	const { value } = useConfigValues();
	const models = useGetAiModels(undefined, {
		query: { staleTime: 5 * 60_000 },
	});
	const [preview, setPreview] = useState<{ text?: string; image?: string }>({});
	const [confirming, setConfirming] = useState<{
		key: string;
		model: string;
		losing: string[];
	} | null>(null);
	const [error, setError] = useState("");
	const [refreshing, setRefreshing] = useState(false);
	const save = useSaveConfig((key) => {
		toast.success(
			key === "AI_Text_Model" ? "Text model saved" : "Image model saved",
		);
		setConfirming(null);
		setPreview({});
	}, setError);

	const lensPrice = value("Lens_Price_USD");
	const lensPriceUsd =
		lensPrice && Number(lensPrice) > 0 ? Number(lensPrice) : null;
	const textId =
		preview.text ??
		models.data?.selected.text ??
		value("AI_Text_Model") ??
		DEFAULT_TEXT_MODEL;
	const imageId =
		preview.image ??
		models.data?.selected.image ??
		value("AI_Image_Model") ??
		DEFAULT_IMAGE_MODEL;
	const textModel = models.data?.text.find((model) => model.id === textId);
	const imageModel = models.data?.image.find((model) => model.id === imageId);
	const names = Object.fromEntries(
		features.map((feature) => [feature.key, feature.nameEn]),
	);

	const estimatesFor = (text?: TextModel, image?: ImageModel) =>
		features.map((feature) =>
			estimateFeature(feature, text, image, lensPriceUsd),
		);
	const estimates = useMemo(
		() =>
			features.map((feature) =>
				estimateFeature(feature, textModel, imageModel, lensPriceUsd),
			),
		[features, textModel, imageModel, lensPriceUsd],
	);

	const choose = (kind: "text" | "image", id: string) => {
		setError("");
		setPreview((current) => ({ ...current, [kind]: id }));
		const key = kind === "text" ? "AI_Text_Model" : "AI_Image_Model";
		const text =
			kind === "text"
				? models.data?.text.find((model) => model.id === id)
				: textModel;
		const image =
			kind === "image"
				? models.data?.image.find((model) => model.id === id)
				: imageModel;
		const losing = estimatesFor(text, image)
			.filter((estimate) => estimate.verdict === "loss")
			.map((estimate) => names[estimate.key] ?? estimate.key);
		// Saving a model that loses money asks first; any other choice saves at once.
		if (losing.length > 0) setConfirming({ key, model: id, losing });
		else save.mutate({ data: { key, value: id } });
	};

	const refresh = async () => {
		setRefreshing(true);
		try {
			const fresh = await getAiModels({ refresh: true });
			queryClient.setQueryData(getGetAiModelsQueryKey(), fresh);
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setRefreshing(false);
		}
	};

	const canSave = can(PERMISSIONS.configs.save);
	const describeText = (model: TextModel) =>
		model.free
			? "free"
			: `${formatSmallUsd(model.promptPerMillionUsd)} in / ${formatSmallUsd(model.completionPerMillionUsd)} out per 1M`;
	const describeImage = (model: ImageModel) =>
		`~${formatSmallUsd(model.imageUsd)} per image`;

	return (
		<section className="card grid gap-5 p-5" aria-labelledby="models-heading">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 id="models-heading" className="text-base font-semibold">
						Models
					</h2>
					<p className="text-sm text-muted">
						<span>
							Every text feature and the image brief use the text model;
							character images use the image model. Choosing one saves it at
							once and readers use it on their next action.
						</span>
					</p>
				</div>
				<Button
					icon={<RefreshCw size={16} strokeWidth={1.75} aria-hidden />}
					loading={refreshing}
					onClick={() => void refresh()}
				>
					Refresh list
				</Button>
			</div>
			{models.error ? (
				<ErrorState
					error={models.error}
					onRetry={() => void models.refetch()}
				/>
			) : !models.data ? (
				<TableSkeleton rows={2} columns={2} />
			) : (
				<>
					<div className="grid gap-5 lg:grid-cols-2">
						<div className="grid gap-3">
							<ModelPicker
								label="Text model"
								models={models.data.text}
								value={textId}
								describe={describeText}
								disabled={!canSave || save.isPending}
								onChange={(id) => choose("text", id)}
							/>
							<TextPricing model={textModel} />
						</div>
						<div className="grid gap-3">
							<ModelPicker
								label="Image model"
								models={models.data.image}
								value={imageId}
								describe={describeImage}
								disabled={!canSave || save.isPending}
								onChange={(id) => choose("image", id)}
							/>
							<ImagePricing model={imageModel} />
						</div>
					</div>
					<p className="text-xs text-muted">
						<span>
							Prices from OpenRouter, {formatDateTime(models.data.fetchedAt)}.
							After a change, run <code>make ai-smoke</code> on the server to
							confirm the model works.
						</span>
					</p>
					<CostTable
						estimates={estimates}
						names={names}
						stats={stats}
						lensPriceUsd={lensPriceUsd}
					/>
				</>
			)}
			{error && (
				<p className="field-error" role="alert">
					{error}
				</p>
			)}
			<ConfirmDialog
				open={confirming !== null}
				title="Use a model that loses money?"
				confirmLabel="Use it anyway"
				busy={save.isPending}
				error={error}
				onClose={() => {
					setConfirming(null);
					setPreview({});
				}}
				onConfirm={() =>
					confirming &&
					save.mutate({
						data: { key: confirming.key, value: confirming.model },
					})
				}
			>
				<span>
					With <code>{confirming?.model}</code>, these features would cost more
					than their lenses are worth: {confirming?.losing.join(", ")}. Raise
					the lens price or those features' lenses afterwards.
				</span>
			</ConfirmDialog>
		</section>
	);
}

/** How a feature's price compares with its recorded average cost. */
function RealMargin({
	stats,
	lenses,
	priceUsd,
}: {
	stats?: Stats;
	lenses: number;
	priceUsd: number | null;
}) {
	if (!stats || stats.actions === 0) {
		return (
			<p className="text-sm text-muted">No actions in the last 30 days.</p>
		);
	}
	const average = Number(stats.averageCostUsd);
	const value = priceUsd === null ? null : lenses * priceUsd;
	const ratio = value === null || average === 0 ? null : value / average;
	const tone =
		stats.actions < MIN_ACTIONS || ratio === null
			? "badge"
			: ratio >= HEALTHY_MARGIN
				? "badge badge-success"
				: ratio >= 1
					? "badge badge-warning"
					: "badge badge-danger";
	return (
		<p className="flex flex-wrap items-center gap-2 text-sm">
			<span>
				{formatNumber(stats.actions)} actions, {formatNumber(stats.failures)}{" "}
				failed, average cost {formatSmallUsd(average)}
			</span>
			<span className={tone}>
				<span>
					{stats.actions < MIN_ACTIONS
						? `Too few actions to judge (${MIN_ACTIONS} needed)`
						: ratio === null
							? "No cost recorded"
							: `${ratio.toFixed(1)}× the cost`}
				</span>
			</span>
		</p>
	);
}

function FeatureForm({
	feature,
	stats,
	priceUsd,
	canEdit,
}: {
	feature: Feature;
	stats?: Stats;
	priceUsd: number | null;
	canEdit: boolean;
}) {
	const toast = useToast();
	const queryClient = useQueryClient();
	const [values, setValues] = useState({
		nameEn: feature.nameEn,
		nameAr: feature.nameAr,
		lenses: String(feature.lenses),
		enabled: feature.enabled,
		maxPromptChars: String(feature.maxPromptChars),
		maxOutputTokens: String(feature.maxOutputTokens),
	});
	const [error, setError] = useState("");
	const save = usePutAiPricingByKey({
		mutation: {
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: getGetAiPricingQueryKey(),
				});
				toast.success(`${values.nameEn} saved`);
			},
			onError: (cause) => setError(errorMessage(cause)),
		},
	});
	const set = (key: keyof typeof values) => (value: string | boolean) =>
		setValues((current) => ({ ...current, [key]: value }));
	const image =
		feature.key === "character_image" || feature.key === "chapter_cover";

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const lenses = Number(values.lenses);
		const prompt = Number(values.maxPromptChars);
		const output = Number(values.maxOutputTokens);
		const problem =
			!Number.isInteger(lenses) || lenses < 0 || lenses > 10_000
				? "Lenses must be a whole number from 0 to 10,000."
				: !Number.isInteger(prompt) || prompt < 1_000 || prompt > 400_000
					? "The prompt limit must be from 1,000 to 400,000 characters."
					: !Number.isInteger(output) || output < 100 || output > 16_000
						? "The output limit must be from 100 to 16,000 tokens."
						: !values.nameEn.trim() || !values.nameAr.trim()
							? "Both names are required."
							: "";
		if (problem) {
			setError(problem);
			return;
		}
		setError("");
		save.mutate({
			key: feature.key,
			data: {
				nameEn: values.nameEn.trim(),
				nameAr: values.nameAr.trim(),
				lenses,
				enabled: values.enabled,
				maxPromptChars: prompt,
				maxOutputTokens: output,
			},
		});
	};

	return (
		<form
			onSubmit={submit}
			noValidate
			className="card grid gap-4 p-5"
			aria-labelledby={`feature-${feature.key}`}
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h3 id={`feature-${feature.key}`} className="text-base font-semibold">
						{feature.nameEn}
					</h3>
					<p className="font-mono text-xs text-muted">{feature.key}</p>
				</div>
				<p className="flex items-center gap-2 text-sm">
					<LensPrice lenses={feature.lenses} />
					<span className="text-muted">
						{priceUsd === null || feature.lenses === 0
							? ""
							: `≈ ${formatUsd(String(feature.lenses * priceUsd))} per action`}
					</span>
				</p>
			</div>
			<RealMargin
				stats={stats}
				lenses={Number(values.lenses) || 0}
				priceUsd={priceUsd}
			/>
			<fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
				<Field label="English name">
					<input
						className="input"
						value={values.nameEn}
						onChange={(event) => set("nameEn")(event.target.value)}
					/>
				</Field>
				<Field label="Arabic name">
					<input
						className="input"
						dir="rtl"
						value={values.nameAr}
						onChange={(event) => set("nameAr")(event.target.value)}
					/>
				</Field>
				<Field label="Lenses per action" hint="0 makes it free.">
					<input
						className="input"
						type="number"
						min={0}
						max={10_000}
						step={1}
						inputMode="numeric"
						value={values.lenses}
						onChange={(event) => set("lenses")(event.target.value)}
					/>
				</Field>
				<Field label="Available">
					<label className="flex min-h-10 items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={values.enabled}
							onChange={(event) => set("enabled")(event.target.checked)}
						/>
						<span>
							{values.enabled
								? "On for readers"
								: "Off: readers see it as unavailable"}
						</span>
					</label>
				</Field>
				<Field label="Prompt limit (characters)">
					<input
						className="input"
						type="number"
						min={1_000}
						max={400_000}
						value={values.maxPromptChars}
						onChange={(event) => set("maxPromptChars")(event.target.value)}
					/>
				</Field>
				<Field label={image ? "Brief limit (tokens)" : "Answer limit (tokens)"}>
					<input
						className="input"
						type="number"
						min={100}
						max={16_000}
						value={values.maxOutputTokens}
						onChange={(event) => set("maxOutputTokens")(event.target.value)}
					/>
				</Field>
			</fieldset>
			{error && (
				<p className="field-error" role="alert">
					{error}
				</p>
			)}
			{canEdit && (
				<div className="flex justify-end">
					<Button type="submit" variant="primary" loading={save.isPending}>
						Save
					</Button>
				</div>
			)}
		</form>
	);
}

/** Settings → AI: the cloud switch, models with their cost check, and each feature's price. */
export function AiSettingsPanel() {
	const { can } = useAuth();
	const pricing = useGetAiPricing();
	const summary = useGetBillingSummary(
		{ days: 30 },
		{ query: { enabled: can(PERMISSIONS.billing.summary) } },
	);
	const { value } = useConfigValues();
	const lensPrice =
		value("Lens_Price_USD") ?? summary.data?.lensPriceUsd ?? null;
	const priceUsd =
		lensPrice && Number(lensPrice) > 0 ? Number(lensPrice) : null;
	const stats = summary.data?.ai.features ?? [];

	return (
		<div className="grid gap-4">
			{can(PERMISSIONS.configs.list) && <CloudSwitch />}
			{pricing.error ? (
				<ErrorState
					error={pricing.error}
					onRetry={() => void pricing.refetch()}
				/>
			) : !pricing.data ? (
				<div className="card">
					<TableSkeleton rows={4} columns={4} />
				</div>
			) : (
				<>
					{can(PERMISSIONS.aiModels.list) && (
						<ModelsCard features={pricing.data.data} stats={stats} />
					)}
					<h2 className="mt-2 text-base font-semibold">Feature prices</h2>
					{pricing.data.data.map((feature) => (
						<FeatureForm
							key={`${feature.key}-${String(feature.updatedAt)}`}
							feature={feature}
							stats={stats.find((row) => row.feature === feature.key)}
							priceUsd={priceUsd}
							canEdit={can(PERMISSIONS.aiPricing.update)}
						/>
					))}
				</>
			)}
		</div>
	);
}
