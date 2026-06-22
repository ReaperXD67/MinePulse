import { NextResponse } from "next/server";
import { z } from "zod";
import { StoreItemStatus, UserRole } from "@/lib/generated/prisma/client";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().min(5).max(180).optional(),
  pricePoints: z.coerce.number().int().min(1).max(100000000).optional(),
  command: z.string().trim().min(4).max(240).optional(),
  status: z.enum(["ACTIVE", "HIDDEN"]).optional()
});

async function authorize(itemId: string) {
  const user = await requireMember();
  const item = await prisma.storeItem.findUnique({ where: { id: itemId }, include: { server: true } });

  if (!item || (user.role !== UserRole.ADMIN && item.server.ownerId !== user.id)) {
    throw new Response("Item not found", { status: 404 });
  }

  return item;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await authorize(id);
    const input = schema.parse(await request.json());
    const item = await prisma.storeItem.update({ where: { id }, data: input });
    return NextResponse.json({ itemId: item.id });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await authorize(id);
    await prisma.storeItem.update({ where: { id }, data: { status: StoreItemStatus.HIDDEN } });
    return NextResponse.json({ message: "Item hidden" });
  } catch (error) {
    return routeError(error);
  }
}
