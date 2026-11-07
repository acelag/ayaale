import type { PublicOfferDetails } from "@/lib/offers/public-details";
import type { PublicPropertyProfile } from "@/lib/properties/public-profile";
import { priceUnits } from "@/lib/discovery/model";
import { breadcrumbs, canonical } from "./policy.mjs";

export function offerData(slug: string, offer: PublicOfferDetails, image: boolean) {
  const path = `/offers/${slug}`;
  const url = canonical(path);
  return [
    breadcrumbs(path, offer.title),
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": url,
      url,
      name: offer.title,
      description: offer.description,
      mainEntity: {
        "@type": "Offer",
        "@id": `${url}#offer`,
        name: offer.title,
        url,
        description: offer.description,
        validFrom: offer.publicationStart,
        validThrough: offer.publicationEnd,
        priceSpecification: {
          "@type": "PriceSpecification",
          priceCurrency: "LKR",
          [offer.startingFrom ? "minPrice" : "price"]: offer.price,
          valueAddedTaxIncluded: offer.taxesIncluded,
          description: `${priceUnits[offer.priceUnit]}; ${offer.coverage}`,
        },
        seller: {
          "@type": "LocalBusiness",
          name: offer.property,
          url: canonical(`/properties/${offer.propertySlug}`),
        },
        itemOffered: {
          "@type": "Service",
          name: offer.title,
          description: offer.description,
          areaServed: "Sri Lanka",
        },
        ...(image ? { image: new URL(`/api/offers/${slug}/cover`, url).href } : {}),
      },
    },
  ];
}
export function propertyData(slug: string, property: PublicPropertyProfile, images: boolean) {
  const path = `/properties/${slug}`;
  const url = canonical(path);
  return [
    breadcrumbs(path, property.name),
    {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "@id": `${url}#business`,
      url,
      name: property.name,
      ...(property.description ? { description: property.description } : {}),
      address: {
        "@type": "PostalAddress",
        streetAddress: property.address,
        addressRegion: property.district,
        addressCountry: "LK",
      },
      ...(property.phone && /^\+[1-9][0-9]{6,14}$/.test(property.phone)
        ? { telephone: property.phone }
        : {}),
      ...(images && property.photos.length
        ? {
            image: property.photos.map(
              (photo) =>
                new URL(`/api/public-properties/${slug}/photos/${photo.position}`, url).href,
            ),
          }
        : {}),
    },
  ];
}
