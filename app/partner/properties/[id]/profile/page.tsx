import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoLibrary } from "@/components/partner/profile-photos";
import { PropertyProfileForm } from "@/components/partner/property-profile-form";
import { RegistrationPhoto } from "@/components/partner/registration-photo";
import { Button } from "@/components/ui/button";
import type { PropertyEditor } from "@/lib/partner/profile-editor";
import { loadPartnerPhotoAssets, loadPartnerProperties } from "@/lib/partner/properties";
import { isPropertyId } from "@/lib/partner/registration";
import { requirePartnerSession } from "@/lib/partner/session";

export default async function PropertyProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const session = await requirePartnerSession();
  const [{ id }, { submitted }] = await Promise.all([params, searchParams]);
  if (!isPropertyId(id)) notFound();
  const properties = await loadPartnerProperties(session);
  const property = properties?.find((item) => item.id === id.toLowerCase());
  if (properties && !property) notFound();
  if (!property) return <h1 className="text-2xl font-semibold">Profile temporarily unavailable</h1>;

  const { client } = session;
  const owner = property.role === "owner";
  const [result, published, staff] = await Promise.all([
    owner ? client.rpc("get_property_editor", { target_property: property.id }) : null,
    property.verification_status === "verified"
      ? client.from("properties").select("slug").eq("id", property.id).maybeSingle()
      : null,
    client
      .from("property_memberships")
      .select("id", { head: true, count: "exact" })
      .eq("property_id", property.id)
      .eq("role", "staff"),
  ]);
  const photoAssets = await loadPartnerPhotoAssets(session, property.id);
  const assets = photoAssets ?? [];
  const assetsUnavailable = photoAssets === null;
  const editor = result?.data as PropertyEditor | null;
  const slug = published?.data?.slug;
  const publicLink = slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? `/properties/${slug}` : null;
  const canUpload =
    property.verification_status !== "suspended" && property.verification_status !== "rejected";

  return (
    <div className="max-w-3xl">
      <Link
        href={`/partner/properties/${property.id}`}
        className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
      >
        Property status
      </Link>
      <h1 className="mt-3 break-words text-2xl font-semibold sm:text-3xl">
        {owner ? "Edit property profile" : "Manage property photos"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {property.name} · {property.district}
      </p>
      {publicLink && (
        <Button asChild variant="outline" className="mt-4 min-h-11">
          <Link href={publicLink}>View public profile</Link>
        </Button>
      )}
      {owner && (
        <p className="mt-4 text-sm text-muted-foreground">
          {property.verification_status === "verified"
            ? "Ayaale reviews submitted changes. Visitors continue to see the approved profile during review."
            : "Ayaale reviews these details before listing the property."}
        </p>
      )}
      {editor?.requestStatus === "pending" && (
        <p className="mt-4 rounded-lg border bg-card p-3" role="status">
          {submitted === "1"
            ? "Profile changes submitted for review."
            : "Profile changes are pending review."}
        </p>
      )}
      {editor?.decisionMessage && (
        <p className="mt-4 whitespace-pre-wrap rounded-lg border bg-card p-3">
          {editor.decisionMessage}
        </p>
      )}
      {editor?.requestStatus === "more_information_required" && (
        <p className="mt-3">
          Update the requested details and submit the profile for review again.
        </p>
      )}
      {editor && !editor.editable && (
        <p className="mt-4 rounded-lg border bg-card p-3">
          Editing is paused at the current verification stage.
        </p>
      )}
      <section className="mt-6 rounded-lg border bg-card p-4" aria-labelledby="profile-team">
        <h2 id="profile-team" className="text-xl font-semibold">
          Team
        </h2>
        <p className="mt-2">Your role is {owner ? "owner" : "staff"}.</p>
        {owner && (
          <Link
            href={`/partner/properties/${property.id}/team`}
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
          >
            Manage team
          </Link>
        )}
        {staff.count !== null && (
          <p className="mt-1 text-sm text-muted-foreground">
            {staff.count} of 2 staff slots in use.
          </p>
        )}
      </section>
      <section className="mt-6 rounded-lg border bg-card p-4" aria-labelledby="profile-library">
        <h2 id="profile-library" className="text-xl font-semibold">
          Private photo library
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {owner
            ? "Upload photos here, then choose and order them in the gallery below."
            : "Upload or preview property photos. The owner submits the gallery for review."}
        </p>
        {canUpload && <RegistrationPhoto propertyId={property.id} />}
        {assetsUnavailable ? (
          <p className="mt-3 text-sm" role="alert">
            The photo library is temporarily unavailable.
          </p>
        ) : (
          (!owner || !editor?.editable) && <PhotoLibrary propertyId={property.id} assets={assets} />
        )}
      </section>
      {owner &&
        (editor && !assetsUnavailable ? (
          <PropertyProfileForm
            key={editor.version}
            propertyId={property.id}
            editor={editor}
            assets={assets}
          />
        ) : (
          <p role="alert" className="mt-6">
            The profile editor is temporarily unavailable. Refresh to try again.
          </p>
        ))}
    </div>
  );
}
