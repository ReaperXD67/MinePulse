import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/lib/generated/prisma/client";
import { createSession, hashPassword, setSessionCookie } from "@/lib/auth";
import { recordSignupAttempt, signupRateLimitStatus } from "@/lib/auth-rate-limit";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";
import { passwordPolicy, passwordPolicyError } from "@/lib/password-policy";

export const runtime = "nodejs";

const registerSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(40),
  email: z.string().trim().email(),
  password: z.string().min(passwordPolicy.minLength).max(passwordPolicy.maxLength)
});

export async function POST(request: Request) {
  try {
    const input = registerSchema.parse(await request.json());
    const email = input.email.toLowerCase();
    const throttle = await signupRateLimitStatus(request);
    if (throttle.blocked) {
      return NextResponse.json(
        { error: "Too many accounts were created from this connection. Try again later." },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } }
      );
    }

    const passwordError = passwordPolicyError(input.password, [input.username, email.split("@")[0] || ""]);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    await recordSignupAttempt(request);
    const user = await prisma.user.create({
      data: {
        email,
        username: input.username,
        passwordHash: await hashPassword(input.password),
        role: UserRole.PLAYER
      }
    });
    const session = await createSession(user.id, request);
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        walletPoints: user.walletPoints
      },
      message: "Account created"
    });
    setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    return routeError(error);
  }
}
