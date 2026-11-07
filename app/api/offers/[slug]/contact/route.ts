import { photoStorage } from "@/lib/media/storage";
import { isOfferSlug } from "@/lib/offers/public-details";

const headers = { "Cache-Control": "no-store" };
const eventId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const origin = request.headers.get("origin");
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!origin || origin !== site) {
    return new Response(null, { status: 403, headers });
  }

  const { slug } = await params;
  const channel = request.headers.get("x-contact-channel");
  const token = request.headers.get("x-contact-event");
  if (
    !isOfferSlug(slug) ||
    (channel !== "whatsapp" && channel !== "call") ||
    !token ||
    !eventId.test(token)
  ) {
    return new Response(null, { status: 400, headers });
  }

  const client = photoStorage();
  if (!client) return new Response(null, { status: 503, headers });

  const { data, error } = await client.rpc("record_offer_contact_click", {
    offer_slug: slug,
    contact_channel: channel,
    event_token: token,
  });
  if (error) return new Response(null, { status: 503, headers });
  if (data === "unavailable") return new Response(null, { status: 404, headers });
  if (data === "limited") {
    return new Response(null, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  }
  return new Response(null, { status: 204, headers });
}
