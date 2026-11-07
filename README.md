# Ayaale.com

Sri Lankan promotions discovery for **Stays, Dining and Day Outs**. Visitors browse without accounts and contact providers directly. V1 has no customer checkout or booking.

## Current state

T001–T003 are implemented locally; T004 deployment preparation is in progress. The app uses Next.js App Router with a server-rendered approved-offer discovery feed. Existing Git history is preserved. The existing acelag/ayaale repository and Render service are confirmed deployment targets. Development Supabase is provisioned; staging/production deployment and domains remain pending. T007 profile/property/membership/verification schema is applied to the free development project; client access remains blocked until T011.

## Authoritative blueprint

- [V1 product specification](docs/Ayaale_V1_Build_Plan.md): authoritative product scope and task sequence.
- [Implementation blueprint](docs/BLUEPRINT.md): architecture, boundaries and decisions.
- [Design system](docs/DESIGN_SYSTEM.md): tokens, component contracts and accessibility standards.
- [T002 delivery](docs/tasks/T002.md): verification and implementation boundaries.
- [Task board](docs/TASK_BOARD.md): portable local board for every task.
- [Environment matrix](docs/ENVIRONMENTS.md): environment and secret boundaries.
- [Definition of done](docs/DEFINITION_OF_DONE.md): completion gates.
- [T016 live discovery delivery](docs/tasks/T016.md): public projection, ordering, pagination and verification.
- [T015 discovery delivery](docs/tasks/T015.md): responsive header, URL-driven sample search/categories, cards and screenshots.
- [T014 security delivery](docs/tasks/T014.md): request budgets, audit metadata and recovery checks.
- [Backup/recovery runbook](docs/security/BACKUP_RECOVERY.md): verified drill and outstanding hosted backup setup.
- [T013 photo delivery](docs/tasks/T013.md): private storage, image limits, processing and live verification.
- [T012 authorization tests](docs/tasks/T012.md): cross-property isolation, owner-only access and private data checks.
- [T011 Auth delivery](docs/tasks/T011.md): server clients, email confirmation, roles, policies and verification boundaries.
- [Reporting and communications schema](docs/database/T010_REPORTING_COMMUNICATIONS.md): private reporting, analytics, consent and delivery storage.
- [T010 delivery](docs/tasks/T010.md): files, migration, commands, security, tests and verification.
- [Subscription/trial schema](docs/database/T009_ENTITLEMENTS.md): entitlement periods, first-100 allocation and concurrency-safe caps.
- [T009 delivery](docs/tasks/T009.md): files, migration, commands, security, tests and verification.
- [Offer schema](docs/database/T008_OFFERS.md): pricing, date windows, immutable revisions and status history.
- [T008 delivery](docs/tasks/T008.md): migration, commands, security and tests.
- [Database foundation](docs/database/T007_SCHEMA.md): T007 schema, invariants, access boundaries and database tests.
- [T007 delivery](docs/tasks/T007.md): migration, commands, security and verification evidence.
- [Legal drafts and review gate](docs/legal/REVIEW_AND_RELEASE_CHECKLIST.md): unpublished T006 privacy, terms and consent package.
- [T006 delivery](docs/tasks/T006.md): draft scope, verification and open legal-review gates.
- [Testing guide](docs/TESTING.md): lint, formatting, unit/browser checks and CI.
- [T005 delivery](docs/tasks/T005.md): quality tooling and verification results.
- [Deployment runbook](docs/DEPLOYMENT.md): proposed Render/Supabase setup, secrets, health, domains and rollback.
- [T004 delivery](docs/tasks/T004.md): local checks and outstanding hosted acceptance criteria.
- [T003 delivery](docs/tasks/T003.md): framework setup, commands, security and verification.
- [T001 delivery](docs/tasks/T001.md): changes, commands and verification.

Implement one approved task at a time. T004 is authorized and in progress. T005 quality tooling is implemented and locally verified. T006 drafts are complete; legal review is pending. T007 schema is applied in development. T008 offer schema is applied in development. T009 plans, trial allocation and per-property offer limits are applied in free development. T010 private reporting, analytics, newsletter and notification schemas are applied in free development. T011 Auth and scoped role policies are applied; inbox/UI validation remains T024. T012 expanded authorization tests pass. T013 private photo processing/storage and authenticated live upload verification are complete. T014 abuse controls, audit metadata and recovery checks are implemented; operational off-site backups remain T055. T015 responsive discovery presentation is implemented with clearly marked fictional samples. T016 replaces the samples with the approved live feed and Load More. Ask before T017 or any later task. The specification's suggested prompt is reference material; it does not independently authorize future work.

## Intended stack

Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Supabase PostgreSQL/Auth/Storage with RLS, Render Node web service, and Resend or equivalent email. Framework dependencies are pinned in package.json/package-lock.json. Node 24.22.1 is pinned in .nvmrc/.node-version and has passed the production build.

## Repository workflow

Use small task-scoped branches such as codex/t001-foundation and review changes before merging. Keep the existing repository history; never force-push or publish credentials. No Git remote is configured. The local board is the source of task status until a hosting destination is selected.

Once the owner selects a hosting account and repository visibility, create the remote repository and board, then attach the existing checkout. Use git remote add origin <repository-url> and git push -u origin <branch> only after checking the destination and reviewing history for secrets. These commands are instructions, not actions already performed.

## Local setup

Use Node 24 LTS, then run:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. This foundation requires no secrets or Supabase connection. When environment values are needed, copy .env.example to .env.local and fill only development values. Never connect local development to production data.

```sh
npm run build
npm run start
npx tsc --noEmit
npm run check:contrast
```

The starter page is deliberately non-indexable until launch content is ready. No discovery feed or registration is implemented yet. Database migrations start in T007; the test harness and CI configuration are provided by T005.

Build and development use Next.js webpack mode because this host restricts Turbopack compiler worker ports. shadcn/ui is configured manually with a locally owned Radix Button; the optional CLI is not retained. Full automated checks/CI remain T005.

For Render, review render.yaml and docs/DEPLOYMENT.md before applying: it proposes two billed services and must be reconciled with the existing ayaale service. Use npm run build:render with externally supplied staging/production values; its deployment check intentionally rejects missing configuration. GET /api/health is application liveness only. T004 created and verified the free development Supabase project. Existing Render services and domains remain unchanged.

Budget decision: keep development free using the local app and the existing free Supabase development project. Paid Render staging/production and domain work are deferred. render.yaml is a future proposal and must not be applied without new authorization. T004 hosted acceptance criteria remain incomplete.

Run npm run check for formatting, lint, types, unit tests and contrast. Install Chromium once with npx playwright install chromium, then run npm run test:e2e for production browser checks. npm run check:all runs both groups. CI is configured locally and awaits source publication; no hosted run is claimed. TypeScript is now pinned to 6.0.3 for lint-tool compatibility.

Database tests require a disposable loopback PostgreSQL cluster and AYAALE_TEST_DATABASE_URL pointing to an ayaale_test base database. npm run test:db tests migrations in a randomly named isolated database and removes it afterward. npm run check:all now includes database tests as well as the non-browser and browser checks. See docs/database/T007_SCHEMA.md.
