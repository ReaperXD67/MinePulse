import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticatePluginRequest, pluginJson, pluginRouteError, type PluginAuthContext } from "@/lib/plugin-auth";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  minecraftUuid: z.string().trim().min(8).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export async function POST(request: Request) {
  let auth: PluginAuthContext | null = null;
  try {
    auth = await authenticatePluginRequest(request);
    const input = schema.parse(auth.body);
    const server = auth.server;

    const purchases = await prisma.purchase.findMany({
      where: {
        serverId: server.id,
        status: "PENDING",
        buyer: {
          OR: [
            { bannedAt: null },
            { bannedUntil: { lte: new Date() } }
          ],
          ...(input.minecraftUuid ? { minecraftUuid: input.minecraftUuid } : {})
        }
      },
      include: { buyer: true, item: true },
      orderBy: { createdAt: "asc" },
      take: input.limit
    });

    return pluginJson(auth, {
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
    return pluginRouteError(auth, error);
  }
}
