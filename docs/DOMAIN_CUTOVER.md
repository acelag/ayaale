# Ayaale custom domain — verified 8 November 2026

Ayaale is live at https://ayaale.com on its existing Free Render web service. https://www.ayaale.com redirects to the apex. Both domains are verified with certificates issued. Removing the retired admin.ayaale.com Render binding freed the second included domain slot; the Add Domain dialog no longer quoted an additional charge. No paid upgrade or additional domain charge was accepted.

## Changes

- Moved ayaale.com and www.ayaale.com from KadeCloud static service `srv-d9jgernaqgkc73bflccg` to Ayaale web service `srv-dbd0lagm7kps73d6afeg` in My Workspace.
- Removing the old www association also removed its apex redirect. Adding the apex to Ayaale created the reverse www-to-apex redirect.
- Retired admin.ayaale.com with the owner's explicit approval. Its GoDaddy CNAME is now absent in the observed DNS table. An attempted confirmation was blocked by automatic review; the next observation after external browser interaction already showed the record absent. The owner subsequently also explicitly approved deleting that exact unused DNS record. No retry was needed.
- Changed GoDaddy's www CNAME from `kadecloud-1.onrender.com` to `ayaale.onrender.com`, keeping its one-hour TTL. Preserved root A `216.24.57.1`, nameservers, Google verification TXT, DMARC and other records.
- Set `APP_ENV=production` and `NEXT_PUBLIC_SITE_URL=https://ayaale.com` through a merge update in Render. Dashboard/API configuration remains the source of truth for this existing service; do not apply the deferred paid `render.yaml` proposal.
- Preserved all unrelated settings and disabled indexing, analytics, newsletter signup/sending, transactional/test email and view tracking. The app still uses the free development database and displays Development preview; domain connection is not an approval to launch indexing or email.
- The separately approved exact Supabase callback `https://ayaale.com/auth/callback` remains alongside the preview and two local callbacks. Default Site URL remains localhost. No passwords, roles or broad wildcard destinations changed.

## Deployment and verification

Render deploy `dep-dbo25d49v7es73e3fl00` is live, built from `3c5df4a7a75c05d1bc84d7b9b89495dfc4519cce` on `codex/ayaale-v1-preview`. The service remains Free, Node, Singapore, with automatic deployment disabled. The onrender.com recovery address remains enabled.

- HTTPS homepage: 200, Ayaale content and canonical `https://ayaale.com`.
- HTTPS www `/partner?domain_check=1`: 301 to `https://ayaale.com/partner?domain_check=1`, preserving path/query.
- `/api/health`: 200 with `{"status":"ok"}`.
- Logged-out `/partner`: 307 to `/partner/sign-in`.
- Logged-out `/admin`: 307 to `/partner/sign-in?next=admin`.
- Protected routes have noindex headers; homepage metadata remains noindex/nofollow; robots disallows crawling.
- `https://www.kadecloud.com/`: 200 with its retained Render association. KadeCloud services and its root/www settings were not changed.
- Actual authenticated login, signup emails and delivery workflows were not exercised. Existing confirmed users can sign in on the custom domain.

Evidence: `/private/tmp/ayaale-custom-domain-live.png` and `/private/tmp/ayaale-free-domains-verified.png`. DNS caches may retain the old www target until TTL expiry.

## Recovery

Preserve the free preview URL and current database. Do not restore the old KadeCloud application build into Ayaale: its older schema expectations may differ. Reverting domain routing requires removing the current pair and reattaching it to the old service, checking the actual domain allowance before adding. Do not accept paid overage, delete either service, roll back database migrations or change unrelated DNS to reverse this move.

[Render domain settings](https://dashboard.render.com/web/srv-dbd0lagm7kps73d6afeg/settings#custom-domains), [live deployment](https://dashboard.render.com/web/srv-dbd0lagm7kps73d6afeg/deploys/dep-dbo25d49v7es73e3fl00).
