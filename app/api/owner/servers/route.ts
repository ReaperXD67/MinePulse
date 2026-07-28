import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_REWARD_RATE_PER_SECOND } from "@/lib/reward-rate";
import { makePluginSecret, slugify } from "@/lib/random";
import { normalizeServerTags } from "@/lib/server-tags";
import { routeError } from "@/lib/api";
import { normalizeServerAddress } from "@/lib/server-address";
import { protectPluginSecret } from "@/lib/plugin-credentials";
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
  name: z.string().trim().min(3).max(80),
  host: z.string().trim().min(3).max(120),
  port: z.coerce.number().int().min(1).max(65535).default(25565),
  version: minecraftVersionSchema.optional(),
  minVersion: minecraftVersionSchema.optional(),
  maxVersion: minecraftVersionSchema.optional(),
  region: serverRegionSchema,
  tags: z.string().trim().min(2).max(120),
  description: z.string().trim().min(20).max(420),
  longDescription: z.string().trim().max(3000).default(""),
  rules: z.string().trim().max(2000).default(""),
  galleryImages: z.string().trim().max(2000).default(""),
  bannerImage: z.string().trim().max(500).default("/voxel-network.png"),
  websiteUrl: safeHttpsUrlSchema.optional(),
  discordUrl: safeHttpsUrlSchema.optional(),
  supportUrl: safeHttpsUrlSchema.optional(),
  rewardRatePerSecond: z.coerce
    .number()
    .min(1)
    .max(MAX_REWARD_RATE_PER_SECOND)
    .refine((value) => Number.isInteger(value * 2), "Reward rate must use 0.5 point steps"),
  maxPaidPlayers: z.coerce.number().int().min(1).max(500),
  minPlaySecondsForComment: z.coerce.number().int().min(60).max(86400)
});

async function uniqueSlug(name: string) {
  const base = slugify(name) || "server";
  let candidate = base;
  let counter = 2;

  while (await prisma.server.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
}

export async function POST(request: Request) {
  try {
    const user = await requireMember();
    const input = schema.parse(await request.json());
    const version = input.version || normalizeVersionRange(input.minVersion || "", input.maxVersion || "");
    const tags = normalizeServerTags(input.tags);
    const galleryImages = normalizeGalleryImages(input.galleryImages, user.id);
    const bannerImage = normalizeBannerImage(input.bannerImage, user.id);
    const address = normalizeServerAddress(input.host, input.port);
    const existing = await prisma.server.findFirst({
      where: {
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

    const pluginSecret = makePluginSecret();
    const { minVersion: _minVersion, maxVersion: _maxVersion, ...serverInput } = input;
    const server = await prisma.server.create({
      data: {
        ...serverInput,
        ...address,
        version,
        galleryImages,
        tags,
        ownerId: user.id,
        slug: await uniqueSlug(input.name),
        pointPool: 0,
        pluginSecret: protectPluginSecret(pluginSecret),
        bannerImage
      }
    });

    return NextResponse.json({
      serverId: server.id,
      pluginSecret,
      message: "Server created. Copy the plugin secret now; KarixMC will not display it again."
    });
  } catch (error) {
    return routeError(error);
  }
}
