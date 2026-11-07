import { StructuredData } from "@/components/seo/structured-data";
import { publicMetadata } from "@/lib/seo/metadata";
import { propertyData } from "@/lib/seo/structured-data";
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, ShieldCheck } from "lucide-react";
import { IssueReportForm } from "@/components/reports/issue-report-form";
import { Button } from "@/components/ui/button";
import { categories, offerIllustrations } from "@/lib/discovery/model";
import {
  httpsLink,
  safeMapsUrl,
  safeReviewsUrl,
  safeSocialUrl,
} from "@/lib/properties/public-links";
import { readPublicProperty } from "@/lib/properties/public-profile";

type Props = { params: Promise<{ slug: string }> };
const e164 = /^\+[1-9][0-9]{6,14}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const property = await readPublicProperty((await params).slug).catch(() => null);
  return property
    ? publicMetadata(
        `/properties/${(await params).slug}`,
        property.name,
        property.description || `${property.name} in ${property.district}`,
        true,
        property.photos.length && process.env.SUPABASE_SECRET_KEY
          ? `/api/public-properties/${(await params).slug}/photos/${property.photos[0].position}`
          : undefined,
      )
    : { title: "Property profile", robots: { index: false, follow: false } };
}

export default async function PropertyPage({ params }: Props) {
  const { slug } = await params;
  const property = await readPublicProperty(slug).catch(() => undefined);
  if (property === undefined) {
    return (
      <main id="main-content" tabIndex={-1} className="discovery-shell py-12">
        <h1 className="text-2xl font-semibold">The property profile is temporarily unavailable</h1>
        <p className="mt-3">Try refreshing the page in a moment.</p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/#offers">Browse offers</Link>
        </Button>
      </main>
    );
  }
  if (property === null) notFound();

  const category = categories.find((item) => item.id === property.category)?.label;
  const amenities = [...new Set(property.amenities.map((item) => item.trim()).filter(Boolean))];
  const [cover, ...gallery] = process.env.SUPABASE_SECRET_KEY ? property.photos : [];
  const photoUrl = (position: number) => `/api/public-properties/${slug}/photos/${position}`;
  const links = [
    ["Get directions", safeMapsUrl(property.mapsUrl)],
    ["Google reviews", safeReviewsUrl(property.reviewsUrl)],
    ["Website", httpsLink(property.websiteUrl)?.href],
    ["Facebook", safeSocialUrl(property.facebookUrl, "facebook.com")],
    ["Instagram", safeSocialUrl(property.instagramUrl, "instagram.com")],
    ["Call", property.phone && e164.test(property.phone) ? `tel:${property.phone}` : null],
    [
      "WhatsApp",
      property.whatsapp && e164.test(property.whatsapp)
        ? `https://wa.me/${property.whatsapp.slice(1)}`
        : null,
    ],
    [
      "Email",
      property.email
        ? `mailto:${property.email.split("@").map(encodeURIComponent).join("@")}`
        : null,
    ],
  ] as const;

  return (
    <main id="main-content" tabIndex={-1} className="discovery-shell py-6 sm:py-10">
      <StructuredData
        data={propertyData(slug, property, Boolean(process.env.SUPABASE_SECRET_KEY))}
      />
      <Link
        href="/#offers"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4"
      >
        <ArrowLeft size={17} aria-hidden="true" /> Browse offers
      </Link>
      <header className="mb-6 mt-5">
        <p className="text-sm font-semibold text-primary">
          {category} ·{" "}
          <span className="capitalize">{property.propertyType.replaceAll("_", " ")}</span>
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{property.name}</h1>
        <p className="mt-3 flex items-start gap-2 text-muted-foreground">
          <MapPin size={17} className="mt-1 shrink-0" aria-hidden="true" /> {property.address},{" "}
          {property.district}
        </p>
        <a
          href="#report-an-issue"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
        >
          Report an issue
        </a>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <figure>
          <Image
            src={cover ? photoUrl(cover.position) : offerIllustrations[property.category]}
            alt={cover?.alt ?? ""}
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
        <section
          className="rounded-lg border bg-card p-5 sm:p-6"
          aria-labelledby="property-contact-heading"
        >
          <h2 id="property-contact-heading" className="text-xl font-semibold">
            About this property
          </h2>
          {property.description && (
            <p className="mt-3 whitespace-pre-line">{property.description}</p>
          )}
          <p className="mt-4 flex items-center gap-2 font-semibold text-primary">
            <ShieldCheck size={18} aria-hidden="true" /> Verified by Ayaale
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ayaale checked basic identity and authorization. Quality and availability can vary.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {links.map(
              ([label, url]) =>
                url && (
                  <Button key={label} asChild variant="outline" size="sm">
                    <a href={url}>{label}</a>
                  </Button>
                ),
            )}
          </div>
        </section>
      </div>
      <section
        className="mt-8 rounded-lg border bg-card p-5 sm:p-6"
        aria-labelledby="amenities-heading"
      >
        <h2 id="amenities-heading" className="text-xl font-semibold">
          Amenities
        </h2>
        {amenities.length ? (
          <>
            <ul className="mt-3 grid list-disc gap-2 pl-5 sm:grid-cols-2">
              {amenities.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {amenities.length > 4 && (
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary">
                  View all amenities
                </summary>
                <ul className="grid list-disc gap-2 pl-5 sm:grid-cols-2">
                  {amenities.slice(4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <p className="mt-3 text-muted-foreground">Amenities have yet to be listed.</p>
        )}
      </section>
      {gallery.length > 0 && (
        <section className="mt-8" aria-labelledby="property-photos-heading">
          <h2 id="property-photos-heading" className="text-xl font-semibold">
            Property photos
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((photo) => (
              <Image
                key={photo.position}
                src={photoUrl(photo.position)}
                alt={photo.alt}
                width={640}
                height={480}
                unoptimized
                className="aspect-[4/3] w-full rounded-lg border object-cover"
              />
            ))}
          </div>
        </section>
      )}
      <section
        className="mt-8 rounded-lg border bg-card p-5 sm:p-6"
        aria-labelledby="property-offers-heading"
      >
        <h2 id="property-offers-heading" className="text-xl font-semibold">
          Current offers
        </h2>
        {property.offers.length > 0 ? (
          <ul className="mt-3 grid gap-1">
            {property.offers.map((offer) => (
              <li key={offer.slug}>
                <Link
                  href={`/offers/${offer.slug}`}
                  className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
                >
                  {offer.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-muted-foreground">There are no active offers at this property.</p>
        )}
      </section>
      <IssueReportForm target="property" slug={slug} reportId={randomUUID()} />
    </main>
  );
}
