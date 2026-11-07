import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReportList, ReportPagination } from "@/components/admin/report-list";
import { reportPage, reportsPath, type ReportSummary } from "@/lib/admin/reports";
import { partnerSession } from "@/lib/partner/session";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ completed?: string; page?: string }>;
}) {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const query = await searchParams;
  const completed = query.completed === "1";
  const page = reportPage(query.page);
  const { data, error } = await session.client.rpc("get_admin_reports", {
    completed,
    page_index: page,
  });
  if (!data && !error) notFound();
  const reports = data as ReportSummary[] | null;
  const pageLink = (index: number) => `${reportsPath}?completed=${Number(completed)}&page=${index}`;
  return (
    <section className="max-w-4xl">
      <Link
        href="/admin"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Admin overview
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Complaint moderation</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Open complaints are ordered by priority, then by oldest first.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Internal review targets: high 4 business hours, medium 24 hours, low 48 hours.
      </p>
      <nav aria-label="Complaint status" className="mt-4 flex flex-wrap gap-2">
        <Link
          href={reportsPath}
          aria-current={!completed ? "page" : undefined}
          className="inline-flex min-h-11 items-center rounded-md border bg-card px-3 aria-[current=page]:border-primary"
        >
          Unresolved
        </Link>
        <Link
          href={`${reportsPath}?completed=1`}
          aria-current={completed ? "page" : undefined}
          className="inline-flex min-h-11 items-center rounded-md border bg-card px-3 aria-[current=page]:border-primary"
        >
          Closed
        </Link>
      </nav>
      {error || !reports ? (
        <p role="alert" className="mt-4">
          We couldn’t load complaints. Refresh to try again.
        </p>
      ) : reports.length ? (
        <div className="mt-4 rounded-lg border bg-card px-4">
          <ReportList reports={reports} />
        </div>
      ) : (
        <p className="mt-4">No {completed ? "closed" : "unresolved"} complaints on this page.</p>
      )}
      {reports && (
        <ReportPagination
          label="Complaint queue pages"
          previous={page > 0 ? pageLink(page - 1) : undefined}
          next={reports.length > 20 && page < 999999 ? pageLink(page + 1) : undefined}
        />
      )}
    </section>
  );
}
