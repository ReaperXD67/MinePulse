import type { Prisma } from "@/lib/generated/prisma/client";

export const ownerServerInclude = {
  items: { orderBy: { createdAt: "desc" } },
  supportTickets: {
    include: { requester: { select: { username: true } } },
    orderBy: { updatedAt: "desc" },
    take: 12
  },
  _count: { select: { reports: true, favorites: true, likes: true } }
} satisfies Prisma.ServerInclude;

type OwnerServerRecord = Prisma.ServerGetPayload<{ include: typeof ownerServerInclude }>;

export type OwnerServerView = {
  id: string;
  slug: string;
  name: string;
  host: string;
  port: number;
  version: string;
  region: string;
  tags: string;
  description: string;
  longDescription: string;
  rules: string;
  bannerImage: string;
  galleryImages: string;
  websiteUrl: string | null;
  discordUrl: string | null;
  supportUrl: string | null;
  status: string;
  trustStatus: string;
  riskScore: number;
  pointPool: number;
  rewardRatePerSecond: number;
  maxPaidPlayers: number;
  minPlaySecondsForComment: number;
  premiumPlan: string;
  premiumUntil: string | null;
  lastHeartbeatAt: string | null;
  lastPluginVersion: string | null;
  pluginConfigRevision: number;
  heartbeatIntervalSeconds: number;
  purchasePollSeconds: number;
  afkTimeoutSeconds: number;
  challengeEnabled: boolean;
  challengeIntervalSeconds: number;
  challengeAnswerWindowSeconds: number;
  challengeRequired: boolean;
  minimumMovementDistance: number;
  minimumActivityEvents: number;
  botProtectionLevel: number;
  lastConfigSyncAt: string | null;
  reportCount: number;
  favoriteCount: number;
  likeCount: number;
  items: Array<{
    id: string;
    name: string;
    description: string;
    pricePoints: number;
    command: string;
    requiresOnline: boolean;
    status: string;
  }>;
  supportTickets: Array<{
    id: string;
    requester: string;
    subject: string;
    body: string;
    status: string;
    ownerNote: string;
  }>;
};

export function serializeOwnerServer(server: OwnerServerRecord): OwnerServerView {
  return {
    id: server.id,
    slug: server.slug,
    name: server.name,
    host: server.host,
    port: server.port,
    version: server.version,
    region: server.region,
    tags: server.tags,
    description: server.description,
    longDescription: server.longDescription,
    rules: server.rules,
    bannerImage: server.bannerImage || "/voxel-network.png",
    galleryImages: server.galleryImages,
    websiteUrl: server.websiteUrl,
    discordUrl: server.discordUrl,
    supportUrl: server.supportUrl,
    status: server.status,
    trustStatus: server.trustStatus,
    riskScore: server.riskScore,
    pointPool: server.pointPool,
    rewardRatePerSecond: server.rewardRatePerSecond,
    maxPaidPlayers: server.maxPaidPlayers,
    minPlaySecondsForComment: server.minPlaySecondsForComment,
    premiumPlan: server.premiumPlan,
    premiumUntil: server.premiumUntil?.toISOString() ?? null,
    lastHeartbeatAt: server.lastHeartbeatAt?.toISOString() ?? null,
    lastPluginVersion: server.lastPluginVersion,
    pluginConfigRevision: server.pluginConfigRevision,
    heartbeatIntervalSeconds: server.heartbeatIntervalSeconds,
    purchasePollSeconds: server.purchasePollSeconds,
    afkTimeoutSeconds: server.afkTimeoutSeconds,
    challengeEnabled: server.challengeEnabled,
    challengeIntervalSeconds: server.challengeIntervalSeconds,
    challengeAnswerWindowSeconds: server.challengeAnswerWindowSeconds,
    challengeRequired: server.challengeRequired,
    minimumMovementDistance: server.minimumMovementDistance,
    minimumActivityEvents: server.minimumActivityEvents,
    botProtectionLevel: server.botProtectionLevel,
    lastConfigSyncAt: server.lastConfigSyncAt?.toISOString() ?? null,
    reportCount: server._count.reports,
    favoriteCount: server._count.favorites,
    likeCount: server._count.likes,
    items: server.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      pricePoints: item.pricePoints,
      command: item.command,
      requiresOnline: item.requiresOnline,
      status: item.status
    })),
    supportTickets: server.supportTickets.map((ticket) => ({
      id: ticket.id,
      requester: ticket.requester.username,
      subject: ticket.subject,
      body: ticket.body,
      status: ticket.status,
      ownerNote: ticket.ownerNote
    }))
  };
}
