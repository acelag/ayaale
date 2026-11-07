"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { changeStaffEntry, createStaffInvite } from "@/lib/partner/team-actions";
import type { PropertyTeam } from "@/lib/partner/team";
import { useFormReady } from "./use-form-ready";

const expiry = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});
const field = "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2";

function EntryAction({
  propertyId,
  entryId,
  operation,
  label,
}: {
  propertyId: string;
  entryId: string;
  operation: "revoke" | "remove";
  label: string;
}) {
  const ready = useFormReady();
  const [state, action, pending] = useActionState(
    changeStaffEntry.bind(null, propertyId, entryId, operation),
    { message: "" },
  );
  const text = operation === "revoke" ? "Revoke invitation" : "Remove staff";
  return (
    <form action={action}>
      <Button
        type="submit"
        variant="outline"
        disabled={!ready || pending}
        aria-label={`${text} for ${label}`}
        className="min-h-11"
      >
        {text}
      </Button>
      {state.message && !state.saved && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function TeamManagement({ propertyId, team }: { propertyId: string; team: PropertyTeam }) {
  const ready = useFormReady();
  const [state, action, pending] = useActionState(createStaffInvite.bind(null, propertyId), {
    message: "",
  });
  const [copyMessage, setCopyMessage] = useState("");
  const [email, setEmail] = useState("");

  async function copy() {
    if (!state.link) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopyMessage("Invitation link copied.");
    } catch {
      setCopyMessage("Select and copy the invitation link below.");
    }
  }

  return (
    <div className="mt-6 grid gap-5">
      <section
        aria-labelledby="invite-staff-heading"
        className="rounded-lg border bg-card p-4 sm:p-6"
      >
        <h2 id="invite-staff-heading" className="text-xl font-semibold">
          Invite staff
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Each property has two staff slots. A pending invitation reserves a slot for seven days.
          Share the link with the person you invited. They’ll need an Ayaale account with that
          verified email.
        </p>
        <noscript>
          <p className="mt-2">Enable JavaScript to manage invitations.</p>
        </noscript>
        <form
          action={action}
          className="mt-4 grid max-w-md gap-3"
          onSubmit={() => setCopyMessage("")}
        >
          <label className="grid gap-1.5 font-medium">
            Staff email
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={field}
              disabled={!ready || pending}
            />
          </label>
          <Button
            type="submit"
            disabled={!ready || pending}
            className="min-h-11 sm:justify-self-start"
          >
            {pending ? "Creating…" : "Create invitation"}
          </Button>
        </form>
        {state.message && (
          <p className="mt-3 text-sm" role={state.saved ? "status" : "alert"}>
            {state.message}
          </p>
        )}
        {state.link && (
          <div className="mt-3 grid max-w-lg gap-2">
            <label className="grid gap-1.5 font-medium">
              Invitation link
              <input
                readOnly
                value={state.link}
                onFocus={(event) => event.target.select()}
                className={field}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={copy}
              className="min-h-11 sm:justify-self-start"
            >
              Copy invitation link
            </Button>
            <p role="status" className="text-sm">
              {copyMessage}
            </p>
          </div>
        )}
      </section>
      <section aria-labelledby="pending-invites" className="rounded-lg border bg-card p-4 sm:p-6">
        <h2 id="pending-invites" className="text-xl font-semibold">
          Pending invitations
        </h2>
        {team.invites.length ? (
          <ul className="mt-3 divide-y">
            {team.invites.map(({ id, email, expiresAt }) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="break-all font-medium">{email}</p>
                  <p className="text-sm text-muted-foreground">
                    Expires <time dateTime={expiresAt}>{expiry.format(new Date(expiresAt))}</time>{" "}
                    Sri Lanka time
                  </p>
                </div>
                <EntryAction
                  propertyId={propertyId}
                  entryId={id}
                  operation="revoke"
                  label={email}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No invitations are pending.</p>
        )}
      </section>
      <section aria-labelledby="active-staff" className="rounded-lg border bg-card p-4 sm:p-6">
        <h2 id="active-staff" className="text-xl font-semibold">
          Assigned staff
        </h2>
        {team.staff.length ? (
          <ul className="mt-3 divide-y">
            {team.staff.map(({ id, email, slot }) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <p className="min-w-0 break-all font-medium">{email ?? `Staff slot ${slot}`}</p>
                <EntryAction
                  propertyId={propertyId}
                  entryId={id}
                  operation="remove"
                  label={email ?? `staff slot ${slot}`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No staff are assigned to this property.
          </p>
        )}
      </section>
    </div>
  );
}
