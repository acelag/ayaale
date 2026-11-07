import { campaignQuery } from "@/lib/analytics/privacy.mjs";
import { photoStorage } from "@/lib/media/storage";
import { newsletterTokenPattern } from "@/lib/newsletter/copy";
import { newsletterOrigin, newsletterTokenDigest } from "@/lib/newsletter/server";

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

async function redirectOffer(request: Request, track: boolean) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !newsletterTokenPattern.test(token))
    return new Response(null, { status: 404, headers });
  const origin = newsletterOrigin();
  const client = photoStorage();
  if (!origin || !client) return new Response(null, { status: 503, headers });
  const agent = request.headers.get("user-agent") ?? "";
  const purpose = `${request.headers.get("purpose") ?? ""} ${request.headers.get("sec-purpose") ?? ""}`;
  const { data: slug, error } = await client.rpc("record_newsletter_click", {
    token_digest: newsletterTokenDigest(token),
    record_click:
      track &&
      !/bot\b|crawler|spider|preview|headless/i.test(agent) &&
      !/prefetch|prerender/i.test(purpose),
  });
  if (error) return new Response(null, { status: 503, headers });
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    return new Response(null, { status: 404, headers });
  return new Response(null, {
    status: 303,
    headers: {
      ...headers,
      Location: new URL(`/offers/${slug}?${campaignQuery("newsletter")}`, origin).href,
    },
  });
}

export async function GET(request: Request) {
  return redirectOffer(request, true);
}
export async function HEAD(request: Request) {
  return redirectOffer(request, false);
}
