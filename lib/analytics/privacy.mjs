export const CONSENT_KEY = "ayaale.analytics.v1";
export const CONSENT_AGE = 90 * 24 * 60 * 60 * 1000;

// Fixed campaigns prevent arbitrary query strings from becoming analytics data.
export const campaigns = {
  newsletter: ["newsletter", "email", "weekly-newsletter"],
  facebook: ["facebook", "social", "social-launch"],
  instagram: ["instagram", "social", "social-launch"],
  partner: ["partner", "referral", "partner-launch"],
};
export function campaignQuery(name) {
  const values = Object.hasOwn(campaigns, name) ? campaigns[name] : null;
  return values
    ? new URLSearchParams(
        values.map((value, index) => [["utm_source", "utm_medium", "utm_campaign"][index], value]),
      ).toString()
    : "";
}
export function publicPage(path) {
  if (path === "/") return { path: "/", type: "discovery", title: "Ayaale discovery" };
  if (/^\/offers\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path))
    return { path: "/offers", type: "offer", title: "Ayaale offer" };
  if (/^\/properties\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path))
    return { path: "/properties", type: "property", title: "Ayaale property" };
  return null;
}
export function safePage(url) {
  const parsed = new URL(url);
  const page = publicPage(parsed.pathname);
  if (!page || !/^https?:$/.test(parsed.protocol)) return null;
  let query = "";
  for (const name of Object.keys(campaigns)) {
    const expected = new URLSearchParams(campaignQuery(name));
    if (
      [...expected].every(
        ([key, value]) =>
          parsed.searchParams.getAll(key).length === 1 && parsed.searchParams.get(key) === value,
      )
    ) {
      query = `?${expected}`;
      break;
    }
  }
  return {
    page_location: `${parsed.origin}${page.path}${query}`,
    page_title: page.title,
    page_referrer: "",
    page_type: page.type,
  };
}
export function consentChoice(raw, now = Date.now()) {
  try {
    const item = JSON.parse(raw);
    if (
      (item.choice === "allow" || item.choice === "decline") &&
      Number.isFinite(item.time) &&
      item.time <= now &&
      now - item.time < CONSENT_AGE
    )
      return item.choice;
  } catch {
    /* Missing or malformed preference requires a fresh choice. */
  }
  return null;
}
export function analyticsEvent(name, value) {
  if (name === "contact_click" && ["call", "whatsapp"].includes(value)) return { channel: value };
  if (name === "category_select" && ["all", "stays", "dining", "day_outs"].includes(value))
    return { category: value };
  if (name === "offer_search") return {};
  return null;
}

export function safeReferrer(raw) {
  try {
    const url = new URL(raw);
    if (
      url.protocol === "https:" &&
      [
        "www.google.com",
        "www.google.lk",
        "www.bing.com",
        "www.facebook.com",
        "l.facebook.com",
        "www.instagram.com",
        "t.co",
      ].includes(url.hostname)
    )
      return url.origin;
  } catch {
    /* Missing and unknown referrers are omitted. */
  }
  return "";
}

export function analyticsConfigured(enabled, id, privacyUrl) {
  if (enabled !== "true" || !/^G-[A-Z0-9]{6,20}$/.test(id)) return false;
  try {
    const policy = new URL(privacyUrl);
    return (
      policy.protocol === "https:" &&
      Boolean(policy.hostname) &&
      !policy.username &&
      !policy.password
    );
  } catch {
    return false;
  }
}
