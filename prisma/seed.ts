import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  BillingKind,
  LedgerType,
  PremiumPlanCode,
  PrismaClient,
  ServerStatus,
  StoreItemStatus,
  UserRole
} from "../lib/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db"
});
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.minecraftLinkCode.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.serverHourlyStat.deleteMany();
  await prisma.enforcementAction.deleteMany();
  await prisma.serverReport.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.promoRedemption.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.serverLike.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.storeItem.deleteMany();
  await prisma.serverSession.deleteMany();
  await prisma.pointLedger.deleteMany();
  await prisma.billingLedger.deleteMany();
  await prisma.server.deleteMany();
  await prisma.promoCode.deleteMany();
  await prisma.pointPackage.deleteMany();
  await prisma.premiumTier.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("admin123", 12);
  const ownerHash = await bcrypt.hash("owner123", 12);
  const playerHash = await bcrypt.hash("player123", 12);

  const admin = await prisma.user.create({
    data: {
      email: "admin@minepulse.local",
      username: "Aman Admin",
      passwordHash,
      role: UserRole.ADMIN,
      walletPoints: 25000,
      bio: "MinePulse platform administrator and economy moderator."
    }
  });

  const owner = await prisma.user.create({
    data: {
      email: "owner@minepulse.local",
      username: "Skyforge Owner",
      passwordHash: ownerHash,
      role: UserRole.OWNER,
      bio: "Economy server builder focused on fair progression and long-running communities."
    }
  });

  const player = await prisma.user.create({
    data: {
      email: "player@minepulse.local",
      username: "PixelRunner",
      minecraftName: "PixelRunner",
      passwordHash: playerHash,
      role: UserRole.PLAYER,
      walletPoints: 18500,
      level: 3,
      lifetimeEarnedPoints: 7200,
      friendsPrivate: false,
      bio: "Survival player, event hunter, and new server creator."
    }
  });

  await prisma.pointPackage.createMany({
    data: [
      { code: "POINTS_250K", label: "Starter Reactor", points: 250000, priceCents: 999, sortOrder: 1 },
      { code: "POINTS_1M", label: "1 Million Core", points: 1000000, priceCents: 2999, sortOrder: 2 },
      { code: "POINTS_5M", label: "5 Million Vault", points: 5000000, priceCents: 11999, sortOrder: 3 }
    ]
  });

  await prisma.premiumTier.createMany({
    data: [
      {
        code: PremiumPlanCode.GOLD,
        name: "Gold",
        priceCents: 1499,
        durationDays: 7,
        accentColor: "#f7c948",
        priority: 1
      },
      {
        code: PremiumPlanCode.DIAMOND,
        name: "Diamond",
        priceCents: 2999,
        durationDays: 7,
        accentColor: "#48e3ff",
        priority: 2
      }
    ]
  });

  await prisma.promoCode.create({
    data: {
      code: "BOOST10",
      bonusPercent: 10,
      active: true,
      maxRedemptions: 1000
    }
  });

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const servers = await Promise.all([
    prisma.server.create({
      data: {
        id: "demo-server-skyforge",
        ownerId: owner.id,
        slug: "skyforge-economy",
        name: "Skyforge Economy",
        host: "play.skyforge.local",
        version: "1.21.x",
        region: "EU",
        tags: "Survival,Economy,Jobs",
        description: "A reward-heavy economy world with shops, crates, auctions, and player towns.",
        longDescription: "Build a town, master a job, and trade through a player-led economy. Skyforge publishes every reward rule and keeps its MinePulse bridge online for transparent payouts.",
        rules: "No hacked clients\nNo reward farming with alternate accounts\nKeep chat welcoming\nReport payout issues through MinePulse support",
        pointPool: 640000,
        rewardRatePerSecond: 1.5,
        maxPaidPlayers: 24,
        minPlaySecondsForComment: 1800,
        premiumPlan: PremiumPlanCode.DIAMOND,
        premiumUntil: weekFromNow,
        pluginSecret: "demo-secret-skyforge",
        bannerImage: "/voxel-network.png",
        galleryImages: "/voxel-network.png,/voxel-network.png,/voxel-network.png",
        websiteUrl: "https://example.com/skyforge",
        discordUrl: "https://discord.com",
        supportUrl: "https://example.com/skyforge/support",
        lastHeartbeatAt: now,
        lastPluginVersion: "0.4.0"
      }
    }),
    prisma.server.create({
      data: {
        id: "demo-server-ember",
        ownerId: owner.id,
        slug: "ember-smp",
        name: "Ember SMP",
        host: "ember.local",
        version: "1.20.6",
        region: "US",
        tags: "SMP,Claims,Events",
        description: "Cozy SMP with weekend boss arenas and a careful no-pay-to-win shop.",
        longDescription: "Ember SMP runs a seasonal survival world with community builds, claim protection, weekend bosses, and cosmetic-only rewards.",
        rules: "No griefing\nNo automation used only to farm MinePulse rewards\nRespect claimed builds",
        pointPool: 215000,
        rewardRatePerSecond: 2,
        maxPaidPlayers: 12,
        minPlaySecondsForComment: 2400,
        premiumPlan: PremiumPlanCode.GOLD,
        premiumUntil: twoDaysFromNow,
        pluginSecret: "demo-secret-ember",
        bannerImage: "/voxel-network.png",
        galleryImages: "/voxel-network.png,/voxel-network.png",
        discordUrl: "https://discord.com",
        lastHeartbeatAt: new Date(now.getTime() - 8 * 60 * 1000),
        lastPluginVersion: "0.4.0"
      }
    }),
    prisma.server.create({
      data: {
        id: "demo-server-voidcraft",
        ownerId: player.id,
        slug: "voidcraft-hardcore",
        name: "Voidcraft Hardcore",
        host: "voidcraft.local",
        version: "1.21.x",
        region: "ASIA",
        tags: "Hardcore,Quests,PvE",
        description: "Seasonal hardcore progression where long sessions unlock rare cosmetics.",
        longDescription: "PixelRunner is building a player-led hardcore realm with short seasons, transparent reward caps, and permanent cosmetic history.",
        rules: "One account per player\nNo combat logging\nNo AFK reward machines",
        pointPool: 0,
        rewardRatePerSecond: 1,
        maxPaidPlayers: 10,
        minPlaySecondsForComment: 3600,
        status: ServerStatus.ACTIVE,
        pluginSecret: "demo-secret-voidcraft",
        bannerImage: "/voxel-network.png",
        galleryImages: "/voxel-network.png"
      }
    })
  ]);

  await prisma.storeItem.createMany({
    data: [
      {
        serverId: servers[0].id,
        name: "VIP Rank - 7 days",
        description: "Chat color, /hat, two homes, and queue priority.",
        pricePoints: 7200,
        command: "lp user {player} parent addtemp vip 7d",
        requiresOnline: true,
        status: StoreItemStatus.ACTIVE
      },
      {
        serverId: servers[0].id,
        name: "Sky Key Bundle",
        description: "Five premium crate keys for the Skyforge crate.",
        pricePoints: 3800,
        command: "crate key give {player} sky 5",
        requiresOnline: true,
        status: StoreItemStatus.ACTIVE
      },
      {
        serverId: servers[1].id,
        name: "Event Trail",
        description: "Cosmetic particle trail for one season.",
        pricePoints: 5200,
        command: "trails grant {player} ember",
        requiresOnline: true,
        status: StoreItemStatus.ACTIVE
      }
    ]
  });

  await prisma.friendship.create({
    data: {
      userId: player.id,
      friendId: owner.id
    }
  });

  await prisma.serverLike.create({ data: { serverId: servers[0].id, userId: player.id } });
  await prisma.favorite.create({ data: { serverId: servers[1].id, userId: player.id } });
  await prisma.comment.create({
    data: {
      serverId: servers[0].id,
      userId: player.id,
      body: "The reward rate feels fair and the shop commands arrived instantly."
    }
  });

  await prisma.serverSession.create({
    data: {
      serverId: servers[0].id,
      userId: player.id,
      minecraftName: "PixelRunner",
      ipHash: "seeded-demo-hash",
      activeSeconds: 7200,
      rewardedPoints: 7200,
      rewardCarryPoints: 0,
      activityEvents: 42,
      lastNonce: "seeded-heartbeat-nonce",
      integrityVerified: true,
      status: "CLOSED",
      endedAt: new Date(now.getTime() - 60 * 60 * 1000)
    }
  });

  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);
  await prisma.serverHourlyStat.createMany({
    data: [
      {
        serverId: servers[0].id,
        hourStart,
        sampleCount: 12,
        onlinePlayerTotal: 180,
        peakOnline: 21
      },
      {
        serverId: servers[1].id,
        hourStart,
        sampleCount: 12,
        onlinePlayerTotal: 88,
        peakOnline: 11
      }
    ]
  });

  await prisma.pointLedger.createMany({
    data: [
      {
        userId: player.id,
        serverId: servers[0].id,
        type: LedgerType.PLAYER_REWARD,
        amountPoints: 7200,
        balanceAfter: 18500,
        note: "Verified playtime reward from Skyforge Economy"
      },
      {
        userId: player.id,
        type: LedgerType.LEVEL_REWARD,
        amountPoints: 3000,
        balanceAfter: 18500,
        note: "Demo level bonuses through level 3"
      },
      {
        serverId: servers[0].id,
        type: LedgerType.SERVER_TOPUP,
        amountPoints: 1000000,
        note: "Owner bought 1 Million Core package"
      }
    ]
  });

  await prisma.billingLedger.create({
    data: {
      ownerId: owner.id,
      serverId: servers[0].id,
      kind: BillingKind.POINTS,
      amountPoints: 1000000,
      moneyCents: 2999,
      planCode: "POINTS_1M",
      note: "Demo billing record"
    }
  });

  await prisma.serverReport.create({
    data: {
      serverId: servers[1].id,
      reporterId: player.id,
      reason: "NO_REWARD",
      details: "A verified session stopped earning while the server still showed a funded reward pool.",
      status: "OPEN"
    }
  });

  await prisma.supportTicket.create({
    data: {
      serverId: servers[0].id,
      requesterId: player.id,
      subject: "Rank delivery question",
      body: "My purchase is queued. Can you confirm when the server bridge will deliver it?",
      status: "OPEN"
    }
  });

  console.log(`Seeded MinePulse with admin ${admin.email}, owner ${owner.email}, player ${player.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
