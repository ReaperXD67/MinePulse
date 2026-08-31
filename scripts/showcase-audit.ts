import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { bridgeStateAt } from "../lib/server-liveness";

const expected = [
  { id: "demo-server-skyforge", port: 25565, banner: "/showcase/skyforge-economy.png" },
  { id: "demo-server-ember", port: 25566, banner: "/showcase/ember-smp.png" },
  { id: "demo-server-voidcraft", port: 25567, banner: "/showcase/voidcraft-hardcore.png" }
] as const;
const connectionString = process.env.DATABASE_URL;
if (!connectionString?.startsWith("postgresql://") && !connectionString?.startsWith("postgres://")) {
  throw new Error("DATABASE_URL must point to PostgreSQL");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const failures: string[] = [];
const showcaseLaunchAt = new Date("2026-08-31T16:00:00.000Z");

function check(condition: unknown, message: string) {
  if (!condition) failures.push(message);
}

async function main() {
  const servers = await prisma.server.findMany({
    where: { id: { in: expected.map((server) => server.id) } },
    include: { items: { where: { status: "ACTIVE" }, orderBy: { id: "asc" } } },
    orderBy: { port: "asc" }
  });
  const officialCount = await prisma.server.count({ where: { isOfficialShowcase: true } });
  const [legacySessions, legacyStats, legacyReviews] = await Promise.all([
    prisma.serverSession.count({ where: { serverId: { in: expected.map((server) => server.id) }, startedAt: { lt: showcaseLaunchAt } } }),
    prisma.serverHourlyStat.count({ where: { serverId: { in: expected.map((server) => server.id) }, hourStart: { lt: showcaseLaunchAt } } }),
    prisma.comment.count({ where: { serverId: { in: expected.map((server) => server.id) }, createdAt: { lt: showcaseLaunchAt } } })
  ]);
  check(servers.length === expected.length, `Expected ${expected.length} showcase servers; found ${servers.length}`);
  check(officialCount === expected.length, `Expected exactly ${expected.length} official showcase records; found ${officialCount}`);
  check(legacySessions === 0, `${legacySessions} pre-launch demo sessions remain visible`);
  check(legacyStats === 0, `${legacyStats} pre-launch hourly demo stats remain visible`);
  check(legacyReviews === 0, `${legacyReviews} pre-launch demo reviews remain visible`);

  const ports = new Set<number>();
  const banners = new Set<string>();
  for (const definition of expected) {
    const server = servers.find((candidate) => candidate.id === definition.id);
    if (!server) continue;
    check(server.isOfficialShowcase, `${server.id} is not labeled as an official showcase`);
    check(server.status === "ACTIVE", `${server.id} status is ${server.status}`);
    check(server.trustStatus === "VERIFIED", `${server.id} trust status is ${server.trustStatus}`);
    check(server.pointPool > 0, `${server.id} campaign pool is empty`);
    check(server.port === definition.port, `${server.id} uses unexpected port ${server.port}`);
    check(server.bannerImage === definition.banner, `${server.id} uses unexpected banner ${server.bannerImage}`);
    check(server.host !== "localhost" && !server.host.endsWith(".local"), `${server.id} does not use a public hostname`);
    check(bridgeStateAt(server) === "online", `${server.id} bridge is ${bridgeStateAt(server)}`);
    check(server.items.length === 2, `${server.id} should expose exactly two active demo items`);
    for (const item of server.items) {
      check(item.requiresOnline, `${item.id} must require the player to be online`);
      check(/^give \{player\} minecraft:[a-z0-9_]+ [1-9][0-9]*$/.test(item.command), `${item.id} does not use an approved vanilla give command`);
      check(item.pricePoints >= 60 && item.pricePoints <= 180, `${item.id} has an unsuitable demonstration price`);
    }
    ports.add(server.port);
    if (server.bannerImage) banners.add(server.bannerImage);
  }
  check(ports.size === expected.length, "Showcase ports are not unique");
  check(banners.size === expected.length, "Showcase banners are not unique");

  if (process.env.SHOWCASE_REQUIRE_PUBLIC_LIVE === "true") {
    const baseUrl = (process.env.APP_BASE_URL || "https://karixmc.pl").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/marketplace/live`, { signal: AbortSignal.timeout(10_000) });
    check(response.ok, `Public marketplace liveness returned HTTP ${response.status}`);
    if (response.ok) {
      const payload = await response.json() as { serverIds?: unknown };
      const ids = Array.isArray(payload.serverIds) ? new Set(payload.serverIds) : new Set();
      for (const server of expected) check(ids.has(server.id), `${server.id} is absent from the public live directory`);
    }
  }

  if (failures.length) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    throw new Error(`Showcase audit failed with ${failures.length} problem(s)`);
  }
  console.log(`Showcase audit passed: ${servers.length} distinct, funded, live, officially labeled servers with ${servers.reduce((count, server) => count + server.items.length, 0)} safe store items.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
