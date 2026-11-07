# Environment matrix

## Current budget decision

Owner decision (4 November 2026): keep development free. Continue with the local Next.js app and existing $0/month ayaale-development Supabase project. Do not provision paid resources, upgrade plans, create staging/production services or change DNS without new explicit authorization. Staging/production and domain acceptance criteria remain deferred; full T004 is not complete.

T004 local deployment configuration is ready; development Supabase is provisioned; staging/production remain pending. Provider connections and account choices are confirmed. See [deployment runbook](DEPLOYMENT.md) for actual resource state, existing-resource discovery and pending approvals.

| Boundary        | Development                             | Staging                          | Production                                   |
| --------------- | --------------------------------------- | -------------------------------- | -------------------------------------------- |
| App             | Local Next.js, Node 24.22.1             | Separate Render Node service     | Separate paid Render Node service            |
| URL             | http://localhost:3000                   | TBD; restricted/non-indexable    | https://ayaale.com proposed; cutover pending |
| Supabase        | ayaale-development, Singapore (healthy) | Dedicated staging project        | Dedicated production project                 |
| Data            | Synthetic only                          | Synthetic/sanitized fixtures     | Approved live data                           |
| Email           | Test addresses/sink                     | Recipient allowlist              | Verified sender, consenting recipients       |
| Secrets         | Ignored .env.local                      | Staging service environment      | Production service environment               |
| Jobs            | Explicit local tests only               | Isolated test jobs when approved | Idempotent scheduled jobs when approved      |
| Access          | Developers                              | Authorized reviewers             | Least-privilege operators                    |
| Search indexing | Disabled                                | Disabled plus access restriction | Public approved pages only                   |

## Variable boundaries

| Variable                             | Exposure    | Purpose                                                |
| ------------------------------------ | ----------- | ------------------------------------------------------ |
| NEXT_PUBLIC_SITE_URL                 | Public      | Environment-specific base URL                          |
| NEXT_PUBLIC_SUPABASE_URL             | Public      | Environment-specific Supabase endpoint                 |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public      | Public API key; requires RLS                           |
| SUPABASE_SECRET_KEY                  | Server only | Future privileged operations; not required by T004     |
| SUPABASE_SERVICE_ROLE_KEY            | Server only | Privileged operations only when required; bypasses RLS |
| RESEND_API_KEY                       | Server only | Email provider access when implemented                 |
| CRON_SECRET                          | Server only | Authenticate scheduled endpoints when implemented      |

Only names and empty placeholders belong in .env.example. Do not reuse production secrets or database projects in lower environments. Never log secrets, copy production personal data to fixtures, or expose privileged keys in browser bundles. Validate required variables when their consuming features are introduced. Assign owners, rotation procedures, backup/recovery and deployment rollback checks during infrastructure/security tasks.

APP_ENV distinguishes development/staging/production and must not replace NODE_ENV. Render builds/runs both staging and production with NODE_ENV=production. Deployment public values must be present before build and rebuilt when changed. No privileged keys are configured by T004.
