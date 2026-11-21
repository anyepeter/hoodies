"use client";

import { CHAT_IMAGE_MAX_BYTES, CHAT_IMAGE_MAX_PX, CHAT_PDF_MAX_BYTES, type ChatFileDTO, type ChatMessageDTO } from "@/lib/chat/shared";

/*
 * Pictures and PDFs from the composer (shopper widget and admin inbox). Pictures are made small HERE, in the
 * browser: decoded, drawn on a canvas with the longest side at most CHAT_IMAGE_MAX_PX, and exported as WebP
 * (JPEG where the browser can't write WebP). Re-encoding keeps only the pixels, so EXIF data and GPS location
 * never leave the phone. PDFs go as they are (at most 3 MB). The server checks everything again.
 */

export const ATTACH_ACCEPT = "image/*,application/pdf,.pdf,.heic,.heif";
export const DECODE_ERROR = "That picture couldn't be opened. Try a screenshot or a JPEG/PNG.";
const NETWORK = "We couldn't reach the server. Check your connection and try again.";

export type Prepared = { blob: Blob; name: string; mime: string; kind: "image" | "file"; width: number | null; height: number | null };

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bitmap.width > 0 && bitmap.height > 0) return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
      bitmap.close();
    } catch {
      // Not decodable this way (older Safari, some formats): try an <img> below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty");
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

const stemOf = (name: string, fallback: string) =>
  name
    .replace(/\.[^.]*$/, "")
    .replace(/[\\/]/g, " ")
    .trim()
    .slice(0, 60) || fallback;

/** Readable size: "820 KB", "2.4 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A chosen file → what to upload, or a plain sentence saying why it can't be sent. */
export async function prepareAttachment(file: File): Promise<{ ok: true; file: Prepared } | { ok: false; error: string }> {
  const pdf = file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name));
  if (pdf) {
    if (file.size === 0) return { ok: false, error: "That PDF is empty." };
    if (file.size > CHAT_PDF_MAX_BYTES) return { ok: false, error: "That PDF is over 3 MB. Send a smaller one." };
    const blob = file.type ? file : new Blob([file], { type: "application/pdf" });
    return { ok: true, file: { blob, name: `${stemOf(file.name, "document")}.pdf`, mime: "application/pdf", kind: "file", width: null, height: null } };
  }
  const image = file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif|avif|bmp)$/i.test(file.name);
  if (!image) return { ok: false, error: "Only pictures and PDFs can be sent." };
  // Anything this big is a camera RAW or a panorama: decoding it could stall a phone.
  if (file.size > 40_000_000) return { ok: false, error: "That picture is too big to send. Try a screenshot of it." };

  const decoded = await decode(file);
  if (!decoded) return { ok: false, error: DECODE_ERROR };
  try {
    const { source, width, height } = decoded;
    // Smaller and softer until it fits the server's limit (nearly always the first try).
    for (const [px, quality] of [
      [CHAT_IMAGE_MAX_PX, 0.82],
      [CHAT_IMAGE_MAX_PX, 0.7],
      [1200, 0.7],
      [900, 0.6],
    ] as const) {
      const scale = Math.min(1, px / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return { ok: false, error: DECODE_ERROR };
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      let blob = await toBlob(canvas, "image/webp", quality);
      if (!blob || blob.type !== "image/webp") {
        // No WebP encoder here (older Safari): JPEG, on white so transparent parts don't turn black.
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        blob = await toBlob(canvas, "image/jpeg", quality);
      }
      if (!blob || (blob.type !== "image/webp" && blob.type !== "image/jpeg")) return { ok: false, error: DECODE_ERROR };
      if (blob.size <= CHAT_IMAGE_MAX_BYTES) {
        const ext = blob.type === "image/webp" ? "webp" : "jpg";
        return { ok: true, file: { blob, name: `${stemOf(file.name, "photo")}.${ext}`, mime: blob.type, kind: "image", width: canvas.width, height: canvas.height } };
      }
    }
    return { ok: false, error: "That picture is too detailed to send. Try a screenshot of it." };
  } catch {
    // e.g. a canvas the browser won't export
    return { ok: false, error: DECODE_ERROR };
  } finally {
    decoded.release();
  }
}

/** The message bubble shown while a file is on its way (its picture comes from the browser's own copy). */
export function localFile(p: Prepared, id: string, url: string): ChatFileDTO {
  return { id, url, name: p.name, mime: p.mime, size: p.blob.size, width: p.width, height: p.height, kind: p.kind };
}

export type UploadResult = { ok: true; message: ChatMessageDTO } | { ok: false; status: number; error: string; code?: string };

/** Sends a prepared file (+ optional caption) as multipart to `url`. */
export async function uploadAttachment(url: string, p: Prepared, caption: string): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", p.blob, p.name);
  if (caption) form.append("caption", caption);
  if (p.width && p.height) {
    form.append("width", String(p.width));
    form.append("height", String(p.height));
  }
  try {
    const res = await fetch(url, { method: "POST", body: form, cache: "no-store" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; code?: string; message?: ChatMessageDTO } | null;
    if (res.status === 401) return { ok: false, status: 401, error: "You've been signed out. Reload the page to sign in again." };
    if (!res.ok || !json?.ok || !json.message) return { ok: false, status: res.status, error: json?.error ?? "That file couldn't be sent. Try again.", code: json?.code };
    return { ok: true, message: json.message };
  } catch {
    return { ok: false, status: 0, error: NETWORK };
  }
}
