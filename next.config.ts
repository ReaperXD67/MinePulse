import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  experimental: {
    cpus: 1
  }
};

export default nextConfig;
