# T060 — Destination newsletters, recommendations and paid placements

Consideration completed 8 November 2026. This document records options and a proposed sequence, not feature implementation or permission to send. V1 remains a nationwide newest-first feed and one manually curated mixed-category Friday newsletter containing five or six eligible offers. The plan explicitly excludes themed newsletters and paid newsletter placements at launch. T055 live sender/operational setup and T056–T057 real rollout evidence remain unfinished.

## Recommendation and order

| Option                                 | Potential value                                                     | Main cost/risk                                                                          | Proposed decision                                                                  |
| -------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Optional destination preferences       | More relevant offers without inferring where someone lives          | Preference privacy, thin destination inventory, consent and cross-variant deduplication | First candidate after a functioning baseline newsletter and real audience feedback |
| Rules-based recommendation suggestions | Reduce editors' selection work and surface eligible relevant offers | Stale/unsafe offers, repeated properties, feedback bias                                 | Second candidate; editor approval before any email selection changes               |
| Paid placements                        | Potential later revenue for clearly disclosed promotional inventory | Billing, contracts, trust, reporting, allocation fairness and stale paid content        | Defer pending separate commercial/readiness and implementation approval            |
| Behavior-based personalization/ML      | Potential relevance at larger scale                                 | Identity linkage, profiling, consent, cold-start, operational and service costs         | Not justified by current evidence; no new tracking or paid model service           |

These priorities are proposed product judgments based on Ayaale's current small/empty catalogue and unfinished live rollout, not measured uplift claims. Do not create new subscription plans, sponsor prices or guaranteed placement promises during exploration. The owner's free-only constraint remains.

## 1. Destination preferences

Start with a bounded set of existing district/destination labels selected voluntarily by the subscriber. This is a choice of content interest, not residence or live location. Do not infer it from IP, maps position, call/WhatsApp events, newsletter clicks or Google analytics. Do not add GPS collection, fingerprinting or a required customer account.

Before any implementation, approve a preference/consent explanation and whether selecting interests changes the promised weekly content. Existing consent is for one Friday mixed edition; do not silently create extra destination campaigns or declare the old consent proof of new profiling permissions. Keep a clear nationwide option, allow preferences to be removed and preserve a simple global unsubscribe. Preference management must not resubscribe a withdrawn/suppressed address. Confirm access to the relevant subscriber through a reviewed short-lived management flow; URLs and third-party analytics must not contain email addresses or preference details.

Recommended frequency rule: one weekly newsletter at most per subscriber across all destination variants. Multiple interests choose one combined edition; they must not produce several Friday emails. No match or insufficient eligible inventory should default to skipping that targeted send unless the subscriber explicitly chose a nationwide fallback. Explain skipped weeks; do not broaden silently or fill with expired/unverified offers. The final minimum count/category rule for themed editions must be explicitly approved rather than bypassing V1's five/six mixed-category validation.

### Existing constraints that require a reviewed redesign

The current campaign has a global weekly reservation, fixed ordered offer/revision selection, one delivery per campaign/subscriber, a sealed payload digest and stable provider key. Adding a destination field to subscribers is not sufficient. Creating a separate campaign per destination can conflict with the weekly uniqueness rule or cause duplicate sends.

Candidate architecture: retain one weekly parent edition with bounded audience/content variants and a unique weekly subscriber entitlement to one delivery. Freeze preference/consent version, chosen variant and rendered payload at the approved cutoff. Each delivery owns a stable fingerprint/provider key; a retry never silently changes its offers, subject or links. If a user changes preferences during an in-flight batch, a documented cutoff policy must determine whether the old delivery is cancelled or deferred; never send a now-disallowed variant merely because it was queued. Recheck withdrawal, reconfirmation, suppression and current content eligibility immediately before send.

If pinned content expires, pauses or loses entitlement/review eligibility, stop or cancel according to the existing safety policy; do not rerank and reuse the old provider idempotency key with new content. Future variant cancellation/replacement semantics need explicit tests. Preference management must not weaken one-click global unsubscribe or existing privacy-aware link handling. Gmail's current guidance supports opt-in/confirmation and easy unsubscribe, with specific authentication and one-click requirements for bulk senders; provider rules must be rechecked before activation. [Gmail sender guidance](https://support.google.com/mail/answer/81126?hl=en).

## 2. Automated recommendations

Separate editor assistance from personalized delivery. Proposed first step: a deterministic shortlist for admins using already-public offer attributes and explicitly selected destinations/categories, followed by human selection. No customer identity graph, inferred travel plans, sensitive attributes or browsing-history storage is needed.

Eligibility is a hard gate, never a score: verified/nonarchived property, approved current revision, current entitlement, publication window, Sri Lanka redemption dates and other existing visibility constraints. Reapply those gates when rendering/sending; a stale cached recommendation cannot make a paused/hidden/expired offer visible.

Among eligible candidates, use a documented bounded ruleset: explicit destination/category match, reasonable recency and property diversity, with a stable tie-breaker. Avoid arbitrary quality claims and popularity scores distorted by staff/test traffic or small samples. Do not rank someone as a likely high spender or infer family/health/religious characteristics from offer categories. The existing nationwide homepage order and two-consecutive-offers-per-business rule remain unchanged unless a future task explicitly revises them.

Explain suggestions simply, such as “Matches your selected district,” only when that is true. Provide an editorial/manual fallback and an off switch for new suggestions without disabling required expiry checks. Do not describe a rules-based result as independently reviewed, personalized by a booking history or the best-value offer without supporting evidence.

For email, automated suggestions cannot bypass campaign sealing or mutate a retry payload. For a future public recommendations panel, validate pagination/cache invalidation and fallback behavior independently from the canonical newest-first feed. No embeddings, vector schema, model API, background worker or recommendation endpoint is added by this task.

## 3. Paid placements

Treat paid visibility as a separate product and commercial decision, not a higher subscription tier automatically granting search rank. T058 currently designs property subscription payments only; it does not implement advertising orders, budgets, refunds or sponsored inventory. Completing it would not by itself authorize paid placements.

Proposed rules if later approved:

- Clearly label every paid item “Sponsored” at its actual placement, including mobile and email, using accessible text. Do not rely on color, a tooltip or a distant disclosure. Do not blend it into organic recommendations without explanation.
- Keep verification/content/expiry/entitlement gates identical to organic content. Paying cannot purchase verification, override a hidden offer, bypass review or guarantee customer outcomes.
- Agree inventory/surface, start/end in Asia/Colombo, impression/click definitions, caps, price/taxes, conflict/fairness rules, failure/cancellation/refund treatment and approved creative before accepting payment. No terms or prices are invented here.
- Propose one visibly separate sponsor slot in a future pilot rather than modifying the default organic feed order. The operator must approve whether newsletter inventory is separate from or replaces an editorial slot; do not quietly exceed edition size or duplicate an offer.
- Reserve inventory atomically and make settlement/placement activation idempotent. Concurrent purchases must not oversell a slot. A failed/cancelled/unverified payment cannot activate it; a settled payment for ineligible content requires the agreed remedy, not automatic publication.
- Define how expiry, business suspension, subscription lapse, content edits, outage or withdrawn consent affect scheduled/partially delivered placements. Use an auditable make-good/refund procedure rather than resurrecting an ended offer.
- Report only measured eligible impressions and recorded clicks, with bot/test/repeat/collection limitations. No booking, sale or unique-person promise. Businesses receive their own aggregate placement results, never subscriber emails, individual click trails or private targeting lists.

Disclosure, contracts, privacy/tax and billing decisions need appropriate review under the existing publication/readiness process. This document is a proposed product policy, not a legal-compliance conclusion. No sponsor campaign, agreement, payment or public label is created now.

## Future schema and file outline — provisional, no migration

| Area        | Potential additions                                                                                         | Preserved constraints                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Preferences | Private bounded preference choices, versioned choices/consent evidence and restricted management projection | No public audience/address lists; no implicit opt-in or suppressed-address reactivation          |
| Variants    | Parent weekly edition, immutable approved variant content, weekly subscriber delivery uniqueness            | Stable payload/provider keys, Friday semantics, suppression/expiry checks and global unsubscribe |
| Suggestions | Versioned rules/configuration and safe editor shortlist projection                                          | Existing eligibility/authz, no sensitive profile, no raw analytics/user data in prompts or logs  |
| Placements  | Private agreement/order/reservation/delivery/settlement linkage and aggregate reporting                     | Explicit activation/expiry, no overselling, only own business reporting, no billing bypass       |

Likely future source areas: `lib/newsletter/` preference/variant planning, subscriber preference-management routes, existing admin newsletter editor preview/approval, `lib/recommendations/` eligibility-first suggestions, and a separate `lib/placements/` domain only after commercial approval. Add reviewed CLI-generated migrations/types, narrowly scoped read/write functions, privacy copy and operator procedures at implementation time. Do not duplicate newsletter subscriber identities or reuse private analytics events as targeting eligibility.

No new records, flags, secrets, SDKs, queues, analytics dimensions, tracking cookies, routes, tables or buckets are created by this exploration. Readiness of Supabase/Render/email features would be verified against current docs if implementation is later authorized.

## Test matrix for a later implementation

| Area                 | Meaningful acceptance tests                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preferences/access   | Another subscriber cannot read/change choices; token replay/expiry and enumeration attempts handled; no account required for browsing; withdrawal/reconfirmation rules preserved          |
| Consent/frequency    | Multiple interests/overlapping variants/concurrent workers produce at most one weekly delivery; global unsubscribe blocks all variants and retries; preference changes cannot resubscribe |
| Inventory/content    | Sparse/empty selection skips safely; invalid/expired/suspended/cap-ineligible content never published/sent; no unchosen fallback or unauthorized rule relaxation                          |
| Retry integrity      | Same recipient/edition retains exact payload and provider key; failed/changed/expired payload is stopped rather than mutated under that key; out-of-order callbacks remain idempotent     |
| Suggestions          | Deterministic matches/tie-breaks, property diversity, no negative visibility bypass, safe cache invalidation, empty/error fallback and accurate explanation                               |
| Sponsorship          | Accessible labels in every surface, organic order preserved, no expired creative, atomic final-slot reservation, verified settlement once and agreed cancellation/refund handling         |
| Privacy/reporting    | No address/preference/token leakage in public responses, logs or UTM links; only owner-scoped aggregate reports, test/bot limitations disclosed                                           |
| Device/accessibility | Keyboard and screen-reader preference/preview flow, enlarged text, narrow/mobile/Safari, plain-text/HTML email labels and unsubscribe controls                                            |
| Operations           | Current sender quotas/cost caps, alerts, reconciliation, delivery/suppression, retention/backup erasure and safe feature-off behavior                                                     |

Test with synthetic subscribers, preferences and sponsor orders; no live customer targeting or paid acceptance to populate a demo. Keep field evidence separate from fixture/lab success.

## Pilot decision and success criteria

Before building anything, finish a working baseline newsletter and review actual cohort feedback: what destinations people explicitly request, whether there are enough fresh eligible offers, and whether the operator can moderate variants. Then approve one bounded hypothesis, audience, review window, frequency, costs and rollback conditions. Do not mark a date as started without actual delivery.

For a future destination pilot compare recorded clicks per delivered message and unsubscribe/complaint/suppression rates over comparable windows, with audience selection and small-sample limitations. This is engagement, not booking conversion. No open-tracking pixel or cross-site attribution is needed. Predefine baseline, minimum useful sample and stop conditions; report insufficient evidence instead of manufacturing uplift or sending extra messages to enlarge the sample. Suggested stop signals include any unauthorized recipient/variant, repeated delivery, privacy leak or ineligible offer; deliverability deterioration requires operator investigation.

Recommendation pilots can first measure editorial time saved, eligibility failures, diversity and reasons for overrides without sending personalized messages. Paid-placement pilots need approved measurement/contract definitions and actual commercial readiness first. No numeric success threshold is claimed as a universal industry standard or existing business result.

## Acceptance and verification checklist

- [x] Compare the three requested ideas, dependencies and costs/risks.
- [x] Recommend a staged, explicit-preference-first approach while preserving V1.
- [x] Specify privacy, consent/frequency, eligibility, retry, sponsorship disclosure and authorization constraints.
- [x] Outline future schema/files and meaningful test/measurement criteria without implementing features.
- [ ] Owner selects a specific later pilot and approves revised newsletter/product/privacy rules.
- [ ] Verify live operations, real audience/inventory evidence and any commercial/provider costs.
- [ ] Separately authorize and implement the chosen pilot; review evidence before further expansion.

T060's consideration artifact is complete; the proposed decisions are not approved and none of these capabilities is active. T061 remains unstarted.
