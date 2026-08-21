import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type errors still fail the build (we keep tsc strict); ESLint warnings
  // (e.g. stylistic) should not block a deploy.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
