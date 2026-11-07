import "server-only";
import type { Metadata } from "next";
import { canonical, indexingEnabled, summary } from "./policy.mjs";

export function publicMetadata(
  path: string,
  title: string,
  description: string,
  eligible = true,
  image?: string,
): Metadata {
  const url = canonical(path);
  const index = indexingEnabled(process.env) && eligible;
  const shortDescription = summary(description);
  return {
    title,
    description: shortDescription,
    alternates: { canonical: url },
    robots: { index, follow: indexingEnabled(process.env) },
    openGraph: {
      type: "website",
      siteName: "Ayaale",
      locale: "en_LK",
      title,
      description: shortDescription,
      url,
      ...(image ? { images: [{ url: new URL(image, url).href, alt: title }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description: shortDescription,
      ...(image ? { images: [new URL(image, url).href] } : {}),
    },
  };
}
