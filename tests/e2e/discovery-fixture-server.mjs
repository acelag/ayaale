// Loopback test double for UI tests only; SQL correctness is tested in PostgreSQL.
import { createServer } from "node:http";
import sharp from "sharp";
import { handlePartnerFixture } from "./partner-fixture.mjs";

const coverPath = "fixture-property/fixture-cover/main.webp";
const cover = await sharp({ create: { width: 16, height: 12, channels: 3, background: "#446355" } })
  .webp()
  .toBuffer();
const items = Array.from({ length: 15 }, (_, index) => ({
  id: `fixture-${index + 1}`,
  slug: `fixture-coast-${index + 1}`,
  title: index === 1 ? "Fixture courtyard lunch" : `Fixture coast stay ${index + 1}`,
  category: index === 1 ? "dining" : "stays",
  property: index === 1 ? "Fixture restaurant" : "Fixture coast house",
  district: index === 1 ? "Colombo" : "Galle",
  price: index === 0 ? 18500 : 6500,
  originalPrice: index === 0 ? 24000 : null,
  discountPercent: index === 0 ? 22.91 : null,
  priceUnit: index === 1 ? "per_couple" : "per_night",
  startingFrom: false,
  adults: 2,
  children: 0,
  nights: index === 1 ? null : 1,
  inclusions: ["Breakfast included", "Pool access"],
}));
const unavailableOffers = {
  "fixture-expired": { state: "ended", title: "Fixture former weekend" },
  "fixture-paused": { state: "paused", title: "Fixture paused stay" },
  "fixture-unavailable": { state: "unavailable", title: null },
};
createServer(async (req, res) => {
  if (req.url === "/ready") {
    res.end("ok");
    return;
  }
  if (req.method === "GET" && req.url === `/storage/v1/object/ayaale-private-photos/${coverPath}`) {
    if (req.headers.apikey !== "synthetic-service-key-for-tests") {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "image/webp" }).end(cover);
    return;
  }
  if (
    req.method === "GET" &&
    req.url === `/storage/v1/object/ayaale-private-photos/${coverPath}?token=fixture`
  ) {
    res.writeHead(200, { "Content-Type": "image/webp" }).end(cover);
    return;
  }
  if (await handlePartnerFixture(req, res)) return;
  if (req.method !== "POST" || !req.url?.startsWith("/rest/v1/rpc/")) {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const input = JSON.parse(body);
    if (
      req.url === "/rest/v1/rpc/request_newsletter_signup" ||
      req.url === "/rest/v1/rpc/apply_newsletter_token"
    ) {
      if (req.headers.apikey !== "synthetic-service-key-for-tests") {
        res.writeHead(401).end();
        return;
      }
      if (req.url.endsWith("request_newsletter_signup")) {
        // Tests never reach a live email provider.
        const accepted =
          typeof input.subscriber_email === "string" &&
          /^[a-f0-9]{64}$/.test(input.confirm_digest) &&
          /^[a-f0-9]{64}$/.test(input.unsubscribe_digest) &&
          input.privacy_version === "fixture-privacy-v1";
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ status: accepted ? "accepted" : "invalid" }));
        return;
      }
      const status = !/^[a-f0-9]{64}$/.test(input.token_digest)
        ? "invalid"
        : input.token_purpose === "confirm"
          ? "confirmed"
          : "withdrawn";
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(status));
      return;
    }
    if (req.url === "/rest/v1/rpc/record_newsletter_click") {
      if (req.headers.apikey !== "synthetic-service-key-for-tests") {
        res.writeHead(401).end();
        return;
      }
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify("fixture-coast-1"));
      return;
    }
    if (req.url === "/rest/v1/rpc/submit_public_issue_report") {
      if (req.headers.apikey !== "synthetic-service-key-for-tests") {
        res.writeHead(401).end();
        return;
      }
      const validTarget =
        (input.target_kind === "offer" &&
          ["fixture-coast-1", "fixture-paused"].includes(input.target_slug)) ||
        (input.target_kind === "property" && input.target_slug === "fixture-coast-house");
      const result = !validTarget
        ? "unavailable"
        : input.report_reason === "other"
          ? "limited"
          : "received";
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
      return;
    }
    if (req.url === "/rest/v1/rpc/get_public_property_photo_path") {
      if (req.headers.apikey !== "synthetic-service-key-for-tests") {
        res.writeHead(401).end();
        return;
      }
      const path =
        input.property_slug === "fixture-coast-house" && [1, 2].includes(input.photo_position)
          ? coverPath
          : null;
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(path));
      return;
    }
    if (req.url === "/rest/v1/rpc/list_public_sitemap_paths") {
      const paths = [
        ...items.map((item) => `/offers/${item.slug}`),
        "/properties/fixture-coast-house",
      ].sort();
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify(
          paths
            .filter((path) => !input.after_path || path > input.after_path)
            .slice(0, input.page_size)
            .map((path) => ({ path })),
        ),
      );
      return;
    }
    if (req.url === "/rest/v1/rpc/get_public_property_profile") {
      const property =
        input.property_slug === "fixture-coast-house"
          ? {
              name: "Fixture coast house",
              description: "A small stay near the coast.",
              category: "stays",
              propertyType: "guest_house",
              address: "1 Fixture Lane",
              district: "Galle",
              mapsUrl: "https://maps.google.com/?q=Galle",
              reviewsUrl: "https://g.page/r/fixture/review",
              phone: "+94771234567",
              whatsapp: null,
              email: "hello@example.invalid",
              websiteUrl: "https://example.invalid",
              facebookUrl: null,
              instagramUrl: null,
              amenities: ["Wi-Fi", "Pool", "Parking", "Garden", "Outdoor shower"],
              photos: [
                { position: 1, alt: "Garden entrance" },
                { position: 2, alt: "Pool deck" },
              ],
              offers: [],
            }
          : null;
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(property));
      return;
    }
    if (
      ["/rest/v1/rpc/record_offer_contact_click", "/rest/v1/rpc/record_offer_view"].includes(
        req.url,
      )
    ) {
      if (req.headers.apikey !== "synthetic-service-key-for-tests") {
        res.writeHead(401).end();
        return;
      }
      const result = input.offer_slug === items[0].slug ? "recorded" : "unavailable";
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
      return;
    }
    if (req.url === "/rest/v1/rpc/get_public_offer_cover_path") {
      if (req.headers.apikey !== "synthetic-service-key-for-tests") {
        res.writeHead(401).end();
        return;
      }
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify(input.offer_slug === items[0].slug ? coverPath : null));
      return;
    }
    if (req.url === "/rest/v1/rpc/get_public_offer_page") {
      const unavailable = Object.hasOwn(unavailableOffers, input.offer_slug)
        ? unavailableOffers[input.offer_slug]
        : null;
      const item = items.find((offer) => offer.slug === input.offer_slug);
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify(
          item
            ? {
                state: "active",
                offer: {
                  ...item,
                  description: "A coastal weekend with breakfast.",
                  coverage: "Two adults in one room",
                  address: "1 Fixture Lane",
                  propertySlug: "fixture-coast-house",
                  phone: item === items[0] ? "+94771234567" : null,
                  whatsapp: item === items[0] ? "+94777654321" : null,
                  mapsUrl: "https://maps.google.com/?q=Galle",
                  terms: "Advance reservation is required.",
                  taxesIncluded: false,
                  taxDetails: "Local taxes apply at checkout.",
                  restrictions: "Subject to availability.",
                  exclusions: "Transport",
                  extraCharges: "Optional dinner",
                  publicationStart: "2026-11-05T02:00:00Z",
                  publicationEnd: "2026-11-12T02:00:00Z",
                  redemptionStart: "2026-11-20",
                  redemptionEnd: "2026-11-27",
                  details: { room_type: "Garden room" },
                  hasCover: item === items[0],
                },
              }
            : unavailable && {
                ...unavailable,
                related:
                  unavailable.state === "unavailable"
                    ? []
                    : items.slice(0, 2).map(({ slug, title, property, district }) => ({
                        slug,
                        title,
                        property,
                        district,
                      })),
              },
        ),
      );
      return;
    }
    if (req.url !== "/rest/v1/rpc/list_discovery_offers_filtered") {
      res.writeHead(404).end();
      return;
    }
    const { category_filter, query_text, continuation, filters } = input;
    if (query_text === "provider-offline") {
      res.writeHead(503).end();
      return;
    }
    const filtered = items.filter(
      (x) =>
        (category_filter === "all" || x.category === category_filter) &&
        `${x.title} ${x.property} ${x.district}`.toLowerCase().includes(query_text.toLowerCase()) &&
        x.district.toLowerCase().includes((filters.destination ?? "").toLowerCase()) &&
        x.price >= Number(filters.min ?? 0) &&
        x.price <= Number(filters.max ?? Infinity),
    );
    if (filters.sort === "price") filtered.sort((a, b) => a.price - b.price);
    const offset = continuation?.offset ?? 0,
      end = offset + 12;
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        offers: filtered.slice(offset, end),
        total: filtered.length,
        continuation: end < filtered.length ? { offset: end } : null,
      }),
    );
  } catch {
    res.writeHead(400).end();
  }
}).listen(3101, "127.0.0.1");
