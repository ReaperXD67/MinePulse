import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/lib/generated/prisma/client";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().min(5).max(180),
  pricePoints: z.coerce.number().int().min(1).max(100000000),
  command: z.string().trim().min(4).max(240),
  requiresOnline: z.boolean().default(true)
});

export async function POST(request: Request) {
  try {
    const user = await requireMember();
    const input = schema.parse(await request.json());
    const server = await prisma.server.findUnique({ where: { id: input.serverId } });

    if (!server || (user.role !== UserRole.ADMIN && server.ownerId !== user.id)) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const item = await prisma.storeItem.create({ data: input });
    return NextResponse.json({ itemId: item.id });
  } catch (error) {
    return routeError(error);
  }
}
