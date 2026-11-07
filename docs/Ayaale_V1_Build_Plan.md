# Ayaale.com — Version 1 Product Specification and Step-by-Step Build Plan

**Status:** Planning baseline, 4 November 2026. Adjust during implementation.
**Product:** Sri Lankan nationwide promotions discovery platform for Stays, Dining and Day Outs. Customers browse without accounts and contact providers directly. No customer booking or checkout in V1.

## 1. Product principles
- Mobile-first, text-first, fast, accessible and SEO-friendly; compact horizontal offer cards with one optimized thumbnail.
- Public pages: homepage, search results, offer details, verified business profiles, legal/contact pages.
- Private pages: partner dashboard and Ayaale admin dashboard.
- One responsive Next.js app with basic installable PWA support; **no offline mode or push notifications** at launch.
- Nationwide feed by default, newest first; avoid showing more than two consecutive offers from one business.
- Customers do not need accounts; no public customer reviews in V1.

## 2. Roles and access
- Visitor: search, view, share, WhatsApp/call, report, subscribe to newsletter.
- Property owner/admin: manage assigned properties, staff, profile, offers, stats, subscription.
- Property staff: manage offers and photos for explicitly assigned properties; no subscription/staff management.
- Ayaale admin: verification, offer approval, complaints, subscriptions, analytics, newsletters, settings.
- Each property allows one owner/admin and up to two staff accounts. A user may be assigned to several properties. Enforce permissions on the server and with Supabase RLS.

## 3. Customer-facing experience
### Homepage and search
- Compact header: logo, search, “List Your Property.”
- Search placeholder: “Search destinations, hotels, or offers.”
- Tabs: All Offers (default), Stays, Dining, Day Outs.
- Filters: destination, price range, dates, category-specific fields; active filter chips; Reset and “Show N Offers.”
- Sort: Newest First (default), Lowest Price, Biggest Discount, Ending Soon.
- Mobile: sticky compact search/filter toolbar; bottom-sheet filters; mobile-first horizontal offer cards.
- Load 12 offers initially, then Load More; optimized/lazy-loaded images.
- Sections below main feed may include Weekend Getaways and Ending Soon.
### Offer card
- One thumbnail; offer title, property, district/destination, promo price and pricing unit, optional computed discount, brief inclusions, guest counts as applicable, verified indicator.
### Offer detail
- Title, property, location, promo price (mandatory), original price (optional), calculated discount when valid, price unit (“per person,” “per couple,” “per night,” “starting from,” etc.), package coverage.
- Offer publication window distinct from redemption/stay dates.
- Included benefits, adults/children/nights and category-specific details, conditions, taxes, exclusions, restrictions, photos.
- Copy Offer Link; property summary and Verified by Ayaale badge; Google Maps Get Directions; Google reviews link if available; related active offers.
- Sticky mobile WhatsApp and Call buttons; WhatsApp message includes title and offer URL. Track clicks as **clicks, not confirmed enquiries/bookings**.
- Report an Issue link, no login.
- Expired/paused offers disappear from active feeds; old URLs display ended/unavailable state and alternative active offers, not broken pages.
### Business profile
- Public profile even with no active offers; name, description, category, address, district, Google Maps link, contacts, website/social links, cover/gallery, category-specific facilities.
- “Verified by Ayaale” badge and explanatory text: basic identity/authorization checked, not quality or availability guaranteed.
- Amenities are distinct from inclusions in a particular offer. Show key amenities with View All.
- No homestays in Stays category.

## 4. Partner onboarding and property management
- Signup with verified email; collect property type, name, address/district, contact person, phone/WhatsApp, optional online presence and photos. Require valid verified location before final approval.
- Admin manually checks business existence and applicant authorization via independently verified contact or supporting evidence when needed.
- Verification states: Pending, More Information Required, Verified, Rejected; Suspended for approved businesses later restricted.
- Owners may draft offers while pending, but may submit only after verification.
- Reverify critical changes (name, address, ownership, primary contact); keep approved data public while edits are pending when safe.
- Duplicate-match detection: name/address/Google Maps/contact; let applicant submit an ownership claim, verify independently, preserve current owner access until legitimate transfer is confirmed. Do not create duplicate public profiles.
- Property switcher in dashboard; All Properties Overview for multi-property owners, with property counts, total published offers, active offers, views, WhatsApp/call clicks, monthly comparison and per-property breakdown.
- Individual property subscriptions, staff, analytics and offers; same staff member can have permission for multiple properties.
- Profile editor: Information, Contact, Photos, Facilities, Team; completeness indicator; View Public Profile.
- Owner can add properties, manage staff, and see their status.

## 5. Offer creation and lifecycle
### Five-step wizard
1. Property, category, title, short description.
2. Mandatory promotional price, optional original price, pricing unit, guest counts/nights, inclusions, computed discount.
3. Publication start/end and distinct valid redemption/stay dates, terms, taxes, restrictions.
4. Required optimized cover photo, optional gallery; inherited verified property contacts.
5. Preview card/detail, Save Draft or Submit for Review.
- Category-specific fields for Stays, Dining, Day Outs; clear children's ages, meal times, access restrictions, and extra charges where applicable.
- Statuses: Draft, Pending Review, Changes Requested/Rejected, Approved/Scheduled, Active, Paused, Ended, Expired, Hidden by Admin.
- Manual admin approval for **every new offer and public content edit** at launch; approval checks price, dates, inclusions, contact, photo and terms.
- Up to 3 simultaneously active promotions per property on Starter; unlimited drafts; show “X of 3 active.”
- Owners/staff can pause or end immediately. Re-enable unchanged approved paused offers only if dates, subscription and capacity allow. Extending dates or changing published content requires approval.
- Approved scheduled offers publish automatically; expiry removes offers from active listings and frees capacity.
- Expired offers stay in partner dashboard with historical stats and Duplicate action. Reminder 3 days before expiry.
- “Recently Added” indicator for offers published in past 7 days.

## 6. Subscription and trial rules
- First **100 approved, verified properties**, allocated **on approval**, receive a six-month free Starter trial. Do not reserve places on registration.
- One free trial per property, including ownership transfers; separately verify genuine multiple properties under one owner.
- Trial begins at approval time; protect final allocation against concurrent approvals.
- Starter: **LKR 1,500/month; LKR 8,000/6 months; LKR 15,000/year**; max 3 active offers/property.
- Reminders 30, 7 and 1 day before trial end.
- No automatic billing at trial expiry. If no paid subscription, offers become inactive; drafts, history, analytics and verified public profile remain.
- Plan/usage/expiry and billing history visible to owner.
- Payments disabled until business registration, bank account and payment gateway are ready. Integrate secure verified gateway later; do not expose fake checkout.

## 7. Analytics
- Per property: offer detail views, WhatsApp clicks, Call clicks, contact click rate, 7/30/90-day trends, this month vs last month, offer performance table.
- Count contact clicks, never label them bookings; filter obvious bots/internal tests and limit rapid repeat views.
- Multi-property consolidated stats for authorized owner.
- Integrate **Google Analytics 4** for site traffic and acquisition sources; **Google Search Console** for search visibility. Use UTM links for newsletters/social campaigns.
- Ayaale database stores property-specific offer views/contact clicks for dashboard reporting; show aggregated source breakdown only where reliable, otherwise Unknown.
- Monthly partner performance email; privacy-conscious aggregation and retention policy.

## 8. Email and newsletter
- Transactional emails: verify email, property verification outcome/info request, offer review outcome to submitter, trial expiry reminders, critical complaint alerts to admin, monthly performance summary. Log send/delivery status, prevent duplicates.
- In-dashboard notification bell for approvals, registrations, complaints.
- Free customer newsletter signup near homepage bottom: “Discover Sri Lanka’s Best Deals Every Week”; email confirmation, consent record, unsubscribe link; no customer account.
- One weekly **Friday** mixed-category newsletter, manually select 5–6 approved active offers; one reusable text-first template.
- Admin Marketing > Newsletters: Create, Save Draft, select offers (auto-fill content), edit subject/intro, reorder, preview mobile/desktop, send test, schedule/send, view sent/scheduled campaigns and delivery/click/unsubscribe metrics.
- Warn/block expired offers before sending; do not send empty/repetitive weekly newsletters.
- No instant customer alerts, themed newsletters, SMS, push or paid newsletter placements in V1.

## 9. Complaints, trust and moderation
- Visitors can report an offer **or business** without an account; reasons include incorrect price, unavailable offer, misleading information, unreachable contact, other; optional comment/email.
- Admin queue: offer/business, reason, priority, status, date; view, request changes, hide immediately, resolve; internal property complaint history and audit trail.
- Manual decisions; never auto-suspend from raw report count. Serious cases may justify immediate temporary hiding and investigation.
- Internal review targets: high priority 4 business hours; medium 24 hours; low 48 hours; property verification 1–2 business days; offer review 24 hours. Not public guarantees.
- No public review/rating system in first ~6 months; optional Google review link.

## 10. SEO, freshness and performance
- Indexable server-rendered public pages with canonical URLs, generated titles/descriptions, suitable structured data, XML sitemap, robots rules and Search Console.
- Keep old offer links functional with clear expired status; do not advertise expired availability in structured data/sitemap.
- Avoid mass thin destination pages; add useful curated destination pages later.
- Auto-update sitemap when offers publish/expire; admin content-health panel for expiring offers, pending reviews, inactive properties.
- Nudge properties after ~30 days inactivity, avoiding email spam.
- Image resize/compress, responsive formats, lazy loading; cached public listings with fast invalidation for pauses/expiry; indexed filters and pagination.
- Target mobile LCP under 2.5s where feasible; monitor real users, errors, failed jobs and email delivery.

## 11. Technology architecture
- Next.js App Router + TypeScript, Tailwind CSS + shadcn/ui; single responsive web app for public/partner/admin.
- Supabase PostgreSQL, Auth, Storage and Row Level Security. Hosting on Render using a Next.js Node web service (not a static site). Transactional/newsletter email via Resend or equivalent.
- Basic PWA manifest, icons and installability; online-only launch. No offline mode, push notifications or separate native apps.
- Background jobs for scheduled publishing, expiry, reminders and newsletter sends: start with Render Cron Jobs when needed; use a Render Background Worker only if sustained queue processing becomes necessary. Keep scheduled tasks idempotent and use database timestamps as the source of truth.
- Separate dev/staging/production environments; secrets server-side; input validation, audit logs, rate limits, spam protection and backups.

## 11A. Render deployment notes
- Deploy the Next.js App Router application as a **Render Web Service** using the Node runtime; do not deploy as a static site because Ayaale needs server rendering, authentication and server endpoints.
- Connect the Git repository and configure separate development/staging/production environments as needed. Use build/start commands appropriate to the final Next.js version (typically `npm run build` and `npm run start`).
- Connect `ayaale.com` and `www.ayaale.com` with HTTPS and a canonical redirect; DNS can remain with Cloudflare.
- Keep Supabase service-role keys, Resend API keys and admin secrets only in Render server-side environment variables. Public `NEXT_PUBLIC_` variables must contain only safe public values.
- Store uploaded photos in Supabase Storage, not on Render's ephemeral application filesystem.
- Use Render Cron Jobs for periodic expiry/reminder/newsletter dispatch when ready; design jobs to be safe on retries. The public website must also check offer validity at query time, rather than relying exclusively on cron execution.
- Set up health checks, request/error logs, deployment rollbacks and uptime monitoring. Verify current Render plan prices, region availability, instance behavior and cron pricing before production launch.
- Initial infrastructure: one paid Render web service + Supabase + email provider; add cron jobs and background workers only as required. Avoid depending on sleeping free instances for a live customer-facing website.

## 12. Suggested database entities
- users / auth profiles
- properties, property_memberships, property_verification_requests, ownership_claims
- amenities, property_amenities, property_photos
- offers, offer_photos, offer_revisions, offer_status_history
- plans, property_subscriptions, trial_allocations, billing_events
- offer_view_events, contact_click_events, daily_offer_metrics
- issue_reports, moderation_actions
- notification_events, email_delivery_logs
- newsletter_subscribers, subscriber_consents, newsletters, newsletter_offers, newsletter_deliveries
- audit_logs, site_settings
Use UUIDs, timestamps, unique constraints, foreign keys, status checks and RLS policies. Do not expose sensitive reporter/subscriber details to property staff.

## 13. Step-by-step implementation tasks

### Phase 0 — Foundation and decisions
- [ ] T001 Create Git repository, issue board, README, environment matrix and definition of done.
- [ ] T002 Define design tokens, typography, responsive breakpoints, shared UI components and accessibility standards.
- [ ] T003 Initialize Next.js TypeScript App Router, Tailwind and shadcn/ui.
- [ ] T004 Create Supabase projects/environments; configure Render Next.js Node web-service deployments, custom domain, health checks and environment secrets.
- [ ] T005 Set up linting, formatting, type checks, unit/e2e test harness and CI.
- [ ] T006 Draft privacy policy, terms, business listing terms and newsletter consent copy; obtain appropriate legal review.

### Phase 1 — Data and security
- [ ] T007 Create SQL schema and migrations for users, properties, memberships and verification.
- [ ] T008 Create offer schema with revision history, price units, inclusions, publication and redemption dates.
- [ ] T009 Create plans/subscriptions/trial allocation schema and enforce per-property caps.
- [ ] T010 Create reporting, analytics, newsletter and notification schemas.
- [ ] T011 Implement Supabase Auth, email verification, owner/staff/admin roles and RLS policies.
- [ ] T012 Write authorization tests proving staff cannot access other properties or owner-only actions.
- [ ] T013 Implement file storage, image validation, resizing and size limits.
- [ ] T014 Add rate limits, spam protection, audit trails and backup/recovery checks.

### Phase 2 — Public discovery
- [ ] T015 Build responsive header, search, category tabs and compact offer cards.
- [ ] T016 Build listing queries: nationwide newest-first, fair alternation, 12 per page, Load More.
- [ ] T017 Build mobile bottom-sheet filters, sort menu, filter chips and sticky controls.
- [ ] T018 Build offer detail page with inclusions, prices, dates, terms and images.
- [ ] T019 Add sticky WhatsApp/Call buttons, prefilled message, Copy Link and click tracking.
- [ ] T020 Build public property profile, amenities, verified badge/explanation, maps/reviews links.
- [ ] T021 Implement expired/paused/unavailable offer pages and related active offers.
- [ ] T022 Add public issue-report forms for offers and properties.
- [ ] T023 Add basic PWA manifest/icons and mobile installability tests.

### Phase 3 — Partner onboarding and dashboard
- [ ] T024 Build partner signup, email verification, property registration and status screen.
- [ ] T025 Build property switcher and multi-property overview with consolidated totals.
- [ ] T026 Build profile editing, photo gallery, amenities and completeness indicator.
- [ ] T027 Build owner-managed staff invitations and multi-property membership assignments.
- [ ] T028 Build 5-step offer wizard with validation, drafts, preview and category-specific fields.
- [ ] T029 Build My Offers list with states, pause/end, duplicate and edit-for-review flows.
- [ ] T030 Enforce three-active-offer cap and show clear usage.
- [ ] T031 Build per-property analytics cards, trend chart, offer table and monthly comparisons.
- [ ] T032 Build subscription/trial status and future billing UI without live checkout.
- [ ] T033 Optimize all partner workflows for phones.

### Phase 4 — Ayaale administration
- [ ] T034 Build admin overview with pending verifications, offers and reports.
- [ ] T035 Build property verification checklist and approve/request-info/reject/suspend workflow.
- [ ] T036 Add duplicate-property detection and manual ownership claim/transfer workflow.
- [ ] T037 Build offer review queue with public preview, approve/reject/request changes and revision history.
- [ ] T038 Build complaint moderation queue, priority, hiding, resolution and internal history.
- [ ] T039 Build trial allocation counter with concurrency-safe first-100 approval logic.
- [ ] T040 Build admin platform analytics, content-health and settings pages.

### Phase 5 — Automation, email and newsletter
- [ ] T041 Implement scheduled offer activation/expiry and cache invalidation.
- [ ] T042 Implement offer-expiry reminder and inactive-business reminder jobs.
- [ ] T043 Implement transactional email templates, delivery logs and retries.
- [ ] T044 Implement trial 30/7/1-day reminders and monthly performance emails.
- [ ] T045 Add dashboard notification bell and urgent admin email alerts.
- [ ] T046 Build newsletter subscription form, confirmation, consent and unsubscribe flow.
- [ ] T047 Build simple admin newsletter editor, manual mixed-offer selection, preview and test send.
- [ ] T048 Implement Friday scheduling, expiry validation, send deduplication and campaign analytics.

### Phase 6 — SEO, analytics and release
- [ ] T049 Configure GA4 events, UTM conventions and privacy-aware traffic reporting.
- [ ] T050 Configure Search Console, metadata, structured data, canonical URLs, robots and sitemap.
- [ ] T051 Add traffic-source summary where reliable; use Unknown otherwise.
- [ ] T052 Run performance/accessibility/mobile browser tests (including iOS Safari).
- [ ] T053 Test end-to-end: onboarding → verify → trial → draft → approve → publish → contact → expire → duplicate.
- [ ] T054 Test negative cases: duplicate claims, unverified users, cross-property access, over-cap publishing, expired newsletter offers, subscription expiry, fake reports.
- [ ] T055 Set up monitoring, backups, email deliverability (SPF/DKIM/DMARC) and production alerts.
- [ ] T056 Soft-launch with a small verified partner cohort; review support issues, conversion clicks and load times.
- [ ] T057 Open first-100-property trial offer and monitor approval allocations.

### Phase 7 — Deferred, not part of launch
- [ ] T058 Integrate payment gateway after legal/business/bank readiness; verified webhooks, receipts, renewals.
- [ ] T059 Explore customer reviews after verification approach is defined.
- [ ] T060 Consider destination-targeted newsletters, automated recommendations, paid placements.
- [ ] T061 Consider booking/payment workflow, native apps, push notifications and offline support only when justified.

## 14. Acceptance criteria for first launch
- Customer can browse nationwide, filter, view details and contact a verified provider without signing in.
- Partner can register and draft, but cannot publish until verification and offer approval.
- One owner can manage several properties; staff only see authorized properties.
- No property exceeds three live offers on Starter.
- Pausing/ending is immediate; expiry and scheduling run automatically.
- First 100 approved verified properties get exactly one six-month trial per property.
- Reported issues reach admin; admin can hide suspicious offers immediately.
- Weekly newsletter requires confirmed consent and supports one-click unsubscribe.
- Public pages work on iPhone and Android browsers and can be installed as a basic PWA.
- Analytics distinguish views/clicks from bookings and protect property/customer privacy.
- No customer booking, offline functionality, push alerts, or active payments in V1.

## 15. Suggested ChatGPT implementation prompt
“I'm building Ayaale.com using Next.js App Router, TypeScript, Supabase, Tailwind CSS and shadcn/ui. Use the attached Ayaale V1 Build Plan as the authoritative product specification. Help me implement task T001 first. For each task, provide the files to create/change, schema/migrations if applicable, commands, security considerations, tests, acceptance criteria and a short verification checklist. Do not implement future tasks without asking. Keep code production-minded, responsive, accessible and SEO-friendly.”
