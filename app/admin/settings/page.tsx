import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { offerViewTrackingEnabled } from "@/lib/offers/view-tracking";
import { partnerSession } from "@/lib/partner/session";

function siteOrigin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    return ["http:", "https:"].includes(url.protocol) ? url.origin : "Unavailable";
  } catch {
    return "Unavailable";
  }
}

export default async function AdminSettingsPage() {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const { data: allowed, error } = await session.client.rpc("has_platform_admin_access");
  if (error) return <h1 className="text-2xl font-semibold">Settings temporarily unavailable</h1>;
  if (!allowed) notFound();
  const environment = process.env.APP_ENV;
  const settings = [
    [
      "Environment",
      ["development", "staging", "production"].includes(environment ?? "")
        ? environment
        : "Unavailable",
    ],
    ["Site origin", siteOrigin()],
    ["Reporting time zone", "Sri Lanka time (Asia/Colombo)"],
    ["Offer view collection setting", offerViewTrackingEnabled() ? "On" : "Off"],
  ];
  return (
    <section className="max-w-4xl">
      <Link
        href="/admin"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Admin overview
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Settings</h1>
      <p className="mt-2 text-muted-foreground">
        Current deployment settings. Changes are managed in the deployment configuration.
      </p>
      <dl className="mt-4 grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 sm:p-5">
        {settings.map(([label, value]) => (
          <div key={label} className="min-w-0 break-words">
            <dt className="font-semibold">{label}</dt>
            <dd className="mt-1">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
