import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: false,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    const developmentScripts = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
    const developmentConnections = process.env.NODE_ENV === "development" ? " ws: wss:" : "";
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; media-src 'self'; font-src 'self' data:; script-src 'self' 'unsafe-inline'${developmentScripts}; style-src 'self' 'unsafe-inline'; connect-src 'self'${developmentConnections}` },
          ...(process.env.APP_BASE_URL?.startsWith("https://")
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : [])
        ]
      }
    ];
  },
  typescript: {
    ignoreBuildErrors: process.env.NEXT_SKIP_TYPECHECK === "1"
  },
  experimental: {
    cpus: 1
  }
};

export default nextConfig;
