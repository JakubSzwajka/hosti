import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  outputFileTracingIncludes: {
    "/**": ["../../packages/catalog/schema.sql"],
  },
};

export default nextConfig;
