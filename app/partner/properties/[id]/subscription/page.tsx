import Link from "next/link";
import { notFound } from "next/navigation";
import { PropertySwitcher } from "@/components/partner/property-switcher";
import type { OfferCapacity } from "@/lib/partner/manage-offers";
import { loadPartnerProperties } from "@/lib/partner/properties";
import { isPropertyId } from "@/lib/partner/registration";
import { requirePartnerSession } from "@/lib/partner/session";

type Subscription = {
  plan: string;
  previouslyVerified: boolean;
  usage: OfferCapacity;
  trial: { startsAt: string; endsAt: string; state: keyof typeof trialLabels } | null;
  prices: { months: 1 | 6 | 12; amount: number; currency: "LKR" }[];
};

const trialLabels = {
  active: "Free trial active",
  upcoming: "Free trial scheduled",
  expired: "Free trial expired",
  cancelled: "Free trial cancelled",
};
const billingPeriods = { 1: "per month", 6: "per 6 months", 12: "per year" };
const sriLankaTime = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});
const number = new Intl.NumberFormat("en-LK", { maximumFractionDigits: 2 });
const linkClass =
  "inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4";

export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePartnerSession();
  const { id } = await params;
  if (!isPropertyId(id)) notFound();
  const properties = await loadPartnerProperties(session);
  const owned = properties?.filter(({ role }) => role === "owner");
  const property = owned?.find((item) => item.id === id.toLowerCase());
  if (owned && !property) notFound();
  if (!owned || !property) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Subscription temporarily unavailable</h1>
        <p className="mt-2">Refresh to try again.</p>
      </section>
    );
  }

  const { data, error } = await session.client.rpc("get_property_subscription", {
    target_property: property.id,
  });
  if (!data && !error) notFound();
  const subscription = data as Subscription | null;
  const base = `/partner/properties/${property.id}`;

  return (
    <section className="max-w-3xl">
      <Link href={base} className={linkClass}>
        Property status
      </Link>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Subscription and billing</h1>
      <p className="mt-2 break-words text-muted-foreground">
        {property.name} · {property.district}
      </p>
      <PropertySwitcher properties={owned} currentId={property.id} view="subscription" />
      {subscription ? (
        <SubscriptionDetails subscription={subscription} base={base} />
      ) : (
        <p role="alert" className="mt-4">
          We couldn’t load this subscription. Refresh to try again.
        </p>
      )}
    </section>
  );
}

function SubscriptionDetails({ subscription, base }: { subscription: Subscription; base: string }) {
  const { plan, trial, usage, prices, previouslyVerified } = subscription;
  return (
    <div className="mt-6 grid gap-5">
      <section aria-labelledby="trial-heading" className="rounded-lg border bg-card p-4 sm:p-5">
        <h2 id="trial-heading" className="text-xl font-semibold">
          {plan} trial
        </h2>
        <p className="mt-2 font-semibold">
          {trial ? trialLabels[trial.state] : "No trial allocated"}
        </p>
        {trial ? (
          <>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Trial start</dt>
                <dd>
                  <time dateTime={trial.startsAt}>
                    {sriLankaTime.format(new Date(trial.startsAt))}
                  </time>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {trial.state === "cancelled" ? "Original trial end" : "Trial end"}
                </dt>
                <dd>
                  <time dateTime={trial.endsAt}>{sriLankaTime.format(new Date(trial.endsAt))}</time>
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-sm text-muted-foreground">
              Dates and times use Sri Lanka time.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {previouslyVerified
              ? "This property does not have a Starter trial. Trials are allocated to the first 100 verified properties at approval."
              : "The six-month Starter trial is allocated at approval to the first 100 verified properties. Registration does not reserve a trial."}
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Starter trials end automatically with no charge. Without an active subscription, published
          offers become inactive. Drafts, history and analytics remain available.
        </p>
      </section>
      <section aria-labelledby="usage-heading" className="rounded-lg border bg-card p-4 sm:p-5">
        <h2 id="usage-heading" className="text-xl font-semibold">
          Active offer usage
        </h2>
        <p className="mt-2 text-2xl font-semibold tabular-nums">
          {usage.active} of {usage.limit} active
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {usage.eligibility === "unverified" &&
            "Property verification is required before offers can go live. "}
          {usage.eligibility === "no_entitlement" &&
            "A current trial or subscription is required before offers can go live. "}
          Drafts are unlimited.
        </p>
        <Link href={`${base}/offers`} className={linkClass}>
          My Offers
        </Link>
      </section>
      <section aria-labelledby="pricing-heading" className="rounded-lg border bg-card p-4 sm:p-5">
        <h2 id="pricing-heading" className="text-xl font-semibold">
          {plan} pricing
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          These prices are for future billing. Payments are currently unavailable.
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {prices.map(({ months, amount, currency }) => (
            <li key={months} className="rounded-md border p-3">
              <span className="block font-semibold tabular-nums">
                {currency} {number.format(amount)}
              </span>
              <span className="block text-sm text-muted-foreground">{billingPeriods[months]}</span>
            </li>
          ))}
        </ul>
      </section>
      <section
        aria-labelledby="billing-history-heading"
        className="rounded-lg border bg-card p-4 sm:p-5"
      >
        <h2 id="billing-history-heading" className="text-xl font-semibold">
          Billing history
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          There are no payments or invoices to show. Billing history will appear here when payments
          become available.
        </p>
      </section>
    </div>
  );
}
