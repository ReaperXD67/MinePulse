import { LedgerType, PurchaseStatus, type Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type RefundExpiredOptions = {
  buyerId?: string;
  serverId?: string;
  batchSize?: number;
  now?: Date;
};

export async function refundExpiredPurchases(options: RefundExpiredOptions = {}) {
  const now = options.now ?? new Date();
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 100, 500));
  const scope: Prisma.PurchaseWhereInput = {
    ...(options.buyerId ? { buyerId: options.buyerId } : {}),
    ...(options.serverId ? { serverId: options.serverId } : {})
  };

  return prisma.$transaction(async (tx) => {
    const expired = await tx.purchase.findMany({
      where: {
        ...scope,
        expiresAt: { lte: now },
        OR: [
          { status: PurchaseStatus.PENDING },
          {
            status: PurchaseStatus.PROCESSING,
            OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }]
          }
        ]
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: {
        id: true,
        buyerId: true,
        serverId: true,
        pricePointsSnapshot: true,
        item: { select: { name: true } }
      }
    });

    let refunded = 0;
    for (const purchase of expired) {
      const transitioned = await tx.purchase.updateMany({
        where: {
          id: purchase.id,
          expiresAt: { lte: now },
          OR: [
            { status: PurchaseStatus.PENDING },
            {
              status: PurchaseStatus.PROCESSING,
              OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }]
            }
          ]
        },
        data: {
          status: PurchaseStatus.REFUNDED,
          claimToken: null,
          claimExpiresAt: null
        }
      });
      if (transitioned.count !== 1) continue;

      const buyer = await tx.user.update({
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
          balanceAfter: buyer.walletPoints,
          note: `Refunded expired delivery for ${purchase.item.name}`
        }
      });
      refunded += 1;
    }

    return { scanned: expired.length, refunded };
  });
}
