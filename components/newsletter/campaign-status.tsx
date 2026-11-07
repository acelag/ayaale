"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useFormReady } from "@/components/partner/use-form-ready";
import { scheduleNewsletter } from "@/lib/newsletter/schedule-actions";

export type CampaignMetrics = {
  status: string;
  scheduledAt: string | null;
  audience: number;
  accepted: number;
  delivered: number;
  failed: number;
  suppressed: number;
  bounced: number;
  complained: number;
  clicked: number;
  unsubscribed: number;
};

const labels: Record<Exclude<keyof CampaignMetrics, "status" | "scheduledAt">, string> = {
  audience: "Recipients",
  accepted: "Provider accepted",
  delivered: "Delivered",
  failed: "Failed",
  suppressed: "Suppressed",
  bounced: "Bounced",
  complained: "Spam complaints",
  clicked: "Recipients with recorded link clicks",
  unsubscribed: "Unsubscribed",
};
const sriLanka = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});

export function CampaignStatus({
  id,
  version,
  metrics,
  enabled,
  dirty = false,
}: {
  id: string;
  version: string;
  metrics: CampaignMetrics;
  enabled: boolean;
  dirty?: boolean;
}) {
  const cancel = metrics.status === "scheduled";
  const [state, action, pending] = useActionState(
    scheduleNewsletter.bind(null, id, version, cancel),
    { message: "" },
  );
  const ready = useFormReady();
  return (
    <section
      aria-labelledby="campaign-status"
      className="mt-5 rounded-lg border bg-card p-4 sm:p-5"
    >
      <h2 id="campaign-status" className="text-xl font-semibold">
        Schedule and campaign results
      </h2>
      <p className="mt-2 capitalize">{metrics.status}</p>
      {metrics.scheduledAt && (
        <p className="mt-1 text-sm">
          Scheduled for{" "}
          <time dateTime={metrics.scheduledAt}>
            {sriLanka.format(new Date(metrics.scheduledAt))}
          </time>{" "}
          Sri Lanka time.
        </p>
      )}
      {(metrics.status === "draft" || cancel) && (
        <form action={action} className="mt-3">
          {!enabled && !cancel && (
            <p className="mb-3 text-sm">
              Campaign delivery is unavailable until the sender and worker are configured.
            </p>
          )}
          {!cancel && (
            <div className="max-w-sm">
              <label htmlFor="newsletter-send-at" className="font-semibold">
                Friday send time in Sri Lanka
              </label>
              <input
                id="newsletter-send-at"
                type="datetime-local"
                name="sendAt"
                required
                disabled={!ready || !enabled || pending}
                className="mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3"
              />
              <p className="mt-1 text-sm text-muted-foreground">
                Save all draft changes before scheduling. Offers are checked again before delivery.
              </p>
            </div>
          )}
          <Button
            type="submit"
            variant="outline"
            className="mt-3 min-h-11"
            disabled={!ready || pending || dirty || (!enabled && !cancel)}
          >
            {pending ? "Saving…" : cancel ? "Cancel schedule" : "Schedule Friday newsletter"}
          </Button>
          {dirty && <p className="mt-2 text-sm">Save your draft changes before scheduling.</p>}
          {state.message && (
            <p role="alert" className="mt-3 text-sm">
              {state.message}
            </p>
          )}
        </form>
      )}
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
          <div key={key}>
            <dt className="text-sm text-muted-foreground">{labels[key]}</dt>
            <dd className="font-semibold tabular-nums">{metrics[key]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">
        Click totals count recipients with recorded link requests and may include automated mail
        scanners.
      </p>
    </section>
  );
}
