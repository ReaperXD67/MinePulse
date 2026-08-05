import "server-only";

import path from "node:path";
import { readdir, rm, stat } from "node:fs/promises";

const MANAGED_MEDIA_PATH = /^\/media\/([a-z0-9_-]{3,80})\/([a-z0-9-]{3,80})\/(avatar|banner|gallery)\/([a-f0-9-]{36}\.webp)$/i;

export const MAX_ACCOUNT_MEDIA_BYTES = 32 * 1024 * 1024;

export function mediaStorageRoot() {
  return process.env.MEDIA_ROOT || path.join("storage", "media");
}

export function managedMediaUrl(userId: string, scopeId: string, kind: "avatar" | "banner" | "gallery", filename: string) {
  return `/media/${userId}/${scopeId}/${kind}/${filename}`;
}

export function managedMediaFilePath(value: string | null | undefined) {
  const match = (value || "").match(MANAGED_MEDIA_PATH);
  if (!match) return null;
  return path.join(/* turbopackIgnore: true */ mediaStorageRoot(), match[1], match[2], match[3], match[4]);
}

export async function deleteManagedMedia(values: Array<string | null | undefined>) {
  await Promise.all(values.map(async (value) => {
    const file = managedMediaFilePath(value);
    if (file) await rm(file, { force: true });
  }));
}

async function directoryUsage(directory: string): Promise<{ files: number; bytes: number }> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return directoryUsage(target);
      if (!entry.isFile()) return { files: 0, bytes: 0 };
      const details = await stat(target);
      return { files: 1, bytes: details.size };
    }));
    return nested.reduce((total, current) => ({
      files: total.files + current.files,
      bytes: total.bytes + current.bytes
    }), { files: 0, bytes: 0 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return { files: 0, bytes: 0 };
    }
    throw error;
  }
}

export function accountMediaUsage(userId: string) {
  return directoryUsage(path.join(/* turbopackIgnore: true */ mediaStorageRoot(), userId));
}

export function mediaDirectory(userId: string, scopeId: string, kind: "avatar" | "banner" | "gallery") {
  return path.join(/* turbopackIgnore: true */ mediaStorageRoot(), userId, scopeId, kind);
}

export function mediaDirectoryUsage(directory: string) {
  return directoryUsage(directory);
}
