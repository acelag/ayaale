import type { PhotoAsset } from "@/lib/partner/profile-editor";

export const reviewChecks = {
  price: "Price and package coverage",
  dates: "Publication and redemption dates",
  inclusions: "Inclusions and category details",
  contact: "Verified business contact",
  photos: "Cover and gallery photos",
  terms: "Terms, taxes and restrictions",
};
export const reviewOperations = {
  approve: "Approve offer",
  request_changes: "Request changes",
  reject: "Reject revision",
};

export type ReviewQueueItem = {
  offerId: string;
  revisionId: string;
  title: string;
  property: string;
  number: number;
  status: string;
  submittedAt: string;
};
type ReviewRevision = {
  id: string;
  number: number;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  message: string | null;
};

export type OfferReview = {
  offerId: string;
  slug: string;
  offerStatus: string;
  approvedRevisionId: string | null;
  propertyId: string;
  property: string;
  district: string;
  address: string;
  phone: string | null;
  whatsapp: string | null;
  propertyVerified: boolean;
  version: string;
  revision: ReviewRevision;
  history: (ReviewRevision & { reviewer: string | null })[];
  preview: {
    title: string;
    short_description: string;
    category: string;
    promotional_price: number;
    original_price: number | null;
    discount_percent: number | null;
    price_unit: string;
    price_qualifier: string;
    package_coverage: string;
    adults: number;
    children: number;
    child_age_min: number | null;
    child_age_max: number | null;
    child_policy: string | null;
    nights: number | null;
    inclusions: string[];
    publication_starts_at: string;
    publication_ends_at: string;
    redemption_starts_on: string;
    redemption_ends_on: string;
    terms: string;
    taxes_included: boolean;
    tax_details: string | null;
    exclusions: string | null;
    restrictions: string | null;
    extra_charges: string | null;
    category_details: Record<string, string | number | string[]>;
  };
  cover: PhotoAsset | null;
  gallery: PhotoAsset[];
};

export const reviewTime = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});
