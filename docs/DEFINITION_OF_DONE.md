# Definition of done

A task is complete when its agreed acceptance criteria are met, changes are reviewable, relevant checks pass, and limitations are recorded. Do not mark planned or unprovisioned capabilities as implemented.

For every task, record:

1. Scope and files created/changed.
2. Schema/migrations, or explicitly “none”; describe rollback/data impact where applicable.
3. Exact setup/run/verification commands appropriate to the current foundation.
4. Security and privacy considerations, including authorization and secret boundaries.
5. Relevant tests and actual results; distinguish manual checks from automation.
6. Measurable acceptance criteria and a short verification checklist.
7. Unresolved decisions, external blockers and next-task approval boundary.

For UI tasks: responsive phone/desktop layouts, semantic landmarks, keyboard navigation, visible focus, labelled inputs, accessible errors, contrast and appropriate loading/empty/error states. Apply the detailed standards defined by T002.

For public-page tasks: server-rendered useful content, metadata/canonical handling, deliberate indexability, appropriate structured data and optimized images. Do not expose expired availability.

For data/API tasks: validate inputs on the server, enforce property membership and roles, apply/test RLS, protect personal information, and handle retries/concurrency where relevant. Never rely on client checks alone.

For code tasks after T005: run the applicable formatter/lint/type/unit/e2e checks provided by the project; record failures honestly. Do not add empty tests merely to claim coverage. For documentation-only tasks: verify file links, scope, task coverage, ignored secrets and repository diff.

Ask before starting the next task.
