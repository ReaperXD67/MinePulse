import crypto from "node:crypto";

export type SignedHeartbeat = {
  serverId: string;
  timestamp: number;
  nonce: string;
  minecraftUuid: string;
  minecraftName: string;
  afk: boolean;
  movementScore: number;
  activityEvents: number;
  challengePassed?: boolean;
  reportedSeconds: number;
  pluginVersion: string;
};

export function hashIp(ip: string | null | undefined) {
  return crypto
    .createHash("sha256")
    .update(`${process.env.AUTH_SECRET || "minepulse"}:${ip || "unknown"}`)
    .digest("hex");
}

export function clampHeartbeatSeconds(rawSeconds: number) {
  if (!Number.isFinite(rawSeconds) || rawSeconds <= 0) {
    return 0;
  }

  return Math.min(Math.floor(rawSeconds), 30);
}

export function challengeDue(activeSeconds: number) {
  return activeSeconds > 0 && activeSeconds % 300 < 30;
}

export function heartbeatSignaturePayload(input: SignedHeartbeat) {
  return [
    input.serverId,
    input.timestamp,
    input.nonce,
    input.minecraftUuid,
    input.minecraftName,
    input.afk,
    input.movementScore,
    input.activityEvents,
    input.challengePassed === undefined ? "none" : input.challengePassed,
    input.reportedSeconds,
    input.pluginVersion
  ].join("\n");
}

export function verifyHeartbeatSignature(input: SignedHeartbeat, signature: string, secret: string) {
  const expected = crypto.createHmac("sha256", secret).update(heartbeatSignaturePayload(input)).digest("hex");
  const received = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
}

export function heartbeatTimestampIsFresh(timestamp: number, now = Date.now()) {
  return Math.abs(Math.floor(now / 1000) - timestamp) <= 90;
}
