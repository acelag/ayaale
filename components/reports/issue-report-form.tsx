"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { submitIssueReport } from "@/lib/reports/actions";
import { issueReasons, type ReportTarget } from "@/lib/reports/form";

const inputClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function IssueReportForm({
  target,
  slug,
  reportId,
}: {
  target: ReportTarget;
  slug: string;
  reportId: string;
}) {
  const [submissionId] = useState(reportId);
  const [state, submit, pending] = useActionState(
    submitIssueReport.bind(null, target, slug, submissionId),
    { status: "idle" },
  );
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const errorField = state.status === "error" ? state.field : undefined;

  return (
    <section
      id="report-an-issue"
      className="mt-8 rounded-lg border bg-card p-5 sm:p-6"
      aria-labelledby="report-heading"
    >
      <h2 id="report-heading" className="text-xl font-semibold">
        Report an issue
      </h2>
      <noscript>
        <p className="mt-3 text-sm">Enable JavaScript to send an issue report.</p>
      </noscript>
      <div role="status">
        {state.status === "received" && (
          <p className="mt-3">Thank you. Ayaale received your report for review.</p>
        )}
      </div>
      {state.status !== "received" && (
        <form action={submit} className="mt-2 max-w-xl">
          <p className="mb-4 text-sm text-muted-foreground">
            Tell Ayaale what’s wrong with this {target}. You can report without an account.
          </p>
          <fieldset disabled={pending} className="grid min-w-0 gap-4" aria-label="Issue details">
            <label className="grid gap-1.5 font-medium" htmlFor="report-reason">
              Reason
              <select
                id="report-reason"
                name="reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={inputClass}
                aria-invalid={errorField === "reason" || undefined}
                aria-describedby={errorField === "reason" ? "report-error" : undefined}
              >
                <option value="">Choose a reason</option>
                {Object.entries(issueReasons).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 font-medium" htmlFor="report-comment">
              Comment (optional)
              <textarea
                id="report-comment"
                name="comment"
                rows={4}
                maxLength={2000}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className={inputClass}
                aria-invalid={errorField === "comment" || undefined}
                aria-describedby={errorField === "comment" ? "report-error" : undefined}
              />
            </label>
            <div className="grid gap-1.5">
              <label className="font-medium" htmlFor="report-email">
                Email (optional)
              </label>
              <input
                id="report-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
                aria-invalid={errorField === "email" || undefined}
                aria-describedby={
                  errorField === "email" ? "report-email-help report-error" : "report-email-help"
                }
              />
              <p id="report-email-help" className="text-sm text-muted-foreground">
                Ayaale may use your email to follow up. Your report is private.
              </p>
            </div>
            <div hidden>
              <label htmlFor="report-website">Leave this field blank</label>
              <input id="report-website" name="website" autoComplete="off" tabIndex={-1} />
            </div>
            {state.status === "error" && (
              <p id="report-error" role="alert" className="text-sm font-medium text-destructive">
                {state.message}
              </p>
            )}
            <Button type="submit" className="min-h-11 justify-self-start">
              {pending ? "Sending report…" : "Send report"}
            </Button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
