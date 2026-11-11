import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_ORIGIN } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const servers = await prisma.server.findMany({
    where: { status: "ACTIVE", trustStatus: { in: ["VERIFIED", "WATCHLIST"] } },
    select: { slug: true },
    orderBy: { slug: "asc" },
    take: 49_997
  });
  const paths = ["/", "/plugin", "/privacy", ...servers.map((server) => `/servers/${encodeURIComponent(server.slug)}`)];
  // Database updatedAt also changes for live state. It is not a reliable page revision date.
  return paths.map((pathname) => ({ url: new URL(pathname, SITE_ORIGIN).toString() }));
}
