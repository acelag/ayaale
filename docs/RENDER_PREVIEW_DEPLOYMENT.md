# Free Ayaale preview deployment — 7 November 2026

Owner authorization: deploy the rebuilt Ayaale to its separate existing Render service, leaving the domain's current KadeCloud site unchanged. Do not apply the deferred paid two-service Blueprint, create replacement services, change custom domains/DNS, enable indexing or upgrade any plan.

## Confirmed target

- Render workspace: My Workspace (`tea-d9jfttvavr4c73ceoi80`).
- Existing service: `ayaale` (`srv-dbd0lagm7kps73d6afeg`), Free Node web service, Singapore.
- Preview URL: https://ayaale.onrender.com.
- Repository: https://github.com/acelag/ayaale, currently tracking `main` with automatic deploys on commits.
- Prior live deployment: `dep-dbd1r3e7bikc73a8vh6g`, source commit `4d032a99092669569c0761369a308e0f28ab32bb` (22 October). This is old source; triggering a deploy before publishing the rebuild would deploy that source again.
- `ayaale.com` redirects to `www.ayaale.com`, whose current page title is KadeCloud. Keep the domain assignment and DNS unchanged.

## Publication dependency

The GitHub connector was rechecked on 7 November: repository access is `pull=true`, `push=false`. This checkout now has `origin` pointing to the authorized repository, but no rebuild commit has been pushed. Source publication and deployment remain blocked until write access is available. Never work around a denied connector permission or expose an access token in chat, commands, source or logs.

After write access is restored, inspect the current remote branch and preserve remote history. Publish the reviewed rebuild on a `codex/` branch based on that history, retaining the intended removal of the old scaffold. Verify source and ignored-secret boundaries before publishing. Configure the existing Render service to that reviewed source; avoid publishing an intermediate revision to its auto-deployed `main` branch.

## Required existing-service settings

| Setting                 | Value                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan                    | Keep Free                                                                                                                                     |
| Runtime / region        | Keep Node / Singapore                                                                                                                         |
| Node version            | Use `.node-version` (24.22.1); remove conflicting override                                                                                    |
| Build command           | `npm ci --include=dev && npm run build:render`                                                                                                |
| Start command           | `npm run start -- --hostname 0.0.0.0`                                                                                                         |
| Health check            | `/api/health`                                                                                                                                 |
| App environment         | `APP_ENV=staging`                                                                                                                             |
| Site origin             | `NEXT_PUBLIC_SITE_URL=https://ayaale.onrender.com`                                                                                            |
| Supabase                | Existing free development project and its publishable key; privileged key server-side only for implemented features                           |
| Search indexing         | `SEO_INDEXING_ENABLED=false`                                                                                                                  |
| Google analytics        | `NEXT_PUBLIC_ANALYTICS_ENABLED=false`                                                                                                         |
| Optional signup/sending | `NEWSLETTER_SIGNUP_ENABLED=false`, `NEWSLETTER_SEND_ENABLED=false`, `TRANSACTIONAL_EMAIL_ENABLED=false`, `NEWSLETTER_TEST_SEND_ENABLED=false` |
| Offer view collection   | `OFFER_VIEW_TRACKING=off` for this preview                                                                                                    |
| Telemetry               | `NEXT_TELEMETRY_DISABLED=1`                                                                                                                   |

The Render connector can update environment variables and trigger deployment, but does not expose existing-service build/branch/health settings. Use the authenticated Dashboard for those settings. Keep secrets in Render's environment settings and copy only the required existing development credentials; never import all local environment values blindly. Public build-time values require a rebuild.

Use only the existing development database; do not connect production data to this preview. T031, T047 and T048 were applied to free development during this deployment preparation. Exact Supabase Auth site/redirect URLs must still be configured for the preview before partner authentication smoke checks. No new emails or marketing sends are authorized by publishing the preview.

## Verification before reporting deployment complete

- Record the exact reviewed source commit and new Render deploy ID.
- Wait for that deploy to reach `live`; a successful trigger is not proof of deployment.
- Verify `/api/health` returns 200 and exposes no credentials.
- Verify home, public detail/profile availability states, partner sign-in, and admin access protection against the actual development database.
- Confirm robots disallows indexing, pages remain noindex, `/sitemap.xml` is unavailable and optional Google/email/newsletter features stay off.
- Verify exact Auth callback URL for this preview, without broad redirect wildcards.
- Inspect startup/runtime logs for deployment errors without exposing secrets or personal data.
- Recheck that the live KadeCloud domain routing has not changed.

No deployment, environment change, service upgrade or domain cutover has been performed during preparation. The existing automated-test results are recorded in T050. Live preview verification remains pending source-publication access.

## Preparation verification

The preview-specific `build:render` passed using the existing development database configuration. Local checks of that built application passed: health 200, server-rendered noindex, robots disallow, sitemap 404, and logged-out admin/partner redirects. The temporary smoke-test server was stopped. A source scan found no literal values matching the configured local secrets or private-key headers in the selected source files; ignored credentials, Git history, generated output and dependencies are excluded from the release package. This is a credential-boundary check, not a proof that arbitrary source can contain no sensitive information.

T031 property analytics, T047 newsletter editor and T048 dispatch migrations were applied and their function grants inspected. Newsletter sending remains disabled, and no provider call or campaign send was performed. The Supabase scan reports the existing password-protection warning and expected deny-all private table notices, including the two new newsletter tables. No broader grants or plan upgrade were added.
