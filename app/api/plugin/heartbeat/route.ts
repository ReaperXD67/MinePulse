import { NextResponse } from "next/server";
import { z } from "zod";
import { LedgerType, SessionStatus } from "@/lib/generated/prisma/client";
import {
  clampHeartbeatSeconds,
  createMathChallenge,
  hashIp,
  heartbeatTimestampIsFresh,
  verifyHeartbeatSignature,
  verifyMathChallenge
} from "@/lib/plugin-security";
import { claimableLevelRewards } from "@/lib/progression";
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
  challengeId: z.string().uuid().optional(),
  challengeAnswer: z.string().trim().min(1).max(20).optional(),
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
        botProtectionLevel: true,
        heartbeatIntervalSeconds: true,
        challengeEnabled: true,
        challengeIntervalSeconds: true,
        challengeAnswerWindowSeconds: true,
        challengeRequired: true,
        minimumMovementDistance: true,
        minimumActivityEvents: true
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

    const player = await prisma.user.findUnique({
      where: { minecraftUuid: input.minecraftUuid },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        walletPoints: true,
        level: true,
        lifetimeEarnedPoints: true
      }
    });

    const isUnclaimedShadowProfile = Boolean(
      player && !player.passwordHash && player.email.endsWith("@players.minepulse.local")
    );

    if (!player || isUnclaimedShadowProfile) {
      return NextResponse.json({
        ok: true,
        linked: false,
        serverId: server.id,
        earned: 0,
        balanceAfter: 0,
        remainingPool: server.pointPool,
        activeSeconds: 0,
        afkSeconds: 0,
        suspiciousScore: 0,
        paidActivePlayers: 0,
        rewardable: false,
        rewardState: "ACCOUNT_NOT_LINKED",
        rewardMessage: "Link your KarixMC account before rewards can start.",
        integrityVerified: true,
        requiresChallenge: false,
        challengeAccepted: false,
        challenge: null,
        message: "Link your KarixMC account with /karixmc link <code> before rewards can start."
      });
    }

    await prisma.user.update({
      where: { id: player.id },
      data: { minecraftName: input.minecraftName }
    });

    const now = new Date();
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);
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
          trustStatus: true,
          heartbeatIntervalSeconds: true,
          challengeEnabled: true,
          challengeIntervalSeconds: true,
          challengeAnswerWindowSeconds: true,
          challengeRequired: true,
          minimumMovementDistance: true,
          minimumActivityEvents: true
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

      let challengeId = session.challengeId;
      let challengeQuestion = session.challengeQuestion;
      let challengeAnswerHash = session.challengeAnswerHash;
      let challengeRequiredAt = session.challengeRequiredAt;
      let challengeExpiresAt = session.challengeExpiresAt;
      let challengePassedAt = session.challengePassedAt;
      let challengeAccepted = false;

      if (!freshServer.challengeEnabled) {
        challengeId = null;
        challengeQuestion = null;
        challengeAnswerHash = null;
        challengeRequiredAt = null;
        challengeExpiresAt = null;
      } else if (
        challengeId &&
        challengeAnswerHash &&
        challengeExpiresAt &&
        input.challengeId === challengeId &&
        input.challengeAnswer &&
        challengeExpiresAt.getTime() >= now.getTime() &&
        verifyMathChallenge(challengeId, input.challengeAnswer, challengeAnswerHash)
      ) {
        challengeAccepted = true;
        challengePassedAt = now;
        challengeId = null;
        challengeQuestion = null;
        challengeAnswerHash = null;
        challengeRequiredAt = null;
        challengeExpiresAt = null;
      }

      if (challengeExpiresAt && challengeExpiresAt.getTime() < now.getTime()) {
        challengeId = null;
        challengeQuestion = null;
        challengeAnswerHash = null;
        challengeRequiredAt = null;
        challengeExpiresAt = null;
      }

      const challengeAnchor = challengePassedAt ?? session.startedAt;
      const challengeIsDue =
        freshServer.challengeEnabled &&
        !challengeId &&
        now.getTime() - challengeAnchor.getTime() >= freshServer.challengeIntervalSeconds * 1000;

      if (challengeIsDue) {
        const challenge = createMathChallenge(freshServer.challengeAnswerWindowSeconds, now);
        challengeId = challenge.challengeId;
        challengeQuestion = challenge.question;
        challengeAnswerHash = challenge.answerHash;
        challengeRequiredAt = challenge.requiredAt;
        challengeExpiresAt = challenge.expiresAt;
      }

      const rawElapsed = input.reportedSeconds || (now.getTime() - session.lastHeartbeatAt.getTime()) / 1000;
      const elapsed = clampHeartbeatSeconds(rawElapsed);
      const activeSessions = await tx.serverSession.findMany({
        where: {
          serverId: freshServer.id,
          status: SessionStatus.ACTIVE,
          OR: [
            { lastHeartbeatAt: { gte: cutoff } },
            { id: session.id }
          ]
        },
        orderBy: [{ startedAt: "asc" }, { id: "asc" }],
        select: { id: true }
      });
      const paidActivePlayers = activeSessions.length;

      const requiredMovementScore = Math.max(
        1,
        Math.round(freshServer.minimumMovementDistance * freshServer.minimumMovementDistance * 1000)
      );
      const strictMovement =
        freshServer.botProtectionLevel >= 2 ? input.movementScore >= requiredMovementScore : true;
      const activeInteraction = input.activityEvents >= freshServer.minimumActivityEvents;
      const challengePending = Boolean(challengeId);
      const challengeOk = !freshServer.challengeRequired || !challengePending;
      const withinPaidCap = activeSessions
        .slice(0, freshServer.maxPaidPlayers)
        .some((activeSession) => activeSession.id === session.id);
      const verifiedActive = elapsed > 0 && !input.afk && (strictMovement || activeInteraction) && challengeOk;
      const rewardable =
        verifiedActive && withinPaidCap && freshServer.pointPool > 0 && freshServer.rewardRatePerSecond > 0;

      const rewardState = freshServer.pointPool <= 0
        ? "EMPTY_POOL"
        : freshServer.rewardRatePerSecond <= 0
          ? "REWARDS_DISABLED"
          : !withinPaidCap
            ? "PAID_CAP"
            : input.afk
              ? "AFK"
              : !challengeOk
                ? "ACTIVITY_CHECK"
                : !strictMovement && !activeInteraction
                  ? "INACTIVE"
                  : "EARNING";
      const rewardMessage = rewardState === "EMPTY_POOL"
        ? "Rewards are paused because this server's campaign pool is empty."
        : rewardState === "REWARDS_DISABLED"
          ? "Rewards are currently disabled by the server owner."
          : rewardState === "PAID_CAP"
            ? `Rewards are paused because all ${freshServer.maxPaidPlayers} paid player slots are in use.`
            : rewardState === "AFK"
              ? "Rewards are paused because you are AFK. Move or interact to continue earning."
              : rewardState === "ACTIVITY_CHECK"
                ? "Rewards are paused until you answer the activity check with /answer <value>."
                : rewardState === "INACTIVE"
                  ? "Rewards are paused because no meaningful activity was detected. Move, chat, or interact to continue."
                  : `Verified play active. Earning ${freshServer.rewardRatePerSecond} point(s) per second.`;

      const preciseEarned = rewardable
        ? Math.min(freshServer.pointPool, session.rewardCarryPoints + elapsed * freshServer.rewardRatePerSecond)
        : session.rewardCarryPoints;
      const earned = rewardable ? Math.floor(preciseEarned) : 0;
      const rewardCarryPoints = rewardable ? Math.max(0, preciseEarned - earned) : session.rewardCarryPoints;

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
          rewardCarryPoints,
          suspiciousScore: { increment: suspiciousBump },
          activityEvents: { increment: input.activityEvents },
          lastNonce: input.nonce,
          integrityVerified: true,
          challengeId,
          challengeQuestion,
          challengeAnswerHash,
          challengeRequiredAt,
          challengeExpiresAt,
          challengePassedAt
        }
      });

      await tx.server.update({
        where: { id: freshServer.id },
        data: {
          lastHeartbeatAt: now,
          lastPluginVersion: input.pluginVersion
        }
      });

      const hourlyStat = await tx.serverHourlyStat.findUnique({
        where: {
          serverId_hourStart: {
            serverId: freshServer.id,
            hourStart
          }
        }
      });

      if (hourlyStat) {
        await tx.serverHourlyStat.update({
          where: { id: hourlyStat.id },
          data: {
            sampleCount: { increment: 1 },
            onlinePlayerTotal: { increment: paidActivePlayers },
            peakOnline: Math.max(hourlyStat.peakOnline, paidActivePlayers)
          }
        });
      } else {
        await tx.serverHourlyStat.create({
          data: {
            serverId: freshServer.id,
            hourStart,
            sampleCount: 1,
            onlinePlayerTotal: paidActivePlayers,
            peakOnline: paidActivePlayers
          }
        });
      }

      let balanceAfter = player.walletPoints;
      if (earned > 0) {
        let updatedUser = await tx.user.update({
          where: { id: player.id },
          data: {
            walletPoints: { increment: earned },
            lifetimeEarnedPoints: { increment: earned }
          }
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

        const levelRewards = claimableLevelRewards(updatedUser.level, updatedUser.lifetimeEarnedPoints);
        for (const reward of levelRewards) {
          updatedUser = await tx.user.update({
            where: { id: player.id },
            data: {
              walletPoints: { increment: reward.rewardPoints },
              level: reward.level
            }
          });
          balanceAfter = updatedUser.walletPoints;

          await tx.pointLedger.create({
            data: {
              userId: player.id,
              type: LedgerType.LEVEL_REWARD,
              amountPoints: reward.rewardPoints,
              balanceAfter,
              note: `Level ${reward.level} bonus for ${reward.requiredPoints} verified points`
            }
          });
        }
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
        rewardState,
        rewardMessage,
        integrityVerified: true,
        requiresChallenge: challengePending,
        challengeAccepted,
        challenge: challengePending
          ? {
              id: challengeId,
              question: challengeQuestion,
              expiresAt: challengeExpiresAt?.toISOString(),
              required: freshServer.challengeRequired
            }
          : null
      };
    });

    return NextResponse.json({
      ok: true,
      linked: true,
      serverId: server.id,
      playerId: player.id,
      ...result
    });
  } catch (error) {
    return routeError(error);
  }
}
