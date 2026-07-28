import crypto from "node:crypto";

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
