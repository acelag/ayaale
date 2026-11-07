# Verification before T015

Requested review of the current implementation; no T015 work was started.

## Finding fixed

Privileged Supabase calls had no explicit upstream deadline. A stalled Storage request could keep a local image-processing slot occupied after decoding. Added lib/security/timed-fetch.mjs and its declaration, wired it into the server-only privileged SDK client and added two regression cases. Requests now abort after 15 seconds, preserve caller cancellation and use no-store caching. An actual development Supabase read with the new adapter passed.

Upload cleanup now runs only for object paths whose writes were attempted. Invalid image bytes no longer cause unnecessary Storage delete calls. Cleanup exceptions do not mask the original error or prevent finally from releasing the slot. Crashes or unsuccessful cleanup may still leave orphaned objects, as documented; this is not a cross-service transaction.

## Results

| Verification                                            | Result                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Formatting / lint / strict types                        | Pass                                                                                                          |
| Unit tests                                              | 16 pass, including two new upstream request tests                                                             |
| Database migrations, constraints, RLS and authorization | 92 pass                                                                                                       |
| Production build and desktop/mobile browser tests       | 16 pass                                                                                                       |
| Contrast checks                                         | 20 pass                                                                                                       |
| Isolated real database dump/restore drill               | Pass: sentinel, audit, grants/RLS, staff scope, billing/anonymous denial, bucket catalogue                    |
| Hosted read-only permission inspection                  | Pass: browser budget RPC denied, service audit DELETE denied, photos private, all application tables have RLS |
| Hosted advisors                                         | INFO only: two intentional no-policy tables and unused indexes; no warning/error                              |
| Current production dependency audit                     | 0 reported vulnerabilities                                                                                    |
| Full dependency audit                                   | 16 moderate development-tool advisories remain; no high/critical                                              |
| Secret in generated browser assets                      | 0 matches                                                                                                     |
| .env.local isolation                                    | Ignored, untracked, mode 0600; no value displayed                                                             |
| git diff --check                                        | Pass                                                                                                          |

No hosted schema or live account changes were needed during this review. No real email was sent. The disposable database cluster was stopped after testing; the normal app remains on port 3000. Unit/browser checks were repeated after the timeout change; database/recovery checks remain applicable because that fix changes no database behavior.

## Remaining boundaries

The local restore drill is not a hosted disaster-recovery test. Operational encrypted off-site backups, RPO/RTO and operator ownership remain T055. Application signup quotas/honeypot do not constrain direct requests to Supabase's public Auth endpoint; provider-level CAPTCHA/abuse settings must be verified alongside the T024 public signup release. These remain explicit release gates, not newly completed features.

The development-tool advisories were reported rather than applying forced major dependency upgrades during verification. They do not appear in the production-only audit, but still need a deliberate tooling upgrade/review. Live uploaded object restore/throttle checks were completed in T014; this review additionally checked current hosted ACLs and the new SDK timeout adapter.
