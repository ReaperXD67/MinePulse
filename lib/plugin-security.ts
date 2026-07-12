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
  challengeId?: string;
  challengeAnswer?: string;
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

  return Math.min(Math.floor(rawSeconds), 60);
}

function challengeAnswerHash(challengeId: string, answer: string) {
  return crypto
    .createHmac("sha256", process.env.AUTH_SECRET || "minepulse")
    .update(`${challengeId}:${answer.trim()}`)
    .digest("hex");
}

export function createMathChallenge(answerWindowSeconds: number, now = new Date()) {
  const left = crypto.randomInt(2, 10);
  const right = crypto.randomInt(2, 10);
  const challengeId = crypto.randomUUID();
  const answer = String(left + right);

  return {
    challengeId,
    question: `How much is ${left} + ${right}? Use /answer <value>`,
    answerHash: challengeAnswerHash(challengeId, answer),
    requiredAt: now,
    expiresAt: new Date(now.getTime() + answerWindowSeconds * 1000)
  };
}

export function verifyMathChallenge(challengeId: string, answer: string, expectedHash: string) {
  const received = Buffer.from(challengeAnswerHash(challengeId, answer), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
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
    input.challengeId || "none",
    input.challengeAnswer || "none",
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
