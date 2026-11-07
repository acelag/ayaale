# T004 — Deployment runbook

## Free preview deployment update — 8 November 2026

The owner authorized the existing free Render service to host the rebuilt preview at https://ayaale.onrender.com, using the existing free development database. Commit `de7de764cf6dfec8b672880f07fe4fe613b06562` is live on service `srv-dbd0lagm7kps73d6afeg`, from `codex/ayaale-v1-preview`; main is unchanged and automatic deployments are off. Health, noindex, access protection and domain preservation checks passed. No custom domain, billing plan or KadeCloud configuration changed. See [the current preview deployment record](RENDER_PREVIEW_DEPLOYMENT.md) for credentials approval, exact Auth callbacks and remaining launch boundaries. The initial T004 provisioning notes below describe the earlier state, not the current preview publication status.

## Current budget decision

Owner decision (4 November 2026): keep development free. Continue with the local Next.js app and existing $0/month ayaale-development Supabase project. Do not provision paid resources, upgrade plans, create staging/production services or change DNS without new explicit authorization. Staging/production and domain acceptance criteria remain deferred; full T004 is not complete.

## Current state and scope

Local deployment configuration is implemented and the development Supabase project is provisioned; staging/production provisioning is pending cost approval and a pushed Git revision. Supabase and Render connections are confirmed. Accounts selected by the owner: Supabase “acela's Org”, Render “My Workspace”. Do not mark hosted acceptance criteria complete until deployment evidence is recorded.

Read-only discovery found an existing free Render Node service named ayaale in Singapore linked to https://github.com/acelag/ayaale (main), plus one inactive Supabase project. Neither existing resource was changed. The owner confirmed reuse of the existing Render service and repository. Do not create a duplicate production service. The inactive database is not assumed empty or safe to reuse.

## Proposed resources

| Environment | App                                    | Database                            | Data                               |
| ----------- | -------------------------------------- | ----------------------------------- | ---------------------------------- |
| Development | Local Node 24.22.1 app                 | ayaale-development (ACTIVE_HEALTHY) | Synthetic only                     |
| Staging     | ayaale-staging Render Node web service | Dedicated ayaale-staging project    | Synthetic only                     |
| Production  | Existing ayaale service (confirmed)    | Dedicated ayaale-production project | No real data before security tasks |

Propose Singapore for Render and Supabase ap-southeast-1 for regional proximity; actual latency/capacity is verified after creation. Do not add Render Postgres, a persistent disk, cron jobs or workers. Media storage will use Supabase Storage in T013.

The root render.yaml is a reviewable two-service proposal. It uses manual deploys, healthCheckPath /api/health, Node runtime and paid 0.5c-512mb compute (the current equivalent of Starter). The production target is the existing ayaale service and the staging target is a new ayaale-staging service. Before import, reconcile/adopt the existing service through Render; a same-name declaration must not be assumed to safely adopt it. Do not create a replacement. Blueprint Auto Sync should also be disabled during setup. A first import can deploy even though later automatic deploys are off.

## Runtime and commands

.node-version and .nvmrc pin Node 24.22.1. engines limits the major to 24. Remove any conflicting Render NODE_VERSION override. Keep build-time development dependencies, because TypeScript/Tailwind are build tools.

```sh
npm ci --include=dev
npm run check:deployment
npm run build:render
npm run start -- --hostname 0.0.0.0
```

Render supplies PORT; Next.js reads it automatically. Do not hardcode port 3000 or export a static site. NEXT_PUBLIC values are embedded at build time; changing them requires rebuilding, not just restarting.

For local development use npm run dev. No local Supabase credentials are required for the current placeholder. The deployment check intentionally fails without staging/production values; do not use synthetic keys for a real deployment.

## Supabase provisioning

1. Confirm organization, region and costs for each project. Current account quote for a new project is $0/month, but the Free plan allows two active projects; three isolated environments need a plan decision or a separately scoped local-dev alternative. Do not repurpose the existing inactive project without inspecting it and obtaining the owner's agreement.
2. Create distinct projects and record only project refs/URLs in the resource register. Generate/store database passwords in an approved password manager, never in Git or chat.
3. Obtain each project's URL and sb_publishable_ key; keep staging and production values separate. No privileged key is needed by this scaffold. Store future sb_secret_ or legacy service-role credentials server-side only when their consuming task exists.
4. Leave application schemas, buckets and policies uncreated until T007/T011/T013. Public keys do not make an unsecured schema safe. Do not load live personal data.
5. Record region, project status and plan. Require email confirmation when Auth is implemented in T011. Configure exact site/redirect URLs for actual callback routes only after those routes exist; do not invent callbacks or broad production wildcards now.

## Render configuration and secrets

Connect the confirmed repository and deploy a reviewed committed revision. The current local checkout has no remote; no code has been pushed in T004. Existing service code may differ from this folder. Review prior history for credentials before publishing.

For each service set APP_ENV, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. The build validation checks HTTPS origins, environment names and public-key boundaries without logging values. It validates shape, not key validity, account access or environment isolation. Verify keys against the actual projects in the dashboard. sync: false prompts only during initial Blueprint creation; add new values manually on existing services.

Keep privileged keys server-side and set them only for the features and environments that need them. The T043 worker and webhook configuration are documented in [T043](tasks/T043.md). Limit dashboard access, enable account MFA, and keep production secrets out of preview and staging services. Redact credentials, auth headers, personal data and connection strings from logs.

Staging must use synthetic data and remain noindex. Before inviting reviewers, configure a platform access restriction appropriate to the selected Render plan and verify unauthenticated access is denied. noindex is not access control; this repository does not yet implement staging authentication. Do not expose private content based only on a robots rule.

## Health check

GET /api/health returns 200 with {"status":"ok"}, Cache-Control: no-store and X-Robots-Tag: noindex, nofollow. It is Node runtime and forced dynamic. It checks app liveness only and exposes no secrets/build versions. It deliberately does not query Supabase: database readiness is not implemented and must not be inferred from a green app health check. Configure this exact path on the selected Render service.

## Custom domain and HTTPS

Proposed canonical host: https://ayaale.com. Domain changes remain pending the owner's cutover approval and DNS access.

1. Verify the selected deployment passes health and smoke checks on its Render hostname.
2. Add ayaale.com to that service; Render also configures its www alias redirect. Verify both domains and TLS status before cutover.
3. In Cloudflare use the exact DNS targets supplied by Render. Record previous records/TTL and preserve mail/TXT records. Use DNS-only records while validating certificates if advised by Render; never replace unrelated zone records.
4. Verify https://ayaale.com serves the correct revision and https://www.ayaale.com redirects to it with path/query preserved. Verify HTTP redirects to HTTPS and no loops occur. If enabling a proxy later, use Full (strict) TLS and recheck behavior.
5. Also decide the onrender.com hostname policy so it does not become a duplicate indexable origin. Launch indexing, canonical metadata and sitemap remain T050; the current app remains noindex.

No fake live canonical redirect or custom-domain success is claimed by this local configuration.

## Costs and rollback

The blueprint proposes two paid Render instances; confirm the current workspace-specific total before creation/upgrade. Provider pricing and availability can change. Supabase's published Pro entry price is $25/month, with additional project compute charges; free-project limits may block a three-project topology. Email and cron costs are not incurred by this task. The development project was created after the owner accepted its account-specific $0/month quote. No paid service was purchased or upgraded. Render currently lists $7/month for each proposed 0.5c-512mb instance (about $14/month for two, excluding usage/workspace fees). Cron later has a $1/month minimum per service; no cron is created now.

Deploy staging first and capture revision/health/logs before production. Use manual deploys during setup. For a bad app release, select a previously successful deploy in Render, roll back, recheck health and smoke routes, then investigate. Do not roll back unrelated services. No DB rollback is needed in T004 because it contains no schema/data change. Full monitoring/backup recovery drills remain T055. For a domain rollback, restore the recorded prior DNS records and recheck TLS/redirects. Never delete old resources merely to roll back a deploy.

## Resource register

| Resource                               | State / evidence                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Source repository                      | https://github.com/acelag/ayaale confirmed; connector reports push=false, so source publication is blocked           |
| Render workspace                       | My Workspace; confirmed                                                                                              |
| Supabase organization                  | acela's Org; confirmed                                                                                               |
| Existing Render ayaale                 | Free Node service, Singapore; discovered read-only, unchanged                                                        |
| Existing Supabase project              | Inactive, Singapore; discovered read-only, unchanged                                                                 |
| Development Supabase                   | ayaale-development; buntpenbggavsoskhfnu; Singapore; ACTIVE_HEALTHY; quoted $0/month; public-key connectivity passed |
| Staging/production Supabase            | Not provisioned                                                                                                      |
| Staging/production deployment revision | Not deployed                                                                                                         |
| Custom domains / HTTPS                 | Not configured or verified in T004                                                                                   |

## Provider references (checked 4 November 2026)

- [Render Next.js deployment](https://render.com/docs/deploy-nextjs-app), [Blueprint fields](https://render.com/docs/blueprint-spec), [Node selection](https://render.com/docs/node-version), [health checks](https://render.com/docs/health-checks).
- [Render regions](https://render.com/docs/regions), [compute plan identifiers](https://render.com/docs/compute-plans), [pricing](https://render.com/pricing), [custom domains](https://render.com/docs/custom-domains).
- [Supabase environments](https://supabase.com/docs/guides/deployment), [regions](https://supabase.com/docs/guides/platform/regions), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [pricing](https://supabase.com/pricing).

## Development provisioning evidence

The owner approved creation in acela's Org at the quoted $0/month. Project https://supabase.com/dashboard/project/buntpenbggavsoskhfnu is ACTIVE_HEALTHY in ap-southeast-1. Its active publishable key and URL are stored in the ignored, owner-readable .env.local. A read-only Auth settings request returned HTTP 200; no users or tables were created. The existing inactive project remains unchanged.

The GitHub connector can read acelag/ayaale but reports no push permission. Enable repository write access before publication; do not attempt to bypass connector permissions. The Render connector cannot update existing service build/health/domain settings; those steps require the dashboard or another authorized API connection. No existing service environment variables were changed.

## Blueprint validation evidence

The proposed render.yaml passed local validation against https://render.com/schema/render.yaml.json retrieved on 4 November 2026. Temporary YAML/AJV tooling was kept outside the app. This checks structure, not existing-resource adoption, account quotas or billing. Account-aware Render validation remains pending. Official Blueprint and environment-variable Markdown references were retrieved and read. Supabase changelog was checked; its CLI v3 change does not affect this MCP-based provisioning.
