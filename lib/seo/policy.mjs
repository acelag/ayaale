export const CANONICAL_ORIGIN = "https://ayaale.com";
export function indexingEnabled(env) {
  return (
    env.PRELAUNCH_ENABLED !== "true" &&
    env.SEO_INDEXING_ENABLED === "true" &&
    env.APP_ENV === "production" &&
    env.NEXT_PUBLIC_SITE_URL === CANONICAL_ORIGIN &&
    env.IS_PULL_REQUEST !== "true" &&
    (!env.VERCEL_ENV || env.VERCEL_ENV === "production")
  );
}
export function verificationCode(env) {
  return env.APP_ENV === "production" &&
    env.NEXT_PUBLIC_SITE_URL === CANONICAL_ORIGIN &&
    /^[A-Za-z0-9_-]{10,200}$/.test(env.GOOGLE_SITE_VERIFICATION ?? "")
    ? env.GOOGLE_SITE_VERIFICATION
    : undefined;
}
export function canonical(path = "/") {
  if (path !== "/" && !/^\/(offers|properties)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path))
    throw new Error("Invalid canonical path");
  return path === "/" ? CANONICAL_ORIGIN : new URL(path, CANONICAL_ORIGIN).href;
}
export function summary(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}
export function jsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
export function discoveryVariant(params) {
  return Object.keys(params).some(
    (key) => !["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].includes(key),
  );
}
export function websiteData() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${canonical()}#website`,
    name: "Ayaale",
    url: canonical(),
    inLanguage: "en",
    description: "Discover Sri Lankan offers for stays, dining and day outs.",
  };
}
export function breadcrumbs(path, name) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Ayaale", item: canonical() },
      { "@type": "ListItem", position: 2, name, item: canonical(path) },
    ],
  };
}
