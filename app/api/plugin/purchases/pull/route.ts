import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  secret: z.string().min(8),
  minecraftUuid: z.string().trim().min(8).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const server = await prisma.server.findFirst({
      where: { id: input.serverId, pluginSecret: input.secret },
      select: { id: true }
    });

    if (!server) {
      return NextResponse.json({ error: "Invalid server credentials" }, { status: 401 });
    }

    const purchases = await prisma.purchase.findMany({
      where: {
        serverId: server.id,
        status: "PENDING",
        ...(input.minecraftUuid ? { buyer: { minecraftUuid: input.minecraftUuid } } : {})
      },
      include: { buyer: true, item: true },
      orderBy: { createdAt: "asc" },
      take: input.limit
    });

    return NextResponse.json({
      purchases: purchases.map((purchase) => {
        const player = purchase.buyer.minecraftName || purchase.buyer.username;
        return {
          id: purchase.id,
          player,
          uuid: purchase.buyer.minecraftUuid,
          item: purchase.item.name,
          requiresOnline: purchase.requiresOnline,
          command: purchase.commandSnapshot
            .replaceAll("{player}", player)
            .replaceAll("{uuid}", purchase.buyer.minecraftUuid || "")
        };
      })
    });
  } catch (error) {
    return routeError(error);
  }
}
