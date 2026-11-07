import Link from "next/link";
import { claimStatusLabels, type PartnerClaim } from "@/lib/admin/ownership-claims";
import { requirePartnerSession } from "@/lib/partner/session";

export default async function PartnerClaimsPage() {
  const { client } = await requirePartnerSession();
  const { data, error } = await client.rpc("get_my_ownership_claims");
  const claims = data as PartnerClaim[] | null;
  return (
    <section className="max-w-3xl">
      <Link
        href="/partner"
        className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
      >
        Partner home
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">My ownership claims</h1>
      <p className="mt-2 text-muted-foreground">
        Ayaale reviews ownership claims manually. Property access changes only after a transfer is
        approved.
      </p>
      {error || !claims ? (
        <p className="mt-4" role="alert">
          We couldn’t load your claims. Refresh to try again.
        </p>
      ) : claims.length ? (
        <ul className="mt-4 divide-y rounded-lg border bg-card px-4">
          {claims.map((claim) => (
            <li key={claim.id} className="space-y-1 py-3">
              <h2 className="break-words font-semibold">{claim.name}</h2>
              <p>{claimStatusLabels[claim.status]}</p>
              {claim.message && (
                <p className="whitespace-pre-wrap text-muted-foreground">{claim.message}</p>
              )}
              {claim.propertyId && (
                <Link
                  href={`/partner/properties/${claim.propertyId}`}
                  className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
                >
                  Open property
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4">You haven’t submitted an ownership claim.</p>
      )}
    </section>
  );
}
