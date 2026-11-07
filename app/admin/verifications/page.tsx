import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  verificationQueues,
  type VerificationListItem,
  type VerificationQueue,
} from "@/lib/admin/verification";
import { partnerSession } from "@/lib/partner/session";

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; page?: string }>;
}) {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const query = await searchParams;
  const queue =
    query.queue && Object.hasOwn(verificationQueues, query.queue)
      ? (query.queue as VerificationQueue)
      : "pending";
  const page =
    typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 0;
  const { data, error } = await session.client.rpc("get_admin_verifications", {
    queue_filter: queue,
    page_offset: page,
  });
  if (!data && !error) notFound();
  const items = data as VerificationListItem[] | null;
  const base = "/admin/verifications";
  return (
    <section className="max-w-4xl">
      <Link
        href="/admin"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Admin overview
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Property verification</h1>
      <nav aria-label="Verification queues" className="mt-4 flex flex-wrap gap-2">
        {Object.entries(verificationQueues).map(([key, label]) => (
          <Link
            key={key}
            href={`${base}?queue=${key}`}
            aria-current={key === queue ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-md border bg-card px-3 font-medium aria-[current=page]:border-primary aria-[current=page]:text-primary"
          >
            {label}
          </Link>
        ))}
      </nav>
      {items ? (
        items.length ? (
          <ul
            aria-label={verificationQueues[queue]}
            className="mt-4 divide-y rounded-lg border bg-card px-4"
          >
            {items.slice(0, 20).map((item) => (
              <li key={item.id} className="py-2">
                <Link
                  href={`${base}/${item.id}`}
                  className="inline-flex min-h-11 items-center break-words font-semibold text-primary underline underline-offset-4"
                >
                  {item.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {item.district} · {item.propertyStatus.replaceAll("_", " ")}
                  {item.kind &&
                    ` · ${item.kind === "initial" ? "New registration" : "Profile change"}`}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4">This queue is empty.</p>
        )
      ) : (
        <p className="mt-4" role="alert">
          We couldn’t load this queue. Refresh to try again.
        </p>
      )}
      <nav aria-label="Verification pages" className="mt-3 flex flex-wrap gap-4">
        {page > 0 && (
          <Link
            href={`${base}?queue=${queue}&page=${page - 1}`}
            className="inline-flex min-h-11 items-center underline"
          >
            Previous page
          </Link>
        )}
        {items && items.length > 20 && page < 999999 && (
          <Link
            href={`${base}?queue=${queue}&page=${page + 1}`}
            className="inline-flex min-h-11 items-center underline"
          >
            Next page
          </Link>
        )}
      </nav>
    </section>
  );
}
