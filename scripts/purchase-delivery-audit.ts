import crypto from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { request, type APIRequestContext, type APIResponse } from "playwright";
import { protectPluginSecret } from "../lib/plugin-credentials";
import { createScriptPrisma } from "./database-client";

loadEnvConfig(process.cwd());

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const prisma = createScriptPrisma();
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const serverId = `purchase-delivery-audit-${stamp}`;
const secret = crypto.randomBytes(32).toString("hex");
const password = `Purchase!Delivery!Audit!${stamp}`;
const userIds: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function responseBody(response: APIResponse) {
  return response.json().catch(() => ({}));
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function verifySignedResponse(response: Response, requestNonce: string, body: string) {
  const timestamp = response.headers.get("x-karixmc-timestamp") || "";
  const nonce = response.headers.get("x-karixmc-nonce") || "";
  const signature = response.headers.get("x-karixmc-signature") || "";
  assert(response.headers.get("x-karixmc-protocol") === "2", "Plugin response protocol header is missing");
  const canonical = ["RESPONSE", requestNonce, timestamp, nonce, response.status, sha256(body)].join("\n");
  const expected = crypto.createHmac("sha256", secret).update(canonical).digest();
  const received = Buffer.from(signature, "hex");
  assert(received.length === expected.length && crypto.timingSafeEqual(received, expected), "Plugin response signature is invalid");
}

async function signedPost(path: string, payload: Record<string, unknown>) {
  const body = JSON.stringify({ serverId, ...payload });
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const canonical = ["POST", path, serverId, timestamp, nonce, sha256(body)].join("\n");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-karixmc-protocol": "2",
      "x-karixmc-server-id": serverId,
      "x-karixmc-timestamp": String(timestamp),
      "x-karixmc-nonce": nonce,
      "x-karixmc-signature": crypto.createHmac("sha256", secret).update(canonical).digest("hex")
    },
    body
  });
  const text = await response.text();
  verifySignedResponse(response, nonce, text);
  return { response, body: text ? JSON.parse(text) : {} };
}

async function register(label: string, ip: string) {
  const context = await request.newContext({ baseURL: baseUrl, extraHTTPHeaders: { "x-real-ip": ip } });
  const email = `purchase-${label}-${stamp}@example.test`;
  const registration = await context.post("/api/auth/register", {
    data: { email, username: `Purchase ${label} ${stamp.slice(-6)}`, password }
  });
  const payload = await responseBody(registration);
  assert(registration.ok(), `Could not register ${label}: ${registration.status()} ${JSON.stringify(payload)}`);
  userIds.push(payload.user.id);
  return { context, id: payload.user.id as string, uuid: crypto.randomUUID() };
}

async function buy(context: APIRequestContext, itemId: string, requestId = crypto.randomUUID()) {
  const response = await context.post("/api/player/purchase", { data: { itemId, requestId } });
  return { response, body: await responseBody(response), requestId };
}

async function main() {
  const owner = await prisma.user.create({
    data: { email: `purchase-owner-${stamp}@example.test`, username: "Purchase Audit Owner", passwordHash: "audit" }
  });
  userIds.push(owner.id);
  const buyerA = await register("buyer-a", "2001:db8:1::1");
  const buyerB = await register("buyer-b", "2001:db8:2::1");
  const offlineBuyer = await register("offline", "2001:db8:3::1");

  try {
    await prisma.user.updateMany({
      where: { id: { in: [buyerA.id, buyerB.id, offlineBuyer.id] } },
      data: { walletPoints: 1_000 }
    });
    await Promise.all([
      prisma.user.update({ where: { id: buyerA.id }, data: { minecraftUuid: buyerA.uuid, minecraftName: "PurchaseAuditA" } }),
      prisma.user.update({ where: { id: buyerB.id }, data: { minecraftUuid: buyerB.uuid, minecraftName: "PurchaseAuditB" } }),
      prisma.user.update({ where: { id: offlineBuyer.id }, data: { minecraftUuid: offlineBuyer.uuid, minecraftName: "PurchaseOffline" } })
    ]);
    await prisma.server.create({
      data: {
        id: serverId,
        ownerId: owner.id,
        slug: serverId,
        name: "Purchase Delivery Audit",
        host: `${stamp}.purchase.example.test`,
        port: 25565,
        version: "1.21.11",
        description: "Temporary bounded purchase delivery audit server.",
        region: "GLOBAL",
        tags: "Audit,Delivery",
        pluginSecret: protectPluginSecret(secret)
      }
    });
    const item = await prisma.storeItem.create({
      data: {
        serverId,
        name: "Purchase audit apple",
        description: "Temporary test item.",
        pricePoints: 20,
        command: "give {player} minecraft:apple 1"
      }
    });

    const idempotencyKey = crypto.randomUUID();
    const first = await buy(buyerA.context, item.id, idempotencyKey);
    const retry = await buy(buyerA.context, item.id, idempotencyKey);
    assert(first.response.ok() && retry.response.ok(), "Idempotent purchase request failed");
    assert(first.body.purchaseId === retry.body.purchaseId, "Idempotent retry created a different purchase");
    const idempotentState = await prisma.user.findUniqueOrThrow({ where: { id: buyerA.id }, select: { walletPoints: true } });
    assert(idempotentState.walletPoints === 980, `Idempotent retry charged twice; wallet is ${idempotentState.walletPoints}`);
    assert(await prisma.purchase.count({ where: { buyerId: buyerA.id } }) === 1, "Idempotent retry created another row");

    for (let index = 0; index < 4; index++) {
      const purchase = await buy(buyerA.context, item.id);
      assert(purchase.response.ok(), `Allowed purchase ${index + 2} was rejected: ${purchase.response.status()}`);
    }
    const throttled = await buy(buyerA.context, item.id);
    assert(throttled.response.status() === 429, `Sixth purchase in one minute returned ${throttled.response.status()} instead of 429`);

    await prisma.purchase.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        buyerId: buyerB.id,
        serverId,
        itemId: item.id,
        commandSnapshot: item.command,
        pricePointsSnapshot: item.pricePoints,
        requiresOnline: true,
        expiresAt: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000) + index)
      }))
    });
    const capped = await buy(buyerB.context, item.id);
    assert(capped.response.status() === 409, `Eleventh waiting delivery returned ${capped.response.status()} instead of 409`);
    assert(String(capped.body.error || "").includes("10 deliveries waiting"), `Queue cap response was unclear: ${JSON.stringify(capped.body)}`);

    const offlinePurchase = await prisma.purchase.create({
      data: {
        buyerId: offlineBuyer.id,
        serverId,
        itemId: item.id,
        commandSnapshot: item.command,
        pricePointsSnapshot: item.pricePoints,
        requiresOnline: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    const fairPull = await signedPost("/api/plugin/purchases/pull", {
      onlineMinecraftUuids: [buyerA.uuid, buyerB.uuid],
      limit: 2
    });
    assert(fairPull.response.ok && fairPull.body.purchases.length === 2, `Fair pull failed: ${JSON.stringify(fairPull.body)}`);
    const pulledUuids = new Set(fairPull.body.purchases.map((purchase: { uuid: string }) => purchase.uuid));
    assert(pulledUuids.has(buyerA.uuid) && pulledUuids.has(buyerB.uuid), "One buyer monopolized the first delivery batch");
    assert(!fairPull.body.purchases.some((purchase: { id: string }) => purchase.id === offlinePurchase.id), "Offline purchase was pulled automatically");
    assert(fairPull.body.purchases.every((purchase: { claimToken?: string }) => Boolean(purchase.claimToken)), "Pull did not issue claim tokens");

    const deliveredClaim = fairPull.body.purchases[0];
    const staleAck = await signedPost("/api/plugin/purchases/ack", {
      purchaseId: deliveredClaim.id,
      claimToken: crypto.randomUUID(),
      status: "DELIVERED",
      message: "stale audit claim"
    });
    assert(staleAck.response.status === 409, `Wrong claim token returned ${staleAck.response.status}`);
    const deliveredAck = await signedPost("/api/plugin/purchases/ack", {
      purchaseId: deliveredClaim.id,
      claimToken: deliveredClaim.claimToken,
      status: "DELIVERED",
      message: "audit delivery"
    });
    const repeatedAck = await signedPost("/api/plugin/purchases/ack", {
      purchaseId: deliveredClaim.id,
      claimToken: deliveredClaim.claimToken,
      status: "DELIVERED",
      message: "audit retry"
    });
    assert(deliveredAck.response.ok && repeatedAck.response.ok, "Delivered acknowledgement was not idempotent");

    const failedClaim = fairPull.body.purchases[1];
    const failedPurchase = await prisma.purchase.findUniqueOrThrow({ where: { id: failedClaim.id } });
    const walletBeforeRefund = await prisma.user.findUniqueOrThrow({ where: { id: failedPurchase.buyerId }, select: { walletPoints: true } });
    await prisma.storeItem.update({ where: { id: item.id }, data: { pricePoints: 999 } });
    const failedAck = await signedPost("/api/plugin/purchases/ack", {
      purchaseId: failedClaim.id,
      claimToken: failedClaim.claimToken,
      status: "FAILED",
      message: "audit command failure"
    });
    assert(failedAck.response.ok, `Failed acknowledgement was rejected: ${JSON.stringify(failedAck.body)}`);
    const walletAfterRefund = await prisma.user.findUniqueOrThrow({ where: { id: failedPurchase.buyerId }, select: { walletPoints: true } });
    assert(walletAfterRefund.walletPoints === walletBeforeRefund.walletPoints + 20, "Failure refund used the edited item price instead of the purchase snapshot");
    await prisma.storeItem.update({ where: { id: item.id }, data: { pricePoints: 20 } });

    await prisma.purchase.updateMany({
      where: { serverId, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "DELIVERED", deliveredAt: new Date(), claimToken: null, claimExpiresAt: null }
    });

    const expiringWallet = await prisma.user.findUniqueOrThrow({ where: { id: offlineBuyer.id }, select: { walletPoints: true } });
    const expired = await prisma.purchase.create({
      data: {
        buyerId: offlineBuyer.id,
        serverId,
        itemId: item.id,
        commandSnapshot: item.command,
        pricePointsSnapshot: 37,
        requiresOnline: true,
        expiresAt: new Date(Date.now() - 1_000)
      }
    });
    await signedPost("/api/plugin/purchases/pull", { onlineMinecraftUuids: [], limit: 1 });
    await signedPost("/api/plugin/purchases/pull", { onlineMinecraftUuids: [], limit: 1 });
    const [expiredAfter, expiringWalletAfter, expiryLedgers] = await Promise.all([
      prisma.purchase.findUniqueOrThrow({ where: { id: expired.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: offlineBuyer.id }, select: { walletPoints: true } }),
      prisma.pointLedger.count({ where: { userId: offlineBuyer.id, type: "PURCHASE_REFUND", note: { contains: "expired delivery" } } })
    ]);
    assert(expiredAfter.status === "REFUNDED", "Expired purchase was not refunded");
    assert(expiringWalletAfter.walletPoints === expiringWallet.walletPoints + 37, "Expired purchase refund was not exact");
    assert(expiryLedgers === 1, `Expired purchase created ${expiryLedgers} refunds instead of one`);

    const oldClaim = crypto.randomUUID();
    const recoverable = await prisma.purchase.create({
      data: {
        buyerId: buyerA.id,
        serverId,
        itemId: item.id,
        status: "PROCESSING",
        commandSnapshot: item.command,
        pricePointsSnapshot: 20,
        requiresOnline: true,
        claimToken: oldClaim,
        claimExpiresAt: new Date(Date.now() - 1_000),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    const recovered = await signedPost("/api/plugin/purchases/pull", { onlineMinecraftUuids: [buyerA.uuid], limit: 1 });
    assert(recovered.body.purchases?.[0]?.id === recoverable.id, "Expired delivery claim was not recovered");
    assert(recovered.body.purchases[0].claimToken !== oldClaim, "Recovered delivery reused its stale claim token");
    await signedPost("/api/plugin/purchases/ack", {
      purchaseId: recoverable.id,
      claimToken: recovered.body.purchases[0].claimToken,
      status: "DELIVERED"
    });

    const single = await prisma.purchase.create({
      data: {
        buyerId: buyerB.id,
        serverId,
        itemId: item.id,
        commandSnapshot: item.command,
        pricePointsSnapshot: 20,
        requiresOnline: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    const concurrentPulls = await Promise.all([
      signedPost("/api/plugin/purchases/pull", { onlineMinecraftUuids: [buyerB.uuid], limit: 1 }),
      signedPost("/api/plugin/purchases/pull", { onlineMinecraftUuids: [buyerB.uuid], limit: 1 })
    ]);
    const concurrentIds = concurrentPulls.flatMap((entry) => entry.body.purchases.map((purchase: { id: string }) => purchase.id));
    assert(concurrentIds.filter((id) => id === single.id).length === 1, "Concurrent pollers claimed the same delivery more than once");

    console.log(JSON.stringify({
      ok: true,
      checks: {
        idempotentPurchaseCharge: true,
        accountPurchaseRateLimit: true,
        perPlayerServerQueueCap: true,
        fairPlayerRoundRobin: true,
        offlineBacklogDoesNotBlock: true,
        exclusiveExpiringClaim: true,
        staleClaimRejected: true,
        idempotentDeliveryAck: true,
        purchasePriceSnapshotRefund: true,
        automaticExpiryRefundOnce: true,
        expiredClaimRecovery: true,
        concurrentPullClaimsOnce: true
      }
    }, null, 2));
  } finally {
    await buyerA.context.dispose();
    await buyerB.context.dispose();
    await offlineBuyer.context.dispose();
  }
}

async function run() {
  try {
    await main();
  } finally {
    await prisma.pointLedger.deleteMany({ where: { serverId } });
    await prisma.server.deleteMany({ where: { id: serverId } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
