"use client";

import { useEffect } from "react";
import { analyticsConfigured, CONSENT_KEY } from "@/lib/analytics/privacy.mjs";
import { documentSource } from "@/lib/analytics/traffic-source.mjs";

const repeatWindow = 30 * 60 * 1000;

export function RecordOfferView({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `ayaale-view:${slug}`;
    let sent = false;
    function record() {
      if (
        sent ||
        document.visibilityState !== "visible" ||
        navigator.webdriver ||
        navigator.doNotTrack === "1" ||
        ("globalPrivacyControl" in navigator && navigator.globalPrivacyControl === true)
      )
        return;
      sent = true;
      try {
        const [until, previousToken] = (sessionStorage.getItem(key) ?? "").split(":");
        const token =
          Number(until) > Date.now() && previousToken ? previousToken : crypto.randomUUID();
        if (token !== previousToken)
          sessionStorage.setItem(key, `${Date.now() + repeatWindow}:${token}`);
        let source = "unknown";
        try {
          if (
            analyticsConfigured(
              process.env.NEXT_PUBLIC_ANALYTICS_ENABLED,
              process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "",
              process.env.NEXT_PUBLIC_ANALYTICS_PRIVACY_URL ?? "",
            )
          )
            source = documentSource.read(
              window.location.href,
              document.referrer,
              localStorage.getItem(CONSENT_KEY),
            );
        } catch {
          // Blocked consent storage must not invent attribution or stop the basic view count.
        }
        void fetch(`/api/offers/${slug}/view`, {
          method: "POST",
          credentials: "omit",
          headers: {
            "x-offer-view": token,
            "x-offer-source": source,
          },
          keepalive: true,
          referrerPolicy: "no-referrer",
        }).catch(() => {});
      } catch {
        // Browsing still works when storage or view collection is unavailable.
      }
    }
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [slug]);
  return null;
}
