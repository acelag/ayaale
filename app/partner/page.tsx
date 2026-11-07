import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PortfolioOverview } from "@/components/partner/portfolio-overview";
import { PropertySwitcher } from "@/components/partner/property-switcher";
import { signOutPartner } from "@/lib/partner/actions";
import { loadPartnerOverview, loadPartnerProperties } from "@/lib/partner/properties";
import { isPropertyId } from "@/lib/partner/registration";
import { requirePartnerSession } from "@/lib/partner/session";

export default async function PartnerHome({
  searchParams,
}: {
  searchParams: Promise<{ signout?: string; property?: string | string[]; view?: string }>;
}) {
  const { signout, property, view } = await searchParams;
  const session = await requirePartnerSession();
  // The destination checks current membership before returning any property data.
  if (property) {
    if (!isPropertyId(property)) notFound();
    const destination = `/partner/properties/${property}`;
    if (view === "analytics" || view === "subscription") redirect(`${destination}/${view}`);
    redirect(destination);
  }
  const [properties, overview] = await Promise.all([
    loadPartnerProperties(session),
    loadPartnerOverview(session),
  ]);
  const assignments = properties?.filter(({ role }) => role === "staff") ?? [];

  return (
    <section className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">All Properties Overview</h1>
        <form action={signOutPartner}>
          <Button variant="outline" type="submit" className="min-h-11">
            Sign out
          </Button>
        </form>
      </div>
      {signout === "failed" && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          We couldn’t sign you out. Please try again.
        </p>
      )}
      <p className="mt-3 text-muted-foreground">
        Check your registrations and review activity for the properties you own.
      </p>
      <Button asChild className="mt-4 min-h-11">
        <Link href="/partner/register">Register a property</Link>
      </Button>
      <Link
        href="/partner/claims"
        className="ml-4 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
      >
        My ownership claims
      </Link>
      {properties ? (
        <PropertySwitcher properties={properties} />
      ) : (
        <p className="mt-5" role="alert">
          We couldn’t load your properties. Refresh to try again.
        </p>
      )}
      {!overview ? (
        <p className="mt-6" role="alert">
          We couldn’t load portfolio totals. Refresh to try again.
        </p>
      ) : overview.properties.length ? (
        <PortfolioOverview overview={overview} properties={properties ?? []} />
      ) : (
        <p className="mt-6 text-muted-foreground">You haven’t registered a property yet.</p>
      )}
      {assignments.length > 0 && (
        <section className="mt-6" aria-labelledby="assigned-properties">
          <h2 id="assigned-properties" className="text-xl font-semibold">
            Staff assignments
          </h2>
          <ul className="mt-2">
            {assignments.map(({ id, name }) => (
              <li key={id}>
                <Link
                  href={`/partner/properties/${id}`}
                  className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
