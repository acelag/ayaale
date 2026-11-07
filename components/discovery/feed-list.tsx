"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { OfferCard } from "./offer-card";
import { discoveryHref, type Category, type OfferCardData } from "@/lib/discovery/model";
import type { Filters } from "@/lib/discovery/filters";
import type { DiscoveryPage } from "@/lib/discovery/feed";
export function FeedList({
  initial,
  category,
  query,
  filters,
}: {
  initial: DiscoveryPage;
  category: Category;
  query: string;
  filters: Filters;
}) {
  const [offers, setOffers] = useState(initial.offers),
    [cursor, setCursor] = useState(initial.nextCursor),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const busy = useRef(false);
  async function more() {
    if (!cursor || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ ...filters, category, q: query, cursor });
      const response = await fetch(`/api/discovery?${params}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Unable to load offers");
      const data = (await response.json()) as DiscoveryPage;
      const known = new Set(offers.map((item) => item.id));
      const added = data.offers.filter((item: OfferCardData) => !known.has(item.id));
      setOffers([...offers, ...added]);
      setCursor(data.nextCursor);
      setMessage(
        added.length
          ? `${added.length} more ${added.length === 1 ? "offer" : "offers"} loaded.`
          : "No more offers available.",
      );
    } catch {
      setError("Couldn’t load more offers. Try again.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Showing {offers.length} {offers.length === 1 ? "offer" : "offers"}
      </p>
      <div className="offer-grid">
        {offers.map((offer) => (
          <OfferCard key={offer.id} offer={offer} />
        ))}
      </div>
      <p role="status" className="sr-only">
        {message}
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {(cursor || message) && (
        <div className="mt-7 text-center">
          <Button asChild variant="outline">
            <a
              href={cursor ? discoveryHref(category, query, cursor, filters) : "#offers"}
              aria-busy={loading}
              aria-disabled={loading || !cursor}
              onClick={(event) => {
                if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
                event.preventDefault();
                void more();
              }}
            >
              {loading ? "Loading offers…" : cursor ? "Load More" : "All offers shown"}
            </a>
          </Button>
        </div>
      )}
    </>
  );
}
