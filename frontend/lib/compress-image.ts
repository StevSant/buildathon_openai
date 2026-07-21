import { config } from "./config";

// Client-side photo preparation for report uploads: decode whatever the camera/gallery
// hands us (JPEG, PNG, WebP, HEIC on iOS) and re-encode as a bounded JPEG so the stored
// object always matches its .jpg path, uploads stay fast on mobile data, and OpenAI
// vision always receives a format it can read. Falls back to the original file if the
// browser cannot decode it — analyze-report surfaces real failures.
export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, config.photoMaxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", config.photoJpegQuality),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
