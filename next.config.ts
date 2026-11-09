import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async redirects() {
    return [
      { source: "/overview", destination: "/dashboard", permanent: false },
      { source: "/private-notes", destination: "/blog", permanent: false },
      { source: "/documentation", destination: "/blog", permanent: false },
      { source: "/documentation/:id", destination: "/blog", permanent: false },
      { source: "/security/secrets", destination: "/secrets", permanent: false },
      { source: "/network/:rest", destination: "/network", permanent: false },
      { source: "/interview", destination: "/interview/iam", permanent: false },
      { source: "/team/:rest", destination: "/team", permanent: false },
    ];
  },
};

export default nextConfig;
