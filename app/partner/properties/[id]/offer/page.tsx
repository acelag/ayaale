import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OfferWizard } from "@/components/partner/offer-wizard";
import type { WizardData } from "@/lib/partner/offer-wizard";
import { loadPartnerPhotoAssets, loadPartnerProperties } from "@/lib/partner/properties";
import { isPropertyId, stayTypes } from "@/lib/partner/registration";
import { requirePartnerSession } from "@/lib/partner/session";

export default async function PropertyOfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draft?: string; page?: string; step?: string; saved?: string }>;
}) {
  const session = await requirePartnerSession();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isPropertyId(id) || (query.draft !== undefined && !isPropertyId(query.draft))) notFound();
  const properties = await loadPartnerProperties(session);
  if (!properties)
    return <h1 className="text-2xl font-semibold">Offer wizard temporarily unavailable</h1>;
  const property = properties.find((item) => item.id === id.toLowerCase());
  if (!property) notFound();
  const page =
    typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 0;
  const wizardPath = `/partner/properties/${property.id}/offer`;
  const statusPath = `/partner/properties/${property.id}`;
  const [state, details, assets] = await Promise.all([
    session.client.rpc("get_offer_wizard", {
      target_property: property.id,
      draft_id: query.draft,
      draft_page: page,
    }),
    session.client
      .from("properties")
      .select("property_type,public_phone,public_whatsapp")
      .eq("id", property.id)
      .maybeSingle(),
    loadPartnerPhotoAssets(session, property.id),
  ]);
  if (state.error || details.error || !details.data || !assets) {
    return <h1 className="text-2xl font-semibold">Offer wizard temporarily unavailable</h1>;
  }
  const wizard = state.data as WizardData | null;
  if (!wizard || (query.draft && !wizard.draft)) notFound();
  const draft = wizard.draft;
  const startStep =
    typeof query.step === "string" && /^[0-4]$/.test(query.step) ? Number(query.step) : 0;
  const fields = draft
    ? Object.fromEntries(
        Object.entries(draft.content).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : { price_qualifier: "exact", children: "0" };
  const verified = property.verification_status === "verified";
  const contact = details.data;
  const e164 = /^\+[1-9][0-9]{6,14}$/;
  const contactNumbers = verified
    ? [
        contact.public_phone && e164.test(contact.public_phone)
          ? `Call ${contact.public_phone}`
          : "",
        contact.public_whatsapp && e164.test(contact.public_whatsapp)
          ? `WhatsApp ${contact.public_whatsapp}`
          : "",
      ].filter(Boolean)
    : [];

  return (
    <div className="max-w-3xl">
      <Link
        href={statusPath}
        className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
      >
        Property status
      </Link>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">
        {draft?.submitted ? "Offer submitted" : draft ? "Edit offer draft" : "Create an offer"}
      </h1>
      <p className="mt-2 break-words text-muted-foreground">
        {property.name} · {property.district}
      </p>
      {draft?.submitted ? (
        <p role="status" className="mt-4 rounded-lg border bg-card p-4">
          This submission was sent for review. Check the latest status in My Offers.
        </p>
      ) : (
        <>
          {query.saved === "1" && draft && (
            <p role="status" className="mt-4 rounded-lg border bg-card p-4">
              Draft saved.
            </p>
          )}
          <Link
            href="/partner"
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
          >
            Choose another property
          </Link>
          <OfferWizard
            key={`${draft?.id ?? "new"}-${draft?.version ?? 0}`}
            propertyId={property.id}
            propertyName={property.name}
            propertyContact={contactNumbers}
            verified={verified}
            canStay={stayTypes.includes(contact.property_type)}
            draftId={draft?.id ?? randomUUID()}
            version={draft?.version ?? 0}
            initialStep={startStep}
            initial={{ fields, gallery: draft?.content.gallery ?? [] }}
            assets={assets}
          />
        </>
      )}
      <Link
        href={`${statusPath}/offers`}
        className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
      >
        My Offers
      </Link>
      <section aria-labelledby="saved-offer-drafts" className="mt-6 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="saved-offer-drafts" className="text-xl font-semibold">
            Saved drafts
          </h2>
          {draft && (
            <Link
              href={wizardPath}
              className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
            >
              Start a new offer
            </Link>
          )}
        </div>
        {wizard.drafts.length ? (
          <ul className="mt-2">
            {wizard.drafts.slice(0, 20).map(({ id, title }) => (
              <li key={id}>
                <Link
                  href={`${wizardPath}?draft=${id}`}
                  className="inline-flex min-h-11 items-center break-all font-semibold text-primary underline underline-offset-4"
                >
                  {title || "Untitled offer"}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No drafts on this page.</p>
        )}
        <div className="flex flex-wrap gap-4">
          {page > 0 && (
            <Link
              href={`${wizardPath}?page=${page - 1}`}
              className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
            >
              Previous drafts
            </Link>
          )}
          {wizard.drafts.length > 20 && (
            <Link
              href={`${wizardPath}?page=${page + 1}`}
              className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
            >
              More drafts
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
