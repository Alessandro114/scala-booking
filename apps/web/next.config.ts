import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  generateBuildId: async () => process.env.BUILD_ID && /^[a-f0-9]{40,64}$/i.test(process.env.BUILD_ID) ? process.env.BUILD_ID : null,
  env: { TEMPOCOVE_COMPILED_BUILD_ID: process.env.BUILD_ID || "development" },
  poweredByHeader: false,
  agentRules: false,
  async headers() {
    return [
      { source: "/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      // CORS for public API routes — dynamic origin matching is handled in middleware.ts
      // This sets the static method/header allowances; Origin header is set dynamically.
      {
        source: "/api/public/:path*",
        headers: [
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
