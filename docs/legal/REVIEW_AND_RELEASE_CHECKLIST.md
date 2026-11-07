# Legal review and publication gate — T006

**Status: internal working record. Drafting complete; professional legal review not obtained.** Operator/contact placeholders were retained at the owner's explicit request. No documents are published, no agreements accepted and no messages sent to a reviewer.

## Draft package

- [Privacy policy](PRIVACY_POLICY_DRAFT.md)
- [Website terms](WEBSITE_TERMS_DRAFT.md)
- [Business listing terms](BUSINESS_LISTING_TERMS_DRAFT.md)
- [Newsletter consent and message copy](NEWSLETTER_CONSENT_COPY.md)

The copy describes the intended V1 service. It must not be presented as a statement that unbuilt features, safeguards, deletions or integrations already work. No public routes, legal acceptance forms, cookies, analytics, newsletter sends, database fields or consent mechanisms were added by T006. The free-development budget decision is unchanged.

## Current Sri Lankan source check — 4 November 2026

The primary-source check found phased PDPA commencement, not a single fully operational regime. Gazette 2498/16 appoints 1 January 2027 for sections 2–3 and Parts I/III. The regulator's current notice says Parts II and VII are not yet operational. Recheck all applicable provisions and later orders at publication; do not promise a currently available statutory process or penalty based on an older March 2025 summary. [Gazette order](https://dpa.gov.lk/Gazet/2498-16_E.pdf), [DPA notice](https://www.dpa.gov.lk/notice.php).

Read the 2022 Act together with the 2025 amendment; the amendment changes matters including commencement, request handling and overseas processing. A Singapore region and standard vendor contract alone are not a completed transfer assessment. The DPA downloads page labels several regulations/directives as drafts; do not treat consultation drafts as final binding instruments. [2022 Act](https://dpa.gov.lk/acts/Data%20Protection%20Act%20SL%20-%20English%20%282%29.pdf), [2025 amendment](https://dpa.gov.lk/acts/22-2025_E_251104_201549%20%281%29.pdf), [DPA downloads](https://dpa.gov.lk/guidelines.php).

CAA Direction 91 appears in the regulator's published list and in the official Gazette search index. Its indexed text addresses e-commerce advertising and offer disclosures. Whether and how its platform obligations apply to Ayaale's service-only discovery/contact model requires counsel's analysis; no exemption is assumed because Ayaale has no checkout. In particular, check any disclosure, complaint and review-system requirements against V1's no-public-reviews rule before launch. Direct retrieval of the indexed Gazette PDF returned 404 during this check, so full-text verification remains outstanding. [CAA direction register](https://www.caa.gov.lk/web/index.php?Itemid=818&id=93&lang=en&option=com_content&view=category), [indexed official Gazette 2332/15](https://documents.gov.lk/view/extra-gazettes/2023/5/2332-15_E.pdf).

These are research notes and review questions, not a legal opinion or certification of compliance. No conclusion about CAA scope, controller status under every scenario or completed statutory compliance has been made.

## Required reviewer decisions

| Topic                    | Decision/evidence needed                                                                                           | State                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Operator                 | Actual legal/trading identity, registration status, address, support and privacy contacts                          | Placeholders retained by owner                        |
| Effective date and scope | Approved versions, languages, accessibility and publication timing                                                 | Open                                                  |
| Applicable law           | Current PDPA commencement, lawful bases, rights/complaint procedures, marketing rules, consumer/tourism rules      | Qualified review required                             |
| CAA Direction 91         | Obtain full current text; determine applicability, required disclosures and any conflict with no public reviews    | Qualified review required                             |
| Business authority       | Who may bind each business; evidence and fair ownership-transfer process                                           | Legal/product review required                         |
| Assent and updates       | Fair presentation, unchecked affirmative acceptance, accessible accepted versions, material-change handling        | Design/legal review required                          |
| Liability and disputes   | Fair risk allocation, non-excludable rights, governing law/forum; no arbitrary cap or unlimited indemnity inserted | Qualified review required                             |
| Subscription pricing     | Tax-inclusive/exclusive treatment, later paid cancellation/refund/renewal terms                                    | Unresolved; payments remain disabled                  |
| Verification claims      | Basic identity/authorization only, no quality/licensing/availability guarantee                                     | Wording drafted; confirm operational checklist        |
| Overseas processing      | Roles, contracts, support/subprocessors, countries and applicable safeguards                                       | Vendor/transfer assessment required                   |
| Privacy contact / DPO    | Assign responsible person; assess whether formal DPO/DPIA duties apply                                             | Open; no mandatory appointment assumed                |
| Retention                | Approve proposed limits and show deletion/suppression/backup controls can meet them                                | Not implemented or approved                           |
| Optional tracking        | Cookie inventory, lawful choices, GA4 configuration and newsletter click measurement                               | Deferred to owning tasks; no trackers enabled         |
| Children                 | Age/authority policy for signup, proportionate verification and handling accidental submissions                    | Review required; do not add DOB collection by default |

## Data-use and implementation handoff

The proposed retention values are product recommendations, not statutory periods: logs 30 days; identifiable offer/click events 90 days; non-identifying aggregates 24 months; pending newsletter requests 7 days with 24-hour confirmation tokens; verification documents reviewed 90 days after closure; other account/support/moderation records normally up to 24 months after closure. The privacy draft includes exceptions and suppression/backup handling. Do not turn these into production promises until the owner/reviewer approves them and deletion jobs exist. Minimized trial-allocation evidence must preserve the once-per-property rule without retaining unnecessary representative details.

Record a purpose, legal basis, source, required/optional status, public/private audience, permitted recipients, region, retention trigger and deletion owner for each data category when the schema is designed. Reporter identity and subscriber lists must be inaccessible to property staff. Do not collect customer messages/call contents, payment details or children's identities through contact-click measurement.

Supabase is currently development-only in Singapore. Render, the email provider and Google integrations are planned, not verified production processors. Capture actual vendor agreements/roles and support/subprocessor access before completing [[PROCESSOR_REGISTER_LOCATION]]. Do not equate “server-side only” or encryption with complete privacy compliance.

## Placeholder register

| Marker                                    | Required value                                              |
| ----------------------------------------- | ----------------------------------------------------------- |
| [[OPERATOR_LEGAL_NAME]]                   | Actual accountable business/person; do not invent a company |
| [[OPERATOR_ADDRESS]]                      | Verified business/contact address                           |
| [[SUPPORT_EMAIL]]                         | Monitored support inbox                                     |
| [[PRIVACY_EMAIL]]                         | Monitored privacy-request inbox                             |
| [[EFFECTIVE_DATE]]                        | Approved publication/contract date                          |
| [[EMAIL_PROVIDER]]                        | Selected actual email processor                             |
| [[PROCESSOR_REGISTER_LOCATION]]           | Approved accessible processor/region information            |
| [[PRIVACY_CHOICES_LOCATION]]              | Implemented accessible tracking-choice control              |
| [[BACKUP_RETENTION_AND_DELETION_PROCESS]] | Verified retention/restore/deletion procedure               |
| [[SUBSCRIPTION_TAX_TREATMENT]]            | Approved disclosure of applicable subscription taxes        |

## Release sign-off

- [ ] Owner confirms identity, contacts, proposed policies and pricing/tax disclosures.
- [ ] Qualified Sri Lankan legal reviewer records name, review date, document versions and required revisions.
- [ ] Resolve applicability questions and recheck official commencement orders/current rules at publication.
- [ ] Close placeholders; verify public policy against actual production data flows/vendors.
- [ ] Verify lawful processing/overseas arrangements and privacy-request escalation process.
- [ ] Verify retention, suppression, deletion, security and access controls with evidence from owning tasks.
- [ ] Verify marketing is optional, confirmed and separate from partner contract acceptance/essential notices.
- [ ] Verify accurate pricing, trial allocation and verification-badge disclosures in the actual interface.
- [ ] Publish only approved versions in an accessible layout; retain an internal version/review history.

Reviewer: not assigned · Review date: not set · Approved versions: none · Publication authorization: not granted.

Human legal review cannot be obtained from automated document checks. These remaining items are publication gates, not permission to build future features or a claim that T006 is fully complete.
