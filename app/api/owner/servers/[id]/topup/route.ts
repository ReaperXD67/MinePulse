import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingKind, LedgerType, UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  packageId: z.string().min(1)
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser([UserRole.OWNER, UserRole.ADMIN]);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const [server, pointPackage] = await Promise.all([
      prisma.server.findUnique({ where: { id } }),
      prisma.pointPackage.findUnique({ where: { id: input.packageId } })
    ]);

    if (!server || (user.role !== UserRole.ADMIN && server.ownerId !== user.id)) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (!pointPackage || !pointPackage.active) {
      return NextResponse.json({ error: "Point package not available" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.server.update({
        where: { id: server.id },
        data: { pointPool: { increment: pointPackage.points } }
      }),
      prisma.billingLedger.create({
        data: {
          ownerId: server.ownerId,
          serverId: server.id,
          kind: BillingKind.POINTS,
          amountPoints: pointPackage.points,
          moneyCents: pointPackage.priceCents,
          planCode: pointPackage.code,
          note: `Bought ${pointPackage.label}`
        }
      }),
      prisma.pointLedger.create({
        data: {
          serverId: server.id,
          type: LedgerType.SERVER_TOPUP,
          amountPoints: pointPackage.points,
          note: `Owner topped up ${server.name}`
        }
      })
    ]);

    return NextResponse.json({ message: "Point pool topped up" });
  } catch (error) {
    return routeError(error);
  }
}
