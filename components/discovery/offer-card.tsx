import Link from "next/link";
import Image from "next/image";
import { MapPin, ShieldCheck } from "lucide-react";
import type { OfferCardData } from "@/lib/discovery/model";
const money = new Intl.NumberFormat("en-LK", { maximumFractionDigits: 2 });
export function OfferCard({ offer }: { offer: OfferCardData }) {
  return (
    <article className="offer-card" aria-labelledby={`offer-${offer.id}`}>
      <div className="offer-thumbnail">
        <Image
          src={offer.image}
          alt=""
          width={480}
          height={360}
          sizes="(max-width: 639px) 88px, 144px"
          className="aspect-[4/3] w-full rounded-lg object-cover"
        />
        <span className="mt-2 block text-xs text-muted-foreground">Illustration</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-semibold text-primary">
            {offer.category === "day_outs"
              ? "Day Outs"
              : offer.category === "stays"
                ? "Stays"
                : "Dining"}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <ShieldCheck size={14} aria-hidden="true" />
            Verified by Ayaale
          </span>
        </div>
        <h3 id={`offer-${offer.id}`} className="text-base leading-snug font-semibold sm:text-lg">
          <Link
            href={`/offers/${offer.slug}`}
            prefetch={false}
            className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
          >
            {offer.title}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{offer.property}</p>
        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin size={13} aria-hidden="true" />
          {offer.district}
        </p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
          <p className="text-lg font-bold">
            {offer.startingFrom && <span className="mr-1 text-sm font-normal">From</span>}LKR{" "}
            {money.format(offer.price)}
          </p>
          <span className="text-sm text-muted-foreground">{offer.unit}</span>
        </div>
        {offer.originalPrice != null &&
          offer.discountPercent != null &&
          offer.discountPercent > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                <span className="sr-only">Original price </span>
                <s>LKR {money.format(offer.originalPrice)}</s>
              </span>
              <span className="rounded-sm bg-accent px-2 py-1 font-semibold text-accent-foreground">
                {offer.discountPercent}% less
              </span>
            </p>
          )}
        <p className="mt-3 text-sm">{offer.coverage}</p>
        <ul
          aria-label="Offer inclusions"
          className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
        >
          {offer.inclusions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
