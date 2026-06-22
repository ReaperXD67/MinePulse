import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/lib/generated/prisma/client";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]),
  ownerNote: z.string().trim().max(1200)
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMember();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: { server: { select: { ownerId: true } } }
    });

    if (!ticket || (user.role !== UserRole.ADMIN && ticket.server.ownerId !== user.id)) {
      return NextResponse.json({ error: "Support ticket not found" }, { status: 404 });
    }

    await prisma.supportTicket.update({ where: { id }, data: input });
    return NextResponse.json({ message: "Support ticket updated" });
  } catch (error) {
    return routeError(error);
  }
}
