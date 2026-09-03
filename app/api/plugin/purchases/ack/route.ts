import { z } from "zod";
import { LedgerType, PurchaseStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticatePluginRequest, pluginJson, pluginRouteError, type PluginAuthContext } from "@/lib/plugin-auth";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  purchaseId: z.string().min(1),
  claimToken: z.string().uuid().optional(),
  status: z.enum(["DELIVERED", "FAILED"]),
  message: z.string().trim().max(240).optional()
});

export async function POST(request: Request) {
  let auth: PluginAuthContext | null = null;
  try {
    auth = await authenticatePluginRequest(request);
    const input = schema.parse(auth.body);
    const server = auth.server;

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`purchase-delivery:${server.id}`}, 0))::text
      `;

      const purchase = await tx.purchase.findUnique({
        where: { id: input.purchaseId },
        include: { item: true }
      });
      if (!purchase || purchase.serverId !== input.serverId || purchase.serverId !== server.id) {
        throw new Response("Purchase not found", { status: 404 });
      }

      if (purchase.status === PurchaseStatus.DELIVERED) {
        return { message: "Delivery was already confirmed" };
      }
      if (purchase.status === PurchaseStatus.FAILED || purchase.status === PurchaseStatus.REFUNDED) {
        return { message: "Purchase was already resolved" };
      }
      if (purchase.status === PurchaseStatus.PROCESSING && (!input.claimToken || input.claimToken !== purchase.claimToken)) {
        throw new Response("Delivery claim is missing, expired, or no longer owned by this request", { status: 409 });
      }
      if (purchase.status !== PurchaseStatus.PENDING && purchase.status !== PurchaseStatus.PROCESSING) {
        throw new Response("Purchase is not awaiting delivery", { status: 409 });
      }

      const transitionWhere = purchase.status === PurchaseStatus.PROCESSING
        ? { id: purchase.id, status: PurchaseStatus.PROCESSING, claimToken: input.claimToken }
        : { id: purchase.id, status: PurchaseStatus.PENDING };

      if (input.status === "DELIVERED") {
        const transitioned = await tx.purchase.updateMany({
          where: transitionWhere,
          data: {
            status: PurchaseStatus.DELIVERED,
            deliveredAt: new Date(),
            claimToken: null,
            claimExpiresAt: null
          }
        });
        if (transitioned.count !== 1) {
          throw new Response("Delivery claim changed; pull the purchase again", { status: 409 });
        }
        return { message: "Delivery confirmed" };
      }

      const transitioned = await tx.purchase.updateMany({
        where: transitionWhere,
        data: {
          status: PurchaseStatus.FAILED,
          claimToken: null,
          claimExpiresAt: null
        }
      });
      if (transitioned.count !== 1) {
        throw new Response("Delivery claim changed; pull the purchase again", { status: 409 });
      }

      const updatedBuyer = await tx.user.update({
        where: { id: purchase.buyerId },
        data: { walletPoints: { increment: purchase.pricePointsSnapshot } },
        select: { walletPoints: true }
      });
      await tx.pointLedger.create({
        data: {
          userId: purchase.buyerId,
          serverId: purchase.serverId,
          type: LedgerType.PURCHASE_REFUND,
          amountPoints: purchase.pricePointsSnapshot,
          balanceAfter: updatedBuyer.walletPoints,
          note: input.message || `Refunded failed delivery for ${purchase.item.name}`
        }
      });
      return { message: "Purchase failed and refunded" };
    });

    return pluginJson(auth, result);
  } catch (error) {
    return pluginRouteError(auth, error);
  }
}
