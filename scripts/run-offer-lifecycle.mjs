const jobs = {
  "partner-emails": {
    rpc: "queue_partner_lifecycle_emails",
    counts: ["trialReminders", "monthlySummaries"],
  },
  lifecycle: { rpc: "run_offer_lifecycle", counts: ["activated", "expired"] },
  reminders: {
    rpc: "queue_offer_and_inactivity_reminders",
    counts: ["offerExpiry", "inactiveBusiness"],
  },
};
const jobName = process.argv[2] ?? "lifecycle";
const job = Object.hasOwn(jobs, jobName) ? jobs[jobName] : undefined;
const secret = process.env.SUPABASE_SECRET_KEY;
const project = process.env.NEXT_PUBLIC_SUPABASE_URL;

try {
  if (!job) throw new Error("Unknown offer job.");
  const url = new URL(project);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !secret?.startsWith("sb_secret_")
  ) {
    throw new Error("Configure the Supabase HTTPS origin and a server-only secret key.");
  }
  const response = await fetch(new URL(`/rest/v1/rpc/${job.rpc}`, url), {
    method: "POST",
    redirect: "error",
    headers: { apikey: secret, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Offer job returned HTTP ${response.status}.`);
  const result = await response.json();
  const counts = Object.fromEntries(job.counts.map((key) => [key, result[key]]));
  console.log(JSON.stringify({ ...counts, busy: result.busy }));
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith("Offer job returned HTTP ")
      ? error.message
      : "Offer job failed. Check the job configuration and database logs.",
  );
  process.exitCode = 1;
}
