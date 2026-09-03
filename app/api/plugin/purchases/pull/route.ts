import crypto from "node:crypto";
import { z } from "zod";
import { Prisma, PurchaseStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { refundExpiredPurchases } from "@/lib/purchase-lifecycle";
import { PURCHASE_CLAIM_LEASE_MS } from "@/lib/purchase-policy";
import { authenticatePluginRequest, pluginJson, pluginRouteError, type PluginAuthContext } from "@/lib/plugin-auth";

export const runtime = "nodejs";

const minecraftUuid = z.string().trim().uuid();
const schema = z.object({
  serverId: z.string().min(1),
  minecraftUuid: minecraftUuid.optional(),
  onlineMinecraftUuids: z.array(minecraftUuid).max(500).default([]),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

type PurchaseCandidate = { id: string };

export async function POST(request: Request) {
  let auth: PluginAuthContext | null = null;
  try {
    auth = await authenticatePluginRequest(request);
    const input = schema.parse(auth.body);
    const server = auth.server;
    const onlineMinecraftUuids = [...new Set([
      ...input.onlineMinecraftUuids,
      ...(input.minecraftUuid ? [input.minecraftUuid] : [])
    ])];

    await refundExpiredPurchases({ serverId: server.id, batchSize: 100 });

    const purchases = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`purchase-delivery:${server.id}`}, 0))::text
      `;

      const now = new Date();
      await tx.purchase.updateMany({
        where: {
          serverId: server.id,
          status: PurchaseStatus.PROCESSING,
          claimExpiresAt: { lte: now },
          expiresAt: { gt: now }
        },
        data: {
          status: PurchaseStatus.PENDING,
          claimToken: null,
          claimExpiresAt: null
        }
      });

      const onlineFilter = onlineMinecraftUuids.length > 0
        ? Prisma.sql`(p."requiresOnline" = FALSE OR b."minecraftUuid" IN (${Prisma.join(onlineMinecraftUuids)}))`
        : Prisma.sql`p."requiresOnline" = FALSE`;
      const candidates = await tx.$queryRaw<PurchaseCandidate[]>(Prisma.sql`
        SELECT ranked.id
        FROM (
          SELECT
            p.id,
            p."createdAt",
            ROW_NUMBER() OVER (
              PARTITION BY p."buyerId"
              ORDER BY p."createdAt" ASC, p.id ASC
            ) AS buyer_rank
          FROM "Purchase" p
          INNER JOIN "User" b ON b.id = p."buyerId"
          WHERE p."serverId" = ${server.id}
            AND p.status = 'PENDING'::"PurchaseStatus"
            AND p."expiresAt" > ${now}
            AND (b."bannedAt" IS NULL OR b."bannedUntil" <= ${now})
            AND ${onlineFilter}
        ) ranked
        ORDER BY ranked.buyer_rank ASC, ranked."createdAt" ASC, ranked.id ASC
        LIMIT ${input.limit}
      `);

      const claimExpiresAt = new Date(now.getTime() + PURCHASE_CLAIM_LEASE_MS);
      const claimedIds: string[] = [];
      for (const candidate of candidates) {
        const claimToken = crypto.randomUUID();
        const claimed = await tx.purchase.updateMany({
          where: {
            id: candidate.id,
            serverId: server.id,
            status: PurchaseStatus.PENDING,
            expiresAt: { gt: now }
          },
          data: {
            status: PurchaseStatus.PROCESSING,
            claimToken,
            claimExpiresAt,
            lastDeliveryAttemptAt: now,
            deliveryAttempts: { increment: 1 }
          }
        });
        if (claimed.count === 1) claimedIds.push(candidate.id);
      }

      if (claimedIds.length === 0) return [];
      const claimedPurchases = await tx.purchase.findMany({
        where: { id: { in: claimedIds } },
        include: { buyer: true, item: true }
      });
      const position = new Map(claimedIds.map((id, index) => [id, index]));
      return claimedPurchases.sort((left, right) => (position.get(left.id) ?? 0) - (position.get(right.id) ?? 0));
    });

    return pluginJson(auth, {
      purchases: purchases.map((purchase) => {
        const player = purchase.buyer.minecraftName || purchase.buyer.username;
        return {
          id: purchase.id,
          claimToken: purchase.claimToken,
          claimExpiresAt: purchase.claimExpiresAt?.toISOString() ?? null,
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
