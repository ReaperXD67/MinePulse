import crypto from "node:crypto";
import { request } from "playwright";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db"
});
const prisma = new PrismaClient({ adapter });
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const serverName = `Removal Audit ${stamp}`;
let serverId = "";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const context = await request.newContext({ baseURL: baseUrl });
  try {
    const login = await context.post("/api/auth/login", {
      data: { email: "owner@minepulse.local", password: "owner123" }
    });
    assert(login.ok(), `Owner login failed with ${login.status()}`);

    const created = await context.post("/api/owner/servers", {
      data: {
        name: serverName,
        host: `${stamp}.example.test`,
        port: 25565,
        minVersion: "1.21.11",
        maxVersion: "1.21.11",
        region: "GLOBAL",
        tags: "Audit,Removal",
        description: "Temporary listing used to verify the soft-delete workflow.",
        longDescription: "",
        rules: "",
        galleryImages: "",
        websiteUrl: "",
        discordUrl: "",
        supportUrl: "",
        rewardRatePerSecond: 1,
        maxPaidPlayers: 20,
        minPlaySecondsForComment: 1800
      }
    });
    const createdBody = await created.json();
    assert(created.ok(), `Server creation failed with ${created.status()}: ${JSON.stringify(createdBody)}`);
    serverId = createdBody.serverId;

    const removed = await context.delete(`/api/owner/servers/${serverId}`, { data: {} });
    const removedBody = await removed.json();
    assert(removed.ok(), `Server removal failed with ${removed.status()}: ${JSON.stringify(removedBody)}`);

    const stored = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    assert(stored.status === "REMOVED", `Expected REMOVED status, received ${stored.status}`);

    const account = await context.get("/account");
    const accountHtml = await account.text();
    assert(account.ok(), `Account page failed with ${account.status()}`);
    assert(!accountHtml.includes(serverName), "Removed listing still appears in Creator Studio");

    console.log(JSON.stringify({
      ok: true,
      checks: {
        softDeleted: stored.status === "REMOVED",
        hiddenFromCreatorStudio: !accountHtml.includes(serverName),
        auditRecordPreserved: true
      }
    }, null, 2));
  } finally {
    await context.dispose();
  }
}

async function run() {
  try {
    await main();
  } finally {
    if (serverId) await prisma.server.deleteMany({ where: { id: serverId } });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
