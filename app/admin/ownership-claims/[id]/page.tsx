import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OwnershipClaimForm } from "@/components/admin/ownership-claim-form";
import { claimStatusLabels, type ClaimDetail } from "@/lib/admin/ownership-claims";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";

const fields = [
  ["contact_name", "Applicant"],
  ["address", "Street address"],
  ["district", "District"],
  ["public_phone", "Business phone"],
  ["public_whatsapp", "WhatsApp"],
  ["google_maps_url", "Google Maps"],
] as const;

export default async function OwnershipClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  if (!isPropertyId(id)) notFound();
  const { data, error } = await session.client.rpc("get_admin_ownership_claims", {
    target_claim: id,
  });
  if (!data && !error) notFound();
  if (error)
    return <h1 className="text-2xl font-semibold">Ownership claim temporarily unavailable</h1>;
  const claim = data as ClaimDetail;

  return (
    <section className="max-w-4xl">
      <Link
        href="/admin/ownership-claims"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Ownership claims
      </Link>
      <h1 className="mt-2 break-words text-2xl font-semibold sm:text-3xl">{claim.details.name}</h1>
      <p className="mt-2 text-muted-foreground">{claimStatusLabels[claim.status]}</p>
      {saved === "1" && (
        <p className="mt-3 rounded-lg border bg-card p-3" role="status">
          Ownership decision saved.
        </p>
      )}
      <section
        aria-labelledby="claim-details"
        className="mt-4 rounded-lg border bg-card p-4 sm:p-5"
      >
        <h2 id="claim-details" className="text-xl font-semibold">
          Applicant details
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {fields.map(([key, label]) => (
            <div key={key} className="min-w-0 break-words">
              <dt className="font-semibold">{label}</dt>
              <dd>{claim.details[key] || "—"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 whitespace-pre-wrap">{claim.applicantMessage}</p>
      </section>
      {claim.status === "pending" ? (
        <OwnershipClaimForm claim={claim} />
      ) : (
        <section
          aria-labelledby="claim-record"
          className="mt-4 rounded-lg border bg-card p-4 sm:p-5"
        >
          <h2 id="claim-record" className="text-xl font-semibold">
            Decision record
          </h2>
          <p className="mt-2 whitespace-pre-wrap">{claim.decisionMessage}</p>
          {claim.evidence && (
            <p className="mt-2 whitespace-pre-wrap">Internal evidence · {claim.evidence}</p>
          )}
        </section>
      )}
    </section>
  );
}
