import { indexingEnabled } from "@/lib/seo/policy.mjs";
import { sitemapPaths, sitemapXml } from "@/lib/seo/sitemap.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!indexingEnabled(process.env)) return new Response(null, { status: 404, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return new Response(null, { status: 503, headers });
  try {
    const signal = AbortSignal.timeout(10_000);
    const paths = await sitemapPaths(async (after) => {
      const response = await fetch(new URL("/rest/v1/rpc/list_public_sitemap_paths", url), {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ after_path: after, page_size: 1000 }),
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Sitemap service unavailable");
      return response.json();
    });
    return new Response(sitemapXml(paths), {
      headers: { ...headers, "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch {
    return new Response(null, { status: 503, headers: { ...headers, "Retry-After": "300" } });
  }
}
