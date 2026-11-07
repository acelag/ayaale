import type { issueReasons } from "@/lib/reports/form";

export const reportsPath = "/admin/reports";
export const reportStatuses = {
  open: "Open",
  investigating: "Investigating",
  awaiting_changes: "Awaiting changes",
  resolved: "Resolved",
  dismissed: "Dismissed",
};
export const reportPriorities = { high: "High", medium: "Medium", low: "Low" };
export const moderationOperations = {
  review: "Start investigation",
  change_priority: "Change priority",
  request_changes: "Request changes from owner",
  temporarily_hide: "Hide immediately",
  restore: "Restore previous visibility",
  resolve: "Resolve complaint",
  dismiss: "Dismiss complaint",
};
export type ModerationOperation = keyof typeof moderationOperations;
export type ReportSummary = {
  id: string;
  reason: keyof typeof issueReasons;
  priority: keyof typeof reportPriorities;
  status: keyof typeof reportStatuses;
  receivedAt: string;
  property: string;
  title: string;
  target: "offer" | "property";
};
export type ReportDetail = ReportSummary & {
  resolvedAt: string | null;
  version: string;
  comment: string | null;
  reporterEmail: string | null;
  targetStatus: string;
  canHide: boolean;
  canRestore: boolean;
  actions: {
    id: string;
    action: ModerationOperation | "reopen";
    at: string;
    actor: string;
    note: string;
    changes: {
      statusBefore?: ReportSummary["status"];
      statusAfter?: ReportSummary["status"];
      priorityBefore?: ReportSummary["priority"];
      priorityAfter?: ReportSummary["priority"];
      targetBefore?: string;
      targetAfter?: string;
      ownerMessage?: string;
    };
  }[];
  related: ReportSummary[];
};

export function reportPage(value: unknown) {
  return typeof value === "string" && /^\d{1,6}$/.test(value) ? Number(value) : 0;
}
