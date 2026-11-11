import type { Metadata } from "next";

export const SITE_ORIGIN = "https://karixmc.pl";
export const SITE_TITLE = "KarixMC | Minecraft server directory & demos";
export const SITE_DESCRIPTION = "Explore Minecraft servers and labelled demo worlds, find the plugin setup guide, and share first-session feedback with the KarixMC community.";

export function publicPageMetadata(pathname: string, title: string, description: string): Metadata {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || /[?#]/.test(pathname)) {
    throw new Error("Public metadata requires a canonical pathname without parameters or fragments");
  }
  const canonicalUrl = new URL(pathname, SITE_ORIGIN);
  if (canonicalUrl.origin !== SITE_ORIGIN) throw new Error("Public metadata must use the official site origin");
  const canonical = canonicalUrl.toString();
  const image = {
    url: `${SITE_ORIGIN}/voxel-network.png`,
    width: 1600,
    height: 900,
    alt: "KarixMC abstract network illustration"
  };
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: "KarixMC",
      title,
      description,
      url: canonical,
      images: [image]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image.url, alt: image.alt }]
    }
  };
}

export const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_ORIGIN}/#website`,
  name: "KarixMC",
  url: `${SITE_ORIGIN}/`,
  inLanguage: "en"
};

export function structuredDataJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
