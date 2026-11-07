"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { submitPartnerAuth } from "@/lib/partner/actions";
import { useFormReady } from "./use-form-ready";

const field =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function PartnerAuthForm({
  mode,
  destination = "partner",
}: {
  mode: "signup" | "signin";
  destination?: "partner" | "admin";
}) {
  const isSignup = mode === "signup";
  const [email, setEmail] = useState("");
  const ready = useFormReady();
  const [state, action, pending] = useActionState(submitPartnerAuth.bind(null, mode, destination), {
    ok: false,
    message: "",
  });

  return (
    <>
      <noscript>
        <p>Enable JavaScript to continue.</p>
      </noscript>
      <div role="status">
        {state.ok && (
          <p className="mt-4">
            {state.message} Open the link in the browser you used to sign up, or sign in after
            confirming your email.
          </p>
        )}
      </div>
      {(!isSignup || !state.ok) && (
        <form action={action} className="mt-5">
          <fieldset disabled={!ready || pending} className="grid gap-4">
            <label className="grid gap-1.5 font-medium">
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                required
                className={field}
              />
            </label>
            <label className="grid gap-1.5 font-medium">
              Password
              <input
                name="password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={isSignup ? 12 : undefined}
                maxLength={128}
                required
                className={field}
                aria-describedby={isSignup ? "partner-password-help" : undefined}
              />
            </label>
            {isSignup && (
              <p id="partner-password-help" className="text-sm text-muted-foreground">
                Use at least 12 characters.
              </p>
            )}
            {isSignup && (
              <div hidden>
                <label>
                  Leave this blank <input name="website" autoComplete="off" tabIndex={-1} />
                </label>
              </div>
            )}
            {state.message && !state.ok && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {state.message}
              </p>
            )}
            <Button type="submit" className="min-h-11 sm:justify-self-start">
              {pending ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
            </Button>
          </fieldset>
        </form>
      )}
    </>
  );
}
