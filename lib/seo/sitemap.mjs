import { canonical } from "./policy.mjs";
// Keep failures visible to crawlers; never replace an unavailable catalogue with an empty sitemap.
export async function sitemapPaths(fetchPage) {
  const paths = ["/"];
  let after = null;
  for (let batch = 0; batch < 50; batch++) {
    const rows = await fetchPage(after);
    if (!Array.isArray(rows) || rows.length > 1000) throw new Error("Invalid sitemap response");
    for (const row of rows) {
      if (
        !row ||
        typeof row.path !== "string" ||
        !/^\/(offers|properties)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.path) ||
        (after !== null && row.path <= after)
      )
        throw new Error("Invalid sitemap path");
      paths.push(row.path);
      after = row.path;
      if (paths.length > 50_000) throw new Error("Sitemap requires sharding");
    }
    if (rows.length < 1000) return paths;
  }
  throw new Error("Sitemap requires sharding");
}
export function sitemapXml(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${canonical(path)}</loc></url>`).join("")}</urlset>`;
}
