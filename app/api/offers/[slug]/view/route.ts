import { photoStorage } from "@/lib/media/storage";
import { isOfferSlug } from "@/lib/offers/public-details";
import { offerViewTrackingEnabled } from "@/lib/offers/view-tracking";
import { acceptedSource } from "@/lib/analytics/traffic-source.mjs";
import { analyticsConfigured } from "@/lib/analytics/privacy.mjs";

const headers = { "Cache-Control": "no-store" };
const eventId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const automatedAgent = /bot\b|crawler|spider|headless|preview|lighthouse|synthetic/i;

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const origin = request.headers.get("origin");
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!origin || origin !== site) return new Response(null, { status: 403, headers });

  const agent = request.headers.get("user-agent");
  if (
    !offerViewTrackingEnabled() ||
    !agent ||
    automatedAgent.test(agent) ||
    request.headers.get("sec-gpc") === "1" ||
    request.headers.get("dnt") === "1"
  ) {
    return new Response(null, { status: 204, headers });
  }

  const { slug } = await params;
  const token = request.headers.get("x-offer-view");
  if (!isOfferSlug(slug) || !token || !eventId.test(token)) {
    return new Response(null, { status: 400, headers });
  }

  const client = photoStorage();
  if (!client) return new Response(null, { status: 503, headers });
  const sourceEnabled = analyticsConfigured(
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED,
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "",
    process.env.NEXT_PUBLIC_ANALYTICS_PRIVACY_URL ?? "",
  );
  const { data, error } = await client.rpc("record_offer_view_attributed", {
    offer_slug: slug,
    event_token: token,
    traffic_source: sourceEnabled
      ? acceptedSource(request.headers.get("x-offer-source"))
      : "unknown",
  });
  if (error) return new Response(null, { status: 503, headers });
  if (data === "unavailable") return new Response(null, { status: 404, headers });
  if (data === "limited") {
    return new Response(null, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  }
  return new Response(null, { status: 204, headers });
}
