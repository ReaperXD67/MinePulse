import { NextResponse } from "next/server";
import { z } from "zod";
import { routeError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  secret: z.string().min(8)
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const server = await prisma.server.findFirst({
      where: { id: input.serverId, pluginSecret: input.secret },
      select: {
        id: true,
        name: true,
        status: true,
        trustStatus: true,
        pluginConfigRevision: true,
        heartbeatIntervalSeconds: true,
        purchasePollSeconds: true,
        afkTimeoutSeconds: true,
        challengeEnabled: true,
        challengeIntervalSeconds: true,
        challengeAnswerWindowSeconds: true,
        challengeRequired: true,
        minimumMovementDistance: true,
        minimumActivityEvents: true,
        botProtectionLevel: true,
        rewardRatePerSecond: true,
        maxPaidPlayers: true,
        pointPool: true
      }
    });

    if (!server) {
      return NextResponse.json({ error: "Invalid server credentials" }, { status: 401 });
    }

    await prisma.server.update({
      where: { id: server.id },
      data: { lastConfigSyncAt: new Date() }
    });

    return NextResponse.json({
      server: {
        id: server.id,
        name: server.name,
        status: server.status,
        trustStatus: server.trustStatus,
        pointPool: server.pointPool,
        rewardRatePerSecond: server.rewardRatePerSecond,
        maxPaidPlayers: server.maxPaidPlayers
      },
      policy: {
        revision: server.pluginConfigRevision,
        heartbeatIntervalSeconds: server.heartbeatIntervalSeconds,
        purchasePollSeconds: server.purchasePollSeconds,
        afkTimeoutSeconds: server.afkTimeoutSeconds,
        challengeEnabled: server.challengeEnabled,
        challengeIntervalSeconds: server.challengeIntervalSeconds,
        challengeAnswerWindowSeconds: server.challengeAnswerWindowSeconds,
        challengeRequired: server.challengeRequired,
        minimumMovementDistance: server.minimumMovementDistance,
        minimumActivityEvents: server.minimumActivityEvents,
        botProtectionLevel: server.botProtectionLevel
      }
    });
  } catch (error) {
    return routeError(error);
  }
}
