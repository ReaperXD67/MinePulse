import crypto from "node:crypto";
import { request, type APIRequestContext, type APIResponse } from "playwright";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./prisma/dev.db" });
const prisma = new PrismaClient({ adapter });
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
    const second = await createServer(owner, 2);
    assert(first.response.ok() && second.response.ok(), "The first two server listings were not accepted");

    const blocked = await createServer(owner, 3);
    assert(blocked.response.status() === 409, `Third server returned ${blocked.response.status()} instead of 409`);
    assert(String(blocked.payload.error || "").includes("at most 2"), `Third-server error was unclear: ${JSON.stringify(blocked.payload)}`);
    const cappedAccount = await owner.get("/account");
    const cappedAccountHtml = await cappedAccount.text();
    const normalizedAccountHtml = cappedAccountHtml.replace(/<!--.*?-->/g, "");
    assert(cappedAccount.ok(), `Capped Creator Studio returned ${cappedAccount.status()}`);
    assert(normalizedAccountHtml.includes("2/2 listings used"), "Creator Studio did not show the listing usage counter");
    assert(normalizedAccountHtml.includes("Two-server limit reached"), "Creator Studio did not disable publishing at the cap");

    const removed = await owner.delete(`/api/owner/servers/${second.payload.serverId}`, { data: {} });
    assert(removed.ok(), `Could not remove the second listing (${removed.status()})`);
    const replacement = await createServer(owner, 4);
    assert(replacement.response.ok(), `A removed listing did not free a slot: ${JSON.stringify(replacement.payload)}`);

    await prisma.serverSession.create({
      data: {
        serverId: first.payload.serverId,
        userId: reviewerId,
        minecraftName: "GuardrailReviewer",
        activeSeconds: 60,
        integrityVerified: true,
        status: "CLOSED",
        endedAt: new Date()
      }
    });

    const firstReview = await reviewer.post("/api/marketplace/interact", {
      data: { serverId: first.payload.serverId, type: "comment", body: "The first version of this verified review." }
    });
    const secondReview = await reviewer.post("/api/marketplace/interact", {
      data: { serverId: first.payload.serverId, type: "comment", body: "The updated and only verified review." }
    });
    assert(firstReview.ok() && secondReview.ok(), "Creating or updating a verified review failed");
    const secondReviewBody = await body(secondReview);
    assert(secondReviewBody.message === "Review updated", `Review update was not identified: ${JSON.stringify(secondReviewBody)}`);

    const storedReviews = await prisma.comment.findMany({
      where: { serverId: first.payload.serverId, userId: reviewerId }
    });
    assert(storedReviews.length === 1, `Expected one stored review, received ${storedReviews.length}`);
    assert(storedReviews[0].body === "The updated and only verified review.", "The stored review was not updated");

    console.log(JSON.stringify({
      ok: true,
      checks: {
        firstTwoServersAllowed: true,
        thirdServerBlocked: true,
        capVisibleInCreatorStudio: true,
        removedServerFreesSlot: true,
        oneReviewPerPlayerServer: true,
        existingReviewUpdated: true
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
