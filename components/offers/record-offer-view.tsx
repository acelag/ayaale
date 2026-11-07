"use client";

import { useEffect } from "react";

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
        void fetch(`/api/offers/${slug}/view`, {
          method: "POST",
          credentials: "omit",
          headers: { "x-offer-view": token },
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
