import { ImageUp, Trash2, X } from "lucide-react";
import { type DragEvent, useEffect, useId, useRef, useState } from "react";
import { axiosInstance, errorMessage } from "@/api/axios-instance";
import type { PostFilesUpload200 } from "@/api/generated/schemas";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { Button } from "./button";
import { Spinner } from "./spinner";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type PickedImage = { id: string; url: string };

async function uploadImage(
	file: File,
	signal: AbortSignal,
): Promise<PostFilesUpload200> {
	const body = new FormData();
	body.append("file", file);
	const { data } = await axiosInstance.post<PostFilesUpload200>(
		"/api/admin/files/upload",
		body,
		{ signal },
	);
	return data;
}

/** Single-image drop area. Uploads immediately; the parent saves the image reference. */
export function ImageField({
	label,
	value,
	onChange,
	onUploadingChange,
	hint,
}: {
	label: string;
	value: PickedImage | null;
	onChange: (image: PickedImage | null) => void;
	onUploadingChange?: (uploading: boolean) => void;
	hint?: string;
}) {
	const { can } = useAuth();
	const id = useId();
	const input = useRef<HTMLInputElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	const active = useRef<AbortController | null>(null);
	const depth = useRef(0);
	const busyCallback = useRef(onUploadingChange);
	busyCallback.current = onUploadingChange;
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState("");
	const [drag, setDrag] = useState<"idle" | "accept" | "reject">("idle");
	const [picked, setPicked] = useState<{ id: string; name: string }>();
	const canUpload = can(PERMISSIONS.novels.upload);
	const disabled = uploading || !canUpload;
	const description =
		[
			hint ? `${id}-hint` : null,
			error ? `${id}-error` : null,
			!canUpload ? `${id}-permission` : null,
		]
			.filter(Boolean)
			.join(" ") || undefined;
	useEffect(
		() => () => {
			if (active.current) {
				active.current.abort();
				active.current = null;
				busyCallback.current?.(false);
			}
		},
		[],
	);

	const setBusy = (busy: boolean) => {
		setUploading(busy);
		onUploadingChange?.(busy);
	};
	const pick = async (files: File[]) => {
		if (!canUpload || active.current || !files.length) return;
		if (files.length !== 1) return setError("Choose one image at a time.");
		const file = files[0];
		if (!file) return;
		if (
			!file.type.startsWith("image/") &&
			!(
				file.type === "" &&
				/\.(png|jpe?g|gif|webp|avif|bmp|ico|svg|tiff?)$/i.test(file.name)
			)
		)
			return setError("Choose an image file.");
		if (file.size > MAX_IMAGE_BYTES)
			return setError("Images must be 8 MB or smaller.");
		const controller = new AbortController();
		active.current = controller;
		setError("");
		setBusy(true);
		try {
			const uploaded = await uploadImage(file, controller.signal);
			if (controller.signal.aborted) return;
			setPicked({ id: uploaded.id, name: file.name });
			onChange({ id: uploaded.id, url: uploaded.url });
		} catch (reason) {
			if (!controller.signal.aborted)
				setError(errorMessage(reason, "The image could not be uploaded."));
		} finally {
			if (active.current === controller) {
				active.current = null;
				setBusy(false);
			}
		}
	};
	const fileDrag = (event: DragEvent) =>
		Array.from(event.dataTransfer.types).includes("Files");
	const dragState = (event: DragEvent) => {
		const files = Array.from(event.dataTransfer.items).filter(
			(item) => item.kind === "file",
		);
		return files.length > 1 ||
			files.some((item) => item.type && !item.type.startsWith("image/"))
			? ("reject" as const)
			: ("accept" as const);
	};
	return (
		<div className="min-w-0 space-y-2 text-sm">
			<label id={`${id}-label`} htmlFor={id} className="field-label">
				<span>{label}</span>
			</label>
			<fieldset
				className="image-drop-field"
				aria-labelledby={`${id}-label`}
				onDragEnter={(event) => {
					if (!fileDrag(event)) return;
					event.preventDefault();
					event.stopPropagation();
					if (disabled) return;
					depth.current += 1;
					setDrag(dragState(event));
				}}
				onDragOver={(event) => {
					if (!fileDrag(event)) return;
					event.preventDefault();
					event.stopPropagation();
					event.dataTransfer.dropEffect =
						disabled || dragState(event) === "reject" ? "none" : "copy";
					if (!disabled) setDrag(dragState(event));
				}}
				onDragLeave={(event) => {
					event.preventDefault();
					depth.current = Math.max(0, depth.current - 1);
					if (!depth.current) setDrag("idle");
				}}
				onDrop={(event) => {
					if (!fileDrag(event)) return;
					event.preventDefault();
					event.stopPropagation();
					depth.current = 0;
					setDrag("idle");
					void pick(Array.from(event.dataTransfer.files));
				}}
			>
				<input
					id={id}
					ref={input}
					type="file"
					accept="image/*"
					className="sr-only"
					tabIndex={-1}
					disabled={disabled}
					aria-describedby={description}
					onChange={(event) => {
						void pick(Array.from(event.currentTarget.files ?? []));
						event.currentTarget.value = "";
					}}
				/>
				<button
					ref={button}
					type="button"
					className="image-drop-area"
					disabled={disabled}
					data-drag={drag}
					data-error={!!error || undefined}
					aria-busy={uploading || undefined}
					aria-labelledby={`${id}-label ${id}-action`}
					aria-describedby={description}
					aria-invalid={!!error}
					onClick={() => input.current?.click()}
				>
					{uploading ? (
						<Spinner size={24} />
					) : drag === "reject" ? (
						<X size={24} strokeWidth={1.75} aria-hidden />
					) : (
						<ImageUp size={24} strokeWidth={1.75} aria-hidden />
					)}
					<span id={`${id}-action`} className="image-drop-instruction">
						{uploading
							? "Uploading…"
							: drag === "reject"
								? "Drop one image file"
								: drag === "accept"
									? "Drop your image here"
									: "Drag and drop an image or click to upload"}
					</span>
					{value && (
						<span
							className="image-drop-filename"
							title={picked?.id === value.id ? picked.name : undefined}
						>
							{picked?.id === value.id
								? picked.name
								: "Image selected · click to replace"}
						</span>
					)}
				</button>
				{value && canUpload && (
					<Button
						variant="ghost"
						iconOnly
						className="image-drop-remove"
						disabled={uploading}
						aria-label={`Delete ${label.toLowerCase()}`}
						title="Delete image"
						icon={<Trash2 size={16} strokeWidth={1.75} aria-hidden />}
						onClick={() => {
							setError("");
							setPicked(undefined);
							onChange(null);
							button.current?.focus();
						}}
					/>
				)}
			</fieldset>
			{uploading && (
				<output className="field-hint block">
					<span>Uploading image…</span>
				</output>
			)}
			{!canUpload && (
				<p id={`${id}-permission`} className="text-muted">
					<span>Your role can’t upload images.</span>
				</p>
			)}
			{hint && (
				<p id={`${id}-hint`} className="field-hint">
					<span>{hint}</span>
				</p>
			)}
			{error && (
				<p id={`${id}-error`} className="field-error" role="alert">
					<span>{error}</span>
				</p>
			)}
			{value && (
				<div className="grid size-24 place-items-center overflow-hidden rounded-xl border border-line bg-wash">
					<img
						src={value.url}
						alt={label}
						className="size-full object-contain"
					/>
				</div>
			)}
		</div>
	);
}
