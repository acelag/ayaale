import Link from "next/link";
import {
  reportPriorities,
  reportStatuses,
  reportsPath,
  type ReportSummary,
} from "@/lib/admin/reports";
import { issueReasons } from "@/lib/reports/form";

const sriLankaTime = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});

export function ReportTime({ at }: { at: string }) {
  return <time dateTime={at}>{sriLankaTime.format(new Date(at))}</time>;
}

export function ReportList({ reports }: { reports: ReportSummary[] }) {
  return (
    <ul className="divide-y">
      {reports.slice(0, 20).map((report) => (
        <li key={report.id} className="min-w-0 break-words py-3">
          <Link
            href={`${reportsPath}/${report.id}`}
            className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
          >
            {report.title}
          </Link>
          <p className="text-sm">
            {report.target === "offer" ? `Offer · ${report.property}` : "Business"} ·{" "}
            {issueReasons[report.reason]}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {reportPriorities[report.priority]} priority · {reportStatuses[report.status]} ·{" "}
            <ReportTime at={report.receivedAt} />
          </p>
        </li>
      ))}
    </ul>
  );
}

export function ReportPagination({
  label,
  previous,
  next,
}: {
  label: string;
  previous?: string;
  next?: string;
}) {
  if (!previous && !next) return null;
  return (
    <nav aria-label={label} className="mt-2 flex flex-wrap gap-4">
      {previous && (
        <Link
          href={previous}
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Previous page
        </Link>
      )}
      {next && (
        <Link
          href={next}
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Next page
        </Link>
      )}
    </nav>
  );
}
