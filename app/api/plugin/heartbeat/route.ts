import { NextResponse } from "next/server";
import { z } from "zod";
import { LedgerType, SessionStatus, UserRole } from "@/lib/generated/prisma/client";
import { challengeDue, clampHeartbeatSeconds, hashIp } from "@/lib/plugin-security";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  secret: z.string().min(8),
  minecraftUuid: z.string().trim().min(8).max(80),
  minecraftName: z.string().trim().min(2).max(32),
  ip: z.string().trim().max(80).optional(),
  afk: z.boolean().default(false),
  movementDelta: z.coerce.number().min(0).max(10000).default(0),
  challengePassed: z.boolean().optional(),
  reportedSeconds: z.coerce.number().min(0).max(60).optional()
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const server = await prisma.server.findFirst({
      where: {
        id: input.serverId,
        pluginSecret: input.secret,
        status: "ACTIVE"
      },
      select: {
        id: true,
        name: true,
        rewardRatePerSecond: true,
        pointPool: true,
        maxPaidPlayers: true,
        botProtectionLevel: true
      }
    });

    if (!server) {
      return NextResponse.json({ error: "Invalid server credentials" }, { status: 401 });
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
          botProtectionLevel: true
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
            ipHash: hashIp(input.ip)
          }
        });
      }

      const rawElapsed = input.reportedSeconds ?? (now.getTime() - session.lastHeartbeatAt.getTime()) / 1000;
      const elapsed = clampHeartbeatSeconds(rawElapsed);
      const paidActivePlayers = await tx.serverSession.count({
        where: {
          serverId: freshServer.id,
          status: SessionStatus.ACTIVE,
          lastHeartbeatAt: { gte: cutoff }
        }
      });

      const strictMovement = freshServer.botProtectionLevel >= 2 ? input.movementDelta >= 0.1 : true;
      const challengeOk = input.challengePassed !== false;
      const withinPaidCap = paidActivePlayers <= freshServer.maxPaidPlayers;
      const verifiedActive = elapsed > 0 && !input.afk && strictMovement && challengeOk;
      const rewardable =
        verifiedActive && withinPaidCap && freshServer.pointPool > 0 && freshServer.rewardRatePerSecond > 0;

      const earned = rewardable
        ? Math.min(freshServer.pointPool, elapsed * freshServer.rewardRatePerSecond)
        : 0;

      const suspiciousBump =
        input.afk || !strictMovement || !challengeOk ? Math.max(1, freshServer.botProtectionLevel) : 0;

      const updatedSession = await tx.serverSession.update({
        where: { id: session.id },
        data: {
          minecraftName: input.minecraftName,
          lastHeartbeatAt: now,
          activeSeconds: { increment: verifiedActive ? elapsed : 0 },
          afkSeconds: { increment: input.afk ? elapsed : 0 },
          rewardedPoints: { increment: earned },
          suspiciousScore: { increment: suspiciousBump }
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
