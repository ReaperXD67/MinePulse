import { NextResponse } from "next/server";
import { z } from "zod";
import { LedgerType, UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";
import { serverJoinAddress } from "@/lib/server-address";

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
        select: { id: true, minecraftUuid: true }
      });

      if (!buyer?.minecraftUuid) {
        throw new Response("Link your Minecraft account before buying server items", { status: 400 });
      }

      const charged = await tx.user.updateMany({
        where: { id: buyer.id, walletPoints: { gte: item.pricePoints } },
        data: { walletPoints: { decrement: item.pricePoints } }
      });
      if (charged.count !== 1) {
        throw new Response("Not enough points", { status: 400 });
      }

      const updatedBuyer = await tx.user.findUniqueOrThrow({
        where: { id: buyer.id },
        select: { walletPoints: true }
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

    const address = serverJoinAddress(item.server.host, item.server.port);
    return NextResponse.json({
      purchaseId: result.id,
      message: `Purchase queued for ${item.server.name}. Join ${address}, log in, then use /receive.`
    });
  } catch (error) {
    return routeError(error);
  }
}
