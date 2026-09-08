import crypto from "node:crypto";
import { createScriptPrisma } from "./database-client";

const prisma = createScriptPrisma();

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const ownerEmail = `campaign-owner-${stamp}@example.test`;
const otherEmail = `campaign-other-${stamp}@example.test`;
const serverId = `campaign-grant-${stamp}`;
let ownerId = "";
let otherId = "";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const owner = await prisma.user.create({
    data: { email: ownerEmail, username: `CampaignOwner${stamp.slice(-4)}`, passwordHash: "audit" }
  });
  const other = await prisma.user.create({
    data: { email: otherEmail, username: `CampaignOther${stamp.slice(-4)}`, passwordHash: "audit" }
  });
  ownerId = owner.id;
  otherId = other.id;
  await prisma.server.create({
    data: {
      id: serverId,
      ownerId,
      slug: serverId,
      name: "Campaign Grant Audit",
      host: `${stamp}.example.test`,
      version: "1.21.x",
      description: "Temporary admin campaign grant audit server.",
      region: "TEST",
      tags: "Test",
      pluginSecret: crypto.randomBytes(32).toString("hex"),
      pointPool: 1000
    }
  });

  const unauthorized = await fetch(`${baseUrl}/api/admin/users/search?q=campaign`);
  assert(unauthorized.status === 401, `Unauthenticated search returned ${unauthorized.status}`);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@minepulse.local", password: "admin123" })
  });
  assert(login.ok, `Admin login failed (${login.status})`);
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert(cookie, "Admin login did not return a session cookie");
  const headers = { "content-type": "application/json", cookie: cookie! };

  const search = await fetch(`${baseUrl}/api/admin/users/search?q=${encodeURIComponent(ownerEmail.slice(0, 24))}`, {
    headers: { cookie: cookie! }
  });
  const searchPayload = await search.json();
  assert(search.ok, `Admin account search failed (${search.status})`);
  assert(
    searchPayload.accounts?.some((account: { id: string }) => account.id === ownerId),
    "Search did not return the campaign owner"
  );
  assert(searchPayload.accounts.length <= 12, "Account search returned more than the bounded result set");
  assert(
    searchPayload.accounts.find((account: { id: string }) => account.id === ownerId)?.walletPoints === 0,
    "Account search did not return the wallet balance"
  );

  const mismatched = await fetch(`${baseUrl}/api/admin/campaign-grants`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      userId: otherId,
      serverId,
      amountPoints: 12345,
      description: "Ownership mismatch audit"
    })
  });
  assert(mismatched.status === 409, `Ownership mismatch returned ${mismatched.status}`);

  const grant = await fetch(`${baseUrl}/api/admin/campaign-grants`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      userId: ownerId,
      serverId,
      amountPoints: 12345,
      description: "Acceptance test campaign funding"
    })
  });
  const grantPayload = await grant.json();
  assert(grant.ok, `Campaign grant failed (${grant.status}): ${JSON.stringify(grantPayload)}`);

  const [server, ledgers, billings] = await Promise.all([
    prisma.server.findUniqueOrThrow({ where: { id: serverId } }),
    prisma.pointLedger.findMany({ where: { serverId, type: "ADMIN_ADJUSTMENT" } }),
    prisma.billingLedger.findMany({ where: { serverId, kind: "ADMIN_ADJUSTMENT" } })
  ]);
  assert(server.pointPool === 13345, `Expected pool 13345, received ${server.pointPool}`);
  assert(ledgers.length === 1 && ledgers[0].balanceAfter === 13345, "Point ledger balance trail is incorrect");
  assert(billings.length === 1 && billings[0].ownerId === ownerId, "Billing audit entry is incorrect");

  const premiumGrantStartedAt = Date.now();
  const premiumGrant = await fetch(`${baseUrl}/api/admin/servers/${serverId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      premiumPlan: "GOLD",
      premiumDays: 14,
      description: "Acceptance test confirmed bank transfer GOLD"
    })
  });
  assert(premiumGrant.ok, `Premium grant failed (${premiumGrant.status}): ${await premiumGrant.text()}`);

  const [premiumServer, premiumBilling] = await Promise.all([
    prisma.server.findUniqueOrThrow({ where: { id: serverId } }),
    prisma.billingLedger.findFirstOrThrow({
      where: { serverId, planCode: "GOLD" },
      orderBy: { createdAt: "desc" }
    })
  ]);
  const premiumDays = (premiumServer.premiumUntil!.getTime() - premiumGrantStartedAt) / (24 * 60 * 60 * 1000);
  assert(premiumServer.premiumPlan === "GOLD", "Premium plan was not activated");
  assert(premiumDays > 13.99 && premiumDays <= 14.01, `Premium duration is not 14 days (${premiumDays})`);
  assert(premiumBilling.ownerId === ownerId, "Premium billing entry is not attached to the server owner");
  assert(premiumBilling.note.includes("confirmed bank transfer"), "Premium billing entry lost the bank reference");

  console.log(JSON.stringify({
    ok: true,
    checks: {
      adminOnly: true,
      accountSearch: true,
      ownershipValidation: true,
      grantedPoints: 12345,
      resultingPool: server.pointPool,
      pointLedger: ledgers.length,
      billingLedger: billings.length,
      premiumPlan: premiumServer.premiumPlan,
      premiumDays: 14,
      premiumOwnerAudit: true
    }
  }, null, 2));
}

async function cleanup() {
  await prisma.pointLedger.deleteMany({ where: { serverId } });
  await prisma.billingLedger.deleteMany({ where: { serverId } });
  await prisma.server.deleteMany({ where: { id: serverId } });
  if (ownerId || otherId) {
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId].filter(Boolean) } } });
  }
  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
