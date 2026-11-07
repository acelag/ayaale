import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { newsletterEditorPath } from "@/lib/newsletter/editor";
import { partnerSession } from "@/lib/partner/session";

const date = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeZone: "Asia/Colombo" });

export default async function NewslettersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const query = await searchParams;
  const page =
    typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 0;
  const { data, error } = await session.client.rpc("get_admin_newsletter", { page_index: page });
  if (!data && !error) notFound();
  const rows = data as { id: string; subject: string; status: string; updatedAt: string }[] | null;
  return (
    <section className="max-w-4xl">
      <Link
        href="/admin"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Admin overview
      </Link>
      <p className="mt-2 text-sm text-muted-foreground">Marketing</p>
      <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Newsletters</h1>
      {rows && (
        <Button asChild className="mt-4 min-h-11">
          <Link href={`${newsletterEditorPath}/new`}>Create newsletter</Link>
        </Button>
      )}
      {!rows ? (
        <p role="alert" className="mt-4">
          We couldn’t load newsletters. Refresh to try again.
        </p>
      ) : rows.length ? (
        <ul className="mt-4 divide-y rounded-lg border bg-card px-4">
          {rows.slice(0, 20).map((row) => (
            <li key={row.id} className="min-w-0 break-words py-3">
              <Link
                href={`${newsletterEditorPath}/${row.id}`}
                className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
              >
                {row.subject}
              </Link>
              <p className="text-sm text-muted-foreground">
                <span className="capitalize">{row.status}</span> · Updated{" "}
                <time dateTime={row.updatedAt}>{date.format(new Date(row.updatedAt))}</time>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4">No newsletters on this page.</p>
      )}
      {(page > 0 || (rows?.length ?? 0) > 20) && (
        <nav aria-label="Newsletter pages" className="mt-3 flex gap-4">
          {page > 0 && (
            <Link
              href={`${newsletterEditorPath}?page=${page - 1}`}
              className="inline-flex min-h-11 items-center underline"
            >
              Previous page
            </Link>
          )}
          {(rows?.length ?? 0) > 20 && page < 999999 && (
            <Link
              href={`${newsletterEditorPath}?page=${page + 1}`}
              className="inline-flex min-h-11 items-center underline"
            >
              Next page
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
