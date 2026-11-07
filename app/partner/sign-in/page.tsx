import Link from "next/link";
import { redirect } from "next/navigation";
import { PartnerAuthForm } from "@/components/partner/auth-form";
import { partnerSession } from "@/lib/partner/session";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string; next?: string }>;
}) {
  const { confirmation, next } = await searchParams;
  const admin = next === "admin";
  if (await partnerSession()) redirect(admin ? "/admin" : "/partner");
  return (
    <section className="max-w-md rounded-lg border bg-card p-5 sm:p-7">
      <h1 className="text-2xl font-semibold sm:text-3xl">
        {admin ? "Sign in to Ayaale administration" : "Sign in to Ayaale partners"}
      </h1>
      {confirmation === "invalid" && (
        <p className="mt-3 text-sm">
          This confirmation link couldn’t start a session. If you’ve confirmed your email, sign in
          below.
        </p>
      )}
      <PartnerAuthForm mode="signin" destination={admin ? "admin" : "partner"} />
      {!admin && (
        <p className="mt-4 text-sm">
          New to Ayaale?{" "}
          <Link
            href="/partner/signup"
            className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      )}
    </section>
  );
}
