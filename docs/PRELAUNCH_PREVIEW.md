# Coming soon and private preview

Purpose: public visitors see Ayaale's branded Coming soon page while the owner can enter a private preview code to use the website. Preview access is separate from account authentication: administration, owner and staff pages still enforce normal login and authorization.

## Server configuration

- `PRELAUNCH_ENABLED=true` enables the gate. Default is false, preserving existing behavior until an explicitly configured deployment.
- `PRELAUNCH_ACCESS_CODE` is a protected **server-only** secret, 12–128 characters without whitespace. Prefer a long randomly generated code rather than a short PIN. Enter it directly in protected hosting settings; never commit it, add `NEXT_PUBLIC_`, put it in a URL or send it through chat/voice.
- With the gate enabled but no valid code configured, the public page still appears and private preview is unavailable. The full site does not open as a fallback.
- `NEXT_PUBLIC_SITE_URL` must be the trusted exact site origin; the form's Origin check and redirects use it. Use the canonical HTTPS domain on production.

After configuring and deploying, open the site, expand Private preview access and enter the code. A valid entry gives that browser an eight-hour signed HttpOnly, SameSite=Lax cookie. Production uses a Secure `__Host-` cookie. The code is not stored in the cookie or rendered into the page. Other browsers continue seeing Coming soon. Leave preview clears the cookie. Changing the code invalidates existing preview cookies; removing the code locks all private previews. Disabling the gate opens normal public browsing but does not change account roles, trials or billing.

## Protected scope

The request gate covers homepage, offer/property pages, partner/admin/auth pages, sitemap and application data/image endpoints. Hidden data is not merely covered by a visual overlay. Public direct links render the same Coming soon screen; application API requests without preview access return a generic 503. Non-GET writes without preview access also fail. Incoming auth-confirmation links need an unlocked browser; reopen the original link after entering the preview if necessary. Tokens/query values are not copied into a return URL.

Styles/scripts and static app icons remain loadable so the public page can work. The minimal health endpoint remains available. The existing Resend webhook remains available because it independently validates provider signatures; prelaunch mode must not break legitimate in-flight delivery callbacks. This exception is not a public preview bypass.

Coming-soon and preview responses use private/no-store and noindex headers. Robots disallows crawling, and the indexing policy refuses to enable sitemap/indexing while the gate is active even if the normal launch-indexing switch was set. The root layout does not mount optional visitor analytics in prelaunch mode. Search engines can take time to remove previously indexed material; no instant deindexing promise is made.

The access form requires the configured same origin, accepts only bounded URL-encoded POST bodies, limits read time/size, uses constant-time hashed comparisons and has a best-effort per-process attempt throttle. The throttle resets on restart and is not a distributed security control. The long random code is important. Additional instances or a higher-risk use case need shared durable rate limiting. Preview access never grants staff/admin identity or bypasses database authorization.

## Files and checks

- `app/coming-soon/page.tsx`: branded page, accessible expandable access form and error states.
- `app/preview-access/route.ts`, `lock/route.ts`: guarded unlock and lock operations.
- `lib/prelaunch/access.mjs`, `.d.mts`: code configuration, signing/verification, expiry and throttling.
- `proxy.ts`: whole-site gate followed by existing account session refresh.
- `app/layout.tsx`: preview status/leave control and optional analytics exclusion.
- `lib/seo/policy.mjs`, `.env.example`: indexing guard and server-setting examples.
- `scripts/prelaunch.test.mjs`, SEO test extension, `playwright.prelaunch.config.ts`, `tests/e2e/prelaunch.spec.ts`: forgery/expiry/rotation/configuration/throttling, direct-page/API protection, same-origin form, browser unlock/lock and independent admin authentication.

```sh
npm run check
npm run test:prelaunch
```

Browser tests use only a synthetic test code and local fixtures. Never reuse the test code on the live website. The separate local manual practice site and its data remain unchanged until their own restart; its temporary snapshot is not the production deployment.

## Release checklist

- [ ] Review the exact changes/commit and authorize publishing/deployment for the live gate.
- [ ] Enter the real private code directly in protected settings; leave analytics/indexing/senders in their approved states.
- [ ] Deploy the reviewed source with the gate enabled; verify anonymous homepage, deep links, API data and images remain gated.
- [ ] Verify a normal browser can unlock, account routes still require login, and Leave preview locks it again.
- [ ] Recheck an independent/private browser and mobile layout. Keep health and signed webhook behavior intact.

This change does not implement the separately discussed image-led offer card redesign, admin-led user/property creation or manual replacement of first-100 trial allocation. Those remain separate product changes. No live secret has been generated or disclosed by this implementation.

Local verification passed: 43 unit tests, formatting/lint/types and 20 contrast pairs; two desktop/mobile gate checks; 42 normal browsing/analytics/admin checks with the gate disabled. The tests caught and resolved a form-origin/referrer-policy conflict; same-origin submissions now work while foreign-origin submissions remain rejected. The live private code must differ from the synthetic test code.
