"use client";

import { useState, type FormEvent } from "react";
import { useFormReady } from "@/components/partner/use-form-ready";
import { Button } from "@/components/ui/button";
import { newsletterConsent } from "@/lib/newsletter/copy";

export function NewsletterSignup({ privacyUrl }: { privacyUrl: string }) {
  const ready = useFormReady();
  const [state, setState] = useState("idle");
  const pending = state === "pending";
  const messages: Record<string, string> = {
    accepted:
      "Check your inbox. If this address can receive a confirmation, we’ll send you a link. You won’t receive the newsletter until you confirm.",
    invalid: "Enter a valid email address and tick the newsletter checkbox.",
    limited: "Too many requests. Please try again later.",
    unavailable: "We couldn’t process your signup. Please try again.",
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setState("pending");
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          consent: form.get("consent") === "on",
          website: form.get("website"),
        }),
      });
      const { status } = await response.json();
      setState(Object.hasOwn(messages, status) ? status : "unavailable");
    } catch {
      setState("unavailable");
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 max-w-xl" aria-describedby="newsletter-privacy">
      <fieldset disabled={!ready || pending} className="space-y-4">
        <div>
          <label htmlFor="newsletter-email" className="font-semibold">
            Email address
          </label>
          <input
            id="newsletter-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            className="mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </div>
        <label className="flex min-h-11 items-start gap-3">
          <input name="consent" type="checkbox" required className="mt-1 size-5 shrink-0" />
          <span>{newsletterConsent}</span>
        </label>
        <div hidden>
          <label>
            Leave this field blank
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <Button type="submit" className="min-h-11 transition-none">
          {pending ? "Sending…" : "Send confirmation email"}
        </Button>
      </fieldset>
      <p id="newsletter-privacy" className="mt-3 text-sm text-muted-foreground">
        We’ll ask you to confirm by email. See our{" "}
        <a href={privacyUrl} className="underline underline-offset-4">
          Privacy Policy
        </a>{" "}
        for how we use your information.
      </p>
      {pending && (
        <p role="status" className="mt-2 text-sm">
          Sending your request.
        </p>
      )}
      {messages[state] && (
        <p role={state === "accepted" ? "status" : "alert"} className="mt-3 text-sm">
          {messages[state]}
        </p>
      )}
    </form>
  );
}
