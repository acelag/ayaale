import { StructuredData } from "@/components/seo/structured-data";
import { publicMetadata } from "@/lib/seo/metadata";
import { offerData } from "@/lib/seo/structured-data";
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, ShieldCheck } from "lucide-react";
import { ContactActions } from "@/components/offers/contact-actions";
import { RecordOfferView } from "@/components/offers/record-offer-view";
import { IssueReportForm } from "@/components/reports/issue-report-form";
import { Button } from "@/components/ui/button";
import { categories, offerIllustrations, priceUnits } from "@/lib/discovery/model";
import { readPublicOfferPage, type UnavailableOfferPage } from "@/lib/offers/public-details";
import { offerViewTrackingEnabled } from "@/lib/offers/view-tracking";
import { safeMapsUrl } from "@/lib/properties/public-links";

type Props = { params: Promise<{ slug: string }> };
const money = new Intl.NumberFormat("en-LK", { maximumFractionDigits: 2 });
const publication = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});
const redemption = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeZone: "UTC" });
const detailLabels: Record<string, string> = {
  room_type: "Room type",
  meal_plan: "Meal plan",
  check_in_time: "Check-in",
  check_out_time: "Check-out",
  extra_bed_policy: "Extra bed policy",
  meal_period: "Meal period",
  service_start: "Service starts",
  service_end: "Service ends",
  cuisine: "Cuisine",
  menu: "Menu",
  booking_notice: "Advance notice",
  access_start: "Access starts",
  access_end: "Access ends",
  facilities: "Facilities",
  meal_details: "Meal details",
  access_restrictions: "Access restrictions",
};

const availability = {
  paused: {
    heading: "This offer is paused",
    description: "This offer is temporarily paused. Explore offers that are available now.",
  },
  ended: {
    heading: "This offer has ended",
    description: "The offer is no longer available. Explore offers that are available now.",
  },
  unavailable: {
    heading: "This offer is unavailable",
    description: "This offer can’t be accessed right now. Explore offers that are available now.",
  },
};

function UnavailableOffer({ page, slug }: { page: UnavailableOfferPage; slug: string }) {
  const { heading, description } = availability[page.state];

  return (
    <main id="main-content" tabIndex={-1} className="discovery-shell py-8 sm:py-12">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{heading}</h1>
        {page.title && <p className="mt-3 text-lg font-medium">{page.title}</p>}
        <p className="mt-3 text-muted-foreground">{description}</p>
      </header>
      <section className="mt-8 border-t pt-6" aria-labelledby="related-heading">
        <h2 id="related-heading" className="text-xl font-semibold">
          {page.related.length ? "Available offers" : "Find another offer"}
        </h2>
        {page.related.length > 0 ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.related.map((offer) => (
              <li key={offer.slug}>
                <Link
                  href={`/offers/${offer.slug}`}
                  className="block h-full rounded-lg border bg-card p-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="font-semibold text-primary underline underline-offset-4">
                    {offer.title}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {offer.property} · {offer.district}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted-foreground">There are no offers to suggest right now.</p>
        )}
        <Button asChild variant="outline" className="mt-5">
          <Link href="/#offers">Browse all offers</Link>
        </Button>
      </section>
      {page.title && <IssueReportForm target="offer" slug={slug} reportId={randomUUID()} />}
    </main>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await readPublicOfferPage((await params).slug).catch(() => null);
  if (!page) return { title: "Offer details", robots: { index: false, follow: false } };
  if (page.state === "active") {
    return publicMetadata(
      `/offers/${(await params).slug}`,
      page.offer.title,
      page.offer.description,
      true,
      page.offer.hasCover && process.env.SUPABASE_SECRET_KEY
        ? `/api/offers/${(await params).slug}/cover`
        : undefined,
    );
  }
  const { heading, description } = availability[page.state];
  return { title: heading, description, robots: { index: false, follow: false } };
}

export default async function OfferDetails({ params }: Props) {
  const { slug } = await params;
  const page = await readPublicOfferPage(slug).catch(() => undefined);

  if (page === undefined) {
    return (
      <main id="main-content" tabIndex={-1} className="discovery-shell py-12">
        <h1 className="text-2xl font-semibold">Offer details are temporarily unavailable</h1>
        <p className="mt-3">Try refreshing the page in a moment.</p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/#offers">Browse offers</Link>
        </Button>
      </main>
    );
  }
  if (page === null) notFound();
  if (page.state !== "active") return <UnavailableOffer page={page} slug={slug} />;
  const { offer } = page;

  const offerUrl = new URL(
    `/offers/${slug}`,
    process.env.NEXT_PUBLIC_SITE_URL || "https://ayaale.com",
  ).href;
  const e164 = /^\+[1-9][0-9]{6,14}$/;
  const whatsappUrl =
    offer.whatsapp && e164.test(offer.whatsapp)
      ? `https://wa.me/${offer.whatsapp.slice(1)}?${new URLSearchParams({ text: `Hello, I’m interested in ${offer.title}. Could you confirm availability? ${offerUrl}` })}`
      : null;
  const callUrl = offer.phone && e164.test(offer.phone) ? `tel:${offer.phone}` : null;
  const mapsUrl = safeMapsUrl(offer.mapsUrl);
  const category = categories.find((item) => item.id === offer.category)?.label;
  const cover = offer.hasCover && Boolean(process.env.SUPABASE_SECRET_KEY);
  const details = Object.entries(offer.details).filter(
    ([key, value]) =>
      Object.hasOwn(detailLabels, key) && (Array.isArray(value) ? value.length > 0 : value !== ""),
  );

  return (
    <main id="main-content" tabIndex={-1} className="discovery-shell py-6 sm:py-10">
      <StructuredData data={offerData(slug, offer, cover)} />
      {offerViewTrackingEnabled() && <RecordOfferView slug={slug} />}
      <Link
        href="/#offers"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4"
      >
        <ArrowLeft size={17} aria-hidden="true" /> Browse offers
      </Link>
      <header className="mb-7 mt-5 max-w-3xl">
        <p className="text-sm font-semibold text-primary">{category}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{offer.title}</h1>
        <p className="mt-3 flex items-center gap-2 text-muted-foreground">
          <MapPin size={16} className="shrink-0" aria-hidden="true" /> {offer.property} ·{" "}
          {offer.district}
        </p>
        <a
          href="#report-an-issue"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
        >
          Report an issue
        </a>
      </header>
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <figure>
          <Image
            src={cover ? `/api/offers/${slug}/cover` : offerIllustrations[offer.category]}
            alt={cover ? `Cover photo for ${offer.title}` : ""}
            width={960}
            height={720}
            unoptimized
            className="aspect-[4/3] w-full rounded-lg border bg-secondary object-cover"
          />
          {!cover && (
            <figcaption className="mt-2 text-sm text-muted-foreground">
              Category illustration
            </figcaption>
          )}
        </figure>
        <section className="rounded-lg border bg-card p-5 sm:p-6" aria-labelledby="price-heading">
          <h2 id="price-heading" className="font-semibold">
            Offer price
          </h2>
          <p className="mt-2 text-3xl font-bold tabular-nums">
            {offer.startingFrom && <span className="mr-2 text-sm font-normal">From</span>}
            LKR {money.format(offer.price)}
          </p>
          <p className="mt-1 text-muted-foreground">{priceUnits[offer.priceUnit]}</p>
          {offer.originalPrice != null && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span>
                Original price <s>LKR {money.format(offer.originalPrice)}</s>
              </span>
              {offer.discountPercent != null && offer.discountPercent > 0 && (
                <span className="rounded-sm bg-accent px-2 py-1 text-accent-foreground">
                  {offer.discountPercent}% less
                </span>
              )}
            </p>
          )}
          <h3 className="mt-5 font-semibold">Package coverage</h3>
          <p className="mt-1 whitespace-pre-line">{offer.coverage}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {offer.adults} {offer.adults === 1 ? "adult" : "adults"}
            {offer.children > 0 &&
              ` · ${offer.children} ${offer.children === 1 ? "child" : "children"}`}
            {offer.nights && ` · ${offer.nights} ${offer.nights === 1 ? "night" : "nights"}`}
          </p>
          {offer.childAgeMin != null && offer.childAgeMax != null && (
            <p className="mt-1 text-sm">
              Children’s ages {offer.childAgeMin}–{offer.childAgeMax}
            </p>
          )}
          {offer.childPolicy && (
            <p className="mt-2 whitespace-pre-line text-sm">{offer.childPolicy}</p>
          )}
          <ContactActions
            slug={slug}
            offerUrl={offerUrl}
            whatsappUrl={whatsappUrl}
            callUrl={callUrl}
          />
        </section>
      </div>
      <div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid gap-7">
          <section
            className="rounded-lg border bg-card p-5 sm:p-6"
            aria-labelledby="inclusions-heading"
          >
            <h2 id="inclusions-heading" className="text-xl font-semibold">
              What’s included
            </h2>
            <p className="mt-3 whitespace-pre-line">{offer.description}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {offer.inclusions.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
            {details.length > 0 && (
              <dl className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-2">
                {details.map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-semibold">{detailLabels[key]}</dt>
                    <dd className="mt-1 whitespace-pre-line text-muted-foreground">
                      {Array.isArray(value) ? value.join(", ") : value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <section className="rounded-lg border bg-card p-5 sm:p-6" aria-labelledby="terms-heading">
            <h2 id="terms-heading" className="text-xl font-semibold">
              Terms and conditions
            </h2>
            <p className="mt-3 whitespace-pre-line">{offer.terms}</p>
            <dl className="mt-5 grid gap-4 border-t pt-4">
              <div>
                <dt className="font-semibold">Taxes</dt>
                <dd className="mt-1 whitespace-pre-line">
                  {offer.taxesIncluded
                    ? "Included in the advertised price."
                    : "Additional taxes apply."}
                  {offer.taxDetails && ` ${offer.taxDetails}`}
                </dd>
              </div>
              {(
                [
                  ["Exclusions", offer.exclusions],
                  ["Restrictions", offer.restrictions],
                  ["Extra charges", offer.extraCharges],
                ] as const
              ).map(
                ([label, value]) =>
                  value && (
                    <div key={label}>
                      <dt className="font-semibold">{label}</dt>
                      <dd className="mt-1 whitespace-pre-line">{value}</dd>
                    </div>
                  ),
              )}
            </dl>
          </section>
        </div>
        <div className="grid gap-7">
          <section className="rounded-lg border bg-card p-5 sm:p-6" aria-labelledby="dates-heading">
            <h2 id="dates-heading" className="text-xl font-semibold">
              Offer dates
            </h2>
            <dl className="mt-4 grid gap-4">
              <div>
                <dt className="font-semibold">Publication window</dt>
                <dd className="mt-1 text-sm">
                  <time dateTime={offer.publicationStart}>
                    {publication.format(new Date(offer.publicationStart))}
                  </time>
                  {" to "}
                  <time dateTime={offer.publicationEnd}>
                    {publication.format(new Date(offer.publicationEnd))}
                  </time>
                  <span className="block text-muted-foreground">Sri Lanka time</span>
                </dd>
              </div>
              <div>
                <dt className="font-semibold">
                  {offer.category === "stays" ? "Eligible stay dates" : "Redemption dates"}
                </dt>
                <dd className="mt-1 text-sm">
                  <time dateTime={offer.redemptionStart}>
                    {redemption.format(new Date(offer.redemptionStart))}
                  </time>
                  {" to "}
                  <time dateTime={offer.redemptionEnd}>
                    {redemption.format(new Date(offer.redemptionEnd))}
                  </time>
                </dd>
              </div>
            </dl>
          </section>
          <section
            className="rounded-lg border bg-card p-5 sm:p-6"
            aria-labelledby="property-heading"
          >
            <h2 id="property-heading" className="text-xl font-semibold">
              {offer.property}
            </h2>
            <p className="mt-2 whitespace-pre-line text-muted-foreground">
              {offer.address}, {offer.district}
            </p>
            <Link
              href={`/properties/${offer.propertySlug}`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
            >
              View property profile
            </Link>
            <p className="mt-4 flex items-center gap-2 font-semibold text-primary">
              <ShieldCheck size={18} aria-hidden="true" /> Verified by Ayaale
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ayaale checked basic identity and authorization. Quality and availability can vary.
            </p>
            {mapsUrl && (
              <Button asChild variant="outline" className="mt-4">
                <a href={mapsUrl}>Get directions</a>
              </Button>
            )}
          </section>
        </div>
      </div>
      <IssueReportForm target="offer" slug={slug} reportId={randomUUID()} />
    </main>
  );
}
