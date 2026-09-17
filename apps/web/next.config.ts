import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Hosti owns trailing slashes under /v/: a bundle's relative links only
  // resolve when the directory URL keeps its slash, so Next must not rewrite it.
  skipTrailingSlashRedirect: true,
  // Native module, and the SQL schema file the database module reads on boot.
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  outputFileTracingIncludes: {
    "/**": ["./src/server/db/schema.sql"],
  },
};

export default nextConfig;
