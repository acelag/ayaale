# Implementation blueprint

## Scope and authority

The adjacent Ayaale_V1_Build_Plan.md is the unchanged planning baseline dated 4 November 2026. Resolve ambiguity with the product owner and record decisions before implementation. This document maps the baseline to implementation boundaries; it does not expand scope.

## Architecture

One responsive Next.js App Router application serves public discovery, partner and Ayaale administration. Public content is server-rendered and indexable. Partner/admin permissions are enforced on the server and through Supabase RLS, never solely through navigation or client checks. Route names and source layout are proposals to finalize in T003.

Supabase holds durable relational data, authentication and uploaded media. Render runs a Node web service; filesystem uploads are not durable. Add idempotent Render cron jobs only when their tasks are approved. Check offer validity at query time as well as through expiry jobs. Email delivery must support retries, consent and deduplication.

## Non-negotiable product rules

- Categories are Stays, Dining, Day Outs; no homestays in Stays.
- Customers need no account. Contact metrics are clicks, never confirmed bookings.
- Every new offer and public content edit requires manual approval.
- Owner/staff access is explicitly scoped per property; staff cannot manage billing or teams.
- Starter permits three active offers per property and unlimited drafts.
- Trial goes to the first 100 verified approved properties, allocated atomically at approval, once per property.
- Publication windows and redemption dates are separate. Old links retain an ended/unavailable state.
- Payments remain disabled; basic PWA is online-only with no push.
- Newsletter requires confirmed consent and unsubscribe; reporter/subscriber data is private.

## Delivery boundaries

T001 supplies documentation and repository planning only. T002 defines design and accessibility standards. T003 initializes the actual framework. T004 provisions environments. T005 adds automated quality checks. T007–T014 implement data and security. Remaining tasks follow the authoritative sequence; tracking a task does not authorize implementing it.

## Decisions still required

Remote hosting account/repository visibility; hosted issue-board destination; environment owners; Supabase/Render regions and paid plans; email provider and sender domain; canonical domain policy. Choose dependency/runtime versions in T003 and validate provider capabilities in T004. Do not fabricate deployed resources or credentials.

## Design baseline (T002)

Follow the [design system](DESIGN_SYSTEM.md) and [CSS tokens](../design/tokens.css). Shared components must meet the documented state, responsive and accessibility contracts. Framework integration remains T003; product components remain in their owning tasks.

## Application foundation (T003)

The application now uses app/ for routes, components/ui/ for shadcn primitives and lib/ for shared utilities with the @/* alias. app/globals.css imports the original tokens. The root page is a noindex placeholder; database, auth, discovery UI and infrastructure remain in later tasks. See the [T003 delivery record](tasks/T003.md).

## Deployment preparation (T004)

See the [deployment runbook](DEPLOYMENT.md) and render.yaml for separate environment proposals. The Node 24 production build is verified locally. The dynamic /api/health endpoint checks application liveness only. Provider connections are confirmed; the free development Supabase project is provisioned and its publishable key configured locally. Existing Render services and domains remain unchanged. Resolve existing service reuse, Git revision and costs before provisioning.

## Quality gates (T005)

Follow the [testing guide](TESTING.md). ESLint, Prettier, strict type generation/checking, Node unit tests, contrast checks and Playwright production browser tests run locally without project secrets or paid services. A read-only GitHub Actions workflow is prepared; hosted execution awaits source publication. See the [T005 delivery record](tasks/T005.md) for actual results and the documented development-tool advisory.

## Legal drafts (T006)

The [review package](legal/REVIEW_AND_RELEASE_CHECKLIST.md) contains draft privacy/website/business terms and newsletter consent copy. Operator/contact placeholders remain by owner request. These drafts are unpublished and unapproved; professional legal review, current-law verification and operational sign-off are launch gates. Retention limits are proposals, not implemented deletion guarantees or statutory periods. No later task is authorized by the copy.

## Data foundation (T007)

The [schema guide](database/T007_SCHEMA.md) describes the migration applied only in free development. Exactly-one-owner and two-staff constraints are database-enforced; verification proposals remain private. All browser table access is denied until T011. New isolated PostgreSQL tests cover constraints/concurrency; no Auth flow, offers, subscriptions or file storage has been added.

## Offer content foundation (T008)

See the [offer schema guide](database/T008_OFFERS.md). Stable offer identities reference approved private revision snapshots; submitted content/decisions and status history are protected from mutation. Prices use fixed decimals and a generated discount; publication and redemption periods stay separate. Browser access stays denied until T011. Subscription limits, storage, UI and jobs remain in later tasks.

## Subscription foundation (T009)

See the [entitlement schema guide](database/T009_ENTITLEMENTS.md). Starter prices are catalogue-only; paid activation stays disabled. First verified approval allocates one permanent six-month trial among the first 100 properties. Serialized entitlement writes enforce three active offers per property. Effective reads must check expiry at current time; cached status alone is insufficient. Development remains free. Role policies, UI, jobs, reminders and billing remain future approved tasks.

## Reporting and communications foundation (T010)

See the [schema guide](database/T010_REPORTING_COMMUNICATIONS.md). Thirteen private RLS-protected tables store manual complaints, minimized view/contact events, daily aggregates, newsletter consent and delivery state, notifications and retry logs. Browser access remains denied. No event collection, sending, provider configuration, scheduled work or public interface is enabled. T011 role policies and later workflows require separate approval. Development remains free.

## Authentication foundation (T011)

Cookie-based PKCE authentication, server role guards and identity-bound RLS are implemented. Confirmed-email owners/staff read explicitly assigned properties; private PII is admin-only. Platform admins are separately provisioned in private.platform_admins. Direct property/offer/team writes remain denied pending authorized task-specific workflows. Real inbox and signup UI verification remain T024. See the [delivery and access matrix](tasks/T011.md).

## Authorization verification (T012)

Sixteen additional populated-data authorization cases verify cross-property isolation, owner-only reads, private reporter/subscriber denial and role revocation. No application/schema change was needed. All 79 database cases pass. See [T012](tasks/T012.md); future workflow mutations need their own server and database authorization coverage.

## Photo pipeline (T013)

Private processed WebP assets use server-only Storage writes, bounded decoding, metadata stripping and two sizes. Assigned members get short-lived private read URLs. No original, draft asset or gallery is public. Storage is provisioned in free development; the configured server secret and live upload/read/cleanup checks are verified. Public reviewed photo binding and galleries remain later tasks. See [T013](tasks/T013.md).

## Abuse controls and audit/recovery (T014)

Shared PostgreSQL request budgets protect existing Auth and photo entry points; HMAC subjects and global caps avoid raw IP/email budget storage. Photos have bounded streams/decoder work. Append-only audit metadata covers sensitive row changes and Auth actions without row snapshots. Local database and synthetic hosted object restore checks pass; operational off-site backups and provider-level signup abuse setup remain launch work. See [controls](security/T014_CONTROLS.md) and [recovery runbook](security/BACKUP_RECOVERY.md). Ask before T015.

## Discovery presentation (T015)

Reusable server-rendered header, native GET search, URL category links and compact horizontal cards now form the homepage. Only clearly labelled fictional samples are searched; no public database listing access is opened. Local illustrations avoid remote asset requests. All 28 production browser cases pass, with responsive/keyboard/accessibility checks and screenshots. Live queries/pagination are T016 and filters T017, pending authorization. See [T015](tasks/T015.md).

## Approved public discovery (T016)

The public feed now returns up to 12 approved active card projections, newest first with fair alternation across properties and keyset continuation. Search/category state is server-rendered; Load More appends with a native-link fallback. Availability is rechecked at query time. Raw tables, private revisions and Storage paths remain restricted. Development currently has no approved listings, so the empty state is real. See [T016](tasks/T016.md). T017 filters/sorting remain pending approval.
