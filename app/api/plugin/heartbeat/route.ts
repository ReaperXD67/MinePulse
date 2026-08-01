import { z } from "zod";
import { LedgerType, Prisma, SessionStatus, type Server } from "@/lib/generated/prisma/client";
import { clampHeartbeatSeconds, createMathChallenge, verifyMathChallenge } from "@/lib/plugin-security";
import { claimableLevelRewards } from "@/lib/progression";
import { prisma } from "@/lib/prisma";
import { cappedRewardRate } from "@/lib/reward-rate";
import { authenticatePluginRequest, pluginJson, pluginRouteError, type PluginAuthContext } from "@/lib/plugin-auth";
import { accountBanIsActive } from "@/lib/account-ban";

export const runtime = "nodejs";

export const heartbeatInputSchema = z.object({
  serverId: z.string().min(1),
  minecraftUuid: z.string().uuid(),
  minecraftName: z.string().trim().regex(/^[A-Za-z0-9_]{2,16}$/, "Invalid Minecraft name"),
  afk: z.boolean().default(false),
  movementScore: z.coerce.number().int().min(0).max(1000000).default(0),
  activityEvents: z.coerce.number().int().min(0).max(10000).default(0),
  challengeId: z.string().uuid().optional(),
  challengeAnswer: z.string().trim().min(1).max(20).optional(),
  reportedSeconds: z.coerce.number().int().min(0).max(60).default(20),
  pluginVersion: z.string().trim().min(3).max(30).optional()
});

export type HeartbeatInput = z.infer<typeof heartbeatInputSchema>;

export async function processHeartbeat(input: HeartbeatInput, server: Server, requestNonce: string) {
    const player = await prisma.user.findUnique({
      where: { minecraftUuid: input.minecraftUuid },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        walletPoints: true,
        level: true,
        lifetimeEarnedPoints: true,
        bannedAt: true,
        bannedUntil: true,
        banReason: true
      }
    });

    const isUnclaimedShadowProfile = Boolean(
      player && !player.passwordHash && player.email.endsWith("@players.minepulse.local")
    );

    if (!player || isUnclaimedShadowProfile) {
      return {
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
      };
    }

    if (accountBanIsActive(player)) {
      return {
        ok: true,
        linked: true,
        serverId: server.id,
        playerId: player.id,
        earned: 0,
        balanceAfter: player.walletPoints,
        remainingPool: server.pointPool,
        activeSeconds: 0,
        afkSeconds: 0,
        suspiciousScore: 0,
        paidActivePlayers: 0,
        rewardable: false,
        rewardState: "ACCOUNT_BANNED",
        rewardMessage: "KarixMC rewards are paused because this account is suspended.",
        integrityVerified: true,
        requiresChallenge: false,
        challengeAccepted: false,
        challenge: null,
        message: "This KarixMC account is suspended. Contact support if you believe this is a mistake."
      };
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
          afkTimeoutSeconds: true,
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
            lastActivityAt: now
          }
        });
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

      const serverElapsed = Math.max(0, (now.getTime() - session.lastHeartbeatAt.getTime()) / 1000);
      const rawElapsed = Math.min(input.reportedSeconds, serverElapsed);
      const elapsed = clampHeartbeatSeconds(rawElapsed);
      const activeWhere: Prisma.ServerSessionWhereInput = {
        serverId: freshServer.id,
        status: SessionStatus.ACTIVE,
        OR: [
          { lastHeartbeatAt: { gte: cutoff } },
          { id: session.id }
        ]
      };
      const paidActivePlayers = await tx.serverSession.count({ where: activeWhere });
      const paidSlots = await tx.serverSession.findMany({
        where: activeWhere,
        orderBy: [{ startedAt: "asc" }, { id: "asc" }],
        take: freshServer.maxPaidPlayers,
        select: { id: true }
      });

      const requiredMovementScore = Math.max(
        1,
        Math.round(freshServer.minimumMovementDistance * freshServer.minimumMovementDistance * 1000)
      );
      const strictMovement =
        freshServer.botProtectionLevel >= 2 ? input.movementScore >= requiredMovementScore : true;
      const activeInteraction = input.activityEvents >= freshServer.minimumActivityEvents;
      const meaningfulActivity = strictMovement || activeInteraction;
      const previousActivityAt = session.lastActivityAt ?? session.startedAt;
      const lastActivityAt = meaningfulActivity ? now : previousActivityAt;
      const activityTimedOut =
        now.getTime() - lastActivityAt.getTime() >= freshServer.afkTimeoutSeconds * 1000;
      const afk = input.afk || activityTimedOut;
      const challengePending = Boolean(challengeId);
      const challengeOk = !freshServer.challengeRequired || !challengePending;
      const withinPaidCap = paidSlots.some((activeSession) => activeSession.id === session.id);
      const verifiedActive = elapsed > 0 && !afk && challengeOk;
      const effectiveRewardRate = cappedRewardRate(freshServer.rewardRatePerSecond);
      const rewardable =
        verifiedActive && withinPaidCap && freshServer.pointPool > 0 && effectiveRewardRate > 0;

      const rewardState = freshServer.pointPool <= 0
        ? "EMPTY_POOL"
        : effectiveRewardRate <= 0
          ? "REWARDS_DISABLED"
          : !withinPaidCap
            ? "PAID_CAP"
            : afk
              ? "AFK"
              : !challengeOk
                ? "ACTIVITY_CHECK"
                : "EARNING";
      const rewardMessage = rewardState === "EMPTY_POOL"
        ? "Rewards are paused because this server's campaign pool is empty."
        : rewardState === "REWARDS_DISABLED"
          ? "Rewards are currently disabled by the server owner."
          : rewardState === "PAID_CAP"
            ? `Rewards are paused because all ${freshServer.maxPaidPlayers} paid player slots are in use.`
            : rewardState === "AFK"
              ? `Rewards are paused after ${freshServer.afkTimeoutSeconds} seconds without meaningful activity. Move, chat, or interact to continue.`
              : rewardState === "ACTIVITY_CHECK"
                ? "Rewards are paused until you answer the activity check with /answer <value>."
                : `Verified play active. Earning ${effectiveRewardRate} point(s) per second.`;

      const preciseEarned = rewardable
        ? Math.min(freshServer.pointPool, session.rewardCarryPoints + elapsed * effectiveRewardRate)
        : session.rewardCarryPoints;
      const earned = rewardable ? Math.floor(preciseEarned) : 0;
      const rewardCarryPoints = rewardable ? Math.max(0, preciseEarned - earned) : session.rewardCarryPoints;

      const suspiciousBump =
        afk || !challengeOk
          ? Math.max(1, freshServer.botProtectionLevel)
          : 0;

      const updatedSession = await tx.serverSession.update({
        where: { id: session.id },
        data: {
          minecraftName: input.minecraftName,
          lastHeartbeatAt: now,
          lastActivityAt,
          activeSeconds: { increment: verifiedActive ? elapsed : 0 },
          afkSeconds: { increment: afk ? elapsed : 0 },
          rewardedPoints: { increment: earned },
          rewardCarryPoints,
          suspiciousScore: { increment: suspiciousBump },
          activityEvents: { increment: input.activityEvents },
          lastNonce: requestNonce,
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
          ...(input.pluginVersion ? { lastPluginVersion: input.pluginVersion } : {})
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
        const funded = await tx.server.updateMany({
          where: { id: freshServer.id, pointPool: { gte: earned } },
          data: { pointPool: { decrement: earned } }
        });
        if (funded.count !== 1) {
          throw new Response("Campaign pool changed; heartbeat can be retried", { status: 409 });
        }

        let updatedUser = await tx.user.update({
          where: { id: player.id },
          data: {
            walletPoints: { increment: earned },
            lifetimeEarnedPoints: { increment: earned }
          }
        });
        balanceAfter = updatedUser.walletPoints;

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

    return {
      ok: true,
      linked: true,
      serverId: server.id,
      playerId: player.id,
      ...result
    };
}

export async function POST(request: Request) {
  let auth: PluginAuthContext | null = null;
  try {
    auth = await authenticatePluginRequest(request);
    const input = heartbeatInputSchema.parse(auth.body);
    return pluginJson(auth, await processHeartbeat(input, auth.server, auth.nonce));
  } catch (error) {
    return pluginRouteError(auth, error);
  }
}
