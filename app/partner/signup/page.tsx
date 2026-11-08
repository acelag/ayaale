import Link from "next/link";
import { redirect } from "next/navigation";
import { PartnerAuthForm } from "@/components/partner/auth-form";
import { partnerSession } from "@/lib/partner/session";

export default async function SignupPage() {
  if (await partnerSession()) redirect("/partner");
  return (
    <section className="max-w-md rounded-lg border bg-card p-5 sm:p-7">
      <h1 className="text-2xl font-semibold sm:text-3xl">Create a partner account</h1>
      <p className="mt-3 text-muted-foreground">
        Confirm your email to register a property for review.
      </p>
      <section aria-labelledby="launch-trial-heading" className="mt-5 rounded-lg border p-4">
        <h2 id="launch-trial-heading" className="font-semibold">
          Starter launch trial
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The first 100 verified properties receive six months of Starter at no charge, starting
          when the property is first approved. Each property can receive one launch trial.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Creating an account or registering a property does not reserve a place. During an active
          trial, each property can have up to three live offers, subject to offer approval.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          No payment card is required. The trial ends automatically with no charge; offers cannot
          remain live without a current trial or subscription.
        </p>
      </section>
      <PartnerAuthForm mode="signup" />
      <p className="mt-4 text-sm">
        Already have an account?{" "}
        <Link
          href="/partner/sign-in"
          className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </section>
  );
}
