import crypto from "node:crypto";

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
