# T056 — Small-cohort soft launch

Status: preparation and synthetic property setup only. A real-partner soft launch has not occurred. The owner requested sample properties instead of identifying a verified cohort. Keep T057 unopened.

## Sample properties — created 8 November 2026

Sign in with the existing Ayaale administrator account and open `/partner`. Three owned properties are clearly labelled SAMPLE:

| Property                    | Category                 | District | Dashboard                                                  |
| --------------------------- | ------------------------ | -------- | ---------------------------------------------------------- |
| SAMPLE - Ayaale Garden Stay | Stays / guest house      | Kandy    | `/partner/properties/40f85059-da91-44a3-bf7b-e7fc773421fe` |
| SAMPLE - Ayaale Table Cafe  | Dining / cafe            | Colombo  | `/partner/properties/bfc09931-4e0c-4d89-8d71-6f63a7b22faa` |
| SAMPLE - Ayaale Day Retreat | Day outs / day-out venue | Galle    | `/partner/properties/33960f15-beca-4a85-80b3-ec4a90ca0bb4` |

These are fictional dashboard-practice records in the existing free development project, not a separate production database. Addresses/descriptions state that they are synthetic. No physical coordinates, telephone numbers, email contacts, photos or business websites were fabricated. Leave verification pending. Do not approve these records or allocate trials; verification approval would invoke real trial and notification workflows. Do not publish them as real businesses. Existing verification queues and dashboard notifications include their three sample requests; exclude the exact IDs above from real launch cohort/support/allocation reports.

The fixed-ID data-only seed is `scripts/operations/t056-sample-properties.sql`. It requires an existing confirmed platform-admin owner, preserves audit/registration-notification triggers, creates no users or credentials, and refuses to overwrite changed samples. It was run twice: three records remained, without duplicate ownership or requests. No schema migration or permissions change was made. Do not run this seed against a future production project.

If samples are no longer wanted, use the normal supported archive/withdrawal process or prepare a separately reviewed exact-ID cleanup. Do not delete audit records or run broad prefix/name-based deletes. No cleanup was performed by this task.

## Go/no-go before real partners

Record the operator, exact release commit/deploy ID and start date in the private launch record. The repository currently includes uncommitted T051–T055 work; prior test results do not prove that work is deployed. Recheck the exact candidate after any authorized publication/deployment.

- Confirm public health and homepage from an independent network; probes from the implementation environment timed out during T055 and again during T056. Do not mark availability passed based only on a healthy database.
- Finish T055's operational backup, recovery, sender and failure-alert verification. Record who owns support, the verified contact channel and daily review duty. Legal/operator documents still have owner-requested placeholders and remain unpublished; resolve the existing publication checklist before inviting real partners to rely on the service.
- Decide the real-data environment and retention/access policy. The custom domain currently uses the free development project; do not create another paid project or silently promote synthetic data.
- Select 3–5 consenting real businesses. Check current confirmation, authority/ownership evidence, location/contact details, verification outcome and publication eligibility through the existing workflows. The sample records do not satisfy these checks. Do not bypass admin review to populate the homepage.
- Verify each approved offer's price/unit/tax wording, dates, terms, image rights and safe contact destination. A basic verification is not a quality/licensing guarantee.
- Confirm analytics collection/privacy configuration and which windows contain trustworthy view denominators. Keep unknown attribution Unknown. Do not switch on GA, indexing or email flags as a side effect of this runbook.
- Recheck iPhone Safari and Android on the exact release, including filters, text enlargement, sign-in, approved offer pages and contact controls. A scripted fixture or empty-catalogue baseline is not real offer evidence.
- Owner signs off the cohort, release and support cover. Sending invitations requires named recipients and an explicit send instruction; this task sent no messages.

## Suggested seven-day pilot

Start dates are unset; do not imply this clock has begun. Use Asia/Colombo dates/times throughout and UTC instants for precise measurement windows.

| Stage        | Work and evidence                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before day 1 | Complete the gates; capture release, cohort IDs, initial issue counts, collection state and baseline measurements.                                                                                |
| Day 1        | Guide each partner through account access, profile, draft, submission and review. Record where help was needed; retain normal approval/cap controls.                                              |
| Days 2–6     | Review support and failed jobs daily; inspect call/WhatsApp counts and unavailable/expired offers. Record performance on actual public pages using the same device/network method.                |
| Day 7        | Review issue severity/resolution, onboarding completion, contact-click trends and measured load times. Decide extend, fix/retest, pause or complete pilot. Expansion is a separate T057 decision. |

Record onboarding outcomes in a restricted cohort sheet: selected, consented, verified, approved offer live, partner tested and last review. Use internal IDs instead of personal names/emails in shared evidence. Samples and staff activity must not count as partner adoption.

## Review support issues

Use the existing admin report queue at `/admin/reports` for offer complaints. Use `support-review.csv` as a blank summary template for onboarding/usability/support issues that do not fit the report form. Store a filled version outside Git in restricted storage. Keep only an issue key, property alias, safe summary, severity, owner, status and evidence reference; no passwords, confirmation links, personal contact details or copied allegations.

Investigate critical access/privacy leaks, unsafe/wrong contact destinations, unintended publication or trial/cap violations immediately. Pause affected offers/onboarding using existing admin controls while preserving evidence; stop affected senders if needed. Escalate to the named operator, repair, verify and document recovery. Review lower-severity usability issues daily. These are proposed operating targets, not a support SLA already promised to partners.

## Review contact activity

Use `/admin/analytics` for platform trends and each property's existing analytics for partner scope. Platform totals are not automatically cohort-filtered. Sum only the real cohort's property windows when reviewing the pilot; keep baseline, synthetic/staff tests and excluded events separate. Use `daily-review.csv` for safe aggregate summaries with explicit collection state and half-open UTC windows, aligned to Sri Lanka dates.

Report recorded offer views, WhatsApp clicks and call clicks separately. Contact click rate = (WhatsApp + call clicks) / recorded views, only when view collection was valid throughout the window and views > 0. Otherwise record `Unavailable` and why, never zero. Clicks can repeat and rate can exceed 100%; it is not a unique-user conversion or a booking/enquiry count. Do not invent business outcomes. Missing/disabled collection is unknown traffic, not evidence of no interest. GA consented activity and first-party counts have different coverage; do not mix their denominators.

## Review load times

Use `load-time-review.csv` for repeatable per-route samples: exact release, timestamp, real device/browser, URL class, cold/warm state, network and measurement method. Keep private slugs/query/token URLs out of shared logs. Record successful and failed runs, sample count, LCP and CLS; do not report HTTP response duration as LCP or a local lab test as production field performance.

The build-plan mobile LCP target is below 2.5 seconds. Use at least three comparable lab samples per available homepage/property/offer route and report their median with context. Keep cold Free Render wake-up behavior visible. A small cohort may have insufficient field samples; say so instead of claiming p75/Core Web Vitals/INP compliance. Existing `npm run test:performance` is local lab evidence only. Do not load-test a free service or place real calls/WhatsApp messages just to create conversion counts.

## Completion evidence

- Actual selected/consenting verified cohort and release recorded, with readiness gates checked.
- Observed onboarding/public offer/contact flows on that deployed release; trial/cap checks preserved.
- Dated support review and resolutions/owners; no unresolved critical or high launch-blocking issue.
- Contact counts interpreted with collection limits and trustworthy denominators, or explicit unavailable values and remediation.
- Comparable production load measurements and follow-up for regressions; missing evidence identified.
- Owner's day-seven decision recorded. T057 remains a separate authorization.

Until then, T056 is in progress. Sample creation and templates are not a completed soft launch.
