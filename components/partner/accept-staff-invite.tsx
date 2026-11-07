"use client";

import { useActionState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { acceptStaffInvite } from "@/lib/partner/team-actions";

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function getToken() {
  return window.location.hash.slice(1);
}

export function AcceptStaffInvite() {
  const token = useSyncExternalStore(subscribe, getToken, () => null);
  const [state, action, pending] = useActionState(acceptStaffInvite, { message: "" });
  if (token === null)
    return (
      <noscript>
        <p className="mt-4">Enable JavaScript to open this invitation.</p>
      </noscript>
    );
  if (!/^[0-9a-f]{64}$/.test(token))
    return (
      <p className="mt-4" role="alert">
        Open the complete invitation link provided by the property owner.
      </p>
    );
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending} className="min-h-11">
        {pending ? "Accepting…" : "Accept invitation"}
      </Button>
      {state.message && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
