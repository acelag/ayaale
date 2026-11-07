import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reportsPath, reportStatuses } from "@/lib/admin/reports";
import { signOutPartner } from "@/lib/partner/actions";
import { partnerSession } from "@/lib/partner/session";
import { issueReasons } from "@/lib/reports/form";

type QueueItem = { id: string; title: string; receivedAt: string };
type Queue<T> = { total: number; items: T[] };
type AdminOverview = {
  launchTrial?: { allocated: number; limit: number; remaining: number } | null;
  verifications: Queue<QueueItem & { district: string; kind: "initial" | "critical_change" }>;
  offers: Queue<QueueItem & { property: string; revision: number }>;
  reports: Queue<
    QueueItem & {
      property: string;
      target: "property" | "offer";
      priority: "high" | "medium" | "low";
      status: keyof typeof reportStatuses;
      reason: keyof typeof issueReasons;
    }
  >;
};

const labels = {
  verifications: "Pending verifications",
  offers: "Offers awaiting review",
  reports: "Unresolved reports",
};
const number = new Intl.NumberFormat("en-LK");
const sriLankaTime = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});

function QueuePreview<T extends QueueItem>({
  name,
  queue,
  detail,
}: {
  name: keyof typeof labels;
  queue: Queue<T>;
  detail: (item: T) => ReactNode;
}) {
  return (
    <section aria-labelledby={name} className="min-w-0 rounded-lg border bg-card p-4 sm:p-5">
      <h2 id={name} className="scroll-mt-4 text-xl font-semibold">
        {labels[name]}
      </h2>
      {name === "verifications" && (
        <Link
          href="/admin/verifications"
          className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
        >
          Open verification queue
        </Link>
      )}
      {name === "offers" && (
        <Link
          href="/admin/offer-reviews"
          className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
        >
          Open offer review queue
        </Link>
      )}
      {name === "reports" && (
        <Link
          href={reportsPath}
          className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
        >
          Open complaint moderation queue
        </Link>
      )}
      {queue.items.length > 0 ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Showing {number.format(queue.items.length)} of {number.format(queue.total)}.
          </p>
          <ul className="mt-2 divide-y">
            {queue.items.map((item) => (
              <li key={item.id} className="min-w-0 py-3">
                <h3 className="break-words font-semibold">{item.title}</h3>
                <p className="mt-1 break-words text-sm">{detail(item)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Received{" "}
                  <time dateTime={item.receivedAt}>
                    {sriLankaTime.format(new Date(item.receivedAt))}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">This queue is empty.</p>
      )}
    </section>
  );
}

export default async function AdminPage() {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const { data, error } = await session.client.rpc("get_admin_overview");
  if (!data && !error) notFound();
  const overview = data as AdminOverview | null;

  return (
    <section className="max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">Admin overview</h1>
        <form action={signOutPartner}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>
      <Link
        href="/admin/ownership-claims"
        className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
      >
        Ownership claims
      </Link>
      {overview && (
        <nav aria-label="Platform administration" className="mt-2 flex flex-wrap gap-x-5">
          <Link
            href="/admin/analytics"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Platform analytics
          </Link>
          <Link
            href="/admin/content-health"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Content health
          </Link>
          <Link
            href="/admin/newsletters"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Marketing · Newsletters
          </Link>
          <Link
            href="/admin/settings"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Settings
          </Link>
        </nav>
      )}
      {overview ? (
        <>
          <p className="mt-2 text-muted-foreground">
            Review queue summaries. Dates and times use Sri Lanka time.
          </p>
          <nav aria-label="Admin queues" className="mt-5 grid gap-3 sm:grid-cols-3">
            {(Object.keys(labels) as (keyof typeof labels)[]).map((name) => (
              <a
                key={name}
                href={`#${name}`}
                className="block min-h-11 rounded-lg border bg-card p-4 hover:border-primary"
              >
                <span className="block text-sm font-semibold text-primary underline underline-offset-4">
                  {labels[name]}
                </span>
                <span className="mt-1 block text-2xl font-semibold tabular-nums">
                  {number.format(overview[name].total)}
                </span>
              </a>
            ))}
          </nav>
          <section
            aria-labelledby="launch-trial"
            className="mt-5 rounded-lg border bg-card p-4 sm:p-5"
          >
            <h2 id="launch-trial" className="text-xl font-semibold">
              Starter launch trials
            </h2>
            {overview.launchTrial ? (
              <>
                <p className="mt-2 font-semibold tabular-nums">
                  {number.format(overview.launchTrial.allocated)} of{" "}
                  {number.format(overview.launchTrial.limit)} trials allocated
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {overview.launchTrial.remaining === 0
                    ? "All launch trials are allocated. Property approvals can continue."
                    : `${number.format(overview.launchTrial.remaining)} ${overview.launchTrial.remaining === 1 ? "place" : "places"} remaining`}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Trial allocation count is unavailable.
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              An eligible property’s six-month Starter trial starts on approval.
            </p>
          </section>
          <div className="mt-5 grid items-start gap-3 lg:grid-cols-3">
            <QueuePreview
              name="verifications"
              queue={overview.verifications}
              detail={(item) => (
                <>
                  {item.kind === "initial" ? "New registration" : "Profile change"} ·{" "}
                  {item.district}
                </>
              )}
            />
            <QueuePreview
              name="offers"
              queue={overview.offers}
              detail={(item) => (
                <>
                  {item.property} ·{" "}
                  {item.revision === 1 ? "New offer" : `Revision ${item.revision}`}
                </>
              )}
            />
            <QueuePreview
              name="reports"
              queue={overview.reports}
              detail={(item) => (
                <>
                  {item.target === "offer" ? `Offer at ${item.property}` : "Property report"} ·{" "}
                  {issueReasons[item.reason]} · {item.priority} priority ·{" "}
                  {reportStatuses[item.status]}
                </>
              )}
            />
          </div>
        </>
      ) : (
        <p role="alert" className="mt-4">
          We couldn’t load the admin overview. Refresh to try again.
        </p>
      )}
    </section>
  );
}
