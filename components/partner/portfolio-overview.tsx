import Link from "next/link";
import { propertyStatus } from "@/lib/partner/registration";
import type { PartnerOverview, PartnerProperty } from "@/lib/partner/properties";

const activityMetrics = [
  ["views", "Offer views"],
  ["whatsapp", "WhatsApp clicks"],
  ["calls", "Call clicks"],
] as const;
const formatNumber = new Intl.NumberFormat("en-LK");
const formatMonth = new Intl.DateTimeFormat("en-LK", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function PortfolioOverview({
  overview,
  properties,
}: {
  overview: PartnerOverview;
  properties: PartnerProperty[];
}) {
  const { currentMonth, previousMonth, properties: rows } = overview;
  if (!rows.length) return null;
  const total = rows.reduce(
    (sum, row) => ({
      published: sum.published + row.published,
      active: sum.active + row.active,
    }),
    { published: 0, active: 0 },
  );
  const totalsById = new Map(rows.map((row) => [row.id, row]));
  const currentLabel = formatMonth.format(new Date(`${currentMonth}-01T00:00:00Z`));
  const previousLabel = formatMonth.format(new Date(`${previousMonth}-01T00:00:00Z`));

  return (
    <div className="mt-7 grid gap-6">
      <section aria-label="Portfolio totals">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              ["Owned properties", rows.length],
              ["Published offers", total.published],
              ["Active offers", total.active],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-card p-4">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatNumber.format(value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="portfolio-monthly" className="rounded-lg border bg-card p-4 sm:p-5">
        <h2 id="portfolio-monthly" className="text-xl font-semibold">
          Monthly activity
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This month to date compared with the full previous month, using Sri Lanka time. Clicks
          count contact button use.
        </p>
        <table className="mt-3 w-full table-fixed text-left text-sm">
          <thead className="border-b">
            <tr>
              <th scope="col" className="py-2 pr-2">
                Metric
              </th>
              <th scope="col" className="px-1 py-2 text-right">
                {currentLabel} to date
              </th>
              <th scope="col" className="py-2 pl-1 text-right">
                {previousLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {activityMetrics.map(([key, label]) => (
              <tr key={key} className="border-b last:border-0">
                <th scope="row" className="py-3 pr-2 font-medium">
                  {label}
                </th>
                <td className="px-1 text-right tabular-nums">
                  {formatNumber.format(rows.reduce((count, row) => count + row.current[key], 0))}
                </td>
                <td className="pl-1 text-right tabular-nums">
                  {formatNumber.format(rows.reduce((count, row) => count + row.previous[key], 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section aria-labelledby="portfolio-properties">
        <h2 id="portfolio-properties" className="text-xl font-semibold">
          Your property registrations
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-property activity for {currentLabel} to date.
        </p>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {properties.map(({ id, name, verification_status }) => {
            const row = totalsById.get(id);
            if (!row) return null;
            return (
              <li key={id} className="min-w-0 rounded-lg border bg-card p-4">
                <h3 className="break-words font-semibold">
                  <Link
                    href={`/partner/properties/${id}`}
                    className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
                  >
                    {name}
                  </Link>
                </h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  {propertyStatus[verification_status as keyof typeof propertyStatus]?.[0] ??
                    "Status unavailable"}
                </p>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  {(
                    [
                      ["Published offers", row.published],
                      ["Active offers", row.active],
                      ...activityMetrics.map(([key, label]) => [label, row.current[key]] as const),
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-semibold tabular-nums">{formatNumber.format(value)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
