import { bridgeStateAt, BRIDGE_ONLINE_WINDOW_MS, latestBridgeSignalAt } from "@/lib/server-liveness";

export type ServerPresence = {
  onlinePlayers: number | null;
  playingPlayers: number | null;
  earningPlayers: number | null;
  registeredPlayers: number;
  onlineSource: "plugin" | "linked" | "unavailable";
  sampledAt: string | null;
  checkedAt: string;
  bridgeState: "online" | "stale" | "offline";
};

export type PresenceServer = {
  id: string;
  lastHeartbeatAt: Date | null;
  lastConfigSyncAt: Date | null;
  onlinePlayerCount: number | null;
  onlinePlayerCountAt: Date | null;
};

export function summarizeServerPresence(
  server: PresenceServer,
  counts: { registeredPlayers: number; playingPlayers: number; earningPlayers: number },
  now = Date.now()
): ServerPresence {
  const bridgeState = bridgeStateAt(server, now);
  const telemetryFresh = server.onlinePlayerCount !== null && server.onlinePlayerCountAt !== null &&
    now - server.onlinePlayerCountAt.getTime() <= BRIDGE_ONLINE_WINDOW_MS;
  const connected = bridgeState === "online";
  // A config ping proves connectivity, but only an explicit count measures all Minecraft players.
  // Older bridges still provide useful linked-player heartbeats without claiming an all-player total.
  const onlineSource = connected ? telemetryFresh ? "plugin" : "linked" : "unavailable";
  return {
    onlinePlayers: connected ? telemetryFresh ? server.onlinePlayerCount : counts.playingPlayers : null,
    playingPlayers: connected ? counts.playingPlayers : null,
    earningPlayers: connected ? counts.earningPlayers : null,
    registeredPlayers: counts.registeredPlayers,
    onlineSource,
    sampledAt: onlineSource === "plugin" ? server.onlinePlayerCountAt!.toISOString() : latestBridgeSignalAt(server)?.toISOString() ?? null,
    checkedAt: new Date(now).toISOString(),
    bridgeState
  };
}
