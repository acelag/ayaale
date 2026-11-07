import type { Category } from "./model";

export const sorts = [
  { id: "newest", label: "Newest First" },
  { id: "price", label: "Lowest Price" },
  { id: "discount", label: "Biggest Discount" },
  { id: "ending", label: "Ending Soon" },
] as const;

export const filterFields = [
  "destination",
  "min",
  "max",
  "from",
  "to",
  "guests",
  "nights",
] as const;
export type FilterField = (typeof filterFields)[number];
export type Filters = Partial<Record<FilterField | "sort", string>>;

export function readFilters(params: Record<string, unknown>, category: Category): Filters {
  const result: Filters = {};
  const sort = sorts.find((item) => item.id === params.sort);
  if (sort && sort.id !== "newest") result.sort = sort.id;

  for (const field of filterFields) {
    const raw = params[field];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;
    if (field === "destination") {
      result[field] = value.slice(0, 80);
    } else if (field === "min" || field === "max") {
      if (/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) result[field] = value;
    } else if (field === "from" || field === "to") {
      if (/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) {
        const date = new Date(value);
        if (Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value)
          result[field] = value;
      }
    } else if (/^[1-9]\d{0,3}$/.test(value)) {
      if (field === "guests" && Number(value) <= 1000) result[field] = value;
      if (field === "nights" && category === "stays" && Number(value) <= 90) result[field] = value;
    }
  }
  return result;
}

export function filterError(filters: Filters) {
  if (filters.min && filters.max && Number(filters.min) > Number(filters.max)) {
    return "Maximum price must be at least the minimum price.";
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    return "End date must be on or after the start date.";
  }
  return null;
}
