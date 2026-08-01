import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticatePluginRequest, pluginJson, pluginRouteError, type PluginAuthContext } from "@/lib/plugin-auth";
import { accountBanIsActive } from "@/lib/account-ban";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  minecraftUuid: z.string().trim().min(8).max(80)
});

export async function POST(request: Request) {
  let auth: PluginAuthContext | null = null;
  try {
    auth = await authenticatePluginRequest(request);
    const input = schema.parse(auth.body);
    const server = auth.server;

    const player = await prisma.user.findUnique({
      where: { minecraftUuid: input.minecraftUuid },
      select: { id: true, walletPoints: true, bannedAt: true, bannedUntil: true }
    });
    const banned = Boolean(player && accountBanIsActive(player));
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

    return pluginJson(auth, {
      linked: Boolean(player),
      banned,
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
    return pluginRouteError(auth, error);
  }
}
