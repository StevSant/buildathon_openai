import { config } from "./config";

const INVALID_IMAGE_MESSAGE =
  "No pudimos preparar la foto. Usa una imagen JPG, PNG o WebP válida e inténtalo de nuevo.";

// Decode a browser-supported image and re-encode it as a bounded JPEG so the stored
// bytes, MIME type, and .jpg path always agree before analyze-report receives the path.
export async function compressImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, config.photoMaxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(INVALID_IMAGE_MESSAGE);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", config.photoJpegQuality),
    );

    if (!blob || blob.size === 0 || blob.type !== "image/jpeg") {
      throw new Error(INVALID_IMAGE_MESSAGE);
    }

    return blob;
  } catch {
    throw new Error(INVALID_IMAGE_MESSAGE);
  } finally {
    bitmap?.close();
  }
}
