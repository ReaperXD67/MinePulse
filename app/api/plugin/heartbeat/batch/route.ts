import { z } from "zod";
import { heartbeatInputSchema, processHeartbeat } from "@/app/api/plugin/heartbeat/route";
import { authenticatePluginRequest, pluginJson, pluginRouteError, type PluginAuthContext } from "@/lib/plugin-auth";

export const runtime = "nodejs";

const sampleSchema = heartbeatInputSchema.omit({ serverId: true, pluginVersion: true });
const schema = z.object({
  serverId: z.string().min(1),
  pluginVersion: z.string().trim().min(3).max(30),
  heartbeats: z.array(sampleSchema).max(250)
}).superRefine((input, context) => {
  const uniquePlayers = new Set(input.heartbeats.map((heartbeat) => heartbeat.minecraftUuid));
  if (uniquePlayers.size !== input.heartbeats.length) {
    context.addIssue({ code: "custom", message: "A heartbeat batch cannot contain duplicate players" });
  }
});

export async function POST(request: Request) {
  let auth: PluginAuthContext | null = null;
  try {
    auth = await authenticatePluginRequest(request, 256 * 1024);
    const input = schema.parse(auth.body);
    const results = [];

    for (const heartbeat of input.heartbeats) {
      results.push(await processHeartbeat({
        ...heartbeat,
        serverId: input.serverId,
        pluginVersion: input.pluginVersion
      }, auth.server, auth.nonce));
    }

    return pluginJson(auth, { ok: true, results });
  } catch (error) {
    return pluginRouteError(auth, error);
  }
}
