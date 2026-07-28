import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticatePluginRequest, pluginJson, pluginRouteError, type PluginAuthContext } from "@/lib/plugin-auth";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  pluginVersion: z.string().trim().min(3).max(30)
});

export async function POST(request: Request) {
  let auth: PluginAuthContext | null = null;
  try {
    auth = await authenticatePluginRequest(request);
    const input = schema.parse(auth.body);
    const server = auth.server;

    await prisma.server.update({
      where: { id: server.id },
      data: { lastConfigSyncAt: new Date(), lastPluginVersion: input.pluginVersion }
    });

    return pluginJson(auth, {
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
    return pluginRouteError(auth, error);
  }
}
