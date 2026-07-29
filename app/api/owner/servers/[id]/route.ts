import { NextResponse } from "next/server";
import { z } from "zod";
import { ServerStatus, UserRole } from "@/lib/generated/prisma/client";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_REWARD_RATE_PER_SECOND } from "@/lib/reward-rate";
import { normalizeServerTags } from "@/lib/server-tags";
import { routeError } from "@/lib/api";
import { deleteManagedMedia } from "@/lib/media-storage";
import { normalizeServerAddress } from "@/lib/server-address";
import {
  minecraftVersionSchema,
  normalizeBannerImage,
  normalizeGalleryImages,
  normalizeVersionRange,
  safeHttpsUrlSchema,
  serverRegionSchema
} from "@/lib/server-profile";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  host: z.string().trim().min(3).max(120).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  version: minecraftVersionSchema.optional(),
  minVersion: minecraftVersionSchema.optional(),
  maxVersion: minecraftVersionSchema.optional(),
  region: serverRegionSchema.optional(),
  tags: z.string().trim().min(2).max(120).optional(),
  description: z
    .string()
    .trim()
    .min(20, "Listing summary must be at least 20 characters")
    .max(420, "Listing summary must be 420 characters or less")
    .optional(),
  longDescription: z.string().trim().max(3000).optional(),
  rules: z.string().trim().max(2000).optional(),
  galleryImages: z.string().trim().max(2000).optional(),
  bannerImage: z.string().trim().max(500).optional(),
  websiteUrl: safeHttpsUrlSchema.optional(),
  discordUrl: safeHttpsUrlSchema.optional(),
  supportUrl: safeHttpsUrlSchema.optional(),
  rewardRatePerSecond: z.coerce
    .number()
    .min(1)
    .max(MAX_REWARD_RATE_PER_SECOND)
    .refine((value) => Number.isInteger(value * 2), "Reward rate must use 0.5 point steps")
    .optional(),
  maxPaidPlayers: z.coerce.number().int().min(1).max(500).optional(),
  minPlaySecondsForComment: z.coerce.number().int().min(60).max(86400).optional(),
  heartbeatIntervalSeconds: z.coerce.number().int().min(10).max(60).optional(),
  purchasePollSeconds: z.coerce.number().int().min(10).max(120).optional(),
  afkTimeoutSeconds: z.coerce.number().int().min(60).max(1800).optional(),
  challengeEnabled: z.boolean().optional(),
  challengeIntervalSeconds: z.coerce.number().int().min(60).max(3600).optional(),
  challengeAnswerWindowSeconds: z.coerce.number().int().min(30).max(300).optional(),
  challengeRequired: z.boolean().optional(),
  minimumMovementDistance: z.coerce.number().min(0.05).max(3).optional(),
  minimumActivityEvents: z.coerce.number().int().min(0).max(20).optional(),
  botProtectionLevel: z.coerce.number().int().min(1).max(3).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional()
});

const policyFields = new Set([
  "heartbeatIntervalSeconds",
  "purchasePollSeconds",
  "afkTimeoutSeconds",
  "challengeEnabled",
  "challengeIntervalSeconds",
  "challengeAnswerWindowSeconds",
  "challengeRequired",
  "minimumMovementDistance",
  "minimumActivityEvents",
  "botProtectionLevel"
]);

async function authorize(serverId: string) {
  const user = await requireMember();
  const server = await prisma.server.findUnique({ where: { id: serverId } });

  if (!server || (user.role !== UserRole.ADMIN && server.ownerId !== user.id)) {
    throw new Response("Server not found", { status: 404 });
  }

  return { user, server };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, server } = await authorize(id);
    const input = schema.parse(await request.json());
    const version = input.version || (input.minVersion && input.maxVersion
      ? normalizeVersionRange(input.minVersion, input.maxVersion)
      : server.version);
    const galleryImages = input.galleryImages === undefined
      ? server.galleryImages
      : normalizeGalleryImages(input.galleryImages, user.id);
    const bannerImage = input.bannerImage === undefined
      ? server.bannerImage
      : normalizeBannerImage(input.bannerImage, user.id);
    const tags = typeof input.tags === "string" ? normalizeServerTags(input.tags) : undefined;
    const address = normalizeServerAddress(input.host ?? server.host, input.port ?? server.port);
    const existing = await prisma.server.findFirst({
      where: {
        id: { not: id },
        host: address.host,
        port: address.port,
        status: { not: "REMOVED" }
      },
      select: { id: true }
    });

    if (existing) {
      throw new Response("That Minecraft server is already registered. Contact support if you own it.", {
        status: 409
      });
    }

    const policyChanged = Object.keys(input).some((key) => policyFields.has(key));
    const { minVersion: _minVersion, maxVersion: _maxVersion, ...serverInput } = input;
    const updated = await prisma.server.update({
      where: { id },
      data: {
        ...serverInput,
        ...address,
        version,
        galleryImages,
        bannerImage,
        ...(tags ? { tags } : {}),
        ...(policyChanged ? { pluginConfigRevision: { increment: 1 } } : {})
      }
    });

    const oldGallery = server.galleryImages.split(",").map((value) => value.trim()).filter(Boolean);
    const nextGallery = new Set(galleryImages.split(",").map((value) => value.trim()).filter(Boolean));
    await deleteManagedMedia([
      ...(server.bannerImage !== bannerImage ? [server.bannerImage] : []),
      ...oldGallery.filter((value) => !nextGallery.has(value))
    ]);

    return NextResponse.json({ serverId: updated.id, message: "Server updated" });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await authorize(id);
    await prisma.server.update({
      where: { id },
      data: { status: ServerStatus.REMOVED }
    });

    return NextResponse.json({ message: "Listing removed from Creator Studio and the marketplace" });
  } catch (error) {
    return routeError(error);
  }
}
