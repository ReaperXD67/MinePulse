import crypto from "node:crypto";
import { hash } from "bcryptjs";
import { request } from "playwright";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, UserRole } from "../lib/generated/prisma/client";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db"
});
const prisma = new PrismaClient({ adapter });
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const adminEmail = `fleet-admin-${stamp}@example.test`;
const ownerEmail = `fleet-owner-${stamp}@example.test`;
const password = crypto.randomBytes(18).toString("base64url");
const secret = crypto.randomBytes(32).toString("hex");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const passwordHash = await hash(password, 12);
  const [admin, owner] = await Promise.all([
    prisma.user.create({
      data: { email: adminEmail, username: "Fleet Audit Admin", passwordHash, role: UserRole.ADMIN }
    }),
    prisma.user.create({
      data: { email: ownerEmail, username: "Fleet Audit Owner", passwordHash }
    })
  ]);
  const server = await prisma.server.create({
    data: {
      ownerId: owner.id,
      slug: `fleet-audit-${stamp}`,
      name: "Fleet Policy Audit",
      host: `fleet-${stamp}.example.test`,
      version: "1.21.11",
      description: "Temporary server used to verify central protection policy synchronization.",
      region: "TEST",
      tags: "Parkour,Audit",
      pluginSecret: secret,
      pointPool: 1000
    }
  });

  const api = await request.newContext({ baseURL: baseUrl });
  try {
    const login = await api.post("/api/auth/login", { data: { email: adminEmail, password } });
    assert(login.ok(), `Admin login failed: ${login.status()} ${await login.text()}`);

    const update = await api.patch(`/api/admin/servers/${server.id}`, {
      data: {
        adjustPoints: 1250,
        afkTimeoutSeconds: 420,
        challengeEnabled: true,
        challengeIntervalSeconds: 720,
        challengeAnswerWindowSeconds: 75,
        challengeRequired: true,
        heartbeatIntervalSeconds: 25,
        purchasePollSeconds: 20,
        minimumMovementDistance: 0.35,
        minimumActivityEvents: 2,
        botProtectionLevel: 3
      }
    });
    assert(update.ok(), `Admin policy update failed: ${update.status()} ${await update.text()}`);

    const updated = await prisma.server.findUniqueOrThrow({ where: { id: server.id } });
    assert(updated.pointPool === 2250, "Campaign pool adjustment was not persisted");
    assert(updated.pluginConfigRevision === 2, "Plugin policy revision was not incremented");
    assert(updated.afkTimeoutSeconds === 420, "AFK timeout was not persisted");
    assert(updated.challengeIntervalSeconds === 720, "Challenge interval was not persisted");
    assert(updated.challengeAnswerWindowSeconds === 75, "Answer window was not persisted");
    assert(updated.minimumActivityEvents === 2, "Activity threshold was not persisted");
    assert(updated.botProtectionLevel === 3, "Protection level was not persisted");

    const config = await api.post("/api/plugin/config", { data: { serverId: server.id, secret } });
    assert(config.ok(), `Plugin config fetch failed: ${config.status()} ${await config.text()}`);
    const payload = await config.json();
    assert(payload.policy.revision === 2, "Plugin received the wrong policy revision");
    assert(payload.policy.afkTimeoutSeconds === 420, "Plugin received the wrong AFK timeout");
    assert(payload.policy.challengeIntervalSeconds === 720, "Plugin received the wrong challenge interval");
    assert(payload.policy.challengeAnswerWindowSeconds === 75, "Plugin received the wrong answer window");
    assert(payload.policy.botProtectionLevel === 3, "Plugin received the wrong protection level");

    console.log(JSON.stringify({ ok: true, serverId: server.id, revision: payload.policy.revision }, null, 2));
  } finally {
    await api.dispose();
    await prisma.server.deleteMany({ where: { id: server.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, owner.id] } } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
