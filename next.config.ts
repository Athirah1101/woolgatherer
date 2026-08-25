import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow feedback attachments (screenshots / short screen recordings) to be
    // uploaded through the submitFeedback server action.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
