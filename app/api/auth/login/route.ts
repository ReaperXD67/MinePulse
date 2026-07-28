import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { clearLoginFailures, loginRateLimitStatus, recordLoginFailure } from "@/lib/auth-rate-limit";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128)
});

const dummyPasswordHash = bcrypt.hashSync("karixmc-invalid-account-timing-value", 12);

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    const email = body.email.toLowerCase();
    const throttle = await loginRateLimitStatus(request, email);
    if (throttle.blocked) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });
    const passwordValid = await verifyPassword(body.password, user?.passwordHash || dummyPasswordHash);

    if (!user || !passwordValid || !user.passwordHash) {
      await recordLoginFailure(request, email, Boolean(user));
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await clearLoginFailures(email);
    const session = await createSession(user.id, request);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        walletPoints: user.walletPoints
      }
    });
    setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    return routeError(error);
  }
}
