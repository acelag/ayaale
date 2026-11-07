import type { NextConfig } from "next";
import { indexingEnabled } from "./lib/seo/policy.mjs";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.ayaale.com" }],
        destination: "https://ayaale.com/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      ...[
        "/partner/:path*",
        "/admin/:path*",
        "/auth/:path*",
        "/newsletter/:path*",
        "/api/:path*",
      ].map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
      ...["/api/offers/:slug/cover", "/api/public-properties/:slug/photos/:position"].map(
        (source) => ({
          source,
          headers: [
            {
              key: "X-Robots-Tag",
              value: indexingEnabled(process.env) ? "index" : "noindex, nofollow",
            },
          ],
        }),
      ),
    ];
  },
};

export default nextConfig;
