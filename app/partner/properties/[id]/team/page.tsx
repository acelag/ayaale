import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamManagement } from "@/components/partner/team-management";
import { loadPartnerProperties } from "@/lib/partner/properties";
import { isPropertyId } from "@/lib/partner/registration";
import { requirePartnerSession } from "@/lib/partner/session";
import type { PropertyTeam } from "@/lib/partner/team";

export default async function PropertyTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePartnerSession();
  if (!isPropertyId(id)) notFound();
  const properties = await loadPartnerProperties(session);
  if (!properties)
    return <h1 className="text-2xl font-semibold">Property team temporarily unavailable</h1>;
  const property = properties.find((item) => item.id === id.toLowerCase() && item.role === "owner");
  if (!property) notFound();
  const { data, error } = await session.client.rpc("get_property_team", {
    target_property: property.id,
  });
  if (!data && !error) notFound();

  return (
    <section className="max-w-3xl">
      <Link
        href={`/partner/properties/${property.id}`}
        className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
      >
        Property status
      </Link>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Manage property team</h1>
      <p className="mt-2 break-words text-muted-foreground">
        {property.name} · {property.district}
      </p>
      {error || !data ? (
        <p role="alert" className="mt-6">
          We couldn’t load the team. Refresh to try again.
        </p>
      ) : (
        <TeamManagement propertyId={property.id} team={data as PropertyTeam} />
      )}
    </section>
  );
}
