import { z } from "zod";

export const SERVER_REGIONS = [
  { value: "GLOBAL", label: "Global" },
  { value: "EU", label: "Europe" },
  { value: "NA", label: "North America" },
  { value: "SA", label: "South America" },
  { value: "ASIA", label: "Asia" },
  { value: "OCEANIA", label: "Oceania" },
  { value: "AFRICA", label: "Africa" }
] as const;

export const MINECRAFT_VERSIONS = [
  "1.8.8",
  "1.9",
  "1.10",
  "1.11",
  "1.12.2",
  "1.13",
  "1.14",
  "1.15",
  "1.16.5",
  "1.17.1",
  "1.18.2",
  "1.19.4",
  "1.20.6",
  "1.21",
  "1.21.1",
  "1.21.4",
  "1.21.8",
  "1.21.11"
] as const;

const regionValues = SERVER_REGIONS.map((region) => region.value) as [string, ...string[]];
const versionValues = [...MINECRAFT_VERSIONS] as [string, ...string[]];

export const serverRegionSchema = z.enum(regionValues, { message: "Select a supported server region" });
export const minecraftVersionSchema = z.enum(versionValues, { message: "Select a supported Minecraft version" });

function versionParts(version: string) {
  return version.split(".").map((part) => Number(part));
}

function compareVersions(left: string, right: string) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function normalizeVersionRange(minVersion: string, maxVersion: string) {
  const min = minecraftVersionSchema.parse(minVersion);
  const max = minecraftVersionSchema.parse(maxVersion);
  if (compareVersions(min, max) > 0) {
    throw new Response("Minimum Minecraft version cannot be newer than the maximum version", { status: 400 });
  }
  return min === max ? min : `${min} - ${max}`;
}

export function parseVersionRange(value: string) {
  const [rawMin, rawMax] = value.split(" - ").map((part) => part.trim());
  const fallback = MINECRAFT_VERSIONS[MINECRAFT_VERSIONS.length - 1];
  const min = MINECRAFT_VERSIONS.includes(rawMin as (typeof MINECRAFT_VERSIONS)[number]) ? rawMin : fallback;
  const maxCandidate = rawMax || rawMin;
  const max = MINECRAFT_VERSIONS.includes(maxCandidate as (typeof MINECRAFT_VERSIONS)[number]) ? maxCandidate : min;
  return { min, max };
}

export const safeHttpsUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use a complete HTTPS URL")
  .or(z.literal(""));

const LEGACY_MEDIA_PATH = /^\/uploads\/([a-z0-9_-]{3,80})\/[a-f0-9-]{36}\.(?:png|jpg)$/i;
const MANAGED_MEDIA_PATH = /^\/media\/([a-z0-9_-]{3,80})\/[a-z0-9-]{3,80}\/(?:avatar|banner|gallery)\/[a-f0-9-]{36}\.webp$/i;
const BUNDLED_MEDIA = new Set(["/voxel-network.png"]);

export function safeMediaPath(value: string | null | undefined) {
  const path = value?.trim() || "";
  return BUNDLED_MEDIA.has(path) || LEGACY_MEDIA_PATH.test(path) || MANAGED_MEDIA_PATH.test(path) ? path : "";
}

export function mediaPathBelongsToUser(value: string, userId: string) {
  if (BUNDLED_MEDIA.has(value)) return true;
  const match = value.match(LEGACY_MEDIA_PATH) || value.match(MANAGED_MEDIA_PATH);
  return match?.[1] === userId;
}

export function normalizeBannerImage(value: string | null | undefined, userId: string) {
  const image = safeMediaPath(value) || "/voxel-network.png";
  if (!mediaPathBelongsToUser(image, userId)) {
    throw new Response("Upload the server banner through your KarixMC account", { status: 400 });
  }
  return image;
}

export function normalizeGalleryImages(value: string | null | undefined, userId?: string) {
  const entries = (value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (entries.some((entry) => !safeMediaPath(entry))) {
    throw new Response("Upload gallery images through KarixMC; remote and unrecognized paths are blocked", { status: 400 });
  }
  if (userId && entries.some((entry) => !mediaPathBelongsToUser(entry, userId))) {
    throw new Response("Gallery images must come from your KarixMC account", { status: 400 });
  }
  const images = Array.from(new Set(entries.map((entry) => safeMediaPath(entry)).filter(Boolean)));
  if (images.length > 5) throw new Response("A server can upload a maximum of 5 gallery images", { status: 400 });
  return images.join(",");
}
