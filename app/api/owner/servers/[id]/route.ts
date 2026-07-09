import { NextResponse } from "next/server";
import { z } from "zod";
import { ServerStatus, UserRole } from "@/lib/generated/prisma/client";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeServerTags } from "@/lib/server-tags";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  host: z.string().trim().min(3).max(120).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  version: z.string().trim().min(2).max(30).optional(),
  region: z.string().trim().min(2).max(30).optional(),
  tags: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().min(20).max(420).optional(),
  longDescription: z.string().trim().max(3000).optional(),
  rules: z.string().trim().max(2000).optional(),
  galleryImages: z.string().trim().max(2000).optional(),
  websiteUrl: z.string().trim().url().or(z.literal("")).optional(),
  discordUrl: z.string().trim().url().or(z.literal("")).optional(),
  supportUrl: z.string().trim().url().or(z.literal("")).optional(),
  rewardRatePerSecond: z.coerce
    .number()
    .min(1)
    .max(100)
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
    await authorize(id);
    const input = schema.parse(await request.json());
    const tags = typeof input.tags === "string" ? normalizeServerTags(input.tags) : undefined;
    const policyChanged = Object.keys(input).some((key) => policyFields.has(key));
    const updated = await prisma.server.update({
      where: { id },
      data: {
        ...input,
        ...(tags ? { tags } : {}),
        ...(policyChanged ? { pluginConfigRevision: { increment: 1 } } : {})
      }
    });

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

    return NextResponse.json({ message: "Server removed" });
  } catch (error) {
    return routeError(error);
  }
}
