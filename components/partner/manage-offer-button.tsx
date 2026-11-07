"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { changeOffer } from "@/lib/partner/manage-offer-actions";
import { offerOperations, type OfferOperation } from "@/lib/partner/manage-offers";
import { useFormReady } from "./use-form-ready";

export function ManageOfferButton({
  propertyId,
  id,
  operation,
  version = "",
  newDraftId,
  page,
}: {
  propertyId: string;
  id: string;
  operation: OfferOperation;
  version?: string;
  newDraftId?: string;
  page: number;
}) {
  const [confirm, setConfirm] = useState(false);
  const ready = useFormReady();
  const [state, action, pending] = useActionState(
    changeOffer.bind(null, propertyId, id, operation, version, newDraftId, page),
    { message: "" },
  );

  if (operation === "end" && !confirm) {
    return (
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={!ready}
        onClick={() => setConfirm(true)}
      >
        End offer
      </Button>
    );
  }

  return (
    <form action={action} className={confirm ? "basis-full rounded-md border p-3" : undefined}>
      {confirm && (
        <p className="mb-2 text-sm">
          End this offer? It will be removed from discovery. You can duplicate it later for a fresh
          submission.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant={confirm ? "destructive" : "outline"}
          className="min-h-11"
          disabled={!ready || pending}
        >
          {pending ? "Working…" : confirm ? "Confirm end" : offerOperations[operation]}
        </Button>
        {confirm && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => setConfirm(false)}
          >
            Cancel
          </Button>
        )}
      </div>
      {state.message && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
