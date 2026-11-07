import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN, indexingEnabled } from "@/lib/seo/policy.mjs";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  if (!indexingEnabled(process.env)) return { rules: { userAgent: "*", disallow: "/" } };
  // Leave private HTML crawlable so its noindex directive can be read. Auth still protects it.
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/offers/*/cover$", "/api/public-properties/*/photos/"],
      disallow: ["/api/", "/newsletter/click", "/auth/callback"],
    },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
  };
}
