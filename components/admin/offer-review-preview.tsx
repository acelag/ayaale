import { OfferReviewCover } from "./offer-review-cover";
import { PhotoLibrary } from "@/components/partner/profile-photos";
import { reviewTime, type OfferReview } from "@/lib/admin/offer-review";
import { categories, priceUnits } from "@/lib/discovery/model";
import { categoryFields } from "@/lib/partner/offer-wizard";

const money = new Intl.NumberFormat("en-LK", { maximumFractionDigits: 2 });
const redemption = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeZone: "UTC" });
const cell = "min-w-0 break-words whitespace-pre-wrap";

export function OfferReviewPreview({ offer }: { offer: OfferReview }) {
  const content = offer.preview;
  const category = categories.find(({ id }) => id === content.category)?.label ?? content.category;
  const priceUnit = priceUnits[content.price_unit as keyof typeof priceUnits];
  const details = [
    ["Package coverage", content.package_coverage],
    ["Guests", `${content.adults} adults · ${content.children} children`],
    ["Nights", content.nights],
    [
      "Children’s ages",
      content.child_age_min !== null && content.child_age_max !== null
        ? `${content.child_age_min}–${content.child_age_max}`
        : null,
    ],
    ["Child policy", content.child_policy],
    ...(categoryFields[content.category] ?? []).map(({ name, label }) => {
      const value = content.category_details[name];
      const display = Array.isArray(value)
        ? value.filter((item) => typeof item === "string").join(", ")
        : typeof value === "string" || typeof value === "number"
          ? value
          : null;
      return [label, display];
    }),
    ["Taxes", content.taxes_included ? "Included" : "Additional taxes apply"],
    ["Tax details", content.tax_details],
    ["Terms and conditions", content.terms],
    ["Exclusions", content.exclusions],
    ["Restrictions", content.restrictions],
    ["Extra charges", content.extra_charges],
  ];

  return (
    <section className="mt-4 rounded-lg border bg-card p-4 sm:p-5" aria-labelledby="public-preview">
      <h2 id="public-preview" className="text-xl font-semibold">
        Public content preview
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Private preview of revision {offer.revision.number}. Contact details are shown for review.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          {offer.cover ? (
            <OfferReviewCover
              key={offer.cover.id}
              propertyId={offer.propertyId}
              asset={offer.cover}
            />
          ) : (
            <p className="rounded-md border p-3">
              The submitted cover is missing from this property’s photos.
            </p>
          )}
          {offer.gallery.length > 0 && (
            <>
              <h3 className="mt-3 font-semibold">Submitted gallery</h3>
              <PhotoLibrary propertyId={offer.propertyId} assets={offer.gallery} />
            </>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{category}</p>
          <h3 className="mt-1 break-words text-xl font-semibold">{content.title}</h3>
          <p className="mt-2 break-words">
            {offer.property} · {offer.district}
          </p>
          <p className="mt-2 text-lg font-semibold">
            {content.price_qualifier === "starting_from" && "From "}
            LKR {money.format(content.promotional_price)}{" "}
            <span className="text-sm font-normal">{priceUnit}</span>
          </p>
          {content.original_price !== null && (
            <p className="mt-1 text-sm">
              Original price <s>LKR {money.format(content.original_price)}</s>
              {content.discount_percent !== null &&
                ` · ${money.format(content.discount_percent)}% less`}
            </p>
          )}
          <p className="mt-2 whitespace-pre-wrap break-words">{content.short_description}</p>
          <h4 className="mt-3 font-semibold">Inclusions</h4>
          <ul className="ml-5 list-disc">
            {content.inclusions.map((item, index) => (
              <li key={index} className="break-words">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
        <div className={cell}>
          <dt className="font-semibold">Publication window</dt>
          <dd>
            <time dateTime={content.publication_starts_at}>
              {reviewTime.format(new Date(content.publication_starts_at))}
            </time>{" "}
            to{" "}
            <time dateTime={content.publication_ends_at}>
              {reviewTime.format(new Date(content.publication_ends_at))}
            </time>{" "}
            Sri Lanka time
          </dd>
        </div>
        <div className={cell}>
          <dt className="font-semibold">Redemption window</dt>
          <dd>
            <time dateTime={content.redemption_starts_on}>
              {redemption.format(new Date(content.redemption_starts_on))}
            </time>{" "}
            to{" "}
            <time dateTime={content.redemption_ends_on}>
              {redemption.format(new Date(content.redemption_ends_on))}
            </time>
          </dd>
        </div>
        {details
          .filter(([, value]) => value !== null && value !== undefined && value !== "")
          .map(([label, value]) => (
            <div key={label} className={cell}>
              <dt className="font-semibold">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        <div className={cell}>
          <dt className="font-semibold">Business contact</dt>
          <dd>
            {offer.phone || offer.whatsapp
              ? [
                  offer.phone && `Call ${offer.phone}`,
                  offer.whatsapp && `WhatsApp ${offer.whatsapp}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "No business number is available."}
          </dd>
        </div>
        <div className={cell}>
          <dt className="font-semibold">Property address</dt>
          <dd>
            {offer.address}, {offer.district}
          </dd>
        </div>
      </dl>
    </section>
  );
}
