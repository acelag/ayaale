"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useFormReady } from "@/components/partner/use-form-ready";
import { decideOfferReview } from "@/lib/admin/offer-review-actions";
import { reviewChecks, reviewOperations } from "@/lib/admin/offer-review";

export function OfferReviewForm({
  offerId,
  revisionId,
  version,
  canApprove,
}: {
  offerId: string;
  revisionId: string;
  version: string;
  canApprove: boolean;
}) {
  const ready = useFormReady();
  const [state, action, pending] = useActionState(
    decideOfferReview.bind(null, offerId, revisionId, version),
    { message: "" },
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) return;
    const fields = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(fields));
  }
  return (
    <form
      method="post"
      onSubmit={submit}
      aria-labelledby="offer-decision"
      className="mt-5 rounded-lg border bg-card p-4 sm:p-5"
    >
      <h2 id="offer-decision" className="text-xl font-semibold">
        Review decision
      </h2>
      <noscript>
        <p>Enable JavaScript to record a decision.</p>
      </noscript>
      <fieldset disabled={!ready || pending} className="mt-3 grid min-w-0 gap-3">
        {canApprove ? (
          <fieldset className="grid min-w-0 gap-1 rounded-md border p-3 sm:grid-cols-2">
            <legend className="px-1 font-semibold">Approval checklist</legend>
            {Object.entries(reviewChecks).map(([key, label]) => (
              <label key={key} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" name={key} className="size-5 shrink-0" />
                {label}
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="text-sm text-muted-foreground">
            Approval requires a verified property and an offer eligible for review.
          </p>
        )}
        <label className="grid gap-1 font-medium">
          Message to the partner
          <textarea
            name="note"
            rows={3}
            maxLength={2000}
            aria-describedby="offer-review-note"
            className="w-full min-w-0 rounded-md border border-input bg-background p-2"
          />
        </label>
        <p id="offer-review-note" className="text-sm text-muted-foreground">
          Required when requesting changes or rejecting a revision.
        </p>
        <div className="flex flex-wrap gap-2">
          {canApprove && (
            <Button type="submit" name="operation" value="approve">
              {reviewOperations.approve}
            </Button>
          )}
          <Button type="submit" name="operation" value="request_changes" variant="outline">
            {reviewOperations.request_changes}
          </Button>
          <Button type="submit" name="operation" value="reject" variant="outline">
            {reviewOperations.reject}
          </Button>
        </div>
      </fieldset>
      {state.message && (
        <p role="alert" className="mt-3 text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
