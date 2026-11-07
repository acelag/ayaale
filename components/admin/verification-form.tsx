"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { decideVerification } from "@/lib/admin/verification-actions";
import { verificationMethods, type VerificationDetail } from "@/lib/admin/verification";
import { useFormReady } from "@/components/partner/use-form-ready";

const field = "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2";

export function VerificationForm({ detail }: { detail: VerificationDetail }) {
  const [state, action, pending] = useActionState(
    decideVerification.bind(null, detail.id, detail.version),
    { message: "" },
  );
  const ready = useFormReady();
  const review =
    detail.request?.status === "pending" && ["pending", "verified"].includes(detail.status);
  const suspend = detail.status === "verified";
  const candidate = { ...detail.current, ...detail.request?.proposed };
  if (!review && !suspend) return null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !ready) return;
    const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(form));
  }

  return (
    <form
      aria-labelledby="verification-decision-heading"
      method="post"
      onSubmit={submit}
      className="mt-5 rounded-lg border bg-card p-4 sm:p-5"
    >
      <h2 id="verification-decision-heading" className="text-xl font-semibold">
        Record a decision
      </h2>
      <fieldset disabled={!ready || pending} className="mt-4 grid min-w-0 gap-3">
        {review && (
          <fieldset className="grid min-w-0 gap-3 rounded-md border p-3">
            <legend className="px-1 font-semibold">Approval checklist</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input name="existence" type="checkbox" className="size-5 shrink-0" />I confirmed the
              business exists.
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input name="authority" type="checkbox" className="size-5 shrink-0" />I confirmed the
              applicant is authorized to represent it.
            </label>
            <label className="grid gap-1">
              Verification method
              <select name="method" className={field}>
                <option value="">Select a method</option>
                {Object.entries(verificationMethods).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              Confirmed Google Maps link
              <input
                name="maps"
                type="url"
                maxLength={2048}
                className={field}
                defaultValue={candidate.google_maps_url ?? ""}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                Latitude
                <input
                  name="latitude"
                  inputMode="decimal"
                  maxLength={12}
                  className={field}
                  defaultValue={candidate.latitude ?? ""}
                />
              </label>
              <label className="grid gap-1">
                Longitude
                <input
                  name="longitude"
                  inputMode="decimal"
                  maxLength={12}
                  className={field}
                  defaultValue={candidate.longitude ?? ""}
                />
              </label>
            </div>
          </fieldset>
        )}
        <label className="grid gap-1">
          Internal evidence summary {review && "(required for approval)"}
          <textarea name="evidence" rows={3} maxLength={4000} className={field} />
        </label>
        <label className="grid gap-1">
          Message to the partner
          <textarea
            name="message"
            rows={3}
            maxLength={2000}
            className={field}
            aria-describedby="decision-message-help"
          />
        </label>
        <p id="decision-message-help" className="text-sm text-muted-foreground">
          Required when requesting information, rejecting, or suspending.
        </p>
        {review && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="operation" value="approve">
              Approve property
            </Button>
            <Button
              type="submit"
              name="operation"
              value="request_info"
              variant="outline"
              formNoValidate
            >
              Request more information
            </Button>
            <Button type="submit" name="operation" value="reject" variant="outline" formNoValidate>
              Reject request
            </Button>
          </div>
        )}
        {suspend && (
          <div className="grid justify-items-start gap-2 border-t pt-3">
            <label className="flex min-h-11 items-center gap-2">
              <input name="confirm" type="checkbox" className="size-5 shrink-0" />I confirm
              suspension will hide the public property and its offers.
            </label>
            <Button
              type="submit"
              name="operation"
              value="suspend"
              variant="destructive"
              formNoValidate
            >
              Suspend property
            </Button>
          </div>
        )}
      </fieldset>
      {state.message && (
        <p className="mt-3 text-destructive" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
