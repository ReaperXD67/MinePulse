import { NextResponse } from "next/server";
import { z } from "zod";
import { LedgerType, SessionStatus, UserRole } from "@/lib/generated/prisma/client";
import {
  challengeDue,
  clampHeartbeatSeconds,
  hashIp,
  heartbeatTimestampIsFresh,
  verifyHeartbeatSignature
} from "@/lib/plugin-security";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  timestamp: z.coerce.number().int().positive(),
  nonce: z.string().trim().min(12).max(120),
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
  minecraftUuid: z.string().trim().min(8).max(80),
  minecraftName: z.string().trim().min(2).max(32),
  ip: z.string().trim().max(80).optional(),
  afk: z.boolean().default(false),
  movementScore: z.coerce.number().int().min(0).max(1000000).default(0),
  activityEvents: z.coerce.number().int().min(0).max(10000).default(0),
  challengePassed: z.boolean().optional(),
  reportedSeconds: z.coerce.number().int().min(0).max(60).default(20),
  pluginVersion: z.string().trim().min(3).max(30)
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const server = await prisma.server.findUnique({
      where: {
        id: input.serverId
      },
      select: {
        id: true,
        name: true,
        pluginSecret: true,
        status: true,
        trustStatus: true,
        rewardRatePerSecond: true,
        pointPool: true,
        maxPaidPlayers: true,
        botProtectionLevel: true
      }
    });

    if (
      !server ||
      server.status !== "ACTIVE" ||
      server.trustStatus === "SUSPENDED" ||
      server.trustStatus === "BLACKLISTED"
    ) {
      return NextResponse.json({ error: "Invalid server credentials" }, { status: 401 });
    }

    if (!heartbeatTimestampIsFresh(input.timestamp)) {
      return NextResponse.json({ error: "Heartbeat timestamp is stale" }, { status: 401 });
    }

    const { signature, ip, ...signedInput } = input;
    if (!verifyHeartbeatSignature(signedInput, signature, server.pluginSecret)) {
      return NextResponse.json({ error: "Heartbeat signature is invalid" }, { status: 401 });
    }

    const player = await prisma.user.upsert({
      where: { minecraftUuid: input.minecraftUuid },
      update: {
        minecraftName: input.minecraftName,
        username: input.minecraftName
      },
      create: {
        email: `${input.minecraftUuid.toLowerCase()}@players.minepulse.local`,
        username: input.minecraftName,
        minecraftUuid: input.minecraftUuid,
        minecraftName: input.minecraftName,
        role: UserRole.PLAYER
      }
    });

    const now = new Date();
    const cutoff = new Date(now.getTime() - 60 * 1000);
    const result = await prisma.$transaction(async (tx) => {
      const freshServer = await tx.server.findUnique({
        where: { id: server.id },
        select: {
          id: true,
          name: true,
          rewardRatePerSecond: true,
          pointPool: true,
          maxPaidPlayers: true,
          botProtectionLevel: true,
          trustStatus: true
        }
      });

      if (!freshServer) {
        throw new Response("Server disappeared", { status: 404 });
      }

      let session = await tx.serverSession.findFirst({
        where: {
          serverId: freshServer.id,
          userId: player.id,
          status: SessionStatus.ACTIVE
        },
        orderBy: { lastHeartbeatAt: "desc" }
      });

      if (session && now.getTime() - session.lastHeartbeatAt.getTime() > 120 * 1000) {
        await tx.serverSession.update({
          where: { id: session.id },
          data: { status: SessionStatus.CLOSED, endedAt: session.lastHeartbeatAt }
        });
        session = null;
      }

      if (!session) {
        session = await tx.serverSession.create({
          data: {
            serverId: freshServer.id,
            userId: player.id,
            minecraftName: input.minecraftName,
            ipHash: hashIp(ip)
          }
        });
      }

      if (session.lastNonce === input.nonce) {
        throw new Response("Heartbeat replay rejected", { status: 409 });
      }

      const rawElapsed = input.reportedSeconds || (now.getTime() - session.lastHeartbeatAt.getTime()) / 1000;
      const elapsed = clampHeartbeatSeconds(rawElapsed);
      const paidActivePlayers = await tx.serverSession.count({
        where: {
          serverId: freshServer.id,
          status: SessionStatus.ACTIVE,
          lastHeartbeatAt: { gte: cutoff }
        }
      });

      const strictMovement = freshServer.botProtectionLevel >= 2 ? input.movementScore >= 40 : true;
      const activeInteraction = input.activityEvents > 0;
      const challengeOk = input.challengePassed !== false;
      const withinPaidCap = paidActivePlayers <= freshServer.maxPaidPlayers;
      const verifiedActive = elapsed > 0 && !input.afk && (strictMovement || activeInteraction) && challengeOk;
      const rewardable =
        verifiedActive && withinPaidCap && freshServer.pointPool > 0 && freshServer.rewardRatePerSecond > 0;

      const earned = rewardable
        ? Math.min(freshServer.pointPool, elapsed * freshServer.rewardRatePerSecond)
        : 0;

      const suspiciousBump =
        input.afk || (!strictMovement && !activeInteraction) || !challengeOk
          ? Math.max(1, freshServer.botProtectionLevel)
          : 0;

      const updatedSession = await tx.serverSession.update({
        where: { id: session.id },
        data: {
          minecraftName: input.minecraftName,
          lastHeartbeatAt: now,
          activeSeconds: { increment: verifiedActive ? elapsed : 0 },
          afkSeconds: { increment: input.afk ? elapsed : 0 },
          rewardedPoints: { increment: earned },
          suspiciousScore: { increment: suspiciousBump },
          activityEvents: { increment: input.activityEvents },
          lastNonce: input.nonce,
          integrityVerified: true
        }
      });

      await tx.server.update({
        where: { id: freshServer.id },
        data: {
          lastHeartbeatAt: now,
          lastPluginVersion: input.pluginVersion
        }
      });

      let balanceAfter = player.walletPoints;
      if (earned > 0) {
        const updatedUser = await tx.user.update({
          where: { id: player.id },
          data: { walletPoints: { increment: earned } }
        });
        balanceAfter = updatedUser.walletPoints;

        await tx.server.update({
          where: { id: freshServer.id },
          data: { pointPool: { decrement: earned } }
        });

        await tx.pointLedger.create({
          data: {
            userId: player.id,
            serverId: freshServer.id,
            type: LedgerType.PLAYER_REWARD,
            amountPoints: earned,
            balanceAfter,
            note: `Heartbeat reward from ${freshServer.name}`
          }
        });
      }

      return {
        earned,
        balanceAfter,
        remainingPool: Math.max(0, freshServer.pointPool - earned),
        activeSeconds: updatedSession.activeSeconds,
        afkSeconds: updatedSession.afkSeconds,
        suspiciousScore: updatedSession.suspiciousScore,
        paidActivePlayers,
        rewardable,
        integrityVerified: true,
        requiresChallenge: challengeDue(updatedSession.activeSeconds)
      };
    });

    return NextResponse.json({
      ok: true,
      serverId: server.id,
      playerId: player.id,
      ...result
    });
  } catch (error) {
    return routeError(error);
  }
}
