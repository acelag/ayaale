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
