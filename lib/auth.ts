import "server-only";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UserRole, type User } from "@/lib/generated/prisma/client";
import { accountBanIsActive } from "@/lib/account-ban";

const COOKIE_NAME = "karixmc_session";
const LEGACY_COOKIE_NAME = "minepulse_session";
const DEFAULT_SECRET = "minepulse-local-development-secret-change-before-production";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export type SessionUser = Pick<
  User,
  | "id"
  | "email"
  | "username"
  | "role"
  | "walletPoints"
  | "level"
  | "lifetimeEarnedPoints"
  | "lastDailyClaimAt"
  | "friendsPrivate"
  | "minecraftUuid"
  | "minecraftName"
  | "bio"
  | "avatarUrl"
  | "bannedAt"
  | "bannedUntil"
  | "banReason"
>;

export type AuthContext = {
  sessionId: string;
  user: SessionUser;
};

const sessionUserSelect = {
  id: true,
  email: true,
  username: true,
  role: true,
  walletPoints: true,
  level: true,
  lifetimeEarnedPoints: true,
  lastDailyClaimAt: true,
  friendsPrivate: true,
  minecraftUuid: true,
  minecraftName: true,
  bio: true,
  avatarUrl: true,
  bannedAt: true,
  bannedUntil: true,
  banReason: true
} as const;

function authSecret() {
  const secret = process.env.AUTH_SECRET || DEFAULT_SECRET;

  if (process.env.NODE_ENV === "production" && (!process.env.AUTH_SECRET || secret === DEFAULT_SECRET)) {
    throw new Error("AUTH_SECRET must be set to a strong unique value before deploying KarixMC.");
  }

  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters.");
  }

  return secret;
}

function secureAuthCookie() {
  const override = process.env.AUTH_COOKIE_SECURE?.toLowerCase();

  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}

function sessionTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function requestAddress(request: Request) {
  // Production only exposes Next.js through Nginx, which replaces X-Real-IP
  // with the TCP peer address. Do not trust CF-Connecting-IP or an incoming
  // X-Forwarded-For chain while the domain points directly at this VPS.
  return (request.headers.get("x-real-ip")?.trim() || "unknown").slice(0, 128);
}

export function privateAuthFingerprint(value: string) {
  return crypto.createHmac("sha256", authSecret()).update(value).digest("hex");
}

export function authRequestFingerprint(request: Request) {
  return privateAuthFingerprint(requestAddress(request));
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string | null) {
  if (!passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}

export async function createSession(userId: string, request: Request) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const retentionCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  await prisma.authSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { revokedAt: { not: null, lte: retentionCutoff } }
      ]
    }
  });
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: sessionTokenHash(token),
      userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
      ipHash: authRequestFingerprint(request),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS)
    },
    select: { id: true, expiresAt: true }
  });

  const excessSessions = await prisma.authSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    skip: 10,
    select: { id: true }
  });
  if (excessSessions.length) {
    await prisma.authSession.updateMany({
      where: { id: { in: excessSessions.map((entry) => entry.id) } },
      data: { revokedAt: now }
    });
  }

  return { token, sessionId: session.id, expiresAt: session.expiresAt };
}

async function sessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value || null;
}

export async function currentAuthContext(): Promise<AuthContext | null> {
  const token = await sessionToken();
  if (!token) return null;

  const now = new Date();
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: sessionTokenHash(token) },
    include: { user: { select: sessionUserSelect } }
  });

  if (!session || session.revokedAt || session.expiresAt <= now) return null;

  if (accountBanIsActive(session.user, now)) {
    await prisma.authSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now }
    });
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    await prisma.authSession.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
      data: { lastSeenAt: now }
    });
  }

  return { sessionId: session.id, user: session.user };
}

export async function readSession() {
  const context = await currentAuthContext();
  return context ? { sessionId: context.sessionId, userId: context.user.id } : null;
}

export async function currentUser(): Promise<SessionUser | null> {
  return (await currentAuthContext())?.user || null;
}

export async function requireUser(roles?: UserRole[]) {
  const user = await currentUser();

  if (!user) {
    throw new Response("Authentication required", { status: 401 });
  }

  if (roles?.length && !roles.includes(user.role)) {
    throw new Response("You do not have access to this area", { status: 403 });
  }

  return user;
}

export async function requireAuthContext(roles?: UserRole[]) {
  const context = await currentAuthContext();

  if (!context) {
    throw new Response("Authentication required", { status: 401 });
  }

  if (roles?.length && !roles.includes(context.user.role)) {
    throw new Response("You do not have access to this area", { status: 403 });
  }

  return context;
}

export async function requireMember() {
  return requireUser([UserRole.PLAYER, UserRole.OWNER, UserRole.ADMIN]);
}

export async function listActiveSessions(userId: string, currentSessionId: string) {
  const now = new Date();
  const sessions = await prisma.authSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true
    }
  });

  return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }));
}

export async function revokeSessionForUser(userId: string, sessionId: string) {
  const result = await prisma.authSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  return result.count > 0;
}

export async function revokeOtherSessions(userId: string, currentSessionId: string) {
  return prisma.authSession.updateMany({
    where: { userId, id: { not: currentSessionId }, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function revokeCurrentSession() {
  const token = await sessionToken();
  if (!token) return false;

  const result = await prisma.authSession.updateMany({
    where: { tokenHash: sessionTokenHash(token), revokedAt: null },
    data: { revokedAt: new Date() }
  });
  return result.count > 0;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureAuthCookie(),
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    priority: "high"
  });
  response.cookies.set(LEGACY_COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

export function clearSessionCookie(response: NextResponse) {
  for (const name of [COOKIE_NAME, LEGACY_COOKIE_NAME]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: secureAuthCookie(),
      path: "/",
      maxAge: 0
    });
  }
}
