/** Relative luminance and WCAG contrast for a six-digit sRGB color. */
function luminance(color: string) {
	const channels = [1, 3, 5].map((offset) => {
		const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return (
		(channels[0] ?? 0) * 0.2126 +
		(channels[1] ?? 0) * 0.7152 +
		(channels[2] ?? 0) * 0.0722
	);
}

export function LookupColorPreview({
	kind,
	color,
	swapped,
}: {
	kind: "category" | "nature";
	color: string;
	swapped: boolean;
}) {
	const valid = /^#[0-9a-fA-F]{6}$/.test(color);
	const marker = kind === "category" ? swapped : true;
	return (
		<section aria-label="Color preview" className="grid gap-2">
			<h3 className="text-sm font-medium">Color preview</h3>
			<div className="grid gap-3 sm:grid-cols-2">
				{(["light", "dark"] as const).map((theme) => {
					const background = theme === "light" ? "#f7f7fb" : "#171820";
					const foreground = valid ? luminance(color) : 0;
					const surface = luminance(background);
					const ratio =
						(Math.max(foreground, surface) + 0.05) /
						(Math.min(foreground, surface) + 0.05);
					return (
						<div
							key={theme}
							className={`lookup-preview lookup-preview-${theme}`}
						>
							<p className="mb-3 text-xs font-semibold">
								{theme === "light" ? "Light background" : "Dark background"}
							</p>
							<div
								role="img"
								aria-label={`${theme} sample: ${kind} color on ${marker ? "marker" : "text"}`}
							>
								<p aria-hidden="true" className="mb-2 font-medium">
									<span
										className="lookup-preview-dot"
										style={{
											backgroundColor: marker && valid ? color : undefined,
										}}
									/>
									<span style={{ color: !marker && valid ? color : undefined }}>
										Sample keyword
									</span>
								</p>
								<p aria-hidden="true" dir="rtl" className="font-medium">
									<span
										className="lookup-preview-dot"
										style={{
											backgroundColor: marker && valid ? color : undefined,
										}}
									/>
									<span style={{ color: !marker && valid ? color : undefined }}>
										كلمة تجريبية
									</span>
								</p>
								{kind === "nature" && (
									<p aria-hidden="true" className="mt-2 text-sm">
										<span>When swapped: </span>
										<span style={{ color: valid ? color : undefined }}>
											Sample keyword
										</span>
									</p>
								)}
							</div>
							<p className="mt-3 text-xs">
								{valid
									? `${ratio.toFixed(2)}:1 · ${ratio >= 4.5 ? "Meets normal text contrast" : ratio >= 3 ? "Large text / markers only" : "Low contrast"}`
									: "Enter a valid color to preview."}
							</p>
						</div>
					);
				})}
			</div>
			<p className="field-hint">
				{kind === "category"
					? swapped
						? "Your category color appears on the marker when positions are switched."
						: "Your category color appears on keyword text."
					: "Nature colors the marker by default, or the text when the category switches positions."}{" "}
				Samples use shared colors; readers can choose personal colors.
			</p>
		</section>
	);
}
