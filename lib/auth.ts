import "server-only";

import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UserRole, type User } from "@/lib/generated/prisma/client";

const COOKIE_NAME = "minepulse_session";
const DEFAULT_SECRET = "minepulse-local-development-secret-change-before-production";

type SessionPayload = {
  userId: string;
  role: UserRole;
};

export type SessionUser = Pick<
  User,
  | "id"
  | "email"
  | "username"
  | "role"
  | "walletPoints"
  | "minecraftUuid"
  | "minecraftName"
  | "bio"
  | "avatarUrl"
>;

function authSecret() {
  const secret = process.env.AUTH_SECRET || DEFAULT_SECRET;

  if (process.env.NODE_ENV === "production" && (!process.env.AUTH_SECRET || secret === DEFAULT_SECRET)) {
    throw new Error("AUTH_SECRET must be set to a strong unique value before deploying MinePulse.");
  }

  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters.");
  }

  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string | null) {
  if (!passwordHash) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(authSecret());
}

export async function readSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, authSecret());
    return verified.payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  const session = await readSession();

  if (!session?.userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      walletPoints: true,
      minecraftUuid: true,
      minecraftName: true,
      bio: true,
      avatarUrl: true
    }
  });
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

export async function requireMember() {
  return requireUser([UserRole.PLAYER, UserRole.OWNER, UserRole.ADMIN]);
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
