import { NextResponse } from "next/server";
import { z } from "zod";
import {
  hashPassword,
  requireAuthContext,
  revokeOtherSessions,
  verifyPassword
} from "@/lib/auth";
import { clearLoginFailures, loginRateLimitStatus, recordLoginFailure } from "@/lib/auth-rate-limit";
import { routeError } from "@/lib/api";
import { passwordPolicy, passwordPolicyError } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(passwordPolicy.minLength).max(passwordPolicy.maxLength)
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContext();
    const input = changePasswordSchema.parse(await request.json());
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { passwordHash: true, username: true, email: true }
    });

    const throttle = await loginRateLimitStatus(request, auth.user.email);
    if (throttle.blocked) {
      return NextResponse.json(
        { error: "Too many password attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } }
      );
    }

    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      await recordLoginFailure(request, auth.user.email, true);
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    if (await verifyPassword(input.newPassword, user.passwordHash)) {
      return NextResponse.json({ error: "New password must be different" }, { status: 400 });
    }

    const passwordError = passwordPolicyError(input.newPassword, [user.username, user.email.split("@")[0] || ""]);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        passwordChangedAt: new Date()
      }
    });
    await clearLoginFailures(auth.user.email);
    const revoked = await revokeOtherSessions(auth.user.id, auth.sessionId);

    return NextResponse.json({
      message: "Password updated. Other devices were signed out.",
      revokedSessions: revoked.count
    });
  } catch (error) {
    return routeError(error);
  }
}
