import Link from "next/link";
import { AcceptStaffInvite } from "@/components/partner/accept-staff-invite";
import { Button } from "@/components/ui/button";
import { partnerSession } from "@/lib/partner/session";

export default async function StaffInvitePage() {
  const session = await partnerSession();
  return (
    <section className="max-w-lg rounded-lg border bg-card p-5 sm:p-7">
      <h1 className="text-2xl font-semibold sm:text-3xl">Property staff invitation</h1>
      {session ? (
        <>
          <p className="mt-3 break-all text-muted-foreground">Signed in as {session.user.email}.</p>
          <p className="mt-2 text-muted-foreground">
            Use the verified email address the owner invited.
          </p>
          <AcceptStaffInvite />
          <Link
            href="/partner"
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
          >
            Return to partner home
          </Link>
        </>
      ) : (
        <>
          <p className="mt-3 text-muted-foreground">
            Sign in with the email address the property owner invited, or create and confirm an
            account. Then reopen your invitation link.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link href="/partner/sign-in">Sign in</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/partner/signup">Create an account</Link>
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
