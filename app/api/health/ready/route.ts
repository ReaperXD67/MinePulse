import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redisClient } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const checks = { database: false, redis: false, media: false };
  const mediaRoot = process.env.MEDIA_ROOT || "storage/media";

  await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`.then(() => { checks.database = true; }),
    redisClient().then(async (client) => {
      if (!client) throw new Error("Redis is unavailable");
      checks.redis = (await client.ping()) === "PONG";
    }),
    access(mediaRoot, constants.R_OK | constants.W_OK).then(() => { checks.media = true; })
  ]);

  const ok = Object.values(checks).every(Boolean);
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const mayInspect = Boolean(process.env.HEALTHCHECK_TOKEN && suppliedToken === process.env.HEALTHCHECK_TOKEN);

  return NextResponse.json(
    {
      ok,
      service: "karixmc-web",
      ...(mayInspect ? { checks } : {}),
      checkedAt: new Date().toISOString()
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
