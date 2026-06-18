import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingKind, UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pointPackage"),
    id: z.string().min(1),
    label: z.string().trim().min(3).max(80),
    points: z.coerce.number().int().min(1).max(1000000000),
    priceCents: z.coerce.number().int().min(0).max(100000000),
    active: z.boolean()
  }),
  z.object({
    kind: z.literal("premiumTier"),
    id: z.string().min(1),
    name: z.string().trim().min(3).max(40),
    priceCents: z.coerce.number().int().min(0).max(100000000),
    durationDays: z.coerce.number().int().min(1).max(365),
    active: z.boolean(),
    priority: z.coerce.number().int().min(1).max(100)
  })
]);

export async function PATCH(request: Request) {
  try {
    const user = await requireUser([UserRole.ADMIN]);
    const input = schema.parse(await request.json());

    if (input.kind === "pointPackage") {
      const updated = await prisma.pointPackage.update({
        where: { id: input.id },
        data: {
          label: input.label,
          points: input.points,
          priceCents: input.priceCents,
          active: input.active
        }
      });

      await prisma.billingLedger.create({
        data: {
          ownerId: user.id,
          kind: BillingKind.ADMIN_ADJUSTMENT,
          note: `Admin updated point package ${updated.code}`,
          planCode: updated.code
        }
      });

      return NextResponse.json({ message: "Point package updated" });
    }

    const updated = await prisma.premiumTier.update({
      where: { id: input.id },
      data: {
        name: input.name,
        priceCents: input.priceCents,
        durationDays: input.durationDays,
        active: input.active,
        priority: input.priority
      }
    });

    await prisma.billingLedger.create({
      data: {
        ownerId: user.id,
        kind: BillingKind.ADMIN_ADJUSTMENT,
        note: `Admin updated premium tier ${updated.code}`,
        planCode: updated.code
      }
    });

    return NextResponse.json({ message: "Premium tier updated" });
  } catch (error) {
    return routeError(error);
  }
}
