export const offerStates: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  approved: "Approved",
  scheduled: "Scheduled",
  active: "Active",
  paused: "Paused",
  ended: "Ended",
  expired: "Expired",
  hidden_by_admin: "Hidden by Ayaale",
  unavailable: "Unavailable",
};

export const offerOperations = {
  pause: "Pause",
  resume: "Resume",
  end: "End offer",
  duplicate: "Duplicate",
  edit: "Edit for review",
} as const;

export type OfferOperation = keyof typeof offerOperations;
export type PartnerOffer = {
  id: string;
  title: string | null;
  category: string | null;
  status: string;
  updatedAt: string;
} & (
  | { kind: "draft"; editDraft: boolean }
  | {
      kind: "offer";
      version: string;
      reviewStatus: string | null;
      reviewMessage: string | null;
      hasRevision: boolean;
      slug: string;
      wasPublished: boolean;
      publicationEnd: string | null;
      redemptionEnd: string | null;
      canPause: boolean;
      canResume: boolean;
      canEnd: boolean;
      history?: { views: number; clicks: number };
    }
);
export type OfferCapacity = {
  active: number;
  limit: number;
  eligibility: "available" | "unverified" | "no_entitlement";
};
