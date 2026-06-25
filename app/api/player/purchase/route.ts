import { NextResponse } from "next/server";
import { z } from "zod";
import { LedgerType, UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  itemId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const user = await requireUser([UserRole.PLAYER, UserRole.OWNER, UserRole.ADMIN]);
    const input = schema.parse(await request.json());

    const item = await prisma.storeItem.findUnique({
      where: { id: input.itemId },
      include: { server: true }
    });

    if (!item || item.status !== "ACTIVE" || item.server.status !== "ACTIVE") {
      return NextResponse.json({ error: "Item is not available" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const buyer = await tx.user.findUnique({
        where: { id: user.id },
        select: { id: true, walletPoints: true, minecraftUuid: true, minecraftName: true, username: true }
      });

      if (!buyer || buyer.walletPoints < item.pricePoints) {
        throw new Response("Not enough points", { status: 400 });
      }

      if (!buyer.minecraftUuid) {
        throw new Response("Link your Minecraft account before buying server items", { status: 400 });
      }

      const updatedBuyer = await tx.user.update({
        where: { id: buyer.id },
        data: { walletPoints: { decrement: item.pricePoints } }
      });

      await tx.pointLedger.create({
        data: {
          userId: buyer.id,
          serverId: item.serverId,
          type: LedgerType.PLAYER_SPEND,
          amountPoints: -item.pricePoints,
          balanceAfter: updatedBuyer.walletPoints,
          note: `Bought ${item.name} on ${item.server.name}`
        }
      });

      return tx.purchase.create({
        data: {
          buyerId: buyer.id,
          serverId: item.serverId,
          itemId: item.id,
          commandSnapshot: item.command,
          requiresOnline: item.requiresOnline
        }
      });
    });

    return NextResponse.json({ purchaseId: result.id, message: "Purchase queued" });
  } catch (error) {
    return routeError(error);
  }
}
