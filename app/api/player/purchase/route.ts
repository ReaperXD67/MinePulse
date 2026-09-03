import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LedgerType, PurchaseStatus, UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";
import { serverJoinAddress } from "@/lib/server-address";
import { refundExpiredPurchases } from "@/lib/purchase-lifecycle";
import {
  MAX_ACTIVE_PURCHASES_PER_PLAYER_SERVER,
  MAX_PURCHASE_ATTEMPTS_PER_MINUTE,
  PURCHASE_EXPIRY_DAYS,
  PURCHASE_EXPIRY_MS
} from "@/lib/purchase-policy";
import { sharedRateLimit } from "@/lib/redis";

export const runtime = "nodejs";

const schema = z.object({
  itemId: z.string().min(1),
  requestId: z.string().uuid().optional()
});

export async function POST(request: Request) {
  try {
    const user = await requireUser([UserRole.PLAYER, UserRole.OWNER, UserRole.ADMIN]);
    const input = schema.parse(await request.json());
    const requestKey = input.requestId ?? crypto.randomUUID();

    if (input.requestId) {
      const existing = await prisma.purchase.findUnique({
        where: { requestKey: input.requestId },
        select: { id: true, buyerId: true, itemId: true }
      });
      if (existing) {
        if (existing.buyerId !== user.id || existing.itemId !== input.itemId) {
          throw new Response("Purchase request ID is already in use", { status: 409 });
        }
        return NextResponse.json({ purchaseId: existing.id, message: "This purchase was already queued." });
      }
    }

    const throttle = await sharedRateLimit(
      `purchase:user:${user.id}`,
      MAX_PURCHASE_ATTEMPTS_PER_MINUTE,
      60
    );
    if (throttle && !throttle.allowed) {
      throw new Response("Too many purchase attempts. Wait a minute and try again.", {
        status: 429,
        headers: { "Retry-After": String(throttle.retryAfterSeconds) }
      });
    }

    const item = await prisma.storeItem.findUnique({
      where: { id: input.itemId },
      include: { server: true }
    });

    if (!item || item.status !== "ACTIVE" || item.server.status !== "ACTIVE") {
      return NextResponse.json({ error: "Item is not available" }, { status: 404 });
    }

    await refundExpiredPurchases({ buyerId: user.id, serverId: item.serverId, batchSize: 50 });

    const result = await prisma.$transaction(async (tx) => {
      // Serialize purchases per account so concurrent requests cannot bypass
      // the queue cap or minute window on separate application replicas.
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`purchase-account:${user.id}`}, 0))
      `;

      const idempotent = await tx.purchase.findUnique({
        where: { requestKey },
        select: { id: true, buyerId: true, itemId: true }
      });
      if (idempotent) {
        if (idempotent.buyerId !== user.id || idempotent.itemId !== input.itemId) {
          throw new Response("Purchase request ID is already in use", { status: 409 });
        }
        return { id: idempotent.id, activeCount: null, idempotent: true };
      }

      const buyer = await tx.user.findUnique({
        where: { id: user.id },
        select: { id: true, minecraftUuid: true }
      });

      if (!buyer?.minecraftUuid) {
        throw new Response("Link your Minecraft account before buying server items", { status: 400 });
      }

      const recentPurchases = await tx.purchase.count({
        where: { buyerId: buyer.id, createdAt: { gte: new Date(Date.now() - 60_000) } }
      });
      if (recentPurchases >= MAX_PURCHASE_ATTEMPTS_PER_MINUTE) {
        throw new Response("Too many purchases. Wait a minute and try again.", {
          status: 429,
          headers: { "Retry-After": "60" }
        });
      }

      const activeCount = await tx.purchase.count({
        where: {
          buyerId: buyer.id,
          serverId: item.serverId,
          status: { in: [PurchaseStatus.PENDING, PurchaseStatus.PROCESSING] }
        }
      });
      if (activeCount >= MAX_ACTIVE_PURCHASES_PER_PLAYER_SERVER) {
        throw new Response(
          `You already have ${MAX_ACTIVE_PURCHASES_PER_PLAYER_SERVER} deliveries waiting on this server. Join and use /receive before buying more.`,
          { status: 409 }
        );
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

      const purchase = await tx.purchase.create({
        data: {
          buyerId: buyer.id,
          serverId: item.serverId,
          itemId: item.id,
          requestKey,
          commandSnapshot: item.command,
          pricePointsSnapshot: item.pricePoints,
          requiresOnline: item.requiresOnline,
          expiresAt: new Date(Date.now() + PURCHASE_EXPIRY_MS)
        }
      });
      return { id: purchase.id, activeCount: activeCount + 1, idempotent: false };
    });

    const address = serverJoinAddress(item.server.host, item.server.port);
    return NextResponse.json({
      purchaseId: result.id,
      message: result.idempotent
        ? "This purchase was already queued."
        : `Purchase queued (${result.activeCount}/${MAX_ACTIVE_PURCHASES_PER_PLAYER_SERVER}) for ${item.server.name}. Join ${address}, log in, then use /receive. Unclaimed items are refunded after ${PURCHASE_EXPIRY_DAYS} days.`
    });
  } catch (error) {
    return routeError(error);
  }
}
