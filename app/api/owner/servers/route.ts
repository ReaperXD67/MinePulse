import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makePluginSecret, slugify } from "@/lib/random";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(3).max(80),
  host: z.string().trim().min(3).max(120),
  port: z.coerce.number().int().min(1).max(65535).default(25565),
  version: z.string().trim().min(2).max(30),
  region: z.string().trim().min(2).max(30),
  tags: z.string().trim().min(2).max(120),
  description: z.string().trim().min(20).max(420),
  rewardRatePerSecond: z.coerce.number().int().min(0).max(100),
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
    const user = await requireUser([UserRole.OWNER, UserRole.ADMIN]);
    const input = schema.parse(await request.json());
    const server = await prisma.server.create({
      data: {
        ...input,
        ownerId: user.id,
        slug: await uniqueSlug(input.name),
        pointPool: 0,
        pluginSecret: makePluginSecret(),
        bannerImage: "/voxel-network.png"
      }
    });

    return NextResponse.json({ serverId: server.id, pluginSecret: server.pluginSecret });
  } catch (error) {
    return routeError(error);
  }
}
