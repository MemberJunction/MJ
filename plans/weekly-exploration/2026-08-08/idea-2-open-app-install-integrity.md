# Idea 2: Open App Publish & Install Integrity Contract

**Week of 2026-08-08 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

MJ's Open App standard is the mechanism by which a small association's IT contractor, or a solo developer building a vertical for a niche nonprofit community, can distribute real, installable functionality without becoming a database migration expert. That promise only holds if installing an app is either a clean success or a clean no-op — never a database left half-written, with no way to know what changed or how to undo it. For an organization with no DBA and no staging environment budget, "the install failed, now what?" cannot have the answer "restore from backup and hope you took one this morning." And for the developer publishing the app, "will this work on a customer's two-year-old database, not just my fresh one" needs to be answerable *before* a customer finds out the hard way.

This is the same "improve the world through generic framework leverage" argument as last week's accessibility idea, aimed at a different, currently rawer part of the platform: the publish → install loop is where MJ's open ecosystem either compounds trust or erodes it, one install at a time.

## What already exists, and what this deliberately revises rather than "discovers"

This is a cluster of five real, currently-open engineering issues (#3619, #3618, #3547, #3546, #3561), all hit in the last two days while shipping real Open Apps (`bizapps-caliber`, `bizapps-accounting`, an MJ 6.1 fresh-install exercise), plus one in-flight design proposal (PR #3499) this idea is meant to complement, not duplicate. One important correction before the architecture: **`plans/open-app-spec.md` §"Rollback" (line 959) already states, deliberately, that automatic rollback is not supported** — "database backups already handle well" is the documented reasoning. This proposal isn't filling a silent gap; it's arguing, with fresh production evidence, that the tradeoff should be revisited — and it proposes a mechanism cheap enough that the original objection ("enormous complexity") no longer holds.

The five findings, and what's true today:

1. **Portable references collapse to baked IDs at capture time.** `metadata/` authors an entity reference portably — `"EntityID": "@lookup:MJ: Entities.Name=Caliber: Assessments"` — but that resolves at `mj sync push` time, so a **captured** migration (for shipping to customers) has already lost the lookup and holds a literal `__mj.Entity` id. Two legitimate installs of the same app (a fresh one, and one that registered its schema before the app shipped a baseline) mint different entity ids for the same logical entity, so `EntityPermission`/`EntityRelationship`/`ApplicationEntity` inserts hit an FK violation on the second kind of host. (#3619)
2. **The schema-placeholder rewrite is duplicated three ways, and only one of the three is correct for an Open App.** CodeGen's own `SQLOutputConfig.schemaPlaceholders` (`packages/CodeGenLib/src/Misc/sql_logging.ts`) is already array-shaped — an ordered `{schema, placeholder}[]` list, built specifically to handle "app schema" and "core schema" as two independent rewrite targets. But `mj sync push --formatAsMigration`'s own `SQLLogger` (`packages/MetadataSync/src/lib/sql-logger.ts`) hardcodes a single literal `__mj` → `${flyway:defaultSchema}` rewrite — correct only in MJ's own repo, where the core schema *is* the Flyway default schema. In every Open App, Skyway binds `${flyway:defaultSchema}` to the *app's* schema, so a captured `EXEC [__mj].spCreateAIPrompt` becomes `EXEC [${flyway:defaultSchema}].spCreateAIPrompt` — resolved on a customer host as a call into a procedure that doesn't exist there. A **third**, independent implementation lives in `GenericDatabaseProvider`'s `SqlLoggingSessionImpl`, also single-schema-shaped. Three code paths, one correct shape, two that silently aren't. (#3618)
3. **A failed install cannot fully undo itself, and cannot say what it owns.** Per-migration transaction mode (needed because `CREATE TYPE...AS TABLE` self-deadlocks with its own TVP instantiation inside one transaction) means a set that fails partway leaves earlier files committed. #3547's own proposed direction — hoist the transaction-hostile `CREATE TYPE` statements out, run the rest of the set as one real transaction — has not been tested but is architecturally sound and, notably, requires **no hand-authored rollback SQL from app publishers**, consistent with the "forward-migration-only, no rollback scripts" philosophy `plans/integration-ddl-schema-management.md` already documents elsewhere in the codebase (line 858: "Rollback scripts are error-prone and dangerous"). Separately: confirmed directly against the generated entity classes that **`OpenAppID` exists on exactly two tables** (`OpenAppDependency`, `OpenAppInstallHistory`) — `Entity`, `Action`, `AIAgent`, `AIPrompt`, `Query`, and `Template` carry no ownership marker at all, so even a successful FK-graph walk at uninstall time cannot attribute every row it should remove. (#3547)
4. **Entity removal already has the right pattern built — just not everywhere it's needed.** `spDeleteEntityWithCoreDependencies` hand-maintains a cascade list covering ~18 of the database's ~73 live FK references to `Entity.ID`; anything else blocks the final delete, and the failure is caught and logged rather than raised — leaving the entity **half-pruned** (its `EntityField` rows gone, the `Entity` row itself stranded), which then silently excludes that entity from every future CodeGen run. The fix doesn't need to be invented: `packages/OpenApp`'s own app-teardown path (`entity-teardown.ts`'s `RunFkGraphTeardown`) **already walks the live FK graph** to build a deepest-first delete/set-null plan for whole-app removal, instead of a hand-maintained list. The single-entity deletion proc should be generated from, or call into, the same graph-driven approach — not maintained as a second, independently-drifting list. (#3546)
5. **The blast radius is not hypothetical.** A fresh MJ 6.1 install currently fails deterministically at migration batch 19 of 32, because a migration drops a column but leaves behind the `EntityField` metadata row describing it, which then blocks deletion of the entity that row still points at — the exact "half-pruned, hand-maintained cascade list" failure mode from finding 4, now blocking the *platform's own* fresh-install path, not just a third-party app's. (#3561)

**PR #3499** ("CodeGen OpenApp-aware scope proposal," open, not yet merged) proposes classifying schemas as mine/not-mine/unowned so CodeGen knows what to generate for. That's a complementary, upstream concern (what CodeGen should *touch*) from this proposal's concern (what a *captured install* correctly *ships and can undo*) — they don't conflict and should land independently.

## Proposed architecture

### 1. Portable capture (fixes #3619, #3618)

- Teach the SQL logger to emit entity-reference inserts as a resolving scalar subquery rather than a baked literal, when it can recognize the source was a `@lookup:` reference — `(SELECT ID FROM [${mjSchema}].[Entity] WHERE Name = N'Caliber: Assessments')` instead of a GUID literal. Deterministic, no runtime dependency, ships portability by construction.
- Unify the three schema-placeholder implementations (CodeGenLib, MetadataSync, GenericDatabaseProvider) onto the one shape that already works — the array-based `{schema, placeholder}[]` CodeGen's own `SQLOutputConfig` uses today — so `formatAsMigration` is correct for any Open App, not just MJ's own repo, with no behavior change for MJ itself (its existing single-entry config becomes a one-element array).

### 2. Transactional install, with a proven-not-assumed mechanism (fixes #3547)

- Validate the hoist-`CREATE TYPE`-outside-the-transaction approach against the #3451 repro harness (it already exists) before building on it — specifically the two load-bearing assumptions #3547 itself flags: that Skyway's history row commits inside the same transaction as the migration content (so a rollback truly un-records itself), and that holding locks on shared core tables for one install's full span is acceptable on a busy instance.
- Once validated: run migration content as one real transaction per install/upgrade operation; `DROP SCHEMA` continues to cover everything in the app's own schema (already correct today); the transaction rollback now covers everything else, including core-schema writes — closing exactly the gap teardown scripts exist to paper over, without requiring any publisher to author or maintain inverse SQL.
- Add an `OpenAppID` provenance column to the handful of shared-schema tables an app's migrations can legitimately write to (`Action`, `AIAgent`, `AIPrompt`, `Query`, `Template`, and any others the audit turns up) — defense-in-depth for diagnostics even after transactional rollback closes the failure-recovery case, and the missing piece for a future "what does this app actually own" report.

### 3. Complete entity lifecycle, generated not hand-maintained (fixes #3546, and would have prevented #3561)

- Generate `spDeleteEntityWithCoreDependencies`'s cascade plan from the live FK graph, reusing `RunFkGraphTeardown`'s existing graph-walk logic rather than maintaining a second, hand-written, already-`73-vs-18` list — nullable FKs get set-null, non-nullable children get deleted, and the set can never silently drift out of sync with the schema again because it's derived from the schema.
- Make the CodeGen caller (`checkAndRemoveMetadataForDeletedTables`) fail loudly instead of log-and-continue on a partial prune, so a half-pruned entity can't slip through unnoticed the way #3561 shows it can.

### 4. Preflight & Integrity Report (the one new UI surface)

Before `mj app install` / `mj app upgrade` commits anything: a dry-run report showing the migration set's schema footprint (which schemas it writes to, cross-checked against the placeholder config from part 1), any non-portable references the capture step flagged, and — once part 2 ships — a plain statement of what "if this fails, what happens" means for this specific install (today: nothing, once shipped: full automatic rollback). This is the moment a publisher or a consuming admin gets to catch a problem before it's a customer incident, not during a live debugging session.

### Why this belongs in core, not an app

Every Open App — regardless of what it does — goes through exactly this publish/capture/install/rollback path once, using the platform's shared machinery. None of the fixes above are specific to any app's domain; they're properties of the installer and the SQL-capture layer every app depends on identically. Fixing it once in `packages/OpenApp` and `packages/MetadataSync` is inherited by every current and future Open App the moment they next publish or a consumer next installs.

## Phased rollout

1. **Phase 1** — Unify the `schemaPlaceholders` shape across the three implementations (fixes #3618); teach the SQL logger to preserve `@lookup:` references as scalar subqueries (fixes #3619). Both are scoped, mechanical, and independently valuable even if nothing else ships.
2. **Phase 2** — Validate and, if sound, ship the transaction-hoist install mechanism (fixes #3547); generate `spDeleteEntityWithCoreDependencies` from the FK graph (fixes #3546, unblocks #3561's class of failure permanently).
3. **Phase 3** — `OpenAppID` provenance columns on shared-schema tables; the Preflight & Integrity Report surfaced in both the CLI and an Admin UI.

## Open questions

- The lock-duration tradeoff in #3547 (one transaction across a whole install holding locks on shared core tables) needs a real benchmark against a busy instance before Phase 2 ships — flagged there as unproven, and it stays unproven here too.
- Should the Preflight Report be a hard gate (install refuses to proceed on a portability warning) or an advisory one with an override flag? Leaning advisory-with-override for Phase 3, hard gate only once the underlying fixes have enough real-world mileage that false positives are rare.

## Mockup

See [`mockups/open-app-install-integrity.html`](./mockups/open-app-install-integrity.html) — the Preflight & Integrity Report shown mid-way through `mj app install`, including a portability warning and the rollback-plan summary. Screenshot: [`screenshots/idea-2-open-app-install-integrity.png`](./screenshots/idea-2-open-app-install-integrity.png).
