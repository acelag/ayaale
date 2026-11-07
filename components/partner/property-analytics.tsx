import type { ReactNode } from "react";

type Activity = { views: number; whatsapp: number; calls: number };
type DailyActivity = Activity & { date: string };
export type PropertyAnalyticsData = {
  currentMonth: string;
  previousMonth: string;
  current: Activity;
  previous: Activity;
  trend: DailyActivity[];
  offers: (Activity & { id: string; title: string })[];
};

const series = [
  { key: "views", label: "Offer detail views", stroke: "var(--primary)", dash: undefined },
  { key: "whatsapp", label: "WhatsApp clicks", stroke: "var(--foreground)", dash: "8 4" },
  { key: "calls", label: "Call clicks", stroke: "var(--muted-foreground)", dash: "2 4" },
] as const;
const number = new Intl.NumberFormat("en-LK");
const rate = new Intl.NumberFormat("en-LK", { style: "percent", maximumFractionDigits: 1 });
const month = new Intl.DateTimeFormat("en-LK", { month: "long", year: "numeric", timeZone: "UTC" });
const date = new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", timeZone: "UTC" });
const empty: Activity = { views: 0, whatsapp: 0, calls: 0 };
const rows = [
  ...series.map(({ key, label }) => ({
    label,
    format: (item: Activity) => number.format(item[key]),
  })),
  {
    label: "Contact click rate",
    format: (item: Activity) =>
      item.views ? rate.format((item.whatsapp + item.calls) / item.views) : "—",
  },
];

function AnalyticsTable({
  label,
  headings,
  children,
}: {
  label: string;
  headings: readonly string[];
  children: ReactNode;
}) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="mt-3 max-w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr>
            {headings.map((heading, index) => (
              <th
                key={heading}
                scope="col"
                className={index === 0 ? "py-2 pr-3 text-left" : "px-2 py-2 text-right"}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums [&_td]:px-2 [&_td]:py-2 [&_td]:text-right [&_th]:py-2 [&_th]:pr-3 [&_th]:text-left [&_th]:font-medium [&_tr]:border-b [&_tr:last-child]:border-0">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function ActivityTrend({ daily }: { daily: DailyActivity[] }) {
  const max = Math.max(0, ...daily.flatMap((day) => series.map(({ key }) => day[key])));
  const dateLabel = (value: string) => date.format(new Date(`${value}T00:00:00Z`));
  const width = 600;
  const top = 4;
  const bottom = 116;
  const edge = 4;

  if (!max) return <p className="mt-3 text-muted-foreground">No activity in this period.</p>;

  return (
    <>
      <figure className="mt-4">
        <div
          aria-hidden="true"
          className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs text-muted-foreground"
        >
          <div className="flex flex-col justify-between text-right tabular-nums">
            <span>{number.format(max)}</span>
            <span>0</span>
          </div>
          <svg
            viewBox={`0 0 ${width} 120`}
            preserveAspectRatio="none"
            className="h-32 w-full sm:h-40"
            fill="none"
          >
            <path
              d={`M ${edge} ${top} H ${width - edge} M ${edge} ${bottom} H ${width - edge}`}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.45}
            />
            {series.map(({ key, stroke, dash }) => (
              <polyline
                key={key}
                points={daily
                  .map(
                    (day, index) =>
                      `${edge + (index * (width - 2 * edge)) / (daily.length - 1)},${bottom - (day[key] / max) * (bottom - top)}`,
                  )
                  .join(" ")}
                stroke={stroke}
                strokeDasharray={dash}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div className="col-start-2 flex flex-wrap justify-between gap-x-2">
            <span>{dateLabel(daily[0].date)}</span>
            <span>{dateLabel(daily[daily.length - 1].date)}</span>
          </div>
        </div>
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {series.map(({ key, label, stroke, dash }) => (
            <span key={key} className="inline-flex items-center gap-2">
              <svg aria-hidden="true" width="22" height="8">
                <path d="M0 4h22" stroke={stroke} strokeDasharray={dash} strokeWidth={2} />
              </svg>
              {label}
            </span>
          ))}
        </figcaption>
      </figure>
      <details className="mt-3">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium underline underline-offset-4">
          View daily data
        </summary>
        <AnalyticsTable
          label="Daily activity data"
          headings={["Date", ...series.map(({ label }) => label)]}
        >
          {daily.map((day) => (
            <tr key={day.date}>
              <th scope="row">
                <time dateTime={day.date}>{dateLabel(day.date)}</time>
              </th>
              {series.map(({ key }) => (
                <td key={key}>{number.format(day[key])}</td>
              ))}
            </tr>
          ))}
        </AnalyticsTable>
      </details>
    </>
  );
}

export function PropertyAnalytics({
  data,
  days,
  rangeLinks,
  offerLinks,
}: {
  data: PropertyAnalyticsData;
  days: number;
  rangeLinks: ReactNode;
  offerLinks: ReactNode;
}) {
  const total = data.trend.reduce(
    (sum, day) => ({
      views: sum.views + day.views,
      whatsapp: sum.whatsapp + day.whatsapp,
      calls: sum.calls + day.calls,
    }),
    empty,
  );
  const currentMonth = month.format(new Date(`${data.currentMonth}-01T00:00:00Z`));
  const previousMonth = month.format(new Date(`${data.previousMonth}-01T00:00:00Z`));

  return (
    <div className="mt-6 grid min-w-0 gap-6">
      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="text-xl font-semibold">
          Activity in the last {days} days
        </h2>
        {rangeLinks}
        <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {rows.map(({ label, format }) => (
            <div key={label} className="rounded-lg border bg-card p-3 sm:p-4">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">
                {format(total)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted-foreground">
          Contact clicks measure WhatsApp and Call button use. The rate divides all contact clicks
          by offer detail views and can exceed 100%. A dash means there are no recorded views.
        </p>
      </section>
      <section
        className="min-w-0 rounded-lg border bg-card p-4 sm:p-5"
        aria-labelledby="trend-heading"
      >
        <h2 id="trend-heading" className="text-xl font-semibold">
          Daily trend
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The selected range includes today. Dates use Sri Lanka time.
        </p>
        <ActivityTrend daily={data.trend} />
      </section>
      <section
        className="min-w-0 rounded-lg border bg-card p-4 sm:p-5"
        aria-labelledby="monthly-heading"
      >
        <h2 id="monthly-heading" className="text-xl font-semibold">
          Monthly comparison
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This month to date compared with the full previous month.
        </p>
        <AnalyticsTable
          label="Monthly activity data"
          headings={["Metric", `${currentMonth} to date`, previousMonth]}
        >
          {rows.map(({ label, format }) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{format(data.current)}</td>
              <td>{format(data.previous)}</td>
            </tr>
          ))}
        </AnalyticsTable>
      </section>
      <section
        className="min-w-0 rounded-lg border bg-card p-4 sm:p-5"
        aria-labelledby="offers-heading"
      >
        <h2 id="offers-heading" className="text-xl font-semibold">
          Offer performance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Published offers in order of first publication. Counts cover the last {days} days.
        </p>
        {data.offers.length ? (
          <AnalyticsTable
            label="Offer performance data"
            headings={["Offer", "Views", "WhatsApp", "Calls", "Click rate"]}
          >
            {data.offers.slice(0, 20).map((offer) => (
              <tr key={offer.id}>
                <th scope="row" className="min-w-28 break-words">
                  {offer.title}
                </th>
                {rows.map(({ label, format }) => (
                  <td key={label}>{format(offer)}</td>
                ))}
              </tr>
            ))}
          </AnalyticsTable>
        ) : (
          <p className="mt-3 text-muted-foreground">No published offers on this page.</p>
        )}
        {offerLinks}
      </section>
    </div>
  );
}
