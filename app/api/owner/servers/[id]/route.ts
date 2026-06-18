import { NextResponse } from "next/server";
import { z } from "zod";
import { ServerStatus, UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().min(20).max(420).optional(),
  rewardRatePerSecond: z.coerce.number().int().min(0).max(100).optional(),
  maxPaidPlayers: z.coerce.number().int().min(1).max(500).optional(),
  minPlaySecondsForComment: z.coerce.number().int().min(60).max(86400).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional()
});

async function authorize(serverId: string) {
  const user = await requireUser([UserRole.OWNER, UserRole.ADMIN]);
  const server = await prisma.server.findUnique({ where: { id: serverId } });

  if (!server || (user.role !== UserRole.ADMIN && server.ownerId !== user.id)) {
    throw new Response("Server not found", { status: 404 });
  }

  return { user, server };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await authorize(id);
    const input = schema.parse(await request.json());
    const updated = await prisma.server.update({
      where: { id },
      data: input
    });

    return NextResponse.json({ serverId: updated.id, message: "Server updated" });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await authorize(id);
    await prisma.server.update({
      where: { id },
      data: { status: ServerStatus.REMOVED }
    });

    return NextResponse.json({ message: "Server removed" });
  } catch (error) {
    return routeError(error);
  }
}
