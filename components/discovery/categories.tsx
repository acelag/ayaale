import type { Filters } from "@/lib/discovery/filters";
import { BedDouble, UtensilsCrossed, Sun, LayoutGrid } from "lucide-react";
import { categories, discoveryHref, type Category } from "@/lib/discovery/model";
const icons = { all: LayoutGrid, stays: BedDouble, dining: UtensilsCrossed, day_outs: Sun };
export function CategoryNavigation({
  selected,
  query,
  filters,
}: {
  selected: Category;
  query: string;
  filters: Filters;
}) {
  return (
    <nav aria-label="Offer categories" className="category-navigation">
      {categories.map((category) => {
        const Icon = icons[category.id];
        return (
          <a
            key={category.id}
            data-analytics-category={category.id}
            href={discoveryHref(category.id, query, undefined, filters)}
            aria-current={selected === category.id ? "page" : undefined}
            className="category-link"
          >
            <Icon size={18} aria-hidden="true" />
            {category.label}
          </a>
        );
      })}
    </nav>
  );
}
