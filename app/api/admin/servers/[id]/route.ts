import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingKind, LedgerType, PremiumPlanCode, ServerStatus, UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  adjustPoints: z.coerce.number().int().min(-1000000000).max(1000000000).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "REMOVED"]).optional(),
  trustStatus: z.enum(["VERIFIED", "WATCHLIST", "SUSPENDED", "BLACKLISTED"]).optional(),
  premiumPlan: z.enum(["NONE", "GOLD", "DIAMOND"]).optional(),
  premiumDays: z.coerce.number().int().min(0).max(365).optional(),
  heartbeatIntervalSeconds: z.coerce.number().int().min(10).max(60).optional(),
  purchasePollSeconds: z.coerce.number().int().min(10).max(120).optional(),
  afkTimeoutSeconds: z.coerce.number().int().min(60).max(1800).optional(),
  challengeEnabled: z.boolean().optional(),
  challengeIntervalSeconds: z.coerce.number().int().min(60).max(3600).optional(),
  challengeAnswerWindowSeconds: z.coerce.number().int().min(30).max(300).optional(),
  challengeRequired: z.boolean().optional(),
  minimumMovementDistance: z.coerce.number().min(0.05).max(3).optional(),
  minimumActivityEvents: z.coerce.number().int().min(0).max(20).optional(),
  botProtectionLevel: z.coerce.number().int().min(1).max(3).optional()
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser([UserRole.ADMIN]);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const server = await prisma.server.findUnique({ where: { id } });

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const pointPool = Math.max(0, server.pointPool + (input.adjustPoints ?? 0));
    const premiumPlan = input.premiumPlan ? (input.premiumPlan as PremiumPlanCode) : server.premiumPlan;
    const premiumUntil =
      input.premiumPlan === "NONE"
        ? null
        : input.premiumDays !== undefined
          ? new Date(Date.now() + input.premiumDays * 24 * 60 * 60 * 1000)
          : server.premiumUntil;
    const policyChanged = Object.keys(input).some((key) => policyFields.has(key));

    await prisma.$transaction([
      prisma.server.update({
        where: { id },
        data: {
          pointPool,
          status: input.status ? (input.status as ServerStatus) : server.status,
          trustStatus: input.trustStatus ?? server.trustStatus,
          premiumPlan,
          premiumUntil,
          ...(input.heartbeatIntervalSeconds !== undefined ? { heartbeatIntervalSeconds: input.heartbeatIntervalSeconds } : {}),
          ...(input.purchasePollSeconds !== undefined ? { purchasePollSeconds: input.purchasePollSeconds } : {}),
          ...(input.afkTimeoutSeconds !== undefined ? { afkTimeoutSeconds: input.afkTimeoutSeconds } : {}),
          ...(input.challengeEnabled !== undefined ? { challengeEnabled: input.challengeEnabled } : {}),
          ...(input.challengeIntervalSeconds !== undefined ? { challengeIntervalSeconds: input.challengeIntervalSeconds } : {}),
          ...(input.challengeAnswerWindowSeconds !== undefined ? { challengeAnswerWindowSeconds: input.challengeAnswerWindowSeconds } : {}),
          ...(input.challengeRequired !== undefined ? { challengeRequired: input.challengeRequired } : {}),
          ...(input.minimumMovementDistance !== undefined ? { minimumMovementDistance: input.minimumMovementDistance } : {}),
          ...(input.minimumActivityEvents !== undefined ? { minimumActivityEvents: input.minimumActivityEvents } : {}),
          ...(input.botProtectionLevel !== undefined ? { botProtectionLevel: input.botProtectionLevel } : {}),
          ...(policyChanged ? { pluginConfigRevision: { increment: 1 } } : {})
        }
      }),
      prisma.pointLedger.create({
        data: {
          serverId: id,
          type: LedgerType.ADMIN_ADJUSTMENT,
          amountPoints: input.adjustPoints ?? 0,
          note: `Admin adjusted ${server.name}`
        }
      }),
      prisma.billingLedger.create({
        data: {
          ownerId: user.id,
          serverId: id,
          kind: BillingKind.ADMIN_ADJUSTMENT,
          amountPoints: input.adjustPoints ?? 0,
          note: policyChanged
            ? `Admin changed listing/economy or bridge protection policy for ${server.name}`
            : `Admin changed status/premium/points for ${server.name}`
        }
      })
    ]);

    return NextResponse.json({ message: "Server updated" });
  } catch (error) {
    return routeError(error);
  }
}
