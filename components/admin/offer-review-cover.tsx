"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { PhotoAsset } from "@/lib/partner/profile-editor";

export function OfferReviewCover({ propertyId, asset }: { propertyId: string; asset: PhotoAsset }) {
  const [url, setUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/properties/${propertyId}/photos/${asset.id}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (!response.ok) throw new Error();
        const { images } = await response.json();
        if (typeof images?.[0] !== "string" || !/^https?:\/\//.test(images[0])) throw new Error();
        if (!controller.signal.aborted) setUrl(images[0]);
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [propertyId, asset.id]);
  if (unavailable) return <p role="status">Cover preview unavailable. Refresh to try again.</p>;
  if (!url) return <p role="status">Loading cover preview…</p>;
  return (
    <Image
      src={url}
      alt="Submitted offer cover photo"
      width={asset.width}
      height={asset.height}
      unoptimized
      referrerPolicy="no-referrer"
      onError={() => setUnavailable(true)}
      className="aspect-[4/3] w-full rounded-md object-cover"
    />
  );
}
