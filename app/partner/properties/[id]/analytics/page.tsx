import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PropertyAnalytics,
  type PropertyAnalyticsData,
} from "@/components/partner/property-analytics";
import { PropertySwitcher } from "@/components/partner/property-switcher";
import { Button } from "@/components/ui/button";
import { loadPartnerProperties } from "@/lib/partner/properties";
import { isPropertyId } from "@/lib/partner/registration";
import { requirePartnerSession } from "@/lib/partner/session";
import { offerViewTrackingEnabled } from "@/lib/offers/view-tracking";

const ranges = [7, 30, 90];

export default async function PropertyAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; page?: string }>;
}) {
  const session = await requirePartnerSession();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isPropertyId(id)) notFound();
  const properties = await loadPartnerProperties(session);
  if (!properties)
    return <h1 className="text-2xl font-semibold">Property analytics temporarily unavailable</h1>;
  const property = properties.find((item) => item.id === id.toLowerCase());
  if (!property) notFound();
  const days = ranges.find((range) => String(range) === query.days) ?? 30;
  const page =
    typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 0;
  const { data, error } = await session.client.rpc("get_property_analytics", {
    target_property: property.id,
    trend_days: days,
    offer_page: page,
  });
  if (!data && !error) notFound();
  const analytics = data as PropertyAnalyticsData | null;
  const base = `/partner/properties/${property.id}`;
  const route = `${base}/analytics`;

  return (
    <section className="max-w-5xl">
      <Link
        href={base}
        className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
      >
        Property status
      </Link>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Property analytics</h1>
      <p className="mt-2 break-words text-muted-foreground">
        {property.name} · {property.district}
      </p>
      <PropertySwitcher properties={properties} currentId={property.id} view="analytics" />
      {!offerViewTrackingEnabled() && (
        <p className="mt-3 text-sm text-muted-foreground">
          Offer view collection is off in this environment. View totals only include previously
          recorded activity.
        </p>
      )}
      {analytics ? (
        <PropertyAnalytics
          data={analytics}
          days={days}
          rangeLinks={
            <nav aria-label="Analytics date range" className="mt-3 flex flex-wrap gap-2">
              {ranges.map((range) => (
                <Button
                  asChild
                  variant={range === days ? "default" : "outline"}
                  className="min-h-11"
                  key={range}
                >
                  <Link
                    href={`${route}?days=${range}`}
                    aria-current={range === days ? "true" : undefined}
                  >
                    {range} days
                  </Link>
                </Button>
              ))}
            </nav>
          }
          offerLinks={
            <nav aria-label="Offer performance pages" className="mt-3 flex flex-wrap gap-4">
              {page > 0 && (
                <Link
                  href={`${route}?days=${days}&page=${page - 1}#offers-heading`}
                  className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  Previous offers
                </Link>
              )}
              {analytics.offers.length > 20 && page < 999999 && (
                <Link
                  href={`${route}?days=${days}&page=${page + 1}#offers-heading`}
                  className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  More offers
                </Link>
              )}
            </nav>
          }
        />
      ) : (
        <p role="alert" className="mt-4">
          We couldn’t load analytics. Refresh to try again.
        </p>
      )}
    </section>
  );
}
