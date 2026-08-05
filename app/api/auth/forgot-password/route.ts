import { NextResponse } from "next/server";
import { z } from "zod";
import { emailActionRateLimitStatus, recordEmailAction } from "@/lib/auth-rate-limit";
import { sendPasswordResetEmail } from "@/lib/account-email";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

const schema = z.object({ email: z.string().trim().email() });
const genericMessage = "If that account exists, password reset instructions have been sent.";

export async function POST(request: Request) {
  try {
    const email = schema.parse(await request.json()).email.toLowerCase();
    const throttle = await emailActionRateLimitStatus(request, "password-reset", email);
    if (throttle.blocked) return NextResponse.json({ message: genericMessage }, { status: 202 });
    await recordEmailAction(request, "password-reset", email);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, username: true, passwordHash: true } });
    if (user?.passwordHash) {
      await sendPasswordResetEmail(user).catch(() => {
        console.error("Password recovery email delivery failed");
      });
    }
    return NextResponse.json({ message: genericMessage }, { status: 202 });
  } catch (error) {
    return routeError(error);
  }
}
