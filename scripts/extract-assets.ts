import { createHash } from "node:crypto";
import sharp from "sharp";
import type { MapImage } from "../src/types/mindmap.js";
import { XmindArchive, safeArchivePath } from "./archive.js";

export interface Asset {
  name: string;
  buffer: Buffer;
}

export async function extractImage(
  archive: XmindArchive,
  source: string,
  assets: Map<string, Asset>,
): Promise<MapImage> {
  const image: MapImage = { source };
  try {
    if (/^(https?:|data:|javascript:|file:|\/\/)/i.test(source))
      throw new Error("不加载外部或活动图片资源");
    const raw = source.replace(/^xap:/i, "").replace(/^\/+/, "");
    const variants = [raw];
    try {
      variants.push(decodeURIComponent(raw));
    } catch {
      /* Keep literal paths containing %. */
    }
    const name = variants.find((n) => archive.entries.has(n));
    if (!name) throw new Error(`未找到内嵌图片：${source}`);
    safeArchivePath(name);
    const buffer = await archive.read(name);
    if (
      /\.svgz?$/i.test(name) ||
      /^\s*(<\?xml[^>]*>\s*)?<svg/i.test(buffer.subarray(0, 1024).toString())
    )
      throw new Error("SVG 活动内容不受支持，请在 Xmind 中改用位图");
    const metadata = await sharp(buffer, {
      limitInputPixels: 80000000,
      failOn: "warning",
    }).metadata();
    const extensions: Record<string, string> = {
      jpeg: "jpg",
      png: "png",
      gif: "gif",
      webp: "webp",
      avif: "avif",
      tiff: "tiff",
    };
    const ext = extensions[metadata.format || ""];
    if (!ext || !metadata.width || !metadata.height)
      throw new Error(`不支持的图片格式：${metadata.format}`);
    // Metadata alone can accept a truncated PNG/JPEG; decode pixels as well.
    await sharp(buffer, {
      limitInputPixels: 80000000,
      failOn: "warning",
    }).stats();
    const hash = createHash("sha256").update(buffer).digest("hex");
    const originalName = `${hash}.${ext}`;
    assets.set(originalName, { name: originalName, buffer });
    image.originalUrl = `data/assets/${originalName}`;
    image.url = image.originalUrl;
    if (ext === "tiff") {
      const preview = await sharp(buffer, { limitInputPixels: 80000000 })
        .png()
        .toBuffer();
      const convertedName = `${hash}.png`;
      assets.set(convertedName, { name: convertedName, buffer: preview });
      image.url = `data/assets/${convertedName}`;
    }
    image.width = metadata.width;
    image.height = metadata.height;
  } catch (error) {
    image.error = error instanceof Error ? error.message : String(error);
  }
  return image;
}
