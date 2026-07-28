import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { mediaUploadRateLimitStatus, recordMediaUploadAttempt } from "@/lib/auth-rate-limit";
import { routeError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  MAX_ACCOUNT_MEDIA_BYTES,
  accountMediaUsage,
  managedMediaUrl,
  mediaDirectory,
  mediaDirectoryUsage
} from "@/lib/media-storage";
import { readRequestBytes } from "@/lib/request-body";

export const runtime = "nodejs";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_DIMENSION = 4096;
const scopeSchema = z.string().trim().regex(/^[a-z0-9-]{20,80}$/i, "Invalid media upload scope");
const kindSchema = z.enum(["avatar", "banner", "gallery"]);
const limits = {
  avatar: { bytes: 256 * 1024, width: 512, height: 512, count: 1 },
  banner: { bytes: 750 * 1024, width: 1920, height: 1080, count: 1 },
  gallery: { bytes: 500 * 1024, width: 1600, height: 1200, count: 5 }
} as const;

async function optimizeImage(bytes: Buffer, kind: keyof typeof limits) {
  const metadata = await sharp(bytes, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_DIMENSION * MAX_INPUT_DIMENSION,
    sequentialRead: true
  }).metadata().catch(() => null);

  if (!metadata?.width || !metadata.height || !["png", "jpeg"].includes(metadata.format || "") || (metadata.pages || 1) !== 1) {
    throw new Response("Only valid single-frame PNG and JPEG images are accepted", { status: 400 });
  }
  if (metadata.width > MAX_INPUT_DIMENSION || metadata.height > MAX_INPUT_DIMENSION) {
    throw new Response("Image dimensions must not exceed 4096 by 4096 pixels", { status: 400 });
  }

  const limit = limits[kind];
  let smallest: Buffer | null = null;
  for (const scale of [1, 0.85, 0.7, 0.55]) {
    const width = Math.max(320, Math.round(limit.width * scale));
    const height = Math.max(320, Math.round(limit.height * scale));
    for (const quality of [84, 76, 68, 60, 52, 44]) {
      const output = await sharp(bytes, {
        failOn: "error",
        limitInputPixels: MAX_INPUT_DIMENSION * MAX_INPUT_DIMENSION,
        sequentialRead: true
      })
        .rotate()
        .resize({ width, height, fit: "inside", withoutEnlargement: true })
        .webp({ quality, effort: 6, smartSubsample: true })
        .toBuffer();
      if (!smallest || output.length < smallest.length) smallest = output;
      if (output.length <= limit.bytes) return output;
    }
  }

  throw new Response(
    `This image cannot be compressed below ${Math.round(limit.bytes / 1024)} KB without unacceptable quality loss`,
    { status: 400 }
  );
}

async function removeOtherFiles(directory: string, keepFilename: string) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name !== keepFilename)
    .map((entry) => rm(path.join(directory, entry.name), { force: true })));
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

    const body = await readRequestBytes(request, MAX_INPUT_BYTES + 64 * 1024);
    const form = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
    const file = form.get("image");
    const kind = kindSchema.parse(form.get("kind") || "avatar");
    const scopeId = kind === "avatar" ? "profile" : scopeSchema.parse(form.get("scopeId"));
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_INPUT_BYTES) {
      throw new Response("Choose a PNG or JPEG image no larger than 4 MB", { status: 400 });
    }

    const optimized = await optimizeImage(Buffer.from(await file.arrayBuffer()), kind);
    const directory = mediaDirectory(user.id, scopeId, kind);
    if (kind === "avatar") {
      const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
      await removeOtherFiles(directory, path.basename(profile?.avatarUrl || ""));
    }
    const scopeUsage = await mediaDirectoryUsage(directory);
    if (kind === "gallery" && scopeUsage.files >= limits.gallery.count) {
      throw new Response("A server can store a maximum of 5 gallery images", { status: 413 });
    }
    const accountUsage = await accountMediaUsage(user.id);
    if (accountUsage.bytes + optimized.length > MAX_ACCOUNT_MEDIA_BYTES) {
      throw new Response("Account media storage limit reached. Remove unused server images before uploading more.", { status: 413 });
    }

    const filename = `${crypto.randomUUID()}.webp`;
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), optimized, { flag: "wx", mode: 0o640 });
    if (kind === "banner") await removeOtherFiles(directory, filename);

    return NextResponse.json({
      url: managedMediaUrl(user.id, scopeId, kind, filename),
      storedBytes: optimized.length,
      maximumStoredBytes: limits[kind].bytes
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
