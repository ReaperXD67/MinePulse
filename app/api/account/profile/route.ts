import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";
import { safeMediaPath } from "@/lib/server-profile";

export const runtime = "nodejs";

const schema = z.object({
  username: z.string().trim().min(2).max(40),
  bio: z.string().trim().max(360),
  avatarUrl: z.string().trim().max(200).refine((value) => !value || Boolean(safeMediaPath(value)), "Upload the avatar through KarixMC"),
  friendsPrivate: z.boolean().default(false)
});

export async function PATCH(request: Request) {
  try {
    const user = await requireMember();
    const input = schema.parse(await request.json());
    await prisma.user.update({
      where: { id: user.id },
      data: {
        username: input.username,
        friendsPrivate: input.friendsPrivate,
        bio: input.bio,
        avatarUrl: input.avatarUrl || null
      }
    });

    return NextResponse.json({ message: "Profile updated" });
  } catch (error) {
    return routeError(error);
  }
}
