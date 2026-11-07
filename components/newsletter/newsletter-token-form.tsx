"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { newsletterTokenPattern } from "@/lib/newsletter/copy";

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
const readToken = () => window.location.hash.slice(1);
const noToken = () => null;

export function NewsletterTokenForm({ action }: { action: "confirm" | "unsubscribe" }) {
  const token = useSyncExternalStore(subscribe, readToken, noToken);
  const [state, setState] = useState("idle");
  const confirm = action === "confirm";
  const label = confirm ? "Confirm subscription" : "Unsubscribe";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !newsletterTokenPattern.test(token) || state === "pending") return;
    setState("pending");
    try {
      const response = await fetch(`/api/newsletter/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const { status } = await response.json();
      if (status === "confirmed" || status === "withdrawn") {
        setState(status);
        window.history.replaceState(null, "", window.location.pathname);
      } else setState(status === "invalid" ? "invalid" : "unavailable");
    } catch {
      setState("unavailable");
    }
  }

  if (state === "confirmed")
    return (
      <p role="status" className="mt-4">
        You’re subscribed. Every newsletter includes an unsubscribe option.
      </p>
    );
  if (state === "withdrawn")
    return (
      <p role="status" className="mt-4">
        If this link is valid, newsletter delivery has been stopped. Your partner account and
        essential account messages are unaffected.
      </p>
    );
  if (state === "invalid" || (token !== null && !newsletterTokenPattern.test(token)))
    return (
      <p role="alert" className="mt-4">
        {confirm
          ? "This confirmation link is no longer valid."
          : "This unsubscribe link is incomplete."}{" "}
        {confirm && (
          <Link href="/#newsletter" className="underline">
            Request a new confirmation.
          </Link>
        )}
      </p>
    );
  return (
    <form onSubmit={submit} className="mt-4">
      <Button type="submit" disabled={!token || state === "pending"} className="min-h-11">
        {state === "pending" ? "Please wait…" : label}
      </Button>
      {state === "unavailable" && (
        <p role="alert" className="mt-3">
          We couldn’t process your request. Please try again.
        </p>
      )}
      <noscript>
        <p className="mt-3">Enable JavaScript to use this email link.</p>
      </noscript>
    </form>
  );
}
