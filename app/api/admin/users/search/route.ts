import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const searchSchema = z.string().trim().min(2).max(100);

export async function GET(request: Request) {
  try {
    await requireUser([UserRole.ADMIN]);
    const query = searchSchema.parse(new URL(request.url).searchParams.get("q") || "");
    const accounts = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query } },
          { username: { contains: query } },
          { minecraftName: { contains: query } }
        ]
      },
      select: {
        id: true,
        username: true,
        email: true,
        minecraftName: true,
        walletPoints: true,
        ownedServers: {
          select: { id: true, name: true, pointPool: true, status: true },
          orderBy: { updatedAt: "desc" }
        }
      },
      orderBy: [{ username: "asc" }, { id: "asc" }],
      take: 12
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    return routeError(error);
  }
}
