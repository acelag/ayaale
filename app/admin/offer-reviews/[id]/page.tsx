import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OfferReviewForm } from "@/components/admin/offer-review-form";
import { OfferReviewPreview } from "@/components/admin/offer-review-preview";
import { reviewTime, type OfferReview } from "@/lib/admin/offer-review";
import { offerStates } from "@/lib/partner/manage-offers";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";

export default async function OfferReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revision?: string; saved?: string; page?: string }>;
}) {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isPropertyId(id) || (query.revision !== undefined && !isPropertyId(query.revision)))
    notFound();
  const page =
    typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 0;
  const { data, error } = await session.client.rpc("get_admin_offer_reviews", {
    target_offer: id,
    target_revision: query.revision,
    page_offset: page,
  });
  if (!data && !error) notFound();
  if (error)
    return <h1 className="text-2xl font-semibold">Offer review temporarily unavailable</h1>;
  const offer = data as OfferReview;
  const { revision } = offer;
  const base = `/admin/offer-reviews/${offer.offerId}`;
  const pageUrl = (index: number) =>
    `${base}?revision=${revision.id}&page=${index}#revision-history`;

  return (
    <section className="max-w-5xl">
      <Link
        href="/admin/offer-reviews"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Offer review queue
      </Link>
      <h1 className="mt-2 break-words text-2xl font-semibold sm:text-3xl">{offer.preview.title}</h1>
      <p className="mt-2 break-words text-muted-foreground">
        {offer.property} · Offer status {offerStates[offer.offerStatus]} · Revision{" "}
        {revision.number} {offerStates[revision.status]}
      </p>
      {query.saved === "1" && (
        <p role="status" className="mt-3 rounded-lg border bg-card p-3">
          Review decision saved.
        </p>
      )}
      {revision.status === "approved" &&
        offer.approvedRevisionId === revision.id &&
        offer.offerStatus === "approved" && (
          <p className="mt-3 rounded-lg border bg-card p-3">
            Approved and waiting to go live. A current subscription or trial and a free active slot
            are required.
          </p>
        )}
      <OfferReviewPreview offer={offer} />
      {revision.status === "pending_review" && (
        <OfferReviewForm
          key={revision.id}
          offerId={offer.offerId}
          revisionId={revision.id}
          version={offer.version}
          canApprove={offer.propertyVerified && offer.offerStatus !== "hidden_by_admin"}
        />
      )}
      <section
        aria-labelledby="revision-history"
        className="mt-5 rounded-lg border bg-card p-4 sm:p-5"
      >
        <h2 id="revision-history" className="text-xl font-semibold">
          Revision history
        </h2>
        <ol className="mt-2 divide-y">
          {offer.history.slice(0, 20).map((item) => (
            <li key={item.id} className="py-2">
              <Link
                href={`${base}?revision=${item.id}`}
                aria-current={item.id === revision.id ? "page" : undefined}
                className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
              >
                Revision {item.number} · {offerStates[item.status]}
              </Link>
              {offer.approvedRevisionId === item.id && (
                <p className="text-sm">Current approved content</p>
              )}
              <p className="text-sm text-muted-foreground">
                Submitted{" "}
                <time dateTime={item.submittedAt}>
                  {reviewTime.format(new Date(item.submittedAt))}
                </time>{" "}
                Sri Lanka time
              </p>
              {item.reviewedAt && (
                <p className="text-sm text-muted-foreground">
                  Reviewed{" "}
                  <time dateTime={item.reviewedAt}>
                    {reviewTime.format(new Date(item.reviewedAt))}
                  </time>
                  {item.reviewer && ` by ${item.reviewer}`}
                </p>
              )}
              {item.message && (
                <p className="mt-1 whitespace-pre-wrap break-words">{item.message}</p>
              )}
            </li>
          ))}
        </ol>
        <nav aria-label="Revision history pages" className="mt-3 flex flex-wrap gap-4">
          {page > 0 && (
            <Link href={pageUrl(page - 1)} className="inline-flex min-h-11 items-center underline">
              Newer revisions
            </Link>
          )}
          {offer.history.length > 20 && page < 999999 && (
            <Link href={pageUrl(page + 1)} className="inline-flex min-h-11 items-center underline">
              Older revisions
            </Link>
          )}
        </nav>
      </section>
    </section>
  );
}
