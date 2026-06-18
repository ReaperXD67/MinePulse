import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingKind, LedgerType, UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  tierId: z.string().min(1)
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser([UserRole.OWNER, UserRole.ADMIN]);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const [server, tier] = await Promise.all([
      prisma.server.findUnique({ where: { id } }),
      prisma.premiumTier.findUnique({ where: { id: input.tierId } })
    ]);

    if (!server || (user.role !== UserRole.ADMIN && server.ownerId !== user.id)) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (!tier || !tier.active || tier.code === "NONE") {
      return NextResponse.json({ error: "Premium tier not available" }, { status: 404 });
    }

    const base = server.premiumUntil && server.premiumUntil > new Date() ? server.premiumUntil : new Date();
    const premiumUntil = new Date(base.getTime() + tier.durationDays * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.server.update({
        where: { id: server.id },
        data: {
          premiumPlan: tier.code,
          premiumUntil
        }
      }),
      prisma.billingLedger.create({
        data: {
          ownerId: server.ownerId,
          serverId: server.id,
          kind: BillingKind.PREMIUM,
          moneyCents: tier.priceCents,
          planCode: tier.code,
          note: `${tier.name} premium until ${premiumUntil.toISOString()}`
        }
      }),
      prisma.pointLedger.create({
        data: {
          serverId: server.id,
          type: LedgerType.SERVER_PREMIUM,
          amountPoints: 0,
          note: `${server.name} bought ${tier.name} premium`
        }
      })
    ]);

    return NextResponse.json({ message: "Premium activated" });
  } catch (error) {
    return routeError(error);
  }
}
