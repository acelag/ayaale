import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { claimStatusLabels, type AdminClaim } from "@/lib/admin/ownership-claims";
import { partnerSession } from "@/lib/partner/session";

const base = "/admin/ownership-claims";

export default async function OwnershipClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ completed?: string; page?: string }>;
}) {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const query = await searchParams;
  const completed = query.completed === "1";
  const page =
    typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 0;
  const { data, error } = await session.client.rpc("get_admin_ownership_claims", {
    completed,
    page_offset: page,
  });
  if (!data && !error) notFound();
  const claims = data as AdminClaim[] | null;

  return (
    <section className="max-w-4xl">
      <Link
        href="/admin"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Admin overview
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Ownership claims</h1>
      <nav aria-label="Claim status" className="mt-3 flex flex-wrap gap-2">
        <Link
          href={base}
          aria-current={!completed ? "page" : undefined}
          className="inline-flex min-h-11 items-center rounded-md border bg-card px-3 aria-[current=page]:border-primary"
        >
          Pending review
        </Link>
        <Link
          href={`${base}?completed=1`}
          aria-current={completed ? "page" : undefined}
          className="inline-flex min-h-11 items-center rounded-md border bg-card px-3 aria-[current=page]:border-primary"
        >
          Decided claims
        </Link>
      </nav>
      {error || !claims ? (
        <p role="alert" className="mt-4">
          We couldn’t load this queue. Refresh to try again.
        </p>
      ) : claims.length ? (
        <ul className="mt-4 divide-y rounded-lg border bg-card px-4">
          {claims.slice(0, 20).map((claim) => (
            <li key={claim.id} className="py-2">
              <Link
                href={`${base}/${claim.id}`}
                className="inline-flex min-h-11 items-center break-words font-semibold text-primary underline underline-offset-4"
              >
                {claim.name}
              </Link>
              <p className="text-sm text-muted-foreground">
                {claim.district} · {claimStatusLabels[claim.status]}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4">This queue is empty.</p>
      )}
      <nav aria-label="Ownership claim pages" className="mt-3 flex flex-wrap gap-4">
        {page > 0 && (
          <Link
            href={`${base}?completed=${Number(completed)}&page=${page - 1}`}
            className="inline-flex min-h-11 items-center underline"
          >
            Previous page
          </Link>
        )}
        {claims && claims.length > 20 && page < 999999 && (
          <Link
            href={`${base}?completed=${Number(completed)}&page=${page + 1}`}
            className="inline-flex min-h-11 items-center underline"
          >
            Next page
          </Link>
        )}
      </nav>
    </section>
  );
}
