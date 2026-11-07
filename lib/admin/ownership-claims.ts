export type ClaimStatus = "pending" | "approved" | "rejected";

export const claimStatusLabels = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

export type PartnerClaim = {
  id: string;
  name: string;
  status: ClaimStatus;
  propertyId: string | null;
  message: string | null;
};

export type AdminClaim = {
  id: string;
  name: string;
  district: string;
  status: ClaimStatus;
  createdAt: string;
};

export const claimSignals = {
  map: "Google Maps",
  name: "Name",
  address: "Street address",
  contact: "Business contact",
};

export type ClaimDetail = {
  id: string;
  details: Record<string, string>;
  applicantMessage: string;
  status: ClaimStatus;
  decisionMessage: string | null;
  evidence: string | null;
  candidates: {
    id: string;
    name: string;
    address: string;
    district: string;
    signals: (keyof typeof claimSignals)[];
    current: boolean;
  }[];
};
