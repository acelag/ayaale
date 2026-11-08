# Ayaale operations — T055

Status: tooling tested locally; production activation incomplete. Keep all services Free. Do not enable a paid Render cron, managed backup/PITR add-on, log drain or email plan. Check current included limits and disable overage spending before activating any external scheduler. The public workflow is disabled until repository variable `AYAALE_MONITORING_ENABLED=true` is explicitly set; no provider settings were changed by this task.

## Monitoring and alert routing

`npm run check:operations` makes fixed HTTPS GET requests to `https://ayaale.com/api/health` and `/`, requires status 200 and health JSON `status: ok`, refuses redirects, waits at most 75 seconds per request for a Free Render cold start, and exits nonzero on failure. Output contains boolean results only. It does not sign in, track a visitor, follow an offer contact link or send email. The health endpoint is application liveness; it does not establish database, scheduler, email or backup health.

`.github/workflows/operations.yml` prepares four checks a day (00:23, 06:23, 12:23, 18:23 UTC). It uses pinned actions, read-only repository permissions, no credentials, no dependency installation and a four-minute job limit. Activation requires the reviewed workflow on the repository's default branch, account allowance/spending checks, the opt-in repository variable, and a successful manual run plus a deliberately failed check routed to the owner. GitHub schedules may be delayed/dropped; public repository schedules can disable after 60 days of inactivity. This is a low-frequency free check, not continuous uptime coverage or an SLA. A skipped job is not monitoring success.

The account operator must enable GitHub Actions failure notifications for this repository and confirm receipt (including scheduled-run ownership). Render's `notifyOnFail=default` inherits workspace settings; confirm its recipients and failure/recovery notification behavior in the dashboard. Do not claim alert delivery until an owner receives a test. Never use a production outage to test alerts. Use a reviewed temporary failing workflow step on a test/manual run, then remove it.

For private dependencies run `scripts/operations/status.sql` in the protected Supabase SQL editor. It returns only three scheduler health booleans and email counts, with no addresses, bodies, IDs, signed links or error payloads. It performs no writes. Expected recent successful jobs: lifecycle within three minutes, offer reminders within 30 minutes, partner lifecycle emails within two hours. This query is an operator check, not an automated alert; wiring it into a scheduler requires separately stored credentials and reviewed least-privilege access. Do not expose it in a public route or put a database secret in the public-check workflow.

Escalation guide:

| Signal                                   | Action                                                                                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public check fails                       | Recheck once from another network; inspect Render events and error logs. Account for a cold start, then investigate application startup/TLS/DNS. Do not blindly redeploy.                             |
| Job unhealthy                            | Inspect `cron.job_run_details` in the protected console; distinguish a job currently running from a stale/failing job. Repair the cause; use existing idempotent worker procedures.                   |
| Any complaint or failure in 24h          | Review protected provider logs. Stop the relevant sender if systemic; investigate verification, configuration, suppression and abuse. Never resend to a complained/bounced/suppressed recipient.      |
| Any bounce in 24h                        | Review bounce reasons and suppression; count is an investigation signal, not proof of a platform outage.                                                                                              |
| Email overdue > 0                        | Check whether sending is intentionally disabled, worker scheduling, leases, credentials and provider limits. Do not enable a sender to clear a queue without reviewing recipient consent/eligibility. |
| Backup older than 36h/missing/unverified | Treat recovery coverage as unknown; repair the backup process and verify an off-site readback. A local dump or successful encryption is insufficient.                                                 |

Preserve logs containing user data only in protected provider consoles, with restricted access and limited retention. Never paste tokens, recipient emails or raw webhook bodies into issues. Runtime exception/error reporting beyond Render logs remains a provider decision; no browser telemetry was activated.

## Backup procedure and acceptance

See [the recovery runbook](BACKUP_RECOVERY.md). Proposed targets for owner approval: daily exports, RPO at most 24 hours, seven daily and four weekly encrypted copies, isolated restore drill monthly and after material changes. These are targets, not achieved guarantees; record actual RTO during a full hosted restore drill. Alert on a missing verified backup after 36 hours. Retention must respect erasure/suppression obligations.

No off-site destination, operator, database export credential or encryption-key custody has been selected. No live hosted export, customer-data upload, retention deletion, backup schedule or full restore was performed. API keys in `.env.local` are not database passwords. Existing synthetic recovery tests do not prove the hosted project can be restored.

Prepare an export in a private directory outside the repository (`umask 077`, directory 0700, files 0600). With CLI v3, inspect installed help and target the remote project explicitly. The reviewed command forms are:

```sh
supabase db dump --help
supabase db dump --remote=buntpenbggavsoskhfnu --role-only --file /secure/snapshot/roles.sql
supabase db dump --remote=buntpenbggavsoskhfnu --file /secure/snapshot/schema.sql
supabase db dump --remote=buntpenbggavsoskhfnu --data-only --use-copy --file /secure/snapshot/data.sql
```

Do not pass a password on the command line or enable debug output. Complete supported interactive credential entry or approved secret-store configuration separately. Hosted PostgreSQL is 17; exports/restores must use compatible tooling. Confirm actual inclusion/exclusion of `private`, `public`, Auth, Storage metadata, roles and grants on a disposable target; CLI-managed schema exclusions mean a command exiting successfully does not prove completeness. Verify against the current Supabase restore guide before a real recovery.

Export **every Storage object's bytes**, including private/unreferenced objects required for recovery, with paginated inventory, bucket/name/content type/length/SHA-256. Do not substitute database Storage metadata. Detect mutations during export and retry/reconcile them: database and object exports are not automatically an atomic snapshot. Record project/ref, UTC snapshot bounds, tool versions, schema/data coverage, object inventory, independent hashes and nonsecret configuration inventory in the protected snapshot manifest. Do not include API keys, database passwords or signed URLs. Auth/SMTP/redirect/provider settings and custom-role passwords require separate protected recovery records.

Only after validating the snapshot, create a tar archive of its files with relative paths and no symlinks. `backup-archive.mjs` packages that prepared archive; it is **not** a database or Storage exporter. It uses a versioned AES-256-GCM envelope with a fresh random nonce and authenticated header, streams bytes, and exclusively creates output files as 0600. Store the random 32-byte base64 key in an approved password manager and a separate restricted local environment file; never commit it, print it, reuse an application key or put it with the backup. Key loss means backup loss.

```sh
# /secure/backup.env contains AYAALE_BACKUP_KEY; load without placing its value in history.
node --env-file=/secure/backup.env scripts/backup-archive.mjs seal /secure/snapshot.tar /secure/snapshot.ayaale-backup
node --env-file=/secure/backup.env scripts/backup-archive.mjs verify /secure/snapshot.ayaale-backup
# After approval: upload encrypted file only to the selected destination.
# Download it to a DIFFERENT path, independently compare SHA-256, then authenticate it:
node --env-file=/secure/backup.env scripts/backup-archive.mjs verify /secure/downloaded.ayaale-backup
# Recovery to a new private location; do not read the output until this exits successfully:
node --env-file=/secure/backup.env scripts/backup-archive.mjs open /secure/downloaded.ayaale-backup /secure/restored.tar
```

Wrong keys, tampering and truncation fail authentication. Failure cleanup attempts to remove partial output; inspect cleanup if permissions/filesystem failures occur. Opening writes unauthenticated bytes to a restricted file until final authentication succeeds: never consume it concurrently. Check tar member paths before extraction; never extract an untrusted archive over the application or live project. Plaintext input/export files are not removed automatically. After successful off-site verification, remove temporary plaintext under the owner's secure storage policy; deletion on SSD/cloud storage is not guaranteed secure erasure.

After remote readback verifies both hash and authentication, the operator may create a private receipt (not automatically generated by sealing):

```json
{
  "version": 1,
  "verifiedAt": "REPLACE_WITH_ACTUAL_UTC_READBACK_TIME",
  "offsiteVerified": true,
  "database": true,
  "storage": true,
  "sha256": "REPLACE_WITH_64_CHARACTER_ENCRYPTED_ARCHIVE_SHA256"
}
```

These booleans are an operator attestation of coverage, not an independent audit. `MONITOR_BACKUP_RECEIPT` points to that local file. `npm run check:operations -- --full` fails on missing, future-dated, incomplete or older-than-36-hour receipts. It does not connect to the off-site destination or verify ongoing object existence. No workflow automatically uploads a receipt or backup.

Restore only to an isolated nonpublic target with all senders, jobs and collection disabled. Verify DB constraints/RLS/permissions, Auth assumptions, Storage bytes, suppression/erasure reconciliation, revoked users and job idempotency before enabling any traffic. Record measured RTO and evidence; do not restore over live data for a drill.

## Email deliverability

Public DNS inspection on 2026-11-08 found an existing `_dmarc.ayaale.com` policy `p=quarantine` with relaxed alignment and a GoDaddy reporting destination. Preserve that policy and destination until the operator reviews report access. No root SPF, root MX or TXT at the conventional `resend._domainkey` selector was returned. This limited lookup does not rule out other selectors, subdomains or providers. No DNS change was made.

Resend credentials/from-address/webhook secret are absent from local configuration. Sender verification, provider account access and live delivery testing remain pending. Do not invent DKIM/SPF values. In Resend obtain the exact records for the owner's selected sending domain; a new sending subdomain can separate reputation, but choose it with the operator before adding it. Preserve existing mailbox MX and other senders. Never create a second SPF record at the same name or weaken DMARC to make delivery pass. DKIM public keys are public; provider API and webhook keys are secrets.

1. Verify the selected domain using provider-issued SPF/DKIM and return-path records. Confirm alignment with the visible From address under the existing DMARC policy. DNS success alone is not inbox proof.
2. Set `MONITOR_SPF_HOST`, `MONITOR_SPF_VALUE`, `MONITOR_DKIM_HOST`, `MONITOR_DKIM_VALUE` from the exact TXT records (not root defaults). Full monitoring checks exact joined TXT values; if the provider requires CNAME DKIM, extend the checker before activation. This check does not replace provider verification, SPF include expansion/lookup-limit checks or DMARC alignment validation.
3. Protect `RESEND_API_KEY`, `TRANSACTIONAL_EMAIL_FROM` and `RESEND_WEBHOOK_SECRET`; configure the signed webhook at `https://ayaale.com/api/webhooks/resend` for supported sent/delivered/bounced/complained/failed/suppressed events. Existing signature/replay and suppression protections remain in force.
4. Keep open/click tracking off unless separately approved and disclosed. Supabase Auth email uses separate SMTP settings and must be verified separately; application Resend keys do not configure Auth mail.
5. With explicit test-recipient approval, send one transactional test and inspect received headers for SPF/DKIM/DMARC PASS and alignment. Confirm the signed delivery event and bounce/complaint suppression using provider-supported synthetic tests. Never test complaints by contacting an unsuspecting recipient. Then test alerts end to end.
6. Verify free sending quotas/rate limits, sender identity/legal placeholders and recipient consent before enabling transactional/newsletter flags. Newsletter and authentication delivery are separate acceptance checks. Leave production sending disabled until these gates pass.

References checked: [Render health checks](https://render.com/docs/health-checks), [Render deploys](https://render.com/docs/deploys), [Supabase backups](https://supabase.com/docs/guides/platform/backups), [Supabase CLI recovery](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [Resend domains](https://resend.com/docs/dashboard/domains/introduction), [GitHub schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). Free projects need their own exports and off-site copies; database backups do not contain Storage bytes.
