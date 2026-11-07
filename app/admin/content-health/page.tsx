import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReportPagination } from "@/components/admin/report-list";
import { partnerSession } from "@/lib/partner/session";

type ContentHealth = {
  propertyReviews: number;
  offerReviews: number;
  expiring: { id: string; slug: string; title: string; property: string; endsAt: string }[];
  inactive: { id: string; name: string; district: string; lastActivity: string | null }[];
};

const number = new Intl.NumberFormat("en-LK");
const sriLankaTime = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});
function pageIndex(value: string | undefined) {
  return typeof value === "string" && /^\d{1,6}$/.test(value) ? Number(value) : 0;
}

export default async function ContentHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ expiring?: string; inactive?: string }>;
}) {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const query = await searchParams;
  const expiring = pageIndex(query.expiring);
  const inactive = pageIndex(query.inactive);
  const { data, error } = await session.client.rpc("get_admin_content_health", {
    expiring_page: expiring,
    inactive_page: inactive,
  });
  if (!data && !error) notFound();
  const health = data as ContentHealth | null;
  const pageLink = (offers: number, properties: number, anchor: string) =>
    `/admin/content-health?expiring=${offers}&inactive=${properties}#${anchor}`;

  return (
    <section className="max-w-5xl">
      <Link
        href="/admin"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Admin overview
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Content health</h1>
      <p className="mt-2 text-muted-foreground">
        Check listings that need attention. Dates and times use Sri Lanka time.
      </p>
      {health ? (
        <>
          <section
            aria-labelledby="pending-reviews"
            className="mt-4 rounded-lg border bg-card p-4 sm:p-5"
          >
            <h2 id="pending-reviews" className="text-xl font-semibold">
              Pending reviews
            </h2>
            <ul className="mt-2 flex flex-wrap gap-x-6">
              <li>
                <Link
                  href="/admin/verifications"
                  className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
                >
                  Property verifications ({number.format(health.propertyReviews)})
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/offer-reviews"
                  className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
                >
                  Offer reviews ({number.format(health.offerReviews)})
                </Link>
              </li>
            </ul>
          </section>
          <section
            aria-labelledby="expiring-offers"
            className="mt-4 rounded-lg border bg-card p-4 sm:p-5"
          >
            <h2 id="expiring-offers" className="text-xl font-semibold">
              Expiring offers
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Live offers whose publication, redemption, or Starter access ends within 72 hours.
            </p>
            {health.expiring.length ? (
              <ul className="mt-2 divide-y">
                {health.expiring.slice(0, 10).map((offer) => (
                  <li key={offer.id} className="break-words py-2">
                    <Link
                      href={`/offers/${offer.slug}`}
                      className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
                    >
                      {offer.title}
                    </Link>
                    <p className="text-sm">
                      {offer.property} · Ends{" "}
                      <time dateTime={offer.endsAt}>
                        {sriLankaTime.format(new Date(offer.endsAt))}
                      </time>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm">No expiring offers on this page.</p>
            )}
            <ReportPagination
              label="Expiring offer pages"
              previous={
                expiring > 0 ? pageLink(expiring - 1, inactive, "expiring-offers") : undefined
              }
              next={
                health.expiring.length > 10 && expiring < 999999
                  ? pageLink(expiring + 1, inactive, "expiring-offers")
                  : undefined
              }
            />
          </section>
          <section
            aria-labelledby="inactive-properties"
            className="mt-4 rounded-lg border bg-card p-4 sm:p-5"
          >
            <h2 id="inactive-properties" className="text-xl font-semibold">
              Inactive properties
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Properties verified for at least 30 days with no live offer and no offer publication
              in the last 30 days.
            </p>
            {health.inactive.length ? (
              <ul className="mt-2 divide-y">
                {health.inactive.slice(0, 10).map((property) => (
                  <li key={property.id} className="break-words py-2">
                    <Link
                      href={`/admin/verifications/${property.id}`}
                      className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
                    >
                      {property.name}
                    </Link>
                    <p className="text-sm">
                      {property.district} ·{" "}
                      {property.lastActivity ? (
                        <>
                          Last publication{" "}
                          <time dateTime={property.lastActivity}>
                            {sriLankaTime.format(new Date(property.lastActivity))}
                          </time>
                        </>
                      ) : (
                        "No published offers"
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm">No inactive properties on this page.</p>
            )}
            <ReportPagination
              label="Inactive property pages"
              previous={
                inactive > 0 ? pageLink(expiring, inactive - 1, "inactive-properties") : undefined
              }
              next={
                health.inactive.length > 10 && inactive < 999999
                  ? pageLink(expiring, inactive + 1, "inactive-properties")
                  : undefined
              }
            />
          </section>
        </>
      ) : (
        <p role="alert" className="mt-4">
          We couldn’t load content health. Refresh to try again.
        </p>
      )}
    </section>
  );
}
