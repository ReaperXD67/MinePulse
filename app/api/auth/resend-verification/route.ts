import { NextResponse } from "next/server";
import { z } from "zod";
import { emailActionRateLimitStatus, recordEmailAction } from "@/lib/auth-rate-limit";
import { sendVerificationEmail } from "@/lib/account-email";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

const schema = z.object({ email: z.string().trim().email() });
const genericMessage = "If that unverified account exists, a new email has been sent.";

export async function POST(request: Request) {
  try {
    const email = schema.parse(await request.json()).email.toLowerCase();
    const throttle = await emailActionRateLimitStatus(request, "verification", email);
    if (throttle.blocked) return NextResponse.json({ error: "Try again later." }, { status: 429 });
    await recordEmailAction(request, "verification", email);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, username: true, emailVerifiedAt: true } });
    if (user && !user.emailVerifiedAt) {
      await sendVerificationEmail(user).catch(() => {
        console.error("Verification email delivery failed");
      });
    }
    return NextResponse.json({ message: genericMessage });
  } catch (error) {
    return routeError(error);
  }
}
