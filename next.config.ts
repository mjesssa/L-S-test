import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  // Pin workspace root so Next.js doesn't walk up and find a stray lockfile
  // in the user's home directory.
  turbopack: {
    root: resolve(__dirname),
  },
};

export default nextConfig;
