# T059 — Customer-review exploration and proposed verification approach

Exploration completed 8 November 2026. This is a decision proposal, not a review feature, approved policy or launch authorization. The authoritative plan excludes public reviews/ratings from V1 and the first approximately six months. That period refers to actual launch, not the date this document was written; elapsed time alone does not authorize activation. Existing optional Google reviews links and private issue reporting remain the current product behavior.

## Product constraint and recommendation

Ayaale introduces visitors to businesses but does not verify booking completion, attendance or payment for the visitor's experience. A call/WhatsApp click, email confirmation, newsletter membership, partner invitation or verified-business badge is not proof that a customer visited or purchased. T058's proposed fees are subscriptions paid by property owners, not evidence of visitor stays/meals/day outs.

Recommendation: retain the current Google reviews link during V1. After the operating/legal/moderation decisions below are approved, consider a small **text-only** native review pilot using confirmed reviewer contact plus independently assessed experience evidence. Do not start star ratings, rankings or aggregate scores in that pilot. If fair, privacy-preserving evidence checks and support capacity are not feasible, keep native reviews deferred.

“Verified by Ayaale” must remain a separate business-identity/authority concept. Do not reuse that badge on reviewers or describe an evidence check as a guarantee that every claim in a review is true.

## Verification alternatives

| Approach                                                         | What it establishes                                             | Limitations and decision                                                                                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing outbound Google reviews link                            | Directs visitors to an external review service                  | No Ayaale authenticity guarantee; no copying/importing ratings. Recommended current state.                                                            |
| Confirmed email only                                             | Control of an inbox at the time of confirmation                 | Does not prove a visit or unique person. Insufficient for a verified-experience label.                                                                |
| Partner invitation or confirmation                               | A partner says the reviewer had an experience                   | Positive-selection bias, collusion and veto risk. Supplementary evidence only; must not be the exclusive route.                                       |
| Private redacted receipt/reservation plus independent assessment | Evidence reasonably consistent with a particular experience     | Can be forged, sensitive and exclusionary to cash/no-receipt customers. Candidate pilot approach with alternatives and human review.                  |
| Trusted booking/transaction integration                          | Stronger linkage to a completed event if the source supports it | Not currently available; provider consent, data access and future booking scope must be approved separately. Do not implement T061 to enable reviews. |

The candidate evidence approach is an inference for Ayaale's current product model, not a claim of guaranteed fraud detection. Define acceptable alternatives before launch so lack of a digital receipt or a business's refusal to cooperate does not automatically disqualify an otherwise credible negative experience.

## Proposed eligibility rules — require owner approval

1. The writer confirms a contact email through the selected authentication mechanism. A private reviewer identity is distinct from the optional public display name. Public browsing still requires no account.
2. The writer identifies a real property and the approximate experience date. Proposed pilot window: within 90 days, subject to approval and fair exceptions. A review about the business is not proof that an Ayaale offer was redeemed; label those claims separately.
3. A moderator assesses minimal evidence consistent with the claimed experience. Use receipt/reference/date/category fields rather than unredacted payment or identity documents. Do not collect card numbers, CVVs, government IDs, unrelated guest names or medical information. Never ask for bank credentials.
4. Declare employment, ownership, close affiliation, competitor relationships and incentives. Exclude self-reviews, sample businesses and undisclosed conflicts under the approved policy. Do not assume an affiliation check detects every conflict.
5. Permit one published review per accepted experience; edits supersede the current text rather than creating extra votes. Define experience matching, duplicate appeals, retention and repeat-visit limits before coding. Do not impose an unreviewed permanent cross-account tracking scheme.
6. Evidence acceptance is independent of rating sentiment and a business's commercial plan. A business cannot approve, rewrite or veto a customer's submission. Give equally accessible submission routes and reasons for moderation outcomes.

The public label, if adopted, should explain only the actual check, for example “Experience evidence checked,” with a short limitations explanation. “Verified booking,” “verified purchase” and “guaranteed genuine” are unavailable claims without an appropriate reliable source. Email control is not proof of legal identity or age; age eligibility and handling of minors need a separate approved policy.

## Proposed submission and moderation flow

`Draft → contact confirmed → awaiting evidence review → awaiting content moderation → published / changes requested / rejected / withdrawn`.

Evidence and content decisions are separate. Submission does not immediately publish; property admins cannot grant publication. A successful email link only confirms the intended operation, not the experience itself. Use current authentication protections, authorization, short-lived purpose-bound tokens where applicable, rate limits and replay protection; do not create a new email-token system until its security design is reviewed. General authentication guidance: [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

Moderate positive and negative text under the same published policy. Remove or redact personal contact details, threats, discriminatory abuse, unrelated content and unsupported impersonation. Disagreement with a business is not by itself a rejection reason. Give the writer a reason and a revision/appeal route; retain restricted version/decision history without retaining unnecessary raw evidence indefinitely.

Separate safety complaints from reviews. Existing private reports and urgent hiding/investigation controls remain available, including to people ineligible to publish a review. Do not automatically suspend a property, publish an allegation or remove a negative review based on raw report/review volume. Sensitive allegations need trained review and an appropriate escalation procedure.

Businesses may submit one moderated response to published text, using current owner authorization. Responses cannot reveal private customer information. Editing a review/response creates a new moderated version; the display policy for a pending revision must be defined. Appeals should be reviewed by someone other than the original decision maker when practical; provide conflict escalation for a small team. Proposed internal review targets and operating hours must be agreed rather than advertised as an existing SLA.

## Privacy and abuse controls

- Public content: approved display name, approved text, coarse experience date and a precisely explained evidence-check label. Never publish receipt images, emails, payment references, room numbers or private moderator notes.
- Private evidence: isolated protected storage, authorized moderator access only, bounded uploads with MIME/byte/pixel validation, metadata stripping, malware/content handling appropriate to the accepted formats and short-lived read access. Start with no evidence attachments until storage/retention/access checks are implemented.
- Identity/access: a writer can manage only their own submissions; business owners/staff cannot read evidence, writer email or another property's moderation queue. Do not silently make existing property staff into review moderators.
- Retention: choose a concrete evidence-deletion period, appeal hold, identity deduplication retention and backup-erasure reconciliation before collection. Email hashes remain linkable personal information; hashing is not anonymization. Restrict access and avoid indefinite retention merely for convenience.
- Abuse: bounded per-identity/property/request budgets, duplicate evidence/review assessment, suspicious-velocity signals and human investigation. Avoid IP-only identity, device fingerprinting or automatic guilt from a shared household/network. Never expose whether an email has reviews through error messages.
- Security/audit: redact token-bearing URLs, evidence and raw personal data from logs; audit actor/target/outcome rather than copying content everywhere. Rate-limit reports and appeals while preserving a route for genuine safety concerns.
- Independence: no payment, discount or subscription benefit for a positive review, editing/removing criticism or prioritized favorable moderation. Do not selectively invite only happy customers. Google's external service also prohibits fake/incentivized engagement and suppression or selective solicitation of negative/positive reviews; those are Google rules, not an assumed legal standard for Ayaale. [Google contribution policy](https://support.google.com/contributionpolicy/answer/7400114?hl=en).

Operator, privacy/contact details and review-policy/legal publication decisions remain unresolved in the existing legal checklist. This exploration does not establish legal compliance or change the owner's instruction to retain placeholders. Obtain the appropriate review before publishing policy or collecting evidence.

## Ratings, search and external reviews

For the proposed initial pilot, publish no star average or ranking score. If ratings are later authorized, decide the scale, minimum sample disclosure, denominator, version/edit rules, hidden/withdrawn treatment and appeal outcomes first. Report only actually published eligible ratings; never show a made-up zero/5 score, combine Google and Ayaale counts, buy ratings or weight results by subscription spend. Evaluate bias and accessibility before any ranking.

No review/rating structured data is added now. Future markup must describe content actually visible on the page and comply with current search-provider eligibility rules, which must be checked at implementation. Do not assume rich-result eligibility. Do not scrape/import Google reviews, ratings, profile photos or reviewer identities as an implementation shortcut; any licensed integration would need its own current terms/attribution review.

## Proposed implementation outline — not authorized work

Possible private records: reviewer identity/contact, property/experience eligibility decision, private evidence asset metadata, review versions, moderation/appeal decisions, business response versions and security audit. Public projection: only the current approved published version and safe display fields. No tables, buckets, policies or migrations are created by T059.

If a pilot is approved, define narrow owner/writer/moderator roles, private evidence RLS/storage policies and anonymous read projection first. Use an explicit review relation, rather than reusing offer approval revisions, partner-verification evidence or complaint rows as public reviews. Keep billing/trial allocation independent of sentiment and review counts. Public/read routes need pagination, no-store or safe invalidation on moderation, accessible text/forms and no unauthorized data in metadata.

Candidate files for a later explicitly requested implementation: `lib/reviews/` for eligibility/moderation/data projections; authenticated submission/management routes; dedicated admin moderation and appeal views; a safe published-review component on property profiles; CLI-generated reviewed database migrations/types; tests and operator/privacy documentation. Paths/API contracts are provisional until identity, evidence and policy decisions are approved. Do not add dummy forms, public review endpoints or “coming soon” promises to V1 as part of this exploration.

## Test and pilot acceptance plan

| Area                | Required checks before a future pilot                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eligibility         | Email-only/contact-click/partner-invitation cannot claim a verified experience; missing/expired/conflicting evidence has an understandable resolution route   |
| Identity and access | Unconfirmed users, token replay, removed roles, cross-writer/property IDs, staff access and public evidence reads denied; no email enumeration                |
| Evidence            | Oversized/spoofed files, metadata, malicious content, private signed links, access expiry, deletion and backup reconciliation                                 |
| Fair moderation     | Same rules for praise/criticism; business cannot veto/edit; moderator conflict handled; edits require review; appeal decisions versioned                      |
| Abuse               | Duplicate/multiple-account attempts, repeat experience reuse, shared networks, incentivized/conflicted content, report floods; no automatic suspension        |
| Privacy             | Public projection/metadata/logs contain no evidence/email/private notes; minimization and actual retention behavior verified                                  |
| Experience          | Empty/pending/rejected/withdrawn states, accessible labels/errors, keyboard/focus, 200% text, phone/Safari and safe retry behavior                            |
| Statistics          | No ratings until authorized; any later averages/counts exclude ineligible/unpublished entries and update after moderation                                     |
| Operations          | Named trained moderators, support/appeal ownership, independent decisions, documented response targets and restoration without republishing withdrawn content |

Use only synthetic text and evidence in implementation tests. Do not seed fake published reviews onto the live service to fill empty states. A pilot needs consenting participants and actual observation of fairness/privacy/support workload, not just passing fixtures.

## Decision and verification checklist

- [x] Define what current signals can and cannot verify.
- [x] Compare plausible approaches and recommend keeping native reviews deferred during V1.
- [x] Propose future experience-evidence, moderation, appeals, privacy and abuse rules with limitations.
- [x] Describe future files/schema and a meaningful acceptance/test matrix without implementing them.
- [ ] Owner approves identity, evidence alternatives/labels, eligibility window, duplicate rules and pilot scope.
- [ ] Approve moderation/appeal staffing, legal/privacy publication and concrete retention decisions.
- [ ] Authorize a separate future implementation after the V1 launch/operational readiness review.

Document checks: `npx prettier docs/reviews/T059_CUSTOMER_REVIEW_APPROACH.md docs/tasks/T059.md --check` and `git diff --check`. No runtime test rerun is needed for documentation-only exploration; no assertion about working native reviews is made. T060–T061 remain unstarted.
