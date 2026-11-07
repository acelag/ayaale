import type { Filters } from "@/lib/discovery/filters";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Category } from "@/lib/discovery/model";
export function OfferSearch({
  query,
  category,
  filters,
}: {
  query: string;
  category: Category;
  filters: Filters;
}) {
  return (
    <form
      action="/#offers"
      method="get"
      role="search"
      data-analytics-search
      aria-label="Search offers"
      className="discovery-search"
    >
      <label htmlFor="offer-search" className="sr-only">
        Search destinations, hotels, or offers
      </label>
      <Search size={20} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      <input
        id="offer-search"
        name="q"
        type="search"
        maxLength={120}
        defaultValue={query}
        placeholder="Search destinations, hotels, or offers."
        className="min-w-0 flex-1 bg-transparent py-3 text-base outline-offset-[-3px]"
      />
      {category !== "all" && <input type="hidden" name="category" value={category} />}
      {Object.entries(filters).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" size="icon" aria-label="Search">
        <Search aria-hidden="true" />
      </Button>
    </form>
  );
}
