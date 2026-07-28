import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireMember } from "@/lib/auth";
import { mediaUploadRateLimitStatus, recordMediaUploadAttempt } from "@/lib/auth-rate-limit";
import { routeError } from "@/lib/api";
import { readRequestBytes } from "@/lib/request-body";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;
const MAX_ACCOUNT_MEDIA_BYTES = 100 * 1024 * 1024;
const MAX_ACCOUNT_MEDIA_FILES = 100;

async function accountMediaUsage(directory: string) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile());
    const sizes = await Promise.all(files.map((entry) => stat(path.join(directory, entry.name))));
    return { files: files.length, bytes: sizes.reduce((total, file) => total + file.size, 0) };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return { files: 0, bytes: 0 };
    }
    throw error;
  }
}

async function sanitizeImage(bytes: Buffer) {
  try {
    const decoder = sharp(bytes, {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION,
      sequentialRead: true
    });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || !["png", "jpeg"].includes(metadata.format || "") || (metadata.pages || 1) !== 1) {
      throw new Response("Only valid PNG and JPEG images are accepted", { status: 400 });
    }
    if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
      throw new Response("Image dimensions must not exceed 4096 by 4096 pixels", { status: 400 });
    }

    const extension = metadata.format === "png" ? "png" : "jpg";
    const sanitized = extension === "png"
      ? await decoder.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer()
      : await decoder.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    if (sanitized.length > MAX_IMAGE_BYTES) {
      throw new Response("The sanitized image is too large; reduce its dimensions or complexity", { status: 400 });
    }
    return { extension, sanitized };
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("The image could not be decoded safely", { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireMember();
    const throttle = await mediaUploadRateLimitStatus(user.id);
    if (throttle.blocked) {
      throw new Response("Too many image uploads. Try again later.", {
        status: 429,
        headers: { "Retry-After": String(throttle.retryAfterSeconds) }
      });
    }
    await recordMediaUploadAttempt(user.id);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      throw new Response("Image upload must use multipart form data", { status: 415 });
    }

    const body = await readRequestBytes(request, MAX_IMAGE_BYTES + 64 * 1024);
    const form = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      throw new Response("Choose a PNG or JPEG image no larger than 4 MB", { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const { extension, sanitized } = await sanitizeImage(bytes);
    const filename = `${crypto.randomUUID()}.${extension}`;
    const directory = path.join(process.cwd(), "public", "uploads", user.id);
    const usage = await accountMediaUsage(directory);
    if (usage.files >= MAX_ACCOUNT_MEDIA_FILES || usage.bytes + sanitized.length > MAX_ACCOUNT_MEDIA_BYTES) {
      throw new Response("Account media storage limit reached. Remove unused images before uploading more.", { status: 413 });
    }
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), sanitized, { flag: "wx", mode: 0o640 });

    return NextResponse.json({ url: `/uploads/${user.id}/${filename}` }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return routeError(error);
  }
}
