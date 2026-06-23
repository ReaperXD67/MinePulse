import { NextResponse } from "next/server";
import { z } from "zod";
import { routeError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  secret: z.string().min(8),
  minecraftUuid: z.string().trim().min(8).max(80)
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const server = await prisma.server.findFirst({
      where: { id: input.serverId, pluginSecret: input.secret },
      select: {
        id: true,
        name: true,
        pointPool: true,
        rewardRatePerSecond: true,
        maxPaidPlayers: true,
        status: true
      }
    });

    if (!server) {
      return NextResponse.json({ error: "Invalid server credentials" }, { status: 401 });
    }

    const player = await prisma.user.findUnique({
      where: { minecraftUuid: input.minecraftUuid },
      select: { id: true, walletPoints: true }
    });
    const session = player
      ? await prisma.serverSession.findFirst({
          where: { serverId: server.id, userId: player.id },
          orderBy: { lastHeartbeatAt: "desc" },
          select: {
            activeSeconds: true,
            afkSeconds: true,
            rewardedPoints: true,
            suspiciousScore: true,
            status: true,
            challengeRequiredAt: true
          }
        })
      : null;

    return NextResponse.json({
      walletPoints: player?.walletPoints ?? 0,
      session: session ?? {
        activeSeconds: 0,
        afkSeconds: 0,
        rewardedPoints: 0,
        suspiciousScore: 0,
        status: "NONE",
        challengeRequiredAt: null
      },
      server
    });
  } catch (error) {
    return routeError(error);
  }
}
