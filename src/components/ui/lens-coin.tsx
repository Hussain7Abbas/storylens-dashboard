import { formatNumber } from "@/lib/format";
import { LensCoinSparkles } from "@/lib/lens-coin/LensCoinSparkles";

/**
 * The lens coin (umbrella `docs/branding/lens-coin/`): the full coin from 24 px,
 * a simpler one below, and a line version in `currentColor` for filled buttons.
 */
function StaticLensCoin({
	size = 16,
	variant = "color",
	title,
}: {
	size?: number;
	variant?: "color" | "mono";
	title?: string;
}) {
	const svg = coinSvg(size, variant);
	return title ? (
		<span role="img" aria-label={title} className="inline-flex">
			{svg}
		</span>
	) : (
		svg
	);
}

function coinSvg(size: number, variant: "color" | "mono") {
	if (variant === "mono") {
		return (
			<svg
				width={size}
				height={size}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={1.75}
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="10" />
				<path d="M12 6.5c.5 3 2.5 5 5.5 5.5-3 .5-5 2.5-5.5 5.5-.5-3-2.5-5-5.5-5.5 3-.5 5-2.5 5.5-5.5z" />
			</svg>
		);
	}
	if (size <= 20) {
		return (
			<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
				<circle cx="32" cy="35" r="28" fill="#3e3289" />
				<circle cx="32" cy="31" r="28" fill="#6554c0" />
				<path
					d="M32 13c1.7 9.6 7.4 15.3 17 17-9.6 1.7-15.3 7.4-17 17-1.7-9.6-7.4-15.3-17-17 9.6-1.7 15.3-7.4 17-17z"
					fill="#fff"
				/>
			</svg>
		);
	}
	return (
		<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
			<defs>
				<linearGradient
					id="lens-coin-face"
					x1="14"
					y1="9"
					x2="50"
					y2="55"
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0" stopColor="#8371e0" />
					<stop offset="1" stopColor="#5544a7" />
				</linearGradient>
			</defs>
			<circle cx="32" cy="34.5" r="27" fill="#3e3289" />
			<circle cx="32" cy="31" r="27" fill="url(#lens-coin-face)" />
			<circle
				cx="32"
				cy="31"
				r="21"
				fill="none"
				stroke="#c9befa"
				strokeWidth="2.5"
			/>
			<path
				d="M32 17.5c1.3 7.6 5.9 12.2 13.5 13.5-7.6 1.3-12.2 5.9-13.5 13.5-1.3-7.6-5.9-12.2-13.5-13.5 7.6-1.3 12.2-5.9 13.5-13.5z"
				fill="#fff"
			/>
			<path
				d="M17.5 20.5a18 18 0 0 1 8-6.5"
				fill="none"
				stroke="#fff"
				strokeOpacity=".55"
				strokeWidth="2.5"
				strokeLinecap="round"
			/>
		</svg>
	);
}

export function lensLabel(lenses: number): string {
	return `${formatNumber(lenses)} ${Math.abs(lenses) === 1 ? "lens" : "lenses"}`;
}

/** A coin and an amount; `0` reads "Free". */
export function LensPrice({
	lenses,
	signed = false,
	size = 16,
}: {
	lenses: number;
	signed?: boolean;
	size?: number;
}) {
	if (lenses === 0 && !signed) {
		return <span className="text-muted">Free</span>;
	}
	const text = `${signed && lenses > 0 ? "+" : ""}${formatNumber(lenses)}`;
	return (
		<span
			className="inline-flex items-center gap-1.5 tabular-nums"
			title={lensLabel(lenses)}
		>
			<LensCoin size={size} />
			<span>{text}</span>
			<span className="sr-only">
				{Math.abs(lenses) === 1 ? "lens" : "lenses"}
			</span>
		</span>
	);
}

export function LensCoin({
	size = 16,
	variant = "color",
	title,
}: {
	size?: number;
	variant?: "color" | "mono";
	title?: string;
}) {
	return (
		<LensCoinSparkles size={size} mono={variant === "mono"} title={title}>
			<StaticLensCoin size={size} variant={variant} />
		</LensCoinSparkles>
	);
}
