export function httpsLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

export function safeMapsUrl(value: string | null) {
  const url = httpsLink(value);
  if (!url) return null;
  if (["maps.google.com", "maps.app.goo.gl"].includes(url.hostname)) return url.href;
  if (
    ["www.google.com", "google.com", "www.google.lk", "google.lk"].includes(url.hostname) &&
    /^\/maps(?:\/|$)/.test(url.pathname)
  )
    return url.href;
  return null;
}

export function safeReviewsUrl(value: string | null) {
  const url = httpsLink(value);
  return url?.hostname === "g.page" ? url.href : safeMapsUrl(value);
}

export function safeSocialUrl(value: string | null, domain: "facebook.com" | "instagram.com") {
  const url = httpsLink(value);
  return url && (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url.href : null;
}
