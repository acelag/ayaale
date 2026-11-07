import type { EditorProfile } from "@/lib/partner/profile-editor";

export const verificationQueues = {
  pending: "Pending review",
  waiting: "Waiting for information",
  verified: "Verified properties",
  closed: "Rejected or suspended",
};

export const decisionLabels = {
  approve: "Approve property",
  request_info: "Request more information",
  reject: "Reject request",
  suspend: "Suspend property",
};

export type VerificationQueue = keyof typeof verificationQueues;
export type VerificationListItem = {
  id: string;
  name: string;
  district: string;
  propertyStatus: string;
  requestStatus: string | null;
  kind: "initial" | "critical_change" | null;
};

type ReviewProfile = Partial<EditorProfile> & {
  primary_category?: string;
  property_type?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type VerificationDetail = {
  id: string;
  name: string;
  status: string;
  version: string;
  current: ReviewProfile;
  request: {
    status: string;
    kind: "initial" | "critical_change";
    proposed: ReviewProfile;
    applicant: string | null;
    message: string | null;
    decisionMessage: string | null;
  } | null;
  history: {
    id: string;
    action: keyof typeof decisionLabels;
    message: string | null;
    evidence: string | null;
    method: string | null;
    at: string;
  }[];
};

export const verificationMethods = {
  independent_contact: "Independent business contact",
  supporting_evidence: "Supporting evidence",
  both: "Independent contact and supporting evidence",
};
