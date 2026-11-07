import Link from "next/link";
import { notFound } from "next/navigation";
import { PropertySwitcher } from "@/components/partner/property-switcher";
import { RegistrationPhoto } from "@/components/partner/registration-photo";
import { Button } from "@/components/ui/button";
import { loadPartnerProperties } from "@/lib/partner/properties";
import { isPropertyId, propertyStatus } from "@/lib/partner/registration";
import { requirePartnerSession } from "@/lib/partner/session";

export default async function PropertyStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePartnerSession();
  const { id } = await params;
  if (!isPropertyId(id)) notFound();
  const properties = await loadPartnerProperties(session);
  if (!properties) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Registration status is temporarily unavailable</h1>
        <p className="mt-3">Refresh to try again.</p>
      </section>
    );
  }
  const property = properties.find((item) => item.id === id.toLowerCase());
  if (!property) notFound();
  const status = propertyStatus[property.verification_status as keyof typeof propertyStatus];
  const canUpload =
    property.verification_status === "pending" ||
    property.verification_status === "more_information_required";
  const { count } = canUpload
    ? await session.client
        .from("photo_assets")
        .select("id", { count: "exact", head: true })
        .eq("property_id", id)
    : { count: null };

  return (
    <div className="max-w-2xl">
      <Link
        href="/partner"
        className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
      >
        Your property registrations
      </Link>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{property.name}</h1>
      <p className="mt-2 text-muted-foreground">
        {property.district} · {property.role === "owner" ? "Owner" : "Staff"}
      </p>
      <PropertySwitcher properties={properties} currentId={property.id} />
      <section
        className="mt-6 rounded-lg border bg-card p-5 sm:p-7"
        aria-labelledby="registration-status"
      >
        <h2 id="registration-status" className="text-xl font-semibold">
          Registration status
        </h2>
        <p className="mt-3 font-semibold text-primary">{status?.[0] ?? "Status unavailable"}</p>
        <p className="mt-2 text-muted-foreground">{status?.[1] ?? "Refresh to check again."}</p>
      </section>
      <nav aria-label="Property actions" className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild className="col-span-2 min-w-0 text-center">
          <Link href={`/partner/properties/${property.id}/offer`}>Create or resume an offer</Link>
        </Button>
        <Button asChild variant="outline" className="min-w-0 text-center">
          <Link href={`/partner/properties/${property.id}/offers`}>My Offers</Link>
        </Button>
        <Button asChild variant="outline" className="min-w-0 text-center">
          <Link href={`/partner/properties/${property.id}/analytics`}>Property analytics</Link>
        </Button>
        <Button asChild variant="outline" className="min-w-0 text-center">
          <Link href={`/partner/properties/${property.id}/profile`}>
            {property.role === "owner" ? "Edit property profile" : "Manage property photos"}
          </Link>
        </Button>
        {property.role === "owner" && (
          <>
            <Button asChild variant="outline" className="min-w-0 text-center">
              <Link href={`/partner/properties/${property.id}/team`}>Manage team</Link>
            </Button>
            <Button asChild variant="outline" className="col-span-2 min-w-0 text-center">
              <Link href={`/partner/properties/${property.id}/subscription`}>
                Subscription and billing
              </Link>
            </Button>
          </>
        )}
      </nav>
      {canUpload && (
        <section
          className="mt-6 rounded-lg border bg-card p-5 sm:p-7"
          aria-labelledby="registration-photos"
        >
          <h2 id="registration-photos" className="text-xl font-semibold">
            Photos for review
          </h2>
          <p className="mt-2 text-muted-foreground">
            Add a photo that helps Ayaale identify your property, such as the entrance or sign.
            Review photos are stored privately.
          </p>
          {count !== null && (
            <p className="mt-2 text-sm font-medium">
              {count} {count === 1 ? "photo" : "photos"} uploaded
            </p>
          )}
          <RegistrationPhoto propertyId={id} />
        </section>
      )}
    </div>
  );
}
