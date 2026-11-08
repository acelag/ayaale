import { campaigns, campaignQuery, consentChoice, publicPage } from "./privacy.mjs";

export const sourceLabels = {
  unknown: "Unknown",
  direct: "Direct",
  newsletter: "Newsletter",
  search: "Search",
  social: "Social",
  referral: "Referral",
};

// Only bounded categories leave the browser. No raw URL, query or referrer is sent.
export function trafficSource(href, referrer, consent, now = Date.now()) {
  if (consentChoice(consent, now) !== "allow") return "unknown";
  try {
    const url = new URL(href);
    if (!/^https?:$/.test(url.protocol)) return "unknown";
    const hasCampaign = [...url.searchParams.keys()].some((key) => /^utm_/i.test(key));
    if (hasCampaign) {
      // Extra, partial, duplicated or unknown campaign tags are ambiguous.
      const keys = [...url.searchParams.keys()].filter((key) => /^utm_/i.test(key));
      if (keys.length !== 3) return "unknown";
      for (const name of Object.keys(campaigns)) {
        if (
          [...new URLSearchParams(campaignQuery(name))].every(
            ([key, value]) =>
              url.searchParams.getAll(key).length === 1 && url.searchParams.get(key) === value,
          )
        )
          return name === "newsletter" ? "newsletter" : name === "partner" ? "referral" : "social";
      }
      return "unknown";
    }
    const from = new URL(referrer);
    if (
      from.protocol !== "https:" ||
      from.port ||
      from.username ||
      from.password ||
      from.origin === url.origin
    )
      return "unknown";
    if (["www.google.com", "www.google.lk", "www.bing.com"].includes(from.hostname))
      return "search";
    if (["www.facebook.com", "l.facebook.com", "www.instagram.com", "t.co"].includes(from.hostname))
      return "social";
  } catch {
    // An absent referrer is not proof of a direct visit.
  }
  return "unknown";
}

export function acceptedSource(value) {
  return ["newsletter", "search", "social", "referral"].includes(value) ? value : "unknown";
}

// Retain a consenting public landing source only in this document's memory.
// Full reloads/new tabs start afresh. No cross-session attribution or identifier.
export function createSourceContext() {
  let entry = null;
  return {
    clear() {
      entry = null;
    },
    read(href, referrer, consent, now = Date.now()) {
      try {
        const url = new URL(href);
        if (consentChoice(consent, now) !== "allow" || !publicPage(url.pathname)) {
          entry = null;
          return "unknown";
        }
        const campaign = [...url.searchParams.keys()].some((key) => /^utm_/i.test(key));
        const campaignSource = campaign ? trafficSource(href, referrer, consent, now) : null;
        if (entry && entry.origin !== url.origin) entry = null;
        if (entry && (now >= entry.until || now < entry.started)) {
          if (!campaign || entry.campaign === campaignSource) return "unknown";
          entry = null;
        }
        if (!entry || campaign) {
          const source = campaignSource ?? trafficSource(href, referrer, consent, now);
          // Repeated evidence does not extend the window. Keep no URL or query values.
          if (!entry || entry.campaign !== campaignSource)
            entry = {
              campaign: campaignSource,
              origin: url.origin,
              source,
              started: now,
              until: now + 30 * 60 * 1000,
            };
        }
        return entry.source;
      } catch {
        entry = null;
        return "unknown";
      }
    },
  };
}

export const documentSource = createSourceContext();
