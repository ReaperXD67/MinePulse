import { PrismaPg } from "@prisma/adapter-pg";
import {
  PremiumPlanCode,
  PrismaClient,
  ServerStatus,
  StoreItemStatus,
  TrustStatus
} from "../lib/generated/prisma/client";
import { protectPluginSecret } from "../lib/plugin-credentials";

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.startsWith("postgresql://") && !connectionString?.startsWith("postgres://")) {
  throw new Error("DATABASE_URL must point to PostgreSQL");
}

const ownerEmail = (process.env.SHOWCASE_OWNER_EMAIL || "karixai@proton.me").trim().toLowerCase();
const publicHost = (process.env.SHOWCASE_PUBLIC_HOST || "karixmc.pl").trim().toLowerCase();
const appBaseUrl = (process.env.APP_BASE_URL || `https://${publicHost}`).replace(/\/$/, "");
const discordUrl = process.env.NEXT_PUBLIC_DISCORD_URL?.trim() || null;

const secrets = {
  skyforge: process.env.SHOWCASE_SKYFORGE_SECRET || "",
  ember: process.env.SHOWCASE_EMBER_SECRET || "",
  voidcraft: process.env.SHOWCASE_VOIDCRAFT_SECRET || ""
};

for (const [name, secret] of Object.entries(secrets)) {
  if (secret.length < 32) throw new Error(`SHOWCASE_${name.toUpperCase()}_SECRET must contain at least 32 characters`);
}
if (new Set(Object.values(secrets)).size !== Object.values(secrets).length) {
  throw new Error("Every showcase server must use a distinct plugin secret");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const definitions = [
  {
    id: "demo-server-skyforge",
    slug: "skyforge-economy",
    name: "Skyforge Economy",
    port: 25565,
    tags: "Survival,Economy,Starter-friendly",
    description: "Official KarixMC economy demo: join a real Paper world and verify rewards and store delivery end to end.",
    longDescription: "Skyforge is a first-party KarixMC showcase world built for product demonstrations. Play normal survival, link your Minecraft identity, earn campaign points while active, then redeem a practical starter item that the live bridge delivers in game. Activity and player counts shown here come from the running server; no players or reviews are simulated.",
    rules: "Use one KarixMC account per player\nNo hacked clients, macros, or AFK reward farming\nKeep chat and builds suitable for a public demonstration\nReport reward or delivery problems through KarixMC support",
    bannerImage: "/showcase/skyforge-economy.png",
    pointPool: 250_000,
    rewardRatePerSecond: 1,
    maxPaidPlayers: 32,
    secret: secrets.skyforge,
    items: [
      { id: "showcase-skyforge-pickaxe", name: "Iron Pickaxe", description: "A vanilla iron pickaxe delivered immediately while you are online.", pricePoints: 60, command: "give {player} minecraft:iron_pickaxe 1" },
      { id: "showcase-skyforge-apples", name: "Golden Apple Pack", description: "Four vanilla golden apples for your survival session.", pricePoints: 120, command: "give {player} minecraft:golden_apple 4" }
    ]
  },
  {
    id: "demo-server-ember",
    slug: "ember-smp",
    name: "Ember SMP",
    port: 25566,
    tags: "SMP,Co-op,Builder-friendly",
    description: "Official KarixMC community demo: a second live world proving multi-server rewards and delivery isolation.",
    longDescription: "Ember is a separate first-party Paper instance used to prove that KarixMC keeps sessions, campaign balances, and purchases isolated per server. It is intentionally lightweight and close to vanilla so a creator can join quickly, move between worlds, and observe the signed bridge behavior without custom gameplay dependencies.",
    rules: "No griefing or stealing from another player's build\nNo automation created to farm KarixMC rewards\nRespect other players and keep chat welcoming\nUse the support link for bridge or store issues",
    bannerImage: "/showcase/ember-smp.png",
    pointPool: 180_000,
    rewardRatePerSecond: 1,
    maxPaidPlayers: 24,
    secret: secrets.ember,
    items: [
      { id: "showcase-ember-food", name: "Explorer Food Pack", description: "Thirty-two cooked beef delivered with a vanilla command.", pricePoints: 60, command: "give {player} minecraft:cooked_beef 32" },
      { id: "showcase-ember-rockets", name: "Firework Rocket Pack", description: "Sixteen flight-duration-one rockets for exploration.", pricePoints: 150, command: "give {player} minecraft:firework_rocket 16" }
    ]
  },
  {
    id: "demo-server-voidcraft",
    slug: "voidcraft-hardcore",
    name: "Voidcraft Hardcore",
    port: 25567,
    tags: "Hard,Survival,PvE",
    description: "Official KarixMC hard-mode demo: a third independent bridge, campaign, world, and reward store.",
    longDescription: "Voidcraft is the higher-difficulty first-party showcase. It runs as its own Paper process with its own world data, bridge secret, campaign, liveness signal, and purchase queue. The dramatic presentation is thematic; the directory still reports only genuine bridge and player telemetry.",
    rules: "Hard difficulty is enabled; prepare before exploring\nNo combat hacks, x-ray, macros, or reward farming\nOne linked Minecraft identity per KarixMC account\nReport exploits privately through KarixMC support",
    bannerImage: "/showcase/voidcraft-hardcore.png",
    pointPool: 125_000,
    rewardRatePerSecond: 1,
    maxPaidPlayers: 18,
    secret: secrets.voidcraft,
    items: [
      { id: "showcase-voidcraft-shield", name: "Survivor Shield", description: "One vanilla shield delivered while you are online.", pricePoints: 75, command: "give {player} minecraft:shield 1" },
      { id: "showcase-voidcraft-pearls", name: "Ender Pearl Pack", description: "Eight vanilla ender pearls for dangerous escapes.", pricePoints: 180, command: "give {player} minecraft:ender_pearl 8" }
    ]
  }
] as const;

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true, role: true } });
  if (!owner) throw new Error(`Showcase owner account ${ownerEmail} does not exist`);
  if (owner.role !== "ADMIN") throw new Error(`Showcase owner ${ownerEmail} must be an ADMIN`);

  const existingSlugs = await prisma.server.findMany({
    where: { slug: { in: definitions.map((server) => server.slug) } },
    select: { id: true, slug: true }
  });
  for (const row of existingSlugs) {
    const expected = definitions.find((server) => server.slug === row.slug);
    if (expected && expected.id !== row.id) {
      throw new Error(`Slug ${row.slug} belongs to unexpected server ${row.id}; refusing an ambiguous bootstrap`);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const definition of definitions) {
      const shared = {
        ownerId: owner.id,
        slug: definition.slug,
        name: definition.name,
        host: publicHost,
        port: definition.port,
        version: "1.21.4",
        description: definition.description,
        longDescription: definition.longDescription,
        rules: definition.rules,
        region: "EU",
        tags: definition.tags,
        bannerImage: definition.bannerImage,
        galleryImages: definition.bannerImage,
        websiteUrl: `${appBaseUrl}/servers/${definition.slug}`,
        discordUrl,
        supportUrl: `${appBaseUrl}/plugin#support`,
        isOfficialShowcase: true,
        status: ServerStatus.ACTIVE,
        trustStatus: TrustStatus.VERIFIED,
        riskScore: 0,
        rewardRatePerSecond: definition.rewardRatePerSecond,
        maxPaidPlayers: definition.maxPaidPlayers,
        minPlaySecondsForComment: 600,
        premiumPlan: PremiumPlanCode.NONE,
        premiumUntil: null,
        pluginSecret: protectPluginSecret(definition.secret),
        botProtectionLevel: 3,
        heartbeatIntervalSeconds: 20,
        purchasePollSeconds: 10,
        afkTimeoutSeconds: 180,
        challengeEnabled: true,
        challengeIntervalSeconds: 300,
        challengeAnswerWindowSeconds: 90,
        challengeRequired: true,
        minimumMovementDistance: 0.2,
        minimumActivityEvents: 1,
        integrityFailures: 0
      };

      await tx.server.upsert({
        where: { id: definition.id },
        create: {
          id: definition.id,
          ...shared,
          pointPool: definition.pointPool,
          pluginConfigRevision: 1
        },
        update: {
          ...shared,
          pluginConfigRevision: { increment: 1 }
        }
      });

      const officialItemIds = definition.items.map((item) => item.id);
      await tx.storeItem.updateMany({
        where: { serverId: definition.id, id: { notIn: officialItemIds } },
        data: { status: StoreItemStatus.HIDDEN }
      });
      for (const item of definition.items) {
        await tx.storeItem.upsert({
          where: { id: item.id },
          create: {
            ...item,
            serverId: definition.id,
            requiresOnline: true,
            status: StoreItemStatus.ACTIVE
          },
          update: {
            serverId: definition.id,
            name: item.name,
            description: item.description,
            pricePoints: item.pricePoints,
            command: item.command,
            requiresOnline: true,
            status: StoreItemStatus.ACTIVE
          }
        });
      }
    }

    await tx.server.updateMany({
      where: {
        host: "example.test",
        id: { notIn: definitions.map((server) => server.id) }
      },
      data: { status: ServerStatus.REMOVED, trustStatus: TrustStatus.SUSPENDED, pointPool: 0 }
    });

    const seededUsers = await tx.user.findMany({
      where: { email: { in: ["admin@minepulse.local", "owner@minepulse.local", "player@minepulse.local"] } },
      select: { id: true }
    });
    const seededUserIds = seededUsers.map((user) => user.id);
    if (seededUserIds.length) {
      const serverIds = definitions.map((server) => server.id);
      await tx.comment.deleteMany({ where: { serverId: { in: serverIds }, userId: { in: seededUserIds } } });
      await tx.serverLike.deleteMany({ where: { serverId: { in: serverIds }, userId: { in: seededUserIds } } });
      await tx.favorite.deleteMany({ where: { serverId: { in: serverIds }, userId: { in: seededUserIds } } });
    }
  });

  const result = await prisma.server.findMany({
    where: { id: { in: definitions.map((server) => server.id) } },
    orderBy: { port: "asc" },
    select: { id: true, slug: true, host: true, port: true, pointPool: true, isOfficialShowcase: true }
  });
  console.table(result);
  console.log("Showcase bootstrap complete. Plugin secrets were encrypted and were not printed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
