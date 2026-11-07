import { priceUnits } from "@/lib/discovery/model";

export type WizardContent = { fields: Record<string, string>; gallery: string[] };
export type OfferDraft = {
  id: string;
  version: number;
  content: { [key: string]: string | string[]; gallery: string[] };
  submitted: boolean;
};
export type WizardData = {
  draft: OfferDraft | null;
  drafts: { id: string; title: string | null }[];
};
export const wizardSteps = [
  "Basics",
  "Price and inclusions",
  "Dates and terms",
  "Photos",
  "Preview",
] as const;

export type WizardField = {
  name: string;
  label: string;
  max?: number;
  type?: string;
  multiline?: boolean;
  options?: Record<string, string>;
  required?: boolean;
};
export const basics: WizardField[] = [
  {
    name: "category",
    label: "Category",
    options: { stays: "Stays", dining: "Dining", day_outs: "Day Outs" },
    required: true,
  },
  { name: "title", label: "Offer title", max: 180, required: true },
  {
    name: "short_description",
    label: "Short description",
    max: 280,
    multiline: true,
    required: true,
  },
];
export const pricing: WizardField[] = [
  {
    name: "promotional_price",
    label: "Promotional price (LKR)",
    type: "decimal",
    max: 13,
    required: true,
  },
  { name: "original_price", label: "Original price (LKR)", type: "decimal", max: 13 },
  { name: "price_unit", label: "Price unit", options: priceUnits, required: true },
  {
    name: "price_qualifier",
    label: "Price type",
    options: { exact: "Exact price", starting_from: "Starting from" },
    required: true,
  },
  {
    name: "package_coverage",
    label: "Package coverage",
    max: 1000,
    multiline: true,
    required: true,
  },
  { name: "adults", label: "Adults included", type: "integer", max: 4, required: true },
  { name: "children", label: "Children included", type: "integer", max: 4 },
  { name: "nights", label: "Nights included", type: "integer", max: 2, required: true },
  { name: "child_age_min", label: "Minimum child age", type: "integer", max: 2, required: true },
  { name: "child_age_max", label: "Maximum child age", type: "integer", max: 2, required: true },
  { name: "child_policy", label: "Child policy", max: 2000, multiline: true, required: true },
  {
    name: "inclusions",
    label: "Inclusions (one per line)",
    max: 3612,
    multiline: true,
    required: true,
  },
];
export const conditions: WizardField[] = [
  {
    name: "publication_starts_at",
    label: "Publication starts",
    type: "datetime-local",
    required: true,
  },
  {
    name: "publication_ends_at",
    label: "Publication ends",
    type: "datetime-local",
    required: true,
  },
  { name: "redemption_starts_on", label: "Redemption starts", type: "date", required: true },
  { name: "redemption_ends_on", label: "Redemption ends", type: "date", required: true },
  { name: "terms", label: "Terms and conditions", max: 10000, multiline: true, required: true },
  {
    name: "taxes_included",
    label: "Are taxes included?",
    options: { yes: "Yes", no: "No" },
    required: true,
  },
  { name: "tax_details", label: "Tax details", max: 2000, multiline: true },
  { name: "exclusions", label: "Exclusions", max: 2000, multiline: true },
  { name: "restrictions", label: "Restrictions", max: 2000, multiline: true },
  { name: "extra_charges", label: "Extra charges", max: 2000, multiline: true },
];
export const categoryFields: Record<string, WizardField[]> = {
  stays: [
    { name: "room_type", label: "Room type" },
    { name: "meal_plan", label: "Meal plan" },
    { name: "check_in_time", label: "Check-in time", type: "time" },
    { name: "check_out_time", label: "Check-out time", type: "time" },
    { name: "extra_bed_policy", label: "Extra bed policy", multiline: true },
  ],
  dining: [
    { name: "meal_period", label: "Meal period" },
    { name: "service_start", label: "Meal service starts", type: "time" },
    { name: "service_end", label: "Meal service ends", type: "time" },
    { name: "cuisine", label: "Cuisine" },
    { name: "menu", label: "Menu", multiline: true },
    { name: "booking_notice", label: "Booking notice" },
  ],
  day_outs: [
    { name: "access_start", label: "Access starts", type: "time" },
    { name: "access_end", label: "Access ends", type: "time" },
    { name: "facilities", label: "Facilities", multiline: true },
    { name: "meal_details", label: "Meal details", multiline: true },
    { name: "access_restrictions", label: "Access restrictions", multiline: true },
  ],
};
export const wizardFields = [
  ...basics,
  ...pricing,
  ...conditions,
  ...Object.values(categoryFields).flat(),
];
export const lines = (text = "") =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
const cents = (text: string) => {
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
};
export function offerDiscount(promo: string, original: string) {
  const valid = /^[0-9]{1,10}(\.[0-9]{1,2})?$/;
  if (!valid.test(promo) || !valid.test(original)) return null;
  const price = cents(promo),
    previous = cents(original);
  return price > BigInt(0) && previous > price
    ? Number(((previous - price) * BigInt(10000)) / previous) / 100
    : null;
}

export function validateWizard({ fields, gallery }: WizardContent) {
  const filled = (field: string, min = 1) => (fields[field]?.trim().length ?? 0) >= min;
  const price = /^[0-9]{1,10}(\.[0-9]{1,2})?$/;
  const integer = (field: string, min: number, max: number, fallback = "") => {
    const value = fields[field] || fallback;
    return /^[0-9]+$/.test(value) && Number(value) >= min && Number(value) <= max;
  };
  if (
    !Object.hasOwn(categoryFields, fields.category) ||
    !filled("title", 2) ||
    !filled("short_description", 2)
  ) {
    return { step: 0, message: "Choose a category and enter a title and short description." };
  }
  if (
    !price.test(fields.promotional_price ?? "") ||
    Number(fields.promotional_price) <= 0 ||
    (filled("original_price") &&
      offerDiscount(fields.promotional_price, fields.original_price) === null) ||
    !Object.hasOwn(priceUnits, fields.price_unit) ||
    !["exact", "starting_from"].includes(fields.price_qualifier)
  ) {
    return {
      step: 1,
      message:
        "Enter a valid promotional price and pricing unit. An original price must be higher.",
    };
  }
  const benefits = lines(fields.inclusions);
  if (
    !filled("package_coverage", 2) ||
    !integer("adults", 1, 1000) ||
    !integer("children", 0, 1000, "0") ||
    (fields.category === "stays" && !integer("nights", 1, 90)) ||
    (Number(fields.children) > 0 &&
      (!integer("child_age_min", 0, 17) ||
        !integer("child_age_max", 0, 17) ||
        Number(fields.child_age_min) > Number(fields.child_age_max) ||
        !filled("child_policy", 2))) ||
    !benefits.length ||
    benefits.length > 12 ||
    benefits.some((value) => value.length > 300)
  ) {
    return {
      step: 1,
      message:
        "Check package coverage, guest counts, child ages and policy, and up to 12 inclusions.",
    };
  }
  if (
    !filled("publication_starts_at") ||
    !filled("publication_ends_at") ||
    fields.publication_starts_at >= fields.publication_ends_at ||
    !filled("redemption_starts_on") ||
    !filled("redemption_ends_on") ||
    fields.redemption_starts_on > fields.redemption_ends_on
  ) {
    return {
      step: 2,
      message: "Set both publication and redemption windows, with their start and end in order.",
    };
  }
  if (
    !filled("terms", 2) ||
    !["yes", "no"].includes(fields.taxes_included) ||
    (fields.taxes_included === "no" && !filled("tax_details", 2))
  ) {
    return {
      step: 2,
      message:
        "Enter the terms and indicate whether taxes are included. Explain any additional taxes.",
    };
  }
  if (!filled("cover") || gallery.includes(fields.cover)) {
    return { step: 3, message: "Choose a cover photo that is separate from the gallery." };
  }
  return null;
}
