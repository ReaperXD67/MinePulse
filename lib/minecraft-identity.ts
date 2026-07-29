import { prisma } from "@/lib/prisma";

export async function unlinkMinecraftIdentity(userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, minecraftName: true, minecraftUuid: true }
    });

    if (!user) return null;

    const now = new Date();
    await tx.serverSession.updateMany({
      where: { userId, status: "ACTIVE" },
      data: { status: "CLOSED", endedAt: now }
    });
    await tx.minecraftLinkCode.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        minecraftUuid: null,
        minecraftName: null,
        minecraftLinkedAt: null,
        minecraftConsentVersion: null
      }
    });

    return { ...user, wasLinked: Boolean(user.minecraftUuid) };
  });
}
