import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReportList, ReportPagination, ReportTime } from "@/components/admin/report-list";
import { ReportModerationForm } from "@/components/admin/report-moderation-form";
import {
  moderationOperations,
  reportPage,
  reportPriorities,
  reportStatuses,
  reportsPath,
  type ReportDetail,
} from "@/lib/admin/reports";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";
import { issueReasons } from "@/lib/reports/form";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; history?: string; actions?: string }>;
}) {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isPropertyId(id)) notFound();
  const history = reportPage(query.history);
  const actions = reportPage(query.actions);
  const { data, error } = await session.client.rpc("get_admin_reports", {
    target_report: id,
    page_index: history,
    action_page: actions,
  });
  if (!data && !error) notFound();
  if (error) return <h1 className="text-2xl font-semibold">Complaint temporarily unavailable</h1>;
  const report = data as ReportDetail;
  const completed = report.status === "resolved" || report.status === "dismissed";
  const pageLink = (h: number, a: number, anchor: string) =>
    `${reportsPath}/${id}?history=${h}&actions=${a}#${anchor}`;

  return (
    <section className="max-w-4xl">
      <Link
        href={completed ? `${reportsPath}?completed=1` : reportsPath}
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Complaint moderation
      </Link>
      <h1 className="mt-2 break-words text-2xl font-semibold sm:text-3xl">{report.title}</h1>
      <p className="mt-2 break-words text-muted-foreground">
        {report.target === "offer" ? `Offer · ${report.property}` : "Business"} ·{" "}
        {issueReasons[report.reason]}
      </p>
      {query.saved === "1" && (
        <p className="mt-4 rounded-lg border bg-card p-3" role="status">
          Moderation action saved.
        </p>
      )}
      <section
        aria-labelledby="report-details"
        className="mt-4 rounded-lg border bg-card p-4 sm:p-5"
      >
        <h2 id="report-details" className="text-xl font-semibold">
          Complaint details
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Status</dt>
            <dd>{reportStatuses[report.status]}</dd>
          </div>
          <div>
            <dt className="font-semibold">Priority</dt>
            <dd>{reportPriorities[report.priority]}</dd>
          </div>
          <div>
            <dt className="font-semibold">Received</dt>
            <dd>
              <ReportTime at={report.receivedAt} />
            </dd>
          </div>
          <div>
            <dt className="font-semibold">
              {report.target === "offer" ? "Offer status" : "Business status"}
            </dt>
            <dd className="capitalize">{report.targetStatus.replaceAll("_", " ")}</dd>
          </div>
          {report.resolvedAt && (
            <div>
              <dt className="font-semibold">Closed</dt>
              <dd>
                <ReportTime at={report.resolvedAt} />
              </dd>
            </div>
          )}
        </dl>
        <details className="mt-3 border-t pt-2">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Private visitor submission
          </summary>
          <dl className="space-y-3 break-words">
            <div>
              <dt className="font-semibold">Comment</dt>
              <dd className="whitespace-pre-wrap">{report.comment ?? "No comment provided."}</dd>
            </div>
            <div>
              <dt className="font-semibold">Reporter email</dt>
              <dd>{report.reporterEmail ?? "No email provided."}</dd>
            </div>
          </dl>
        </details>
      </section>
      {!completed && (
        <ReportModerationForm
          key={report.version}
          id={id}
          version={report.version}
          priority={report.priority}
          status={report.status}
          target={report.target}
          targetStatus={report.targetStatus}
          canHide={report.canHide}
          canRestore={report.canRestore}
        />
      )}
      <section
        aria-labelledby="moderation-history"
        className="mt-5 rounded-lg border bg-card p-4 sm:p-5"
      >
        <h2 id="moderation-history" className="text-xl font-semibold">
          Moderation history
        </h2>
        {report.actions.length ? (
          <ol className="mt-2 divide-y">
            {report.actions.slice(0, 20).map((entry) => (
              <li key={entry.id} className="break-words py-3">
                <p className="font-semibold">
                  {entry.action === "reopen"
                    ? "Reopen complaint"
                    : moderationOperations[entry.action]}
                </p>
                <p className="text-sm text-muted-foreground">
                  {entry.actor} · <ReportTime at={entry.at} />
                </p>
                {entry.changes.statusBefore &&
                  entry.changes.statusAfter &&
                  entry.changes.statusBefore !== entry.changes.statusAfter && (
                    <p className="mt-1 text-sm">
                      {reportStatuses[entry.changes.statusBefore]} →{" "}
                      {reportStatuses[entry.changes.statusAfter]}
                    </p>
                  )}
                {entry.changes.priorityBefore &&
                  entry.changes.priorityAfter &&
                  entry.changes.priorityBefore !== entry.changes.priorityAfter && (
                    <p className="mt-1 text-sm">
                      {reportPriorities[entry.changes.priorityBefore]} →{" "}
                      {reportPriorities[entry.changes.priorityAfter]} priority
                    </p>
                  )}
                {entry.changes.targetBefore && entry.changes.targetAfter && (
                  <p className="mt-1 text-sm capitalize">
                    {entry.changes.targetBefore.replaceAll("_", " ")} →{" "}
                    {entry.changes.targetAfter.replaceAll("_", " ")}
                  </p>
                )}
                <p className="mt-1 whitespace-pre-wrap">{entry.note}</p>
                {entry.changes.ownerMessage && (
                  <p className="mt-1 whitespace-pre-wrap">
                    Owner instructions: {entry.changes.ownerMessage}
                  </p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm">No moderation actions on this page.</p>
        )}
        <ReportPagination
          label="Moderation history pages"
          previous={actions > 0 ? pageLink(history, actions - 1, "moderation-history") : undefined}
          next={
            report.actions.length > 20 && actions < 999999
              ? pageLink(history, actions + 1, "moderation-history")
              : undefined
          }
        />
      </section>
      <section
        aria-labelledby="property-history"
        className="mt-5 rounded-lg border bg-card p-4 sm:p-5"
      >
        <h2 id="property-history" className="text-xl font-semibold">
          Other complaints for this business
        </h2>
        {report.related.length ? (
          <ReportList reports={report.related} />
        ) : (
          <p className="mt-2 text-sm">No other complaints on this page.</p>
        )}
        <ReportPagination
          label="Business complaint history pages"
          previous={history > 0 ? pageLink(history - 1, actions, "property-history") : undefined}
          next={
            report.related.length > 20 && history < 999999
              ? pageLink(history + 1, actions, "property-history")
              : undefined
          }
        />
      </section>
    </section>
  );
}
