import "server-only";
import { filterError, readFilters, type Filters } from "./filters";
import {
  categories,
  offerIllustrations,
  priceUnits,
  type Category,
  type OfferCardData,
} from "./model";
type FeedRow = Omit<OfferCardData, "unit" | "image" | "coverage"> & {
  priceUnit: keyof typeof priceUnits;
  adults: number;
  children: number;
  nights: number | null;
};
export type DiscoveryPage = { offers: OfferCardData[]; nextCursor: string | null; total: number };
export function discoveryParams(params: Record<string, unknown>) {
  const category = categories.find((item) => item.id === params.category)?.id ?? "all";
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const cursor =
    typeof params.cursor === "string" && /^[a-zA-Z0-9_-]{1,1400}$/.test(params.cursor)
      ? params.cursor
      : null;
  return { category, query, cursor, filters: readFilters(params, category) };
}
export async function loadDiscoveryPage(
  category: Category,
  query: string,
  cursor: string | null,
  filters: Filters = {},
): Promise<DiscoveryPage> {
  if (filterError(filters)) throw new Error("Invalid filter range");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Discovery is unavailable");
  let continuation: unknown = null;
  if (cursor) {
    try {
      continuation = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    } catch {
      throw new Error("Invalid discovery cursor");
    }
  }
  const response = await fetch(new URL("/rest/v1/rpc/list_discovery_offers_filtered", url), {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ category_filter: category, query_text: query, continuation, filters }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Discovery is unavailable");
  const result = (await response.json()) as {
    offers: FeedRow[];
    continuation: object | null;
    total: number;
  };
  if (!Array.isArray(result.offers) || result.offers.length > 12)
    throw new Error("Invalid discovery response");
  return {
    total: result.total,
    offers: result.offers.map((row) => ({
      id: row.id,
      slug: row.slug,
      category: row.category,
      title: row.title,
      property: row.property,
      district: row.district,
      price: row.price,
      originalPrice: row.originalPrice,
      discountPercent: row.discountPercent,
      startingFrom: row.startingFrom,
      unit: priceUnits[row.priceUnit],
      image: offerIllustrations[row.category],
      inclusions: row.inclusions,
      coverage: [
        `${row.adults} ${row.adults === 1 ? "adult" : "adults"}`,
        row.children ? `${row.children} ${row.children === 1 ? "child" : "children"}` : null,
        row.nights ? `${row.nights} ${row.nights === 1 ? "night" : "nights"}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    nextCursor: result.continuation
      ? Buffer.from(JSON.stringify(result.continuation)).toString("base64url")
      : null,
  };
}
