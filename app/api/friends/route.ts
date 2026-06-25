import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const addSchema = z.object({
  nickname: z.string().trim().min(2).max(80)
});

const deleteSchema = z.object({
  friendId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const user = await requireMember();
    const input = addSchema.parse(await request.json());
    const nickname = input.nickname.trim();

    const target = await prisma.user.findFirst({
      where: {
        OR: [{ username: nickname }, { minecraftName: nickname }, { email: nickname }]
      },
      select: {
        id: true,
        username: true,
        friendsPrivate: true
      }
    });

    if (!target) {
      return NextResponse.json({ error: "No member found with that nickname" }, { status: 404 });
    }

    if (target.id === user.id) {
      return NextResponse.json({ error: "You cannot add yourself as a friend" }, { status: 400 });
    }

    if (target.friendsPrivate) {
      return NextResponse.json({ error: `${target.username} has friend privacy enabled` }, { status: 403 });
    }

    await prisma.friendship.upsert({
      where: {
        userId_friendId: {
          userId: user.id,
          friendId: target.id
        }
      },
      update: {},
      create: {
        userId: user.id,
        friendId: target.id
      }
    });

    return NextResponse.json({ message: `${target.username} added to friends` });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireMember();
    const input = deleteSchema.parse(await request.json());
    await prisma.friendship.deleteMany({
      where: {
        userId: user.id,
        friendId: input.friendId
      }
    });

    return NextResponse.json({ message: "Friend removed" });
  } catch (error) {
    return routeError(error);
  }
}
