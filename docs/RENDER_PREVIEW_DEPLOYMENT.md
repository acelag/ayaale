# Initial free Ayaale preview — 8 November 2026

This records the initial preview deployment. The later authorized custom-domain move is complete; see [current domain configuration](DOMAIN_CUTOVER.md). The staging origin and unchanged-domain statements below describe the earlier deployment only.

The owner authorized deployment to the existing free Ayaale Render service, leaving the domain's current KadeCloud site unchanged. The preview is now live at https://ayaale.onrender.com. This is a development preview using the existing free development database, not a production launch or an isolated paid staging environment.

## Deployed source and target

| Item                        | Verified value                                 |
| --------------------------- | ---------------------------------------------- |
| Workspace                   | My Workspace (`tea-d9jfttvavr4c73ceoi80`)      |
| Existing service            | `ayaale` (`srv-dbd0lagm7kps73d6afeg`)          |
| Plan / runtime / region     | Free / Node / Singapore                        |
| Repository                  | https://github.com/acelag/ayaale               |
| Branch                      | `codex/ayaale-v1-preview`                      |
| Deployed application commit | `de7de764cf6dfec8b672880f07fe4fe613b06562`     |
| Successful deployment       | `dep-dbno76mc6qcc73ee4cbg` — verified `live`   |
| Preview URL                 | https://ayaale.onrender.com                    |
| Health check                | `/api/health` — verified 200                   |
| Custom domains              | None on this service; domain routing unchanged |

[Render deployment](https://dashboard.render.com/web/srv-dbd0lagm7kps73d6afeg/deploys/dep-dbno76mc6qcc73ee4cbg), [published application commit](https://github.com/acelag/ayaale/commit/de7de764cf6dfec8b672880f07fe4fe613b06562).

The published branch is based on the existing remote history and contains the rebuilt source tree. The unrelated local scaffold history was not force-pushed. `main` remains unchanged. GitHub's connector was unavailable, so publication used GitHub CLI with the owner's browser authorization; its credential is stored in the system keyring. No credential was put in Git or chat. A repository-local Git credential helper supports subsequent pushes without changing other repositories' Git configuration.

Automatic deployment is off. A later push, including documentation changes, does not itself deploy. Trigger a manual deployment only when the intended source and configuration are ready. The deployed application commit above remains the verification reference even if the branch later gains documentation-only commits.

## Saved service configuration

| Setting                       | Value                                                                     |
| ----------------------------- | ------------------------------------------------------------------------- |
| Node version                  | `.node-version` pins 24.22.1                                              |
| Build command                 | `npm ci --include=dev && npm run build:render`                            |
| Start command                 | `npm run start -- --hostname 0.0.0.0`                                     |
| Health check                  | `/api/health`                                                             |
| Application environment       | `APP_ENV=staging`                                                         |
| Site origin                   | `NEXT_PUBLIC_SITE_URL=https://ayaale.onrender.com`                        |
| Supabase project              | Existing free `ayaale-development`, `buntpenbggavsoskhfnu`                |
| Indexing                      | `SEO_INDEXING_ENABLED=false`                                              |
| Google Analytics              | `NEXT_PUBLIC_ANALYTICS_ENABLED=false`                                     |
| Newsletter signup and sending | `NEWSLETTER_SIGNUP_ENABLED=false`, `NEWSLETTER_SEND_ENABLED=false`        |
| Optional email/test sending   | `TRANSACTIONAL_EMAIL_ENABLED=false`, `NEWSLETTER_TEST_SEND_ENABLED=false` |
| Offer-view collection         | `OFFER_VIEW_TRACKING=off`                                                 |
| Telemetry                     | `NEXT_TELEMETRY_DISABLED=1`                                               |

The existing `PORT` setting was preserved. No new service, instance upgrade, paid Blueprint, worker or cron job was created. The root `render.yaml` remains a deferred paid proposal; do not apply it for this free preview. Future environment changes must preserve unrelated values, avoid displaying secrets and account for Render's save/rebuild behavior.

The owner explicitly approved copying the existing Supabase publishable key and `SUPABASE_SECRET_KEY` from the ignored local environment into this service's protected settings. Only those two keys and the required public URL were transferred; email-provider keys and unrelated local settings were not copied. The privileged key is server-only. Database access still follows the application's role checks and controlled service functions. Keep Render dashboard access restricted.

The first automatic build initiated by saving public settings stopped because the required publishable key had not yet been supplied. After the owner's credential-transfer approval, both keys were saved and a new manual build succeeded. No successful deployment is claimed for the earlier failed build.

## Authentication callbacks

The owner separately approved adding these exact return URLs to the free Supabase development project's Auth configuration:

- `https://ayaale.onrender.com/auth/callback`
- `http://localhost:3000/auth/callback`
- `http://127.0.0.1:3000/auth/callback`

The dashboard was checked after saving: all three are present, without wildcards. The existing default Site URL, `http://localhost:3000`, was retained. The application explicitly supplies its configured callback for signup, so the preview can use its allowlisted return URL while local development remains supported. No password, provider, MFA or user-role settings were changed. No real confirmation email was sent during verification.

## Database and privacy boundaries

T031 property analytics, T047 newsletter editor and T048 dispatch migrations were applied individually to free development during preparation, and their function grants were inspected. Subscriber lists, reporting identities and drafts remain private. Newsletter sending remains disabled, and no provider message or campaign was sent.

The Supabase advisor scan retains its existing password-protection warning and expected deny-all private-table notices, including the two newsletter tables. No broader table grants or plan upgrade were added. The runtime-only npm audit reported zero vulnerabilities; Render's install warnings concerned development tooling and were not automatically fixed with breaking upgrades.

## Verification evidence

- The preview-specific production build passed before publication, and Render built the exact published application commit.
- The hosted health endpoint returned 200 with only `{"status":"ok"}`. Startup logs show the app listening on `0.0.0.0:10000`, with no startup errors in the inspected window.
- The deployed homepage rendered successfully against the development database. It currently shows no approved offers; this is an empty catalogue, not a failed feed.
- Pages remain noindex, robots disallows crawling, `/sitemap.xml` returns 404, and no Google Analytics loader is present.
- A response scan found no exposed server secret in the homepage. Logged-out `/admin` and `/partner` redirect to sign-in and include noindex headers. Missing public offers/properties return 404.
- The homepage was inspected in the browser, and a live screenshot was saved for the owner. The pre-deployment automated checks are recorded in T050.
- `ayaale.com` still redirects to `www.ayaale.com`, whose page title remains KadeCloud. No DNS or custom-domain setting was changed.
- Authenticated partner/admin browser activity and actual email delivery were not exercised during this deployment; the owner can sign in at the preview using an existing confirmed account.

The Render Dashboard also displays a pre-existing workspace payment-failed warning. The Ayaale service remains Free and no billing settings were changed; the workspace owner must handle any billing issue separately.

## Subsequent deploys and rollback

Use the existing service and manual deployment mode. Verify the exact source commit, environment flags, database compatibility and final `live` status before reporting a release. The health check is liveness only; a green endpoint does not prove all database or email workflows work. Recheck representative public and protected routes after each release.

A rollback of the application does not reverse the applied database migrations, Auth URL configuration or external state. The older October deployment used a different application; do not assume it remains compatible with the current database. Keep KadeCloud and its domain mapping outside this service's deployment operations. Production domain cutover, indexing, live email activation and later build-plan tasks require their own authorization.
