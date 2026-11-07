import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { reviewTime, type ReviewQueueItem } from "@/lib/admin/offer-review";
import { offerStates } from "@/lib/partner/manage-offers";
import { partnerSession } from "@/lib/partner/session";

const base = "/admin/offer-reviews";
const tabClass =
  "inline-flex min-h-11 items-center rounded-md border bg-card px-3 aria-[current=page]:border-primary";

export default async function OfferReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ completed?: string; page?: string }>;
}) {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const query = await searchParams;
  const completed = query.completed === "1";
  const page =
    typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 0;
  const { data, error } = await session.client.rpc("get_admin_offer_reviews", {
    completed,
    page_offset: page,
  });
  if (!data && !error) notFound();
  const items = data as ReviewQueueItem[] | null;
  const pageUrl = (index: number) => `${base}?completed=${Number(completed)}&page=${index}`;
  return (
    <section className="max-w-4xl">
      <Link
        href="/admin"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Admin overview
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Offer review queue</h1>
      <nav aria-label="Offer review status" className="mt-4 flex flex-wrap gap-2">
        <Link href={base} aria-current={!completed ? "page" : undefined} className={tabClass}>
          Pending review
        </Link>
        <Link
          href={`${base}?completed=1`}
          aria-current={completed ? "page" : undefined}
          className={tabClass}
        >
          Decided revisions
        </Link>
      </nav>
      {error || !items ? (
        <p role="alert" className="mt-4">
          We couldn’t load this queue. Refresh to try again.
        </p>
      ) : items.length ? (
        <ul className="mt-4 divide-y rounded-lg border bg-card px-4">
          {items.slice(0, 20).map((item) => (
            <li key={item.revisionId} className="py-2">
              <Link
                href={`${base}/${item.offerId}?revision=${item.revisionId}`}
                className="inline-flex min-h-11 items-center break-words font-semibold text-primary underline underline-offset-4"
              >
                {item.title}
              </Link>
              <p className="break-words text-sm text-muted-foreground">
                {item.property} · Revision {item.number} · {offerStates[item.status]}
              </p>
              <p className="text-sm text-muted-foreground">
                Submitted{" "}
                <time dateTime={item.submittedAt}>
                  {reviewTime.format(new Date(item.submittedAt))}
                </time>{" "}
                Sri Lanka time
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4">This queue is empty.</p>
      )}
      <nav aria-label="Offer review pages" className="mt-3 flex flex-wrap gap-4">
        {page > 0 && (
          <Link href={pageUrl(page - 1)} className="inline-flex min-h-11 items-center underline">
            Previous page
          </Link>
        )}
        {items && items.length > 20 && page < 999999 && (
          <Link href={pageUrl(page + 1)} className="inline-flex min-h-11 items-center underline">
            Next page
          </Link>
        )}
      </nav>
    </section>
  );
}
