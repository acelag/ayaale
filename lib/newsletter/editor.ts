import { priceUnits } from "@/lib/discovery/model";

export const newsletterEditorPath = "/admin/newsletters";

export type NewsletterOffer = {
  id: string;
  revisionId: string;
  title: string;
  summary: string;
  category: "stays" | "dining" | "day_outs";
  price: number;
  unit: keyof typeof priceUnits;
  startingFrom: boolean;
  property: string;
  slug: string;
  current: boolean;
};
export type NewsletterDraft = {
  id: string;
  subject: string;
  intro: string;
  status: string;
  version: string;
  offers: NewsletterOffer[];
};

export { newsletterCategories, newsletterPrice, newsletterContent } from "./content.mjs";
