import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { VerificationForm } from "@/components/admin/verification-form";
import { PhotoLibrary } from "@/components/partner/profile-photos";
import {
  decisionLabels,
  verificationMethods,
  type VerificationDetail,
} from "@/lib/admin/verification";
import { contactFields, informationFields } from "@/lib/partner/profile-editor";
import { loadPartnerPhotoAssets } from "@/lib/partner/properties";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";
import { safeMapsUrl } from "@/lib/properties/public-links";

const date = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});
const labels = [
  ...informationFields,
  ...contactFields,
  { name: "primary_category", label: "Category" },
  { name: "property_type", label: "Property type" },
  { name: "amenities", label: "Amenities" },
] as const;

export default async function VerificationPage({
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
  const { data, error } = await session.client.rpc("get_admin_verifications", {
    target_property: id,
  });
  if (!data && !error) notFound();
  if (error)
    return <h1 className="text-2xl font-semibold">Verification temporarily unavailable</h1>;
  const detail = data as VerificationDetail;
  const assets = await loadPartnerPhotoAssets(session, detail.id);
  const request = detail.request;
  const candidate = { ...detail.current, ...request?.proposed };
  const proposedGallery = request?.proposed.gallery;
  const map = safeMapsUrl(candidate.google_maps_url ?? null);

  return (
    <section className="max-w-4xl">
      <Link
        href="/admin/verifications"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Verification queues
      </Link>
      <h1 className="mt-2 break-words text-2xl font-semibold sm:text-3xl">{detail.name}</h1>
      <p className="mt-2 text-muted-foreground">
        Property status · {detail.status.replaceAll("_", " ")}
      </p>
      {saved === "1" && (
        <p className="mt-3 rounded-lg border bg-card p-3" role="status">
          Verification decision saved.
        </p>
      )}
      <section
        className="mt-4 rounded-lg border bg-card p-4 sm:p-5"
        aria-labelledby="review-details"
      >
        <h2 id="review-details" className="text-xl font-semibold">
          Details for review
        </h2>
        {request && (
          <div className="mt-2 space-y-2">
            <p>
              {request.kind === "initial" ? "New registration" : "Profile change"} ·{" "}
              {request.status.replaceAll("_", " ")}
            </p>
            {request.applicant && <p>Applicant · {request.applicant}</p>}
            {request.message && <p className="whitespace-pre-wrap">{request.message}</p>}
          </div>
        )}
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {labels.map(({ name, label }) => {
            const value = candidate[name];
            const before = detail.current[name];
            return (
              <div key={name} className="min-w-0 break-words">
                <dt className="text-sm font-semibold">{label}</dt>
                <dd className="whitespace-pre-wrap">
                  {Array.isArray(value) ? value.join(", ") || "—" : (value ?? "—")}
                </dd>
                {request?.kind === "critical_change" &&
                  JSON.stringify(value) !== JSON.stringify(before) && (
                    <dd className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      Current · {Array.isArray(before) ? before.join(", ") || "—" : (before ?? "—")}
                    </dd>
                  )}
              </div>
            );
          })}
        </dl>
        {map && (
          <a
            href={map}
            rel="noreferrer"
            className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Open Google Maps
          </a>
        )}
      </section>
      <section
        className="mt-4 rounded-lg border bg-card p-4 sm:p-5"
        aria-labelledby="review-photos"
      >
        <h2 id="review-photos" className="text-xl font-semibold">
          Private property photos
        </h2>
        {assets ? (
          <PhotoLibrary propertyId={detail.id} assets={assets} />
        ) : (
          <p role="alert">Photos are temporarily unavailable.</p>
        )}
        {proposedGallery && (
          <div className="mt-3">
            <h3 className="font-semibold">Proposed public gallery</h3>
            {proposedGallery.length ? (
              <ol className="ml-5 list-decimal">
                {proposedGallery.map(({ id, alt }) => (
                  <li key={id}>
                    {alt}
                    {assets?.some((asset) => asset.id === id)
                      ? ` · Photo ${assets.findIndex((asset) => asset.id === id) + 1}`
                      : ""}
                  </li>
                ))}
              </ol>
            ) : (
              <p>The proposal clears the public gallery.</p>
            )}
          </div>
        )}
      </section>
      <VerificationForm key={detail.version} detail={detail} />
      <section
        className="mt-5 rounded-lg border bg-card p-4 sm:p-5"
        aria-labelledby="review-history"
      >
        <h2 id="review-history" className="text-xl font-semibold">
          Decision history
        </h2>
        {detail.history.length ? (
          <ol className="mt-2 divide-y">
            {detail.history.map((item) => (
              <li key={item.id} className="space-y-1 py-3">
                <h3 className="font-semibold">{decisionLabels[item.action]}</h3>
                <time className="text-sm text-muted-foreground" dateTime={item.at}>
                  {date.format(new Date(item.at))} Sri Lanka time
                </time>
                {item.method && (
                  <p>{verificationMethods[item.method as keyof typeof verificationMethods]}</p>
                )}
                {item.message && (
                  <p className="whitespace-pre-wrap">Partner message · {item.message}</p>
                )}
                {item.evidence && (
                  <p className="whitespace-pre-wrap">Internal evidence · {item.evidence}</p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-muted-foreground">No decisions recorded.</p>
        )}
      </section>
    </section>
  );
}
