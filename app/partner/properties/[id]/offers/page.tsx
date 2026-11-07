import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ManageOfferButton } from "@/components/partner/manage-offer-button";
import { PropertySwitcher } from "@/components/partner/property-switcher";
import { Button } from "@/components/ui/button";
import { categories } from "@/lib/discovery/model";
import {
  offerStates,
  type OfferCapacity,
  type OfferOperation,
  type PartnerOffer,
} from "@/lib/partner/manage-offers";
import { loadPartnerProperties } from "@/lib/partner/properties";
import { isPropertyId } from "@/lib/partner/registration";
import { requirePartnerSession } from "@/lib/partner/session";

const updatedMessages: Record<string, string> = {
  pause: "Offer paused.",
  resume: "Offer resumed.",
  end: "Offer ended.",
};
const dateTime = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});
const date = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeZone: "UTC" });
const count = new Intl.NumberFormat("en-LK");

export default async function MyOffersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; updated?: string }>;
}) {
  const session = await requirePartnerSession();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isPropertyId(id)) notFound();
  const properties = await loadPartnerProperties(session);
  if (!properties)
    return <h1 className="text-2xl font-semibold">My Offers temporarily unavailable</h1>;
  const property = properties.find((item) => item.id === id.toLowerCase());
  if (!property) notFound();
  const page =
    typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 0;
  const [{ data, error }, { data: capacityData }] = await Promise.all([
    session.client.rpc("get_partner_offers", {
      target_property: property.id,
      list_page: page,
    }),
    session.client.rpc("get_property_offer_capacity", { target_property: property.id }),
  ]);
  if (!data && !error) notFound();
  const offers = (data ?? []) as PartnerOffer[];
  const capacity = capacityData as OfferCapacity | null;
  const remaining = capacity ? capacity.limit - capacity.active : 0;
  const base = `/partner/properties/${property.id}`;
  const notice =
    query.updated && Object.hasOwn(updatedMessages, query.updated)
      ? updatedMessages[query.updated]
      : null;

  return (
    <section className="max-w-4xl">
      <Link
        href={base}
        className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
      >
        Property status
      </Link>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">My Offers</h1>
      <p className="mt-2 break-words text-muted-foreground">
        {property.name} · {property.district}
      </p>
      <PropertySwitcher properties={properties} currentId={property.id} />
      <section
        aria-labelledby="offer-capacity-heading"
        className="mt-4 rounded-lg border bg-card p-4"
      >
        <h2 id="offer-capacity-heading" className="font-semibold">
          Active offer slots
        </h2>
        {capacity ? (
          <>
            <p className="mt-1 text-xl font-semibold">
              {capacity.active} of {capacity.limit} active
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {capacity.eligibility === "unverified"
                ? "Your property must be verified before offers can go live."
                : capacity.eligibility === "no_entitlement"
                  ? "A current subscription or trial is required before offers can go live."
                  : remaining > 0
                    ? `${remaining} ${remaining === 1 ? "slot" : "slots"} available.`
                    : "All slots are full. Pause or end an active offer to free a slot."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Drafts don’t use active slots.</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            We couldn’t load active offer usage. Refresh to try again.
          </p>
        )}
      </section>
      <Button asChild className="mt-4 min-h-11">
        <Link href={`${base}/offer`}>Create an offer</Link>
      </Button>
      {notice && (
        <p role="status" className="mt-4 rounded-md border bg-card p-3">
          {notice}
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-6">
          We couldn’t load offers. Refresh to try again.
        </p>
      ) : offers.length ? (
        <ul aria-label="Offers and drafts" className="mt-6 grid gap-3">
          {offers.slice(0, 20).map((item) => {
            const category = categories.find(({ id }) => id === item.category)?.label;
            const operation = (name: OfferOperation) => (
              <ManageOfferButton
                key={name}
                propertyId={property.id}
                id={item.id}
                operation={name}
                page={page}
                version={item.kind === "offer" ? item.version : undefined}
                newDraftId={name === "duplicate" || name === "edit" ? randomUUID() : undefined}
              />
            );
            return (
              <li key={`${item.kind}-${item.id}`} className="rounded-lg border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="min-w-0 break-words text-lg font-semibold">
                    {item.title ?? "Untitled offer"}
                  </h2>
                  <span className="rounded-md bg-secondary px-2 py-1 text-sm font-semibold">
                    {offerStates[item.status] ?? item.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {category && `${category} · `}Updated{" "}
                  <time dateTime={item.updatedAt}>{dateTime.format(new Date(item.updatedAt))}</time>
                </p>
                {item.kind === "draft" ? (
                  <>
                    {item.editDraft && (
                      <p className="mt-2 text-sm text-muted-foreground">Draft changes for review</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild variant="outline" className="min-h-11">
                        <Link href={`${base}/offer?draft=${item.id}`}>Continue draft</Link>
                      </Button>
                      {operation("duplicate")}
                    </div>
                  </>
                ) : (
                  <>
                    {item.reviewStatus &&
                      item.reviewStatus !== item.status &&
                      item.reviewStatus !== "approved" && (
                        <p className="mt-2 text-sm">
                          Latest revision · {offerStates[item.reviewStatus] ?? item.reviewStatus}
                        </p>
                      )}
                    {item.reviewMessage && (
                      <p className="mt-2 whitespace-pre-line break-words text-sm text-muted-foreground">
                        {item.reviewMessage}
                      </p>
                    )}
                    {item.publicationEnd && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Publication ends{" "}
                        <time dateTime={item.publicationEnd}>
                          {dateTime.format(new Date(item.publicationEnd))}
                        </time>{" "}
                        Sri Lanka time
                      </p>
                    )}
                    {item.redemptionEnd && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Redemption ends{" "}
                        <time dateTime={item.redemptionEnd}>
                          {date.format(new Date(item.redemptionEnd))}
                        </time>
                      </p>
                    )}
                    {item.history && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Recorded activity · {count.format(item.history.views)}{" "}
                        {item.history.views === 1 ? "view" : "views"} ·{" "}
                        {count.format(item.history.clicks)}{" "}
                        {item.history.clicks === 1 ? "contact click" : "contact clicks"}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.canPause && operation("pause")}
                      {item.canResume && operation("resume")}
                      {item.canEnd && operation("end")}
                      {item.hasRevision &&
                        item.status !== "hidden_by_admin" &&
                        item.reviewStatus !== "pending_review" &&
                        operation("edit")}
                      {item.hasRevision && operation("duplicate")}
                      {item.wasPublished && (
                        <Button asChild variant="outline" className="min-h-11">
                          <Link href={`/offers/${item.slug}`}>View public link</Link>
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-6 text-muted-foreground">There are no offers on this page.</p>
      )}
      <nav aria-label="Offer pages" className="mt-4 flex flex-wrap gap-4">
        {page > 0 && (
          <Link
            href={`${base}/offers?page=${page - 1}`}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Previous offers
          </Link>
        )}
        {offers.length > 20 && (
          <Link
            href={`${base}/offers?page=${page + 1}`}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            More offers
          </Link>
        )}
      </nav>
    </section>
  );
}
