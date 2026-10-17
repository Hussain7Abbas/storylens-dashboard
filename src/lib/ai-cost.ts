import type {
	GetAiModels200ImageItem,
	GetAiModels200TextItem,
} from "@/api/generated/schemas";

/**
 * Estimates what one AI action costs with a given OpenRouter model, to show
 * whether lens prices still cover it before a model is changed. Token counts
 * are typical requests (an Arabic chapter of about 3,000 words is ~10,000
 * tokens); the AI tab also shows the real 30-day average once actions exist.
 */

export type TextModel = GetAiModels200TextItem;
export type ImageModel = GetAiModels200ImageItem;

export const REASONING_EFFORTS = [
	"auto",
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;
export const IMAGE_QUALITIES = [
	"auto",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;
export type GenerationSettings = {
	reasoningEffort: string;
	reasoningTokenAllowance: number;
	imageQuality: string;
};
export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
	reasoningEffort: "auto",
	reasoningTokenAllowance: 4096,
	imageQuality: "auto",
};
export function effectiveEffort(value: string, model?: TextModel): string {
	if (value === "auto" || !model) return value;
	if (value === "none" && model.reasoningMandatory) return "auto";
	return model.reasoningEfforts && !model.reasoningEfforts.includes(value)
		? "auto"
		: value;
}
export function effectiveQuality(value: string, model?: ImageModel): string {
	return value !== "auto" &&
		model?.imageQualities &&
		!model.imageQualities.includes(value)
		? "auto"
		: value;
}
/** Public rates do not specify tokens per image at each quality/resolution. */
export function imageCostAtQuality(
	model: ImageModel,
	quality: string,
): number | null {
	const effective = effectiveQuality(quality, model);
	return effective === "auto" || effective === "medium" ? model.imageUsd : null;
}

/** OpenRouter adds about 5.5% when credits are bought. */
export const OPENROUTER_FEE = 1.055;
/** Exa web search for novel research: $0.007 per request (5 results). */
const EXA_SEARCH_USD = 0.007;
/** A price is healthy when lenses are worth at least this many times the cost. */
export const HEALTHY_MARGIN = 1.5;

type Profile = {
	input: number;
	output: number;
	search?: boolean;
	image?: boolean;
};

/** Typical tokens per action. `character_image` is the text brief plus one image. */
export const FEATURE_PROFILES: Record<string, Profile> = {
	page_summary: { input: 9_000, output: 500 },
	chapter_context: { input: 15_000, output: 5_000 },
	keyword_suggestion: { input: 3_000, output: 250 },
	chapter_extraction: { input: 10_000, output: 1_500 },
	character_image: { input: 5_000, output: 300, image: true },
	chapter_cover: { input: 16_000, output: 1000, image: true },
	novel_context: { input: 6_000, output: 400, search: true },
	selector_detection: { input: 6_000, output: 500 },
};

function textCost(model: TextModel, input: number, output: number): number {
	return (
		(input * model.promptPerMillionUsd) / 1_000_000 +
		(output * model.completionPerMillionUsd) / 1_000_000 +
		model.requestUsd
	);
}

/** Estimated USD per action, including OpenRouter's fee; null when a model is unknown. */
export function estimateActionUsd(
	feature: string,
	text: TextModel | undefined,
	image: ImageModel | undefined,
	settings: GenerationSettings = DEFAULT_GENERATION_SETTINGS,
): number | null {
	const profile = FEATURE_PROFILES[feature];
	if (!profile || !text) return null;
	const effort = effectiveEffort(settings.reasoningEffort, text);
	const allowance =
		text.reasoningSupported !== false && effort !== "none"
			? settings.reasoningTokenAllowance
			: 0;
	let cost = textCost(text, profile.input, profile.output + allowance);
	if (profile.search) cost += EXA_SEARCH_USD;
	if (profile.image) {
		if (!image) return null;
		const imageCost = imageCostAtQuality(image, settings.imageQuality);
		if (imageCost === null) return null;
		cost += imageCost + image.requestUsd;
	}
	return cost * OPENROUTER_FEE;
}

export type Verdict = "free" | "loss" | "thin" | "ok" | "unknown";

export type FeatureEstimate = {
	key: string;
	lenses: number;
	costUsd: number | null;
	valueUsd: number | null;
	verdict: Verdict;
	/** Fewest whole lenses that cover the cost at the current lens price. */
	breakEvenLenses: number | null;
	/** Whole lenses for a healthy margin (`HEALTHY_MARGIN` × cost). */
	healthyLenses: number | null;
};

export function estimateFeature(
	feature: { key: string; lenses: number },
	text: TextModel | undefined,
	image: ImageModel | undefined,
	lensPriceUsd: number | null,
	settings: GenerationSettings = DEFAULT_GENERATION_SETTINGS,
): FeatureEstimate {
	const costUsd = estimateActionUsd(feature.key, text, image, settings);
	const valueUsd = lensPriceUsd === null ? null : feature.lenses * lensPriceUsd;
	const lensesFor = (target: number | null) =>
		target === null || lensPriceUsd === null || lensPriceUsd <= 0
			? null
			: Math.max(1, Math.ceil(target / lensPriceUsd));
	const verdict: Verdict =
		costUsd === null || valueUsd === null
			? "unknown"
			: feature.lenses === 0
				? "free"
				: valueUsd < costUsd
					? "loss"
					: valueUsd < costUsd * HEALTHY_MARGIN
						? "thin"
						: "ok";
	return {
		key: feature.key,
		lenses: feature.lenses,
		costUsd,
		valueUsd,
		verdict,
		breakEvenLenses: lensesFor(costUsd),
		healthyLenses: lensesFor(
			costUsd === null ? null : costUsd * HEALTHY_MARGIN,
		),
	};
}

/**
 * The lowest lens price at which every priced feature covers its cost (and a
 * healthy margin) with today's lens counts. Null when nothing is priced.
 */
export function requiredLensPrice(estimates: FeatureEstimate[]): {
	breakEvenUsd: number;
	healthyUsd: number;
} | null {
	const priced = estimates.filter(
		(estimate) => estimate.lenses > 0 && estimate.costUsd !== null,
	);
	if (priced.length === 0) return null;
	const breakEvenUsd = Math.max(
		...priced.map((estimate) => (estimate.costUsd ?? 0) / estimate.lenses),
	);
	return { breakEvenUsd, healthyUsd: breakEvenUsd * HEALTHY_MARGIN };
}

/** `0.0123` → `$0.0123`, `12.5` → `$12.50`: enough digits for tiny AI costs. */
export function formatSmallUsd(value: number | null): string {
	if (value === null) return "—";
	const digits = value >= 1 ? 2 : value >= 0.01 ? 4 : 5;
	return new Intl.NumberFormat("en", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: digits,
	}).format(value);
}

export function perMillion(value: number): string {
	return `${formatSmallUsd(value)} / 1M tokens`;
}
