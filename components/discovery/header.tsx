import type { Filters } from "@/lib/discovery/filters";
import Link from "next/link";
import { ArrowUpRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfferSearch } from "./search";
import type { Category } from "@/lib/discovery/model";
export function DiscoveryHeader({
  query,
  category,
  filters,
}: {
  query: string;
  category: Category;
  filters: Filters;
}) {
  return (
    <header className="discovery-header border-b bg-background">
      <div className="discovery-shell header-grid">
        <Link
          href="/"
          aria-label="Ayaale home"
          className="brand flex min-h-11 items-center gap-2 font-bold tracking-tight"
        >
          <Compass size={26} aria-hidden="true" className="text-primary" />
          ayaale<span className="text-primary">.</span>
        </Link>
        <OfferSearch query={query} category={category} filters={filters} />
        <Button asChild variant="outline" size="sm" className="property-link">
          <a href="/partner/signup">
            List Your Property
            <ArrowUpRight aria-hidden="true" />
          </a>
        </Button>
      </div>
    </header>
  );
}
