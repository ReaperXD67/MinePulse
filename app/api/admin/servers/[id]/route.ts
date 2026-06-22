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
  premiumDays: z.coerce.number().int().min(0).max(365).optional()
});

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

    await prisma.$transaction([
      prisma.server.update({
        where: { id },
        data: {
          pointPool,
          status: input.status ? (input.status as ServerStatus) : server.status,
          trustStatus: input.trustStatus ?? server.trustStatus,
          premiumPlan,
          premiumUntil
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
          note: `Admin changed status/premium/points for ${server.name}`
        }
      })
    ]);

    return NextResponse.json({ message: "Server updated" });
  } catch (error) {
    return routeError(error);
  }
}
