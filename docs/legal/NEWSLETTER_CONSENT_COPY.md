# Ayaale newsletter consent copy — draft

**Status:** DRAFT — NOT APPROVED FOR PUBLICATION OR SENDING. Copy and interaction requirements only; no signup form, email integration or campaign is implemented by T006. Keep operator/contact placeholders until confirmed.

Version: T006-draft-1 · Prepared: 4 November 2026

## Signup panel

Heading: **Discover Sri Lanka’s Best Deals Every Week**

Introduction: A Friday email with selected Stays, Dining and Day Out offers across Sri Lanka. Free to join. No customer account needed. We may skip a week if there are not enough suitable active offers.

Field label: **Email address**

Optional checkbox label, unchecked by default:

> Yes, email me Ayaale’s weekly Friday newsletter with selected Sri Lankan offers. I can unsubscribe at any time.

Button: **Send confirmation email**

Supporting notice:

> We’ll email you a confirmation link before subscribing you. Read our Privacy Policy to learn how [[OPERATOR_LEGAL_NAME]] uses your email and newsletter link activity. Joining is optional and is not required to browse offers or list a property.

Link the words Privacy Policy to the approved public policy when that route exists. Do not link users to this internal draft or substitute an “I agree to all terms” checkbox for marketing choice. A dedicated newsletter form can require the marketing checkbox before its own confirmation request; it must never be required for an unrelated service.

## Validation and submission states

- Empty/invalid email: “Enter a valid email address.”
- No marketing choice selected: “Tick the box if you’d like to receive the newsletter.”
- Loading: “Sending…”; keep the button width and announce progress politely.
- Submitted: “Check your inbox. If this address can receive a confirmation, we’ll send you a link. You won’t receive the newsletter until you confirm.”
- Rate limit: “Too many requests. Please try again later.”
- Temporary error: “We couldn’t send your request. Please try again.”

Do not reveal whether an address is already subscribed, suppressed or linked to a partner account. Do not automatically resubscribe an unsubscribed address. An explicit new signup still requires confirmation.

## Confirmation email

Subject: **Confirm your Ayaale newsletter subscription**

Hello,

Someone requested Ayaale’s free weekly newsletter for this email address. Confirm below if you’d like selected Sri Lankan Stays, Dining and Day Out offers, normally sent on Fridays.

Button: **Confirm subscription**

You can unsubscribe at any time. If you didn’t request this email, ignore it; you won’t be subscribed. This confirmation expires in 24 hours.

[[OPERATOR_LEGAL_NAME]] · [[OPERATOR_ADDRESS]]

Privacy Policy · [[SUPPORT_EMAIL]]

Use the 24-hour expiry only if the implementation enforces it. Opening an email or merely loading a link must not silently activate a subscription through a security scanner. The confirmation screen must make the final action clear.

## Confirmation screen

Heading: **Confirm your weekly Ayaale email**

Text: “Get selected Stays, Dining and Day Out offers from across Sri Lanka, normally on Fridays. You can unsubscribe whenever you like.”

Button: **Confirm subscription**

Success heading: **You’re subscribed**

Success text: “Look out for Ayaale’s next Friday selection. Every newsletter includes an unsubscribe option.”

Expired/invalid link: “This confirmation link is no longer valid. You can request a new one from the newsletter signup.”

Unsubscribe after confirmation but before the first newsletter must work. Repeated confirmations must not duplicate a subscriber or alter an earlier consent record.

## Newsletter footer

> You’re receiving this because you confirmed an Ayaale newsletter subscription. Offers may end or become unavailable; check the current offer details and confirm with the provider before making arrangements.
>
> Unsubscribe · Privacy Policy
>
> [[OPERATOR_LEGAL_NAME]] · [[OPERATOR_ADDRESS]] · [[SUPPORT_EMAIL]]

Offer links may include campaign attribution. Do not include the recipient's email address or other direct identifiers in analytics/UTM parameters. Do not enable email open-tracking pixels at launch under this draft policy. Link-click measurement must be disclosed and minimized. A required provider tracking feature is a release-review issue, not permission to enable it silently.

## Unsubscribe states

Success: **You’re unsubscribed**

Text: “You won’t receive future Ayaale newsletters. This does not close a partner account or stop essential account messages.”

Already removed/invalid token: “If this link is valid, newsletter delivery has been stopped. If you still need help, contact [[SUPPORT_EMAIL]].”

Support one-click unsubscribe through the email provider's compatible mechanism without login, password, a survey or a retention offer. Do not send a marketing “goodbye” email. Retain only the minimum suppression/consent evidence necessary to honor the choice. Never display an address belonging to another person on a token page.

## Evidence and later implementation checks

T010/T046/T048 must record the email, exact consent text/version, privacy-policy version, signup source/time, confirmation time, withdrawal time and delivery/suppression state. Keep consent history rather than overwriting the last choice. IP/device evidence should be collected only when justified and minimized, not indefinitely stored by default. Tokens must be unguessable, appropriately time-limited where applicable, protected from logs/analytics/referrer leaks and resistant to replay.

Before sending: exclude pending/unconfirmed, unsubscribed and suppressed recipients; recheck suppression immediately before dispatch; deduplicate retries and overlapping jobs. Use a separate unsubscribe mechanism for each recipient without exposing their address. Do not subscribe report senders, provider contacts, imported lists or all partner accounts merely because they supplied an email.

Future tests must prove unchecked-by-default choice, no marketing before confirmation, expired-link handling, no duplicate subscription, fresh consent for rejoining, unsubscribe without login, suppression after a scheduled campaign was queued and accessible error/loading/success messages. This document supplies requirements, not a schema migration or code for those tasks.
