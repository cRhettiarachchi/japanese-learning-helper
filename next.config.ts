import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: { "/api/**/*": ["./server/**", "./api/**"] },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};
export default config;
