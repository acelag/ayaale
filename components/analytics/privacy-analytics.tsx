"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { documentSource } from "@/lib/analytics/traffic-source.mjs";
import {
  analyticsConfigured,
  analyticsEvent,
  consentChoice,
  CONSENT_KEY,
  publicPage,
  safePage,
  safeReferrer,
} from "@/lib/analytics/privacy.mjs";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean;
};
let memoryChoice: string | null = null;
const changed = "ayaale:privacy-choice";
function snapshot() {
  let raw = memoryChoice;
  try {
    raw = memoryChoice ?? localStorage.getItem(CONSENT_KEY) ?? "";
  } catch {
    /* Use the session preference. */
  }
  return raw && consentChoice(raw) ? raw : "";
}
function subscribe(callback: () => void) {
  const storageChanged = () => {
    memoryChoice = null;
    callback();
  };
  window.addEventListener("storage", storageChanged);
  window.addEventListener(changed, callback);
  const timer = window.setInterval(callback, 60_000);
  return () => {
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener(changed, callback);
    clearInterval(timer);
  };
}
function browserDeclines() {
  return (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  );
}
function clearAnalyticsCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0];
    if (name === "_ga" || name.startsWith("_ga_"))
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}

export function PrivacyAnalytics() {
  const pathname = usePathname();
  const preference = useSyncExternalStore(subscribe, snapshot, () => "");
  const [editing, setEditing] = useState(false);
  const lastPage = useRef("");
  const choice = consentChoice(preference);
  const id = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "";
  const privacyUrl = process.env.NEXT_PUBLIC_ANALYTICS_PRIVACY_URL ?? "";
  const configured = analyticsConfigured(process.env.NEXT_PUBLIC_ANALYTICS_ENABLED, id, privacyUrl);
  const publicRoute = Boolean(publicPage(pathname));

  useEffect(() => {
    if (!configured) {
      documentSource.clear();
      return;
    }
    const target = window as unknown as AnalyticsWindow;
    if (!publicRoute || consentChoice(snapshot()) !== "allow" || browserDeclines()) {
      documentSource.clear();
      target[`ga-disable-${id}`] = true;
      clearAnalyticsCookies();
      // A loaded vendor runtime cannot be unloaded safely. Replace the document.
      if (document.getElementById("ayaale-ga4")) window.location.reload();
      return;
    }
    target[`ga-disable-${id}`] = false;
    documentSource.read(window.location.href, document.referrer, snapshot());
    const safe = safePage(window.location.href);
    const page = safe ? { ...safe, page_referrer: safeReferrer(document.referrer) } : null;
    if (!page) return;
    if (!target.gtag) {
      target.dataLayer = [];
      target.gtag = function () {
        // gtag's documented queue stores Arguments objects, not parameter arrays.
        // eslint-disable-next-line prefer-rest-params
        target.dataLayer!.push(arguments);
      };
      target.gtag("set", "ads_data_redaction", true);
      target.gtag("set", "url_passthrough", false);
      target.gtag("consent", "default", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      target.gtag("consent", "update", { analytics_storage: "granted" });
      target.gtag("js", new Date());
      target.gtag("config", id, {
        ...page,
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_domain: "none",
        cookie_expires: 90 * 24 * 60 * 60,
        cookie_update: false,
      });
      // Queue consent and safe defaults before fetching any Google resource.
      const script = document.createElement("script");
      script.id = "ayaale-ga4";
      script.async = true;
      script.referrerPolicy = "no-referrer";
      script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
      document.head.append(script);
    }
    target.gtag("set", page);
    if (lastPage.current !== window.location.href) {
      lastPage.current = window.location.href;
      target.gtag("event", "page_view", { ...page, send_to: id });
      if (page.page_type === "offer")
        target.gtag("event", "offer_detail_view", { ...page, send_to: id });
    }
    const emit = (name: string, value?: string) => {
      if (
        consentChoice(snapshot()) !== "allow" ||
        browserDeclines() ||
        !publicPage(window.location.pathname)
      )
        return;
      const params = analyticsEvent(name, value);
      if (params) target.gtag?.("event", name, { ...page, ...params, send_to: id });
    };
    const click = (event: MouseEvent) => {
      // Unload Google before crossing into account, auth or token routes.
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (
        anchor &&
        !anchor.target &&
        !anchor.hasAttribute("download") &&
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin === window.location.origin && !publicPage(url.pathname)) {
          event.preventDefault();
          event.stopPropagation();
          target[`ga-disable-${id}`] = true;
          window.location.assign(url.href);
          return;
        }
      }
      const element =
        event.target instanceof Element
          ? event.target.closest("[data-analytics-category], [data-analytics-contact]")
          : null;
      if (element?.hasAttribute("data-analytics-category"))
        emit("category_select", element.getAttribute("data-analytics-category") ?? "");
      if (element?.hasAttribute("data-analytics-contact"))
        emit("contact_click", element.getAttribute("data-analytics-contact") ?? "");
    };
    const submit = (event: SubmitEvent) => {
      if (
        event.target instanceof HTMLFormElement &&
        event.target.hasAttribute("data-analytics-search")
      )
        emit("offer_search");
    };
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit);
    };
  }, [configured, publicRoute, pathname, choice, id]);

  function choose(value: "allow" | "decline") {
    const record = JSON.stringify({ choice: value, time: Date.now() });
    try {
      localStorage.setItem(CONSENT_KEY, record);
      memoryChoice = null;
    } catch {
      memoryChoice = record;
    }
    setEditing(false);
    window.dispatchEvent(new Event(changed));
  }
  if (!configured || !publicRoute) return null;
  return (
    <section
      aria-label="Analytics privacy choices"
      className="border-t bg-background px-4 py-5 text-sm"
    >
      <div className="mx-auto max-w-5xl">
        {!choice || editing ? (
          <>
            <h2 className="font-semibold">Your analytics choice</h2>
            <p className="my-3 max-w-2xl">
              Allow Google Analytics cookies to help us understand visits and campaign traffic on
              public browsing pages. Google receives technical data about your browser and
              connection. Browsing works when you decline. You can change this choice here anytime.
            </p>
            <a href={privacyUrl} rel="noreferrer" className="underline underline-offset-4">
              Read our privacy notice
            </a>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => choose("allow")}>
                Allow analytics
              </Button>
              <Button variant="outline" onClick={() => choose("decline")}>
                Decline analytics
              </Button>
            </div>
          </>
        ) : (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Privacy choices
          </Button>
        )}
      </div>
    </section>
  );
}
