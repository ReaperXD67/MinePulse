import "server-only";

import { privateAuthFingerprint, authRequestFingerprint } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type LimitPolicy = {
  scope: string;
  identity: string;
  limit: number;
  windowMs: number;
  blockMs: number;
};

type LimitStatus = {
  blocked: boolean;
  retryAfterSeconds: number;
};

function policyKey(policy: LimitPolicy) {
  return privateAuthFingerprint(`${policy.scope}:${policy.identity}`);
}

function loginPolicies(request: Request, email: string, includeEmail = true): LimitPolicy[] {
  return [
    ...(includeEmail ? [{
      scope: "login-email",
      identity: email.toLowerCase(),
      limit: 5,
      windowMs: 15 * 60 * 1000,
      blockMs: 15 * 60 * 1000
    }] : []),
    {
      scope: "login-ip",
      identity: authRequestFingerprint(request),
      limit: 20,
      windowMs: 15 * 60 * 1000,
      blockMs: 15 * 60 * 1000
    }
  ];
}

function signupPolicy(request: Request): LimitPolicy {
  return {
    scope: "signup-ip",
    identity: authRequestFingerprint(request),
    limit: 5,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000
  };
}

function mediaUploadPolicy(userId: string): LimitPolicy {
  return {
    scope: "media-upload-account",
    identity: userId,
    limit: 20,
    windowMs: 10 * 60 * 1000,
    blockMs: 10 * 60 * 1000
  };
}

function emailActionPolicy(request: Request, scope: string, identity: string): LimitPolicy[] {
  return [
    { scope: `${scope}-account`, identity: identity.toLowerCase(), limit: 3, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 },
    { scope: `${scope}-ip`, identity: authRequestFingerprint(request), limit: 10, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 }
  ];
}

async function statusForPolicies(policies: LimitPolicy[]): Promise<LimitStatus> {
  const now = new Date();
  const rows = await prisma.authThrottle.findMany({
    where: { key: { in: policies.map(policyKey) } }
  });
  const activeBlocks = rows
    .map((row) => row.blockedUntil)
    .filter((blockedUntil): blockedUntil is Date => Boolean(blockedUntil && blockedUntil > now));

  if (!activeBlocks.length) return { blocked: false, retryAfterSeconds: 0 };

  return {
    blocked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((Math.max(...activeBlocks.map((date) => date.getTime())) - now.getTime()) / 1000))
  };
}

async function recordPolicyAttempt(policy: LimitPolicy) {
  const now = new Date();
  const key = policyKey(policy);
  await prisma.authThrottle.deleteMany({
    where: { updatedAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } }
  });

  await prisma.$transaction(async (tx) => {
    const row = await tx.authThrottle.findUnique({ where: { key } });
    const outsideWindow = !row || now.getTime() - row.windowStartedAt.getTime() >= policy.windowMs;
    const failures = outsideWindow ? 1 : row.failures + 1;
    const blockedUntil = failures >= policy.limit ? new Date(now.getTime() + policy.blockMs) : null;

    await tx.authThrottle.upsert({
      where: { key },
      create: {
        key,
        scope: policy.scope,
        failures,
        windowStartedAt: now,
        blockedUntil,
        updatedAt: now
      },
      update: {
        failures,
        windowStartedAt: outsideWindow ? now : row?.windowStartedAt || now,
        blockedUntil,
        updatedAt: now
      }
    });
  });
}

export function loginRateLimitStatus(request: Request, email: string) {
  return statusForPolicies(loginPolicies(request, email));
}

export async function recordLoginFailure(request: Request, email: string, accountExists: boolean) {
  for (const policy of loginPolicies(request, email, accountExists)) {
    await recordPolicyAttempt(policy);
  }
}

export async function clearLoginFailures(email: string) {
  const policy: LimitPolicy = {
    scope: "login-email",
    identity: email.toLowerCase(),
    limit: 5,
    windowMs: 15 * 60 * 1000,
    blockMs: 15 * 60 * 1000
  };
  await prisma.authThrottle.deleteMany({
    where: { key: policyKey(policy) }
  });
}

export function signupRateLimitStatus(request: Request) {
  return statusForPolicies([signupPolicy(request)]);
}

export function recordSignupAttempt(request: Request) {
  return recordPolicyAttempt(signupPolicy(request));
}

export function mediaUploadRateLimitStatus(userId: string) {
  return statusForPolicies([mediaUploadPolicy(userId)]);
}

export function recordMediaUploadAttempt(userId: string) {
  return recordPolicyAttempt(mediaUploadPolicy(userId));
}

export function emailActionRateLimitStatus(request: Request, scope: string, identity: string) {
  return statusForPolicies(emailActionPolicy(request, scope, identity));
}

export async function recordEmailAction(request: Request, scope: string, identity: string) {
  for (const policy of emailActionPolicy(request, scope, identity)) await recordPolicyAttempt(policy);
}
