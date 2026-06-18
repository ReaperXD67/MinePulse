import { NextResponse } from "next/server";
import { z } from "zod";
import { LedgerType, PurchaseStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  secret: z.string().min(8),
  purchaseId: z.string().min(1),
  status: z.enum(["DELIVERED", "FAILED"]),
  message: z.string().trim().max(240).optional()
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const purchase = await prisma.purchase.findUnique({
      where: { id: input.purchaseId },
      include: {
        item: true,
        server: true,
        buyer: true
      }
    });

    if (
      !purchase ||
      purchase.serverId !== input.serverId ||
      purchase.server.pluginSecret !== input.secret ||
      purchase.status !== PurchaseStatus.PENDING
    ) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    if (input.status === "DELIVERED") {
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: PurchaseStatus.DELIVERED, deliveredAt: new Date() }
      });
      return NextResponse.json({ message: "Delivery confirmed" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: PurchaseStatus.FAILED }
      });

      const updatedBuyer = await tx.user.update({
        where: { id: purchase.buyerId },
        data: { walletPoints: { increment: purchase.item.pricePoints } }
      });

      await tx.server.update({
        where: { id: purchase.serverId },
        data: { pointPool: Math.max(0, purchase.server.pointPool - purchase.item.pricePoints) }
      });

      await tx.pointLedger.create({
        data: {
          userId: purchase.buyerId,
          serverId: purchase.serverId,
          type: LedgerType.PURCHASE_REFUND,
          amountPoints: purchase.item.pricePoints,
          balanceAfter: updatedBuyer.walletPoints,
          note: input.message || `Refunded failed delivery for ${purchase.item.name}`
        }
      });
    });

    return NextResponse.json({ message: "Purchase failed and refunded" });
  } catch (error) {
    return routeError(error);
  }
}
