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
import { ownerServerInclude, serializeOwnerServer } from "@/lib/owner-server-view";
import {
  minecraftVersionSchema,
  normalizeBannerImage,
  normalizeGalleryImages,
  normalizeVersionRange,
  safeHttpsUrlSchema,
  serverRegionSchema
} from "@/lib/server-profile";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireMember();
    const servers = await prisma.server.findMany({
      where: { ownerId: user.id, status: { not: "REMOVED" } },
      include: ownerServerInclude,
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(
      { servers: servers.map(serializeOwnerServer) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return routeError(error);
  }
}

const schema = z.object({
  name: z.string().trim().min(3).max(80),
  host: z.string().trim().min(3).max(120),
  port: z.coerce.number().int().min(1).max(65535).default(25565),
  version: minecraftVersionSchema.optional(),
  minVersion: minecraftVersionSchema.optional(),
  maxVersion: minecraftVersionSchema.optional(),
  region: serverRegionSchema,
  tags: z.string().trim().min(2).max(120),
  description: z
    .string()
    .trim()
    .min(20, "Listing summary must be at least 20 characters")
    .max(420, "Listing summary must be 420 characters or less"),
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
      where: { host: address.host, port: address.port, status: { not: "REMOVED" } },
      select: { id: true }
    });

    if (existing) {
      throw new Response("That Minecraft server is already registered. Contact support if you own it.", {
        status: 409
      });
    }

    const previousListing = await prisma.server.findFirst({
      where: { host: address.host, port: address.port, status: "REMOVED" },
      orderBy: { updatedAt: "desc" }
    });

    if (previousListing && previousListing.ownerId !== user.id) {
      throw new Response("That Minecraft server was registered by another account. Contact support to verify ownership.", {
        status: 409
      });
    }

    if (previousListing && previousListing.trustStatus !== "VERIFIED") {
      throw new Response("This removed server cannot be restored automatically. Contact support for a trust review.", {
        status: 409
      });
    }

    const pluginSecret = makePluginSecret();
    const { minVersion: _minVersion, maxVersion: _maxVersion, ...serverInput } = input;
    const serverData = {
      ...serverInput,
      ...address,
      version,
      galleryImages,
      tags,
      pluginSecret: protectPluginSecret(pluginSecret),
      bannerImage
    };
    const server = await prisma.server.create({
      data: {
        ...serverData,
        ownerId: user.id,
        slug: await uniqueSlug(input.name),
        pointPool: 0
      }
    });

    return NextResponse.json({
      serverId: server.id,
      pluginSecret,
      freshStart: Boolean(previousListing),
      message: previousListing
        ? "Fresh listing created. The removed server stays archived, and its shop, likes, favorites, reviews, sessions, pool, and plugin identity were not reused."
        : "Server created. Copy the plugin secret now; KarixMC will not display it again."
    });
  } catch (error) {
    return routeError(error);
  }
}
