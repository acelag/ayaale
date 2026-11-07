"use client";

import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useFormReady } from "@/components/partner/use-form-ready";
import { decideOwnershipClaim } from "@/lib/admin/ownership-claim-actions";
import { claimSignals, type ClaimDetail } from "@/lib/admin/ownership-claims";

const field = "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2";

export function OwnershipClaimForm({ claim }: { claim: ClaimDetail }) {
  const [state, action, pending] = useActionState(decideOwnershipClaim.bind(null, claim.id), {
    message: "",
  });
  const ready = useFormReady();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) return;
    const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(form));
  }

  return (
    <form
      aria-labelledby="claim-decision"
      method="post"
      onSubmit={submit}
      className="mt-4 rounded-lg border bg-card p-4 sm:p-5"
    >
      <h2 id="claim-decision" className="text-xl font-semibold">
        Record an ownership decision
      </h2>
      <fieldset disabled={!ready || pending} className="mt-3 grid min-w-0 gap-3">
        <fieldset className="grid min-w-0 gap-2 rounded-md border p-3">
          <legend className="px-1 font-semibold">Matched properties</legend>
          {claim.candidates.length ? (
            claim.candidates.map((candidate) => (
              <div key={candidate.id} className="min-w-0 border-b pb-2 last:border-0">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="property"
                    value={candidate.id}
                    disabled={!candidate.current}
                    className="size-5 shrink-0"
                  />
                  <span className="break-words">
                    {candidate.name} · {candidate.district}
                  </span>
                </label>
                <p className="text-sm text-muted-foreground">{candidate.address}</p>
                <p className="text-sm text-muted-foreground">
                  Matched by {candidate.signals.map((signal) => claimSignals[signal]).join(", ")}.
                </p>
                {!candidate.current && (
                  <p className="text-sm">
                    The property or owner assignment changed after submission.
                  </p>
                )}
                <Link
                  href={`/admin/verifications/${candidate.id}`}
                  className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  View property verification
                </Link>
              </div>
            ))
          ) : (
            <p>No matching properties are available.</p>
          )}
        </fieldset>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="verified" className="size-5 shrink-0" />I independently
          verified the claimant’s authority to take ownership.
        </label>
        <label className="grid gap-1">
          Internal evidence summary (required for transfer)
          <textarea name="evidence" className={field} maxLength={4000} rows={3} />
        </label>
        <label className="grid gap-1">
          Message to the claimant
          <textarea name="note" required className={field} maxLength={2000} rows={3} />
        </label>
        <p className="text-sm text-muted-foreground">
          Approval transfers the existing listing and removes the former owner’s access, staff
          assignments and unused invitations for this property.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            name="operation"
            value="approve"
            disabled={!claim.candidates.some(({ current }) => current)}
          >
            Approve transfer
          </Button>
          <Button type="submit" name="operation" value="reject" variant="outline">
            Reject claim
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
