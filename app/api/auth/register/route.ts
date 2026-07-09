import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/lib/generated/prisma/client";
import { hashPassword, setSessionCookie, signSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const registerSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(40),
  email: z.string().trim().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(120)
});

export async function POST(request: Request) {
  try {
    const input = registerSchema.parse(await request.json());
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        username: input.username,
        passwordHash: await hashPassword(input.password),
        role: UserRole.PLAYER
      }
    });
    const token = await signSession({ userId: user.id, role: user.role });
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
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return routeError(error);
  }
}
