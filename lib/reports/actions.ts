"use server";

import { headers } from "next/headers";
import { photoStorage } from "@/lib/media/storage";
import { isOfferSlug } from "@/lib/offers/public-details";
import { isPropertySlug } from "@/lib/properties/public-profile";
import { issueReasons, type ReportState, type ReportTarget } from "./form";

const reportId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const unavailable: ReportState = {
  status: "error",
  message: "We couldn’t send your report. Please try again in a moment.",
};

export async function submitIssueReport(
  target: ReportTarget,
  slug: string,
  id: string,
  _previous: ReportState,
  form: FormData,
): Promise<ReportState> {
  // Next.js validates Origin against the request host. Require the header as well.
  if (!(await headers()).get("origin")) return unavailable;
  if (
    (target !== "offer" && target !== "property") ||
    typeof slug !== "string" ||
    !(target === "offer" ? isOfferSlug(slug) : isPropertySlug(slug)) ||
    typeof id !== "string" ||
    !reportId.test(id) ||
    !(form instanceof FormData)
  )
    return unavailable;

  if (form.get("website")) return { status: "received" };

  const reason = form.get("reason");
  const comment = form.get("comment");
  const email = form.get("email");
  if (typeof reason !== "string" || !Object.hasOwn(issueReasons, reason)) {
    return { status: "error", field: "reason", message: "Choose a reason for your report." };
  }
  if (
    comment !== null &&
    (typeof comment !== "string" || comment.length > 2000 || comment.includes("\0"))
  ) {
    return {
      status: "error",
      field: "comment",
      message: "Enter a comment of up to 2,000 characters.",
    };
  }
  if (
    email !== null &&
    (typeof email !== "string" ||
      email.length > 254 ||
      (email.trim() && !emailPattern.test(email.trim())) ||
      email.includes("\0"))
  ) {
    return {
      status: "error",
      field: "email",
      message: "Enter a valid email address or leave it blank.",
    };
  }

  try {
    const client = photoStorage();
    if (!client) return unavailable;
    const { data, error } = await client.rpc("submit_public_issue_report", {
      target_kind: target,
      target_slug: slug,
      report_id: id,
      report_reason: reason,
      report_comment: comment?.trim() || null,
      contact_email: email?.trim() || null,
    });
    if (error) return unavailable;
    if (data === "received") return { status: "received" };
    if (data === "limited") {
      return {
        status: "error",
        message: "Too many reports were sent recently. Please try again later.",
      };
    }
    if (data === "unavailable") {
      return { status: "error", message: "This page can no longer receive reports." };
    }
    return unavailable;
  } catch {
    return unavailable;
  }
}
