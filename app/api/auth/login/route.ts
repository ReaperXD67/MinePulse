import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { clearLoginFailures, loginRateLimitStatus, recordLoginFailure } from "@/lib/auth-rate-limit";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";
import { accountBanIsActive, accountBanMessage } from "@/lib/account-ban";
import { emailDeliveryRequired } from "@/lib/account-email";
import { UserRole } from "@/lib/generated/prisma/client";
import { verifyAdminTotp } from "@/lib/admin-mfa";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
  totpCode: z.string().trim().regex(/^\d{6}$/).optional()
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

    if (emailDeliveryRequired() && !user.emailVerifiedAt) {
      return NextResponse.json(
        { error: "Verify your email before signing in.", code: "EMAIL_NOT_VERIFIED" },
        { status: 403 }
      );
    }

    if (user.role === UserRole.ADMIN && process.env.ADMIN_2FA_REQUIRED === "true") {
      if (!user.adminTotpSecret || !user.adminTotpEnabledAt) {
        return NextResponse.json(
          { error: "Administrator MFA is not configured. Run the secure admin bootstrap command.", code: "ADMIN_MFA_NOT_CONFIGURED" },
          { status: 403 }
        );
      }
      if (!body.totpCode) {
        return NextResponse.json({ error: "Enter the six-digit authenticator code.", code: "TWO_FACTOR_REQUIRED" }, { status: 401 });
      }
      if (!verifyAdminTotp(user.adminTotpSecret, user.email, body.totpCode)) {
        await recordLoginFailure(request, email, true);
        return NextResponse.json({ error: "Invalid email, password, or authenticator code." }, { status: 401 });
      }
    }

    await clearLoginFailures(email);
    if (accountBanIsActive(user)) {
      return NextResponse.json({ error: accountBanMessage(user), code: "ACCOUNT_BANNED" }, { status: 403 });
    }

    if (user.bannedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { bannedAt: null, bannedUntil: null, banReason: null }
      });
    }

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
