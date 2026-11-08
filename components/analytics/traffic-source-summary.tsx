import { sourceLabels, type TrafficSource } from "@/lib/analytics/traffic-source.mjs";

export type SourceCount = { source: TrafficSource; views: number };
const number = new Intl.NumberFormat("en-LK");
const percent = new Intl.NumberFormat("en-LK", { style: "percent", maximumFractionDigits: 1 });

export function TrafficSourceSummary({ sources }: { sources: SourceCount[] }) {
  const total = sources.reduce((sum, row) => sum + row.views, 0);
  return (
    <section
      aria-labelledby="traffic-sources"
      className="min-w-0 rounded-lg border bg-card p-4 sm:p-5"
    >
      <h2 id="traffic-sources" className="text-xl font-semibold">
        Recorded view sources
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Sources describe recorded offer detail views in the selected period, not unique visitors or
        bookings. Only recognized campaign or referrer evidence is attributed. Missing evidence,
        unavailable consent and older unattributed views appear as Unknown; an absent referrer does
        not mean Direct.
      </p>
      {total ? (
        <dl className="mt-3 divide-y">
          {sources.map(({ source, views }) => (
            <div
              key={source}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
            >
              <dt>{sourceLabels[source] ?? sourceLabels.unknown}</dt>
              <dd className="tabular-nums">
                {number.format(views)} views · {percent.format(views / total)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm">No offer views in this period.</p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">
        Campaign tags and referrers can be missing or changed. These counts are indicative and may
        differ from Google Analytics.
      </p>
    </section>
  );
}
