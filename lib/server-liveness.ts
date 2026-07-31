export const BRIDGE_ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const BRIDGE_STALE_WINDOW_MS = 15 * 60 * 1000;

type BridgeSignal = {
  lastHeartbeatAt: Date | null;
  lastConfigSyncAt: Date | null;
};

export function latestBridgeSignalAt(server: BridgeSignal) {
  const timestamps = [server.lastHeartbeatAt, server.lastConfigSyncAt]
    .filter((value): value is Date => Boolean(value))
    .map((value) => value.getTime());

  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}

export function bridgeStateAt(server: BridgeSignal, now = Date.now()): "online" | "stale" | "offline" {
  const signalAt = latestBridgeSignalAt(server);
  if (!signalAt) return "offline";

  const age = now - signalAt.getTime();
  if (age <= BRIDGE_ONLINE_WINDOW_MS) return "online";
  if (age <= BRIDGE_STALE_WINDOW_MS) return "stale";
  return "offline";
}

export function bridgeIsOnline(server: BridgeSignal, now = Date.now()) {
  return bridgeStateAt(server, now) === "online";
}
