"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { useFormReady } from "@/components/partner/use-form-ready";
import { moderateReport } from "@/lib/admin/report-actions";
import {
  moderationOperations,
  reportPriorities,
  type ModerationOperation,
  type ReportDetail,
} from "@/lib/admin/reports";

const inputClass = "mt-1 block w-full rounded-md border border-input bg-background px-3 py-2";

export function ReportModerationForm({
  id,
  version,
  priority,
  status,
  canHide,
  canRestore,
  target,
  targetStatus,
}: Pick<
  ReportDetail,
  "id" | "version" | "priority" | "status" | "canHide" | "canRestore" | "target" | "targetStatus"
>) {
  const [result, submit, pending] = useActionState(moderateReport.bind(null, id, version), {
    message: "",
  });
  const [operation, setOperation] = useState("");
  const ready = useFormReady();
  const visible = operation === "temporarily_hide" || operation === "restore";
  const hidden = targetStatus === "hidden_by_admin" || targetStatus === "suspended";

  return (
    <form
      className="mt-5 rounded-lg border bg-card p-4 sm:p-5"
      aria-labelledby="moderation-heading"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => submit(data));
      }}
    >
      <h2 id="moderation-heading" className="text-xl font-semibold">
        Moderate complaint
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Each decision needs an internal note. Resolving or dismissing closes this complaint and
        leaves public visibility as it is.
      </p>
      {hidden && !canRestore && (
        <p className="mt-2 text-sm">This listing can’t be restored from this complaint.</p>
      )}
      <fieldset disabled={!ready || pending} className="mt-4 space-y-4">
        <div>
          <label htmlFor="moderation-action" className="font-semibold">
            Action
          </label>
          <select
            id="moderation-action"
            name="operation"
            className={inputClass}
            required
            value={operation}
            onChange={(event) => setOperation(event.target.value)}
          >
            <option value="">Choose an action</option>
            {(Object.keys(moderationOperations) as ModerationOperation[])
              .filter(
                (action) =>
                  (action !== "review" || status !== "investigating") &&
                  (action !== "temporarily_hide" || canHide) &&
                  (action !== "restore" || canRestore),
              )
              .map((action) => (
                <option value={action} key={action}>
                  {moderationOperations[action]}
                </option>
              ))}
          </select>
        </div>
        {operation === "change_priority" && (
          <div>
            <label htmlFor="moderation-priority" className="font-semibold">
              New priority
            </label>
            <select
              id="moderation-priority"
              name="priority"
              className={inputClass}
              required
              defaultValue=""
            >
              <option value="">Choose a priority</option>
              {Object.entries(reportPriorities)
                .filter(([key]) => key !== priority)
                .map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
        )}
        {operation === "request_changes" && (
          <div>
            <label htmlFor="owner-message" className="font-semibold">
              Instructions for the owner
            </label>
            <p id="owner-message-help" className="mt-1 text-sm text-muted-foreground">
              Describe the changes needed. Leave out reporter details. These instructions are queued
              for the owner.
            </p>
            <textarea
              id="owner-message"
              name="ownerMessage"
              aria-describedby="owner-message-help"
              className={inputClass}
              required
              maxLength={2000}
              rows={3}
            />
          </div>
        )}
        <div>
          <label htmlFor="moderation-note" className="font-semibold">
            Internal note
          </label>
          <textarea
            id="moderation-note"
            name="note"
            className={inputClass}
            required
            maxLength={4000}
            rows={3}
          />
        </div>
        {visible && (
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 shrink-0" name="confirm" required />
            <span>
              {operation === "restore"
                ? "I confirm restoring the previous visibility, subject to current publication rules."
                : target === "property"
                  ? "I confirm hiding the business profile and its offers from the public site."
                  : "I confirm hiding this offer from the public site."}
            </span>
          </label>
        )}
        <Button
          type="submit"
          className="min-h-11"
          variant={operation === "temporarily_hide" ? "destructive" : "default"}
        >
          {pending ? "Saving…" : "Save moderation action"}
        </Button>
      </fieldset>
      {result.message && (
        <p role="alert" className="mt-3 text-sm">
          {result.message}
        </p>
      )}
    </form>
  );
}
