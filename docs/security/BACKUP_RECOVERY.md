# Backup and recovery runbook

## Verified scope and remaining setup

The T014 drill verifies an isolated synthetic PostgreSQL database can be dumped/restored with its data, audit evidence, RLS, grants and role isolation intact. A separate synthetic private Storage object was downloaded, deleted, restored from the byte copy and checksum verified. Both are recovery checks, not an off-site backup service or hosted-project disaster-recovery test.

According to [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups), Free projects should regularly export with the CLI and maintain off-site copies. Database backups do not include Storage object bytes; restoring metadata cannot resurrect deleted files. Custom-role passwords are also not included in daily downloadable backups. No paid backup/PITR plan was enabled.

A scheduled hosted export, encrypted off-site destination, retention schedule, operator ownership, restore credentials and measured RPO/RTO remain T055 launch work. Do not claim the current development project has operational backups just because migrations or local test dumps exist. No full hosted database export/restore was attempted; the app API secret is not a database connection password. Never test destructive recovery against the live project.

## Repeat the safe local drill

Use a disposable loopback ayaale_test PostgreSQL base database, matching or newer pg_dump/pg_restore than the source server, and pinned Node 24:

```sh
AYAALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/ayaale_test \
PG_BIN_DIR=/opt/homebrew/opt/postgresql@16/bin \
npm run check:recovery
```

PG_BIN_DIR is optional when compatible tools are on PATH. The command rejects hosted/non-loopback targets through the database harness. It creates a random source and a separate random restore database, uses real custom-format pg_dump and pg_restore --exit-on-error, and checks a sentinel record, audit counts/immutability, RLS, staff property isolation, billing denial, anonymous denial and the bucket catalogue. The harness Auth/Storage catalogues are minimal fixtures, not the full hosted Supabase system.

The temporary directory is 0700 and dump 0600. Child-process database passwords use environment variables, never command arguments or printed command text. A SHA-256 is reported to identify the tested archive; it is not evidence of ongoing backups. Source/restore databases and archive directory are removed in finally. Failed cleanup needs manual investigation using only the reported/random test names; never drop an unrelated database. CI's regular database tests remain enabled, while this separate drill requires compatible local PostgreSQL binaries and is not claimed as a hosted CI run.

Actual T014 local result: PASS for every listed check. The synthetic archive was removed after the drill. No recoverable copy of hosted user data was retained.

T055 adds tested archive encryption and a proposed operating procedure in [OPERATIONS.md](OPERATIONS.md). Hosted exports, off-site storage, scheduling and a full restore drill remain pending; encryption tooling alone is not an operational backup.

## Before configuring real backups

1. Assign an operator and approve environment-specific RPO/RTO and retention. Choose an encrypted off-site destination and access/rotation policy. Keep production and development archives separate.
2. Check the installed CLI help: npm exec --yes --package=supabase@3.0.0 -- supabase db dump --help. Version 3 is local by default and requires an explicit --remote target. Obtain database access through the approved secret mechanism, not chat or checked-in files. Never reuse the app secret as a database password.
3. Export the necessary schema, data and roles under the provider's current documented restore procedure. The CLI supports --role-only, --data-only, --use-copy, --schema and --file; managed schemas/roles have special handling, so do not assume an app-schema-only export is a complete hosted backup. Pin/test the exact command set on a separate project before scheduling.
4. Export Storage bytes independently with an inventory of bucket, path, content type, length and SHA-256. Include every referenced variant. Encrypt archives and manifests; do not put secret keys, raw signed URLs or auth tokens in them. Verify upload metadata against restored bytes.
5. Preserve the migration/version, app commit, configuration variable names, bucket privacy/limits, Auth redirect/provider setup and restore prerequisites separately. Store secret values only in the approved secret system. Code history alone does not back up runtime data.
6. Restore into an isolated, non-public environment with sending/jobs disabled. Confirm database ownership/grants, all RLS policies/functions, Auth behavior, memberships, immutable trial eligibility, approved revision pointers and audit evidence. Restore objects through the Storage API and recheck private access and checksums.
7. Reapply erasure/suppression decisions made after the backup, before enabling email or public reads. A backup must not resubscribe a withdrawn address, recreate revoked staff/admin access, recycle a trial or resend an already delivered campaign.
8. Rotate/reconfigure credentials as needed, reconcile queued jobs/idempotency keys, invalidate stale caches, and measure actual recovery time. Enable traffic/jobs only after a reviewed acceptance checklist. Record findings and repeat drills periodically and after material schema/storage changes.

No hosted restoration, new service, off-site upload or paid retention feature is authorized solely by this runbook. T055 operational setup still needs the owner's decisions and authorization.
