// lib/imageTools.ts
export async function toWebpBlob(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
const bmp = await createImageBitmap(file);
const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
const w = Math.max(1, Math.round(bmp.width * scale));
const h = Math.max(1, Math.round(bmp.height * scale));
const canvas = new OffscreenCanvas(w, h);
const ctx = canvas.getContext("2d")!;
ctx.drawImage(bmp, 0, 0, w, h);
return await canvas.convertToBlob({ type: "image/webp", quality });
}
