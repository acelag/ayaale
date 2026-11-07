import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { type CampaignMetrics } from "@/components/newsletter/campaign-status";
import { NewsletterEditor } from "@/components/newsletter/newsletter-editor";
import {
  newsletterEditorPath,
  type NewsletterDraft,
  type NewsletterOffer,
} from "@/lib/newsletter/editor";
import { newsletterTestConfig } from "@/lib/newsletter/editor-config";
import { newsletterOrigin } from "@/lib/newsletter/server";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";

export default async function NewsletterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; scheduled?: string }>;
}) {
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const creating = id === "new";
  if (!creating && !isPropertyId(id)) notFound();
  const { data, error } = await session.client.rpc(
    "get_admin_newsletter",
    creating ? {} : { campaign_id: id },
  );
  if (!data && !error) notFound();
  if (!data || error)
    return <h1 className="text-2xl font-semibold">Newsletter temporarily unavailable</h1>;
  const initial = creating
    ? { id: "", status: "draft", version: "", subject: "", intro: "", offers: [] }
    : (data as NewsletterDraft);
  const candidates =
    initial.status === "draft"
      ? await session.client.rpc("search_admin_newsletter_offers", { search_text: "" })
      : null;
  const metrics = !creating
    ? await session.client.rpc("get_admin_newsletter_metrics", { campaign_id: id })
    : null;
  return (
    <section className="max-w-5xl">
      <Link
        href={newsletterEditorPath}
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Newsletters
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
        {creating ? "Create newsletter" : "Edit newsletter"}
      </h1>
      {query.saved === "1" && (
        <p role="status" className="mt-3">
          Newsletter draft saved.
        </p>
      )}
      {query.scheduled === "1" && (
        <p role="status" className="mt-3">
          Newsletter schedule updated.
        </p>
      )}
      <NewsletterEditor
        key={initial.version}
        initial={initial}
        candidates={(candidates?.data as NewsletterOffer[] | null) ?? []}
        origin={newsletterOrigin() ?? "https://ayaale.com"}
        testId={randomUUID()}
        canTest={Boolean(newsletterTestConfig())}
        campaignMetrics={metrics?.data ? (metrics.data as CampaignMetrics) : undefined}
        canSchedule={
          process.env.NEWSLETTER_SEND_ENABLED === "true" && Boolean(newsletterTestConfig())
        }
      />
      {!creating && metrics?.error && (
        <p role="alert" className="mt-3">
          Campaign results are temporarily unavailable.
        </p>
      )}
    </section>
  );
}
