import type { Filters } from "./filters";
export const categories = [
  { id: "all", label: "All Offers" },
  { id: "stays", label: "Stays" },
  { id: "dining", label: "Dining" },
  { id: "day_outs", label: "Day Outs" },
] as const;
export type Category = (typeof categories)[number]["id"];
export type OfferCardData = {
  id: string;
  slug: string;
  category: Exclude<Category, "all">;
  title: string;
  property: string;
  district: string;
  price: number;
  unit: string;
  originalPrice?: number | null;
  discountPercent?: number | null;
  coverage: string;
  inclusions: string[];
  image: string;
  startingFrom?: boolean;
};
export function discoveryHref(
  category: Category,
  query = "",
  cursor?: string,
  filters: Filters = {},
) {
  const params = new URLSearchParams();
  if (category !== "all") params.set("category", category);
  if (query) params.set("q", query);
  if (cursor) params.set("cursor", cursor);
  for (const [key, value] of Object.entries(filters)) {
    if (value && (key !== "nights" || category === "stays")) params.set(key, value);
  }
  return params.size ? `/?${params.toString()}#offers` : "/#offers";
}

export const offerIllustrations = {
  stays: "/illustrations/stay.svg",
  dining: "/illustrations/dining.svg",
  day_outs: "/illustrations/day-out.svg",
};
export const priceUnits = {
  per_person: "per person",
  per_couple: "per couple",
  per_night: "per night",
  per_room: "per room",
  per_package: "per package",
  per_group: "per group",
};
