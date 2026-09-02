import crypto from "node:crypto";
import { request, type APIRequestContext, type APIResponse } from "playwright";
import { createScriptPrisma } from "./database-client";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const prisma = createScriptPrisma();
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const password = `Guardrails!Audit!Passphrase!${stamp}`;
const auditAddress = `2001:db8::${crypto.randomBytes(8).toString("hex")}`;
const userIds: string[] = [];
const serverIds: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function body(response: APIResponse) {
  return response.json().catch(() => ({}));
}

async function register(context: APIRequestContext, label: string) {
  const response = await context.post("/api/auth/register", {
    data: {
      email: `guardrails-${label}-${stamp}@example.test`,
      username: `Guardrails ${label} ${stamp.slice(-6)}`,
      password
    }
  });
  const payload = await body(response);
  assert(response.ok(), `Could not register ${label} (${response.status()}): ${JSON.stringify(payload)}`);
  userIds.push(payload.user.id);
  return payload.user.id as string;
}

function serverPayload(position: number) {
  return {
    name: `Guardrail Server ${position} ${stamp}`,
    host: `${position}.${stamp}.guardrails.example.test`,
    port: 25565,
    minVersion: "1.21.11",
    maxVersion: "1.21.11",
    region: "GLOBAL",
    tags: "Audit,Guardrails",
    description: "A temporary listing used to verify marketplace account limits.",
    longDescription: "",
    rules: "",
    galleryImages: "",
    bannerImage: "/voxel-network.png",
    websiteUrl: "",
    discordUrl: "",
    supportUrl: "",
    rewardRatePerSecond: 1,
    maxPaidPlayers: 20,
    minPlaySecondsForComment: 60
  };
}

async function createServer(owner: APIRequestContext, position: number) {
  const response = await owner.post("/api/owner/servers", { data: serverPayload(position) });
  const payload = await body(response);
  if (response.ok()) serverIds.push(payload.serverId);
  return { response, payload };
}

async function main() {
  const contextOptions = { baseURL: baseUrl, extraHTTPHeaders: { "x-forwarded-for": auditAddress } };
  const owner = await request.newContext(contextOptions);
  const reviewer = await request.newContext(contextOptions);
  try {
    await register(owner, "owner");
    const reviewerId = await register(reviewer, "reviewer");

    const first = await createServer(owner, 1);
    assert(first.response.ok(), "The first server listing was not accepted");

    const blocked = await createServer(owner, 2);
    assert(blocked.response.status() === 409, `Second server returned ${blocked.response.status()} instead of 409`);
    assert(String(blocked.payload.error || "").includes("one current server listing"), `Second-server error was unclear: ${JSON.stringify(blocked.payload)}`);
    const cappedAccount = await owner.get("/account");
    const cappedAccountHtml = await cappedAccount.text();
    const normalizedAccountHtml = cappedAccountHtml.replace(/<!--.*?-->/g, "");
    assert(cappedAccount.ok(), `Capped Creator Studio returned ${cappedAccount.status()}`);
    assert(normalizedAccountHtml.includes("1/1 member listing used"), "Creator Studio did not show the listing usage counter");
    assert(normalizedAccountHtml.includes("One-listing limit reached"), "Creator Studio did not disable publishing at the cap");

    const removed = await owner.delete(`/api/owner/servers/${first.payload.serverId}`, { data: {} });
    assert(removed.ok(), `Could not remove the first listing (${removed.status()})`);
    const replacement = await createServer(owner, 3);
    assert(replacement.response.ok(), `A removed listing did not free a slot: ${JSON.stringify(replacement.payload)}`);

    await prisma.serverSession.create({
      data: {
        serverId: replacement.payload.serverId,
        userId: reviewerId,
        minecraftName: "GuardrailReviewer",
        activeSeconds: 60,
        integrityVerified: true,
        status: "CLOSED",
        endedAt: new Date()
      }
    });
    await prisma.server.update({
      where: { id: replacement.payload.serverId },
      data: { lastConfigSyncAt: new Date() }
    });

    const firstReview = await reviewer.post("/api/marketplace/interact", {
      data: { serverId: replacement.payload.serverId, type: "comment", body: "The first version of this verified review." }
    });
    const secondReview = await reviewer.post("/api/marketplace/interact", {
      data: { serverId: replacement.payload.serverId, type: "comment", body: "The updated and only verified review." }
    });
    assert(firstReview.ok() && secondReview.ok(), "Creating or updating a verified review failed");
    const secondReviewBody = await body(secondReview);
    assert(secondReviewBody.message === "Review updated", `Review update was not identified: ${JSON.stringify(secondReviewBody)}`);

    const storedReviews = await prisma.comment.findMany({
      where: { serverId: replacement.payload.serverId, userId: reviewerId }
    });
    assert(storedReviews.length === 1, `Expected one stored review, received ${storedReviews.length}`);
    assert(storedReviews[0].body === "The updated and only verified review.", "The stored review was not updated");

    await prisma.user.update({
      where: { id: reviewerId },
      data: { minecraftUuid: crypto.randomUUID(), minecraftName: "GuardrailReviewer", walletPoints: 100 }
    });
    const concurrentItem = await prisma.storeItem.create({
      data: {
        serverId: replacement.payload.serverId,
        name: "Concurrent purchase audit item",
        description: "One-wallet-balance concurrency check.",
        pricePoints: 100,
        command: "give {player} minecraft:apple 1"
      }
    });
    const purchaseAttempts = await Promise.all([
      reviewer.post("/api/player/purchase", { data: { itemId: concurrentItem.id } }),
      reviewer.post("/api/player/purchase", { data: { itemId: concurrentItem.id } })
    ]);
    const purchaseStatuses = purchaseAttempts.map((response) => response.status()).sort((left, right) => left - right);
    assert(
      purchaseStatuses[0] === 200 && purchaseStatuses[1] === 400,
      `Concurrent purchases returned ${purchaseStatuses.join(", ")} instead of one success and one rejection`
    );
    const successfulPurchase = purchaseAttempts.find((response) => response.ok());
    const successfulPurchaseBody = successfulPurchase ? await body(successfulPurchase) : {};
    assert(
      String(successfulPurchaseBody.message || "").includes("/receive"),
      `Purchase success did not explain delivery: ${JSON.stringify(successfulPurchaseBody)}`
    );
    const [purchaseCount, purchaseLedgerCount, purchaseBuyer] = await Promise.all([
      prisma.purchase.count({ where: { buyerId: reviewerId, itemId: concurrentItem.id } }),
      prisma.pointLedger.count({ where: { userId: reviewerId, type: "PLAYER_SPEND" } }),
      prisma.user.findUniqueOrThrow({ where: { id: reviewerId }, select: { walletPoints: true } })
    ]);
    assert(purchaseCount === 1, `Concurrent requests created ${purchaseCount} purchases`);
    assert(purchaseLedgerCount === 1, `Concurrent requests created ${purchaseLedgerCount} spend ledgers`);
    assert(purchaseBuyer.walletPoints === 0, `Concurrent requests left wallet at ${purchaseBuyer.walletPoints}`);

    console.log(JSON.stringify({
      ok: true,
      checks: {
        firstServerAllowed: true,
        secondServerBlocked: true,
        capVisibleInCreatorStudio: true,
        removedServerFreesSlot: true,
        oneReviewPerPlayerServer: true,
        existingReviewUpdated: true,
        atomicPurchaseBalance: true,
        purchaseDeliveryGuidance: true
      }
    }, null, 2));
  } finally {
    await owner.dispose();
    await reviewer.dispose();
  }
}

async function run() {
  try {
    await main();
  } finally {
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
