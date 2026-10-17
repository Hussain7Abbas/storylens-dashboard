import { expect, test } from "@playwright/test";
import {
	effectiveEffort,
	estimateActionUsd,
	type ImageModel,
	imageCostAtQuality,
	type TextModel,
} from "../src/lib/ai-cost";

const text: TextModel = {
	id: "text/model",
	name: "Text",
	contextLength: 1000000,
	promptPerMillionUsd: 2,
	completionPerMillionUsd: 10,
	requestUsd: 0,
	webSearchUsd: null,
	imageUsd: null,
	imageTokens: null,
	free: false,
	reasoningSupported: true,
	reasoningEfforts: ["none", "low", "high"],
	reasoningMandatory: false,
};
const image: ImageModel = {
	...text,
	id: "image/model",
	imageUsd: 0.03,
	imageTokens: 1056,
	imageQualities: ["auto", "medium", "high"],
};
test("cost estimates include the configured reasoning allowance", () => {
	const off = estimateActionUsd("page_summary", text, image, {
		reasoningEffort: "none",
		reasoningTokenAllowance: 4096,
		imageQuality: "auto",
	});
	const on = estimateActionUsd("page_summary", text, image, {
		reasoningEffort: "low",
		reasoningTokenAllowance: 4096,
		imageQuality: "auto",
	});
	expect((on ?? 0) - (off ?? 0)).toBeCloseTo(((4096 * 10) / 1000000) * 1.055);
});
test("mandatory thinking cannot use a saved off setting", () => {
	expect(effectiveEffort("none", { ...text, reasoningMandatory: true })).toBe(
		"auto",
	);
});
test("quality-specific prices are unknown instead of reusing the baseline", () => {
	expect(imageCostAtQuality(image, "high")).toBeNull();
	expect(imageCostAtQuality(image, "medium")).toBe(0.03);
	expect(
		estimateActionUsd("character_image", text, image, {
			reasoningEffort: "low",
			reasoningTokenAllowance: 4096,
			imageQuality: "high",
		}),
	).toBeNull();
});
