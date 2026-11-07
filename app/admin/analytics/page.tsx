import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActivityTrend, type PropertyAnalyticsData } from "@/components/partner/property-analytics";
import { Button } from "@/components/ui/button";
import { offerViewTrackingEnabled } from "@/lib/offers/view-tracking";
import { partnerSession } from "@/lib/partner/session";

const ranges = [7, 30, 90];
const sources = {
  unknown: "Unknown",
  direct: "Direct",
  newsletter: "Newsletter",
  search: "Search",
  social: "Social",
  referral: "Referral",
};
type Analytics = {
  viewIngestionReady: boolean;
  trend: PropertyAnalyticsData["trend"];
  sources: { source: keyof typeof sources; views: number }[];
};

const number = new Intl.NumberFormat("en-LK");
const percent = new Intl.NumberFormat("en-LK", { style: "percent", maximumFractionDigits: 1 });

export default async function PlatformAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const query = await searchParams;
  const days = ranges.find((range) => String(range) === query.days) ?? 30;
  const { data, error } = await session.client.rpc("get_admin_platform_analytics", {
    trend_days: days,
  });
  if (!data && !error) notFound();
  const analytics = data as Analytics | null;
  const trackingEnabled = offerViewTrackingEnabled();
  const totals = analytics?.trend.reduce(
    (total, day) => ({
      views: total.views + day.views,
      whatsapp: total.whatsapp + day.whatsapp,
      calls: total.calls + day.calls,
    }),
    { views: 0, whatsapp: 0, calls: 0 },
  );

  return (
    <section className="max-w-5xl">
      <Link
        href="/admin"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Admin overview
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Platform analytics</h1>
      <p className="mt-2 text-muted-foreground">
        Recorded offer activity across Ayaale. Date ranges include today in Sri Lanka time.
      </p>
      {analytics?.viewIngestionReady === false ? (
        <p className="mt-2 text-sm text-muted-foreground">
          The offer view collection endpoint is unavailable in this environment. Historical records
          are still included.
        </p>
      ) : !trackingEnabled ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Offer view collection is off in this environment. Historical records are still included.
        </p>
      ) : null}
      <nav aria-label="Analytics date range" className="mt-4 flex flex-wrap gap-2">
        {ranges.map((range) => (
          <Button
            key={range}
            asChild
            variant={days === range ? "default" : "outline"}
            className="min-h-11"
          >
            <Link
              href={`/admin/analytics?days=${range}`}
              aria-current={days === range ? "page" : undefined}
            >
              {range} days
            </Link>
          </Button>
        ))}
      </nav>
      {analytics && totals ? (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Offer detail views", number.format(totals.views)],
              ["WhatsApp clicks", number.format(totals.whatsapp)],
              ["Call clicks", number.format(totals.calls)],
              [
                "Contact click rate",
                totals.views && trackingEnabled && analytics.viewIngestionReady
                  ? percent.format((totals.whatsapp + totals.calls) / totals.views)
                  : "Unavailable",
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card p-4">
                <dt className="text-sm font-semibold">{label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-sm text-muted-foreground">
            The contact click rate divides WhatsApp and call clicks by recorded offer views. Clicks
            can include repeated attempts.
          </p>
          <section
            aria-labelledby="platform-activity"
            className="mt-5 min-w-0 rounded-lg border bg-card p-4"
          >
            <h2 id="platform-activity" className="text-xl font-semibold">
              Daily offer activity
            </h2>
            <ActivityTrend daily={analytics.trend} />
          </section>
          <section
            aria-labelledby="platform-sources"
            className="mt-5 rounded-lg border bg-card p-4"
          >
            <h2 id="platform-sources" className="text-xl font-semibold">
              Recorded view sources
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Views without reliable attribution appear as Unknown.
            </p>
            {analytics.sources.length ? (
              <dl className="mt-2 divide-y">
                {analytics.sources.map(({ source, views }) => (
                  <div key={source} className="flex items-center justify-between gap-3 py-2">
                    <dt>{sources[source]}</dt>
                    <dd className="tabular-nums">{number.format(views)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-sm">No offer views in this period.</p>
            )}
          </section>
        </>
      ) : (
        <p role="alert" className="mt-4">
          We couldn’t load platform analytics. Refresh to try again.
        </p>
      )}
    </section>
  );
}
