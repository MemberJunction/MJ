---
"@memberjunction/open-app-engine": patch
"@memberjunction/installer": patch
"@memberjunction/ng-explorer-app": patch
---

fix(open-app): `mj app` runtime-load + lifecycle correctness (server-side), plus installer/Explorer fixes

The next-applicable subset of the OpenApp lifecycle audit — runtime-load and install/upgrade/remove correctness — across three packages:

- **`@memberjunction/open-app-engine`.** Makes an installed Open App actually take effect and the lifecycle reversible/repeatable: installed server packages load at boot from `dynamicPackages.server[]` (and their generated GraphQL resolvers enter the live schema); install status + reinstall correctness (npm-install failure leaves the app `Disabled` not falsely `Active`; an `Error`-state app is reinstallable; rollback drops only a schema we created; migrations baseline so a `V1` migration is never skipped); atomic upgrade dependency rewrite; and remove data-safety (DB-first ordering, co-tenant shared-schema guard, and metadata cleanup committed in one transaction on PostgreSQL). Also removes an app's **own `Application` row on uninstall** — an app's metadata-sync migration registers an `Application` (fixed UUID) grouping its entities; removal previously left it orphaned, so a reinstall's migration re-`INSERT`ed the same UUID and failed on `PK_Application_ID`. Removal now deletes an Application **wholly owned** by the removed schema (best-effort, after the atomic metadata commit; an Application that also groups other apps' entities, or one with user-added dependents, is left intact and reused). +unit tests.

- **`@memberjunction/installer`.** The configure phase wrote a real `.env` (DB credentials, API keys) but emitted no `.gitignore`, so a freshly scaffolded project could commit secrets via `git init && git add .`. It now guarantees a `.gitignore` ignoring `.env`/`.env.*` (keeping `.env.example`); idempotent — appends only missing entries, never rewriting user lines.

- **`@memberjunction/ng-explorer-app`.** Fixes an MJExplorer login crash where `MJNotificationService.Instance` was read before DI constructed the singleton (surfaced by magic-link's instant, no-redirect login) — the service is now injected into `MJExplorerAppComponent` so it's constructed before `handleLogin` runs.
