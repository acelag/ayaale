# Phase 2 verification

Reviewed T015–T023 against the [Ayaale V1 build plan](../Ayaale_V1_Build_Plan.md). The workspace copy matches the attached plan byte for byte. The local regression suite passed. Full product sign-off still needs the offer-page items and live checks below.

| Task | Verified                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T015 | Responsive cards, native search and category navigation, keyboard access, empty and reset states.                                                                       |
| T016 | 12 offers per page, newest-first ordering, alternation when another property is available, stable continuations, and retryable Load More.                               |
| T017 | Mobile bottom sheet, filter chips, matching counts, sort, and persistence through URL changes and pagination.                                                           |
| T018 | Public detail route, pricing, inclusions, separate date windows, terms and delivery of the approved cover.                                                              |
| T019 | Mobile contact controls, prefilled WhatsApp message, Copy Link, and deduplicated click recording.                                                                       |
| T020 | Verified property profiles, amenities, map and review links, photo assignment and visibility checks.                                                                    |
| T021 | Paused, ended and unavailable pages, active alternatives, and no historical details for withdrawn offers.                                                               |
| T022 | Guest reports, optional comment and email, rate limits, duplicate retry handling, and restricted reporter details. Submission requires JavaScript in the current build. |
| T023 | Manifest, Android-size and Apple touch icons, launch URL, and Chromium installability in desktop and mobile emulation.                                                  |

## Build plan gaps

- Section 3 lists related active offers and a Google reviews link when available on the offer detail page. The [offer page RPC](../../supabase/migrations/20261105090559_t021_unavailable_offer_pages.sql) supplies alternatives for unavailable pages only. The Google reviews link appears on the [property profile](../../app/properties/%5Bslug%5D/page.tsx). An active offer links to that profile, which adds a navigation step.
- Section 5 calls for a seven-day Recently Added indicator and allows an optional offer gallery. The current public cards have no recency indicator, and offer details display a single approved cover. The partner offer wizard is a later task. Property galleries are already covered by T020.

## Test results and environment

- `npm run check:all` passed with Node 24.22.1 and disposable PostgreSQL. Formatting, lint, TypeScript, 16 unit tests, 20 contrast pairs, 118 database tests and 64 desktop and mobile Chromium tests passed. `git diff --check` passed.
- Free development Supabase migration history matches the seven local Phase 2 migration versions. Public feed and missing-target reads succeeded. Anonymous photo-path, contact-write and report-write calls returned 401. The trusted report endpoint rejected a nonexistent target before writing.
- Hosted development has zero verified public properties and zero previously published offers. Populated browsing, photo delivery, contact tracking, unavailable pages and report submissions were verified with local fixtures. Hosted verification with real content remains open.
- Localhost served the expected empty discovery response and PWA assets. Unknown offer, property and media URLs returned 404. One homepage request returned 500 with a webpack module error while the production test build was running. Three sequential homepage and feed checks passed afterward. The production browser suite passed.
- Physical Android Chrome and iPhone Safari installation and launch still need an HTTPS deployment. Use the [T023 device checklist](../tasks/T023.md).

The verification used the existing free development project and disposable local test data. No hosted rows or migrations were added.
