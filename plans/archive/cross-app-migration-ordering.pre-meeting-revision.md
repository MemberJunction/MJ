# Cross-Application Migration Ordering — Implementation Plan

**Status:** Draft for review
**Created:** 2026-04-28
**Source:** Synthesizes the discussion on issue #2487 (issue body, reviewer comments, and follow-up review notes)
**Tracking issue:** [#2487](https://github.com/MemberJunction/MJ/issues/2487)
**Related plan:** [multi-database-skyway-support.md](./multi-database-skyway-support.md)
**Repos affected:** `MemberJunction/MJ` (this repo), `MemberJunction/skyway` (external)

---

## Table of Contents

1. [Context](#1-context)
2. [Decisions Already Made](#2-decisions-already-made)
3. [Phase 1 — Foundations](#3-phase-1--foundations)
   - 3.1 [`mj migrate create` CLI generator](#31-mj-migrate-create-cli-generator) `[MJ]`
   - 3.2 [SP compatibility policy document](#32-sp-compatibility-policy-document) `[Policy]`
   - 3.3 [Migration header dependency declarations](#33-migration-header-dependency-declarations) `[Skyway]` `[MJ]`
   - 3.4 [CI graph validation](#34-ci-graph-validation) `[MJ]`
4. [Phase 2 — Core Runtime](#4-phase-2--core-runtime)
   - 4.1 [Holistic cross-schema ordering in Skyway](#41-holistic-cross-schema-ordering-in-skyway) `[Skyway]`
   - 4.2 [Tolerant metadata-management SPs (`__mj.spCreateEntity` and friends)](#42-tolerant-metadata-management-sps-mjspcreateentity-and-friends) `[MJ]`
   - 4.3 [OpenApp version pinning (semver-style)](#43-openapp-version-pinning-semver-style) `[MJ]`
5. [Phase 3 — Deferred / Conditional](#5-phase-3--deferred--conditional)
6. [Cross-Cutting Concerns](#6-cross-cutting-concerns)
7. [File Inventory](#7-file-inventory)
8. [Open Questions](#8-open-questions)

---

## 1. Context

This plan operationalizes the architectural direction agreed on issue [#2487](https://github.com/MemberJunction/MJ/issues/2487):

- **Option 1 + Option 4** is the chosen axis: holistic cross-schema migration ordering, paired with explicit version pinning *between sibling apps* (npm-style ranges between OpenApps).
- **Options 2 and 3** are explicitly deferred. Composite baselines and composer-tools both produce monolithic stack snapshots, which is antithetical to the OpenApp componentization model. The diamond-dependency case (an app consuming two sibling OpenApps that themselves consume MJ + BAC) makes per-combination snapshots fragment combinatorially.
- A **fifth direction** surfaced during discussion and is folded in: **upstream stored-procedure compatibility**. Making `spCreate*` / `spUpdate*` tolerant of missing parameters collapses the entire "old codegen migration runs against newer MJ" failure class by construction, not by ordering discipline. This is the highest single leverage point in the plan.

The work spans two repos. `MemberJunction/skyway` (the external migration engine consumed as `@memberjunction/skyway-core`) owns the runner; `MemberJunction/MJ` (this repo) owns the CLI, codegen, policy, and CI gating. The issue thread asked that this plan be drafted in this repo with the Skyway-bound tasks clearly delineated so they can be broken off and worked in parallel.

### Why this is feasible now: Skyway ownership

Most of this plan would have been impractical under Flyway. Cross-schema topological resolution, header-driven dependency declarations, and runtime install-time composition all require runner-level changes that Flyway as an upstream tool didn't expose. Now that we own the runner via `@memberjunction/skyway-core`, those changes become normal feature work in a repo we control. **This isn't a footnote — it's the precondition that unblocks every Phase 2 item.** When you read §4.1 and think "this requires modifying the resolver internals," the answer is yes, and that's exactly the kind of change Skyway-ownership exists to make tractable.

### Two distinct levels of version pinning

This plan addresses **inter-OpenApp pinning** and explicitly defers **SaaS-product-level MJ-version pinning**. These look superficially similar (both are "App X declares a version range for App Y") but solve different problems and have opposite tradeoffs:

| | Inter-OpenApp pinning (§4.3) | SaaS-product MJ pinning (§5.4) |
|---|---|---|
| What it pins | App A consumes OpenApp B at range `^1.2.0` | SaaS product X is built against MJ 5.30, won't auto-uptake 5.31 |
| Problem solved | Sibling-app compatibility envelope (npm-parallel) | Insulating downstream products from upstream churn |
| Effect on org | Encourages componentization | Slows downstream MJ uptake (the org has explicitly *not* been willing to accept this) |
| In scope here | Yes, §4.3 | No, §5.4 |

A reviewer who reads §4.3 and §5.4 in isolation may think the plan is being inconsistent — "we're doing pinning here but rejecting it there." It's not. They're different tools for different jobs, and the deferral of the SaaS-MJ case is a deliberate choice made on the issue thread, not an oversight.

### Stated assumption: open-app-into-customer-DB is first-class

#2487's discussion question 5 asked how heavily to weight the future "customer installs an OpenApp into their own database at an arbitrary MJ version" scenario. **This plan weights it heavily**, which is what drives the rejection of Options 2 and 3 (composite baselines / composer-distributed snapshots) — both assume a known stack composition, which the open-app case explicitly does not. If the org's view shifts and open-app installation is deemed a peripheral concern rather than a first-class scenario, the deferral logic in §5 would need to be revisited. Surfacing the assumption here so reviewers can object explicitly if they disagree.

### Constraints carried forward from #2487

- Do not edit historical migrations in place (Skyway checksum validation, audit trail).
- Do not require product teams to manually orchestrate cross-layer ordering on every upgrade.
- Must serve both populations: existing databases (in-place upgrade path) and fresh databases (replay or compose without contradictions).
- Cannot slow upstream layers down. MJ iterates fast; that's a non-negotiable.

### Two failure classes the plan must address

1. **DDL ordering across schemas.** A downstream FK referencing an upstream table; upstream wants to drop or restructure the table. Today this fails on existing DBs (FK refuses the drop) and can fail on fresh DBs (timestamp ordering across schemas isn't enforced). Phase 2.1 (holistic ordering) + Phase 1.3/1.4 (header deps + CI) addresses this.
2. **Metadata-migration version-skew.** Codegen-emitted SQL captures point-in-time SP signatures. Replaying that SQL against a newer MJ where the signature changed fails even if the DDL it accompanies is fine. Phase 2.2 (tolerant SPs) addresses this *by construction* — the only durable fix.

---

## 2. Decisions Already Made

These were settled on the issue thread and aren't open for re-litigation in this plan:

| Decision | Source |
|---|---|
| Holistic cross-schema ordering (Option 1) is in scope | Issue #2487 thread |
| OpenApp-level version pinning (npm-style ranges) is in scope | Issue #2487 thread + review notes |
| Composite baselines (Option 2) are deferred indefinitely | "Blows up componentization" — issue thread |
| Composer-tool distribution (Option 3 distribution case) is deferred | Reframed as composer-lite for *validation* if diamond-dependency pain materializes; not a distribution mechanism |
| SaaS-product-level MJ-version pinning is a separate, deferrable conversation | Distinct from inter-app pinning; not in scope here |
| Plan is structured as a PR for inline review feedback | Issue thread request |
| MJ-side and Skyway-side work are tagged separately for parallel execution | Issue thread request |

---

## 3. Phase 1 — Foundations

Phase 1 work can begin immediately and is largely policy + tooling that doesn't change the runner's behavior. These items pay down the "developer discipline" tax that Option 1 alone would otherwise rely on, and they de-risk Phase 2 by establishing the contracts that Phase 2 enforces.

### 3.1 `mj migrate create` CLI generator

**Tag:** `[MJ]`
**Owner:** TBD (CLI maintainer)
**Effort:** Small (~1-2 days)
**Dependencies:** None — can ship standalone

**Problem.** Migration filenames are hand-typed today. The format is `V<YYYYMMDDHHMM>__v<VERSION>__<Description>.sql`. Manual creation drifts: timestamps in local time vs UTC, inconsistent special-character handling in titles, version-suffix typos, off-by-one minute collisions on the same day. Holistic ordering (Phase 2.1) is brittle if filenames are inconsistent.

**Approach.** Add a new oclif subcommand under the existing `migrate` topic. MJCLI uses oclif with auto-discovery from `src/commands/`; conventions are documented in [packages/MJCLI/src/commands/migrate/index.ts](packages/MJCLI/src/commands/migrate/index.ts).

**Files to add:**

- [packages/MJCLI/src/commands/migrate/create.ts](packages/MJCLI/src/commands/migrate/create.ts) (new) — oclif `Command` subclass that emits a properly-named, header-stamped migration SQL stub.
- [packages/MJCLI/src/lib/migrationFilename.ts](packages/MJCLI/src/lib/migrationFilename.ts) (new) — pure function that takes `(version: string, title: string, now?: Date)` and returns the canonical filename. Pulled out for unit-testability.
- [packages/MJCLI/src/__tests__/migrationFilename.test.ts](packages/MJCLI/src/__tests__/migrationFilename.test.ts) (new) — Vitest tests for the filename builder.

**Files to modify:**

- [packages/MJCLI/README.md](packages/MJCLI/README.md) — document the new command.
- [migrations/CLAUDE.md](migrations/CLAUDE.md) — replace "manually compose the filename" guidance with `mj migrate create` invocation.

**Command shape:**

```bash
mj migrate create \
  --version 5.31.x \
  --title "Add ScopeID to AuditLog" \
  [--schema __mj] \
  [--target-app committees]
```

**Filename format produced:**

```
V<YYYYMMDDHHMM>__v<VERSION>__<Slugified_Title>.sql
```

- `<YYYYMMDDHHMM>` is generated as **UTC** (`new Date().toISOString()` → strip non-digits, take first 12 chars). No more `--zone` flag, no more local-time drift.
- `<Slugified_Title>` strategy: lowercase `[a-z0-9 _-]` preserved, spaces and `--` collapsed to single `_`, all other characters dropped. Idempotent.
- `--version` validates against `/^v?\d+\.\d+(\.x|\.\d+)?$/` (the existing regex in [packages/MJCLI/src/config.ts:237](packages/MJCLI/src/config.ts) — extracted into the shared util).

**Generated stub (default header):**

```sql
-- =====================================================
-- Migration: V202604281200__v5.31.x__Add_ScopeID_To_AuditLog
-- Schema: __mj
-- Target app: committees
-- Requires:
--   <add upstream-migration version-stamps here, one per line>
-- Created: 2026-04-28T12:00:00Z by mj-create-migration v0.1.0
-- =====================================================

-- TODO: Implement migration

```

The `Requires:` line is the hook for §3.3. An empty list means "no upstream-migration dependencies declared." It's an opt-in field; existing migrations need no retroactive change to keep working.

**Acceptance criteria:**

- Running `mj migrate create --version 5.31.x --title "Test One"` at any time, in any timezone, produces a UTC-stamped file in the correct location.
- The same `(version, title, instant)` tuple always produces the exact same filename — covered by a deterministic unit test using a frozen `Date`.
- Slugification matches the existing convention in [migrations/v5/](migrations/v5/) when scanned across the last 50 files.
- Filename collision detection: if a file with the same `<YYYYMMDDHHMM>__v<VERSION>` prefix already exists, the command fails with an actionable error and suggests retrying after a minute or supplying `--force-suffix=N`.
- New file is written to the correct directory derived from `mjConfig.migrationsLocation` (existing config path; default `./migrations` per [packages/MJCLI/src/config.ts](packages/MJCLI/src/config.ts)).

---

### 3.2 SP compatibility policy document

**Tag:** `[Policy]`
**Owner:** TBD (CodeGen maintainer + a reviewer from each consumer team)
**Effort:** Small (writing exercise, ~1 day) but must land *before* §4.2 implementation
**Dependencies:** None

**Problem.** The metadata-migration version-skew problem isn't solvable purely by ordering. A downstream codegen migration calls `EXEC __mj.spCreateEntity @Name='X', @BaseTable='X', @AllowAllRowsAPI=0, @AllowUpdateAPI=0, ...` — capturing the parameter list as it existed at codegen time. If MJ later adds a required parameter, the historical EXEC call fails. If MJ renames a parameter, same. If MJ changes a default, the row gets the wrong default forever.

**Scoping clarification.** This policy applies to MJ's **metadata-management** SPs in the `__mj` schema — `spCreateEntity`, `spCreateEntityField`, `spUpdateExistingEntitiesFromSchema`, and the rest of the small set of SPs whose calls are baked into downstream-app migration history. It does **not** apply to per-entity SPs like `spCreateAddress`, `spCreatePerson`, etc. Those per-entity SPs are emitted by codegen for the entity they belong to, are called only by `BaseEntity.Save()` at runtime (never from migrations), and therefore can't have a version-skew problem — the running app and the SP it calls are always at the same version. Conflating the two would expand the scope of the policy unnecessarily and put rules on per-entity SPs that gain nothing.

The fix is contractual, not tactical: MJ's metadata-management stored procedures must be **backwards-compatible by construction**. That requires a written policy, not a one-off "be tolerant" instinct. This document codifies the rules so future SP changes can be reviewed against an explicit standard rather than a vibe.

**Files to add:**

- [docs/standards/SP_COMPATIBILITY_POLICY.md](docs/standards/SP_COMPATIBILITY_POLICY.md) (new)

**Files to modify:**

- [CLAUDE.md](CLAUDE.md) — add a top-level link in the "MemberJunction Development Guide" section.
- [packages/CodeGenLib/CLAUDE.md](packages/CodeGenLib/CLAUDE.md) — link from CodeGen-specific guidance.

**Policy contents (outline):**

1. **Scope.** Applies to MJ's metadata-management SPs in the `__mj` schema (e.g. `spCreateEntity`, `spCreateEntityField`, `spUpdateExistingEntitiesFromSchema`) and any other `__mj`-schema SP that downstream-app migrations directly `EXEC`. It does NOT apply to per-entity SPs like `spCreateAddress` / `spUpdatePerson` — those are codegen-emitted alongside their entity, called only by `BaseEntity.Save()` at runtime, and regenerated whenever the entity changes, so version-skew can't occur.
2. **Allowed signature changes (no migration required):**
   - Adding a new parameter that has a default value (`@NewParam type = <default>`).
   - Widening a parameter type (e.g., `nvarchar(50)` → `nvarchar(100)`).
   - Adding a new optional output column (callers don't bind by position).
3. **Disallowed signature changes (require shim):**
   - Removing or renaming a parameter.
   - Changing a parameter's type in a non-widening way.
   - Adding a new parameter without a default.
   - Reordering parameters (T-SQL is positional-or-named; we always emit named, but the policy disallows reordering anyway for clarity).
4. **Shim window.** When a disallowed change is genuinely necessary:
   - Introduce a new versioned proc (`spCreateEntity_v2`) alongside the old one.
   - Old proc remains for at least one minor MJ version after the new one ships.
   - Old proc emits a `RAISERROR(..., 10, ...)` warning when called (severity 10 = informational, doesn't fail the migration).
   - Deprecation lint (§3.4) flags any newly-generated codegen SQL still calling the old proc.
5. **`spCreate` parameter rules:**
   - Every business column that allows null gets `@Param type = NULL` in the SP signature. Caller can omit; SP applies column default.
   - Every column with a database default gets `@Param type = NULL`; SP body uses `ISNULL(@Param, <default>)` or `CASE WHEN @Param IS NULL THEN <default> ELSE @Param END`.
   - Required columns (NOT NULL, no default) remain required parameters. These are rare in well-designed schemas.
6. **`spUpdate` parameter rules:**
   - **All non-PK parameters get `@Param type = NULL` defaults.**
   - SP body uses `[Column] = ISNULL(@Param, [Column])` so that omitting a parameter preserves the existing row value (this is the "merge update" semantic flagged on the issue thread as nicer programmer UX).
   - Caveats: nullable columns where `NULL` is a meaningful value need a sentinel — the policy mandates a separate `@<Param>_Clear bit = 0` companion parameter for any nullable column whose `NULL` is semantic. Codegen can detect these from the schema; humans need to be told the rule exists.
7. **Versioning the policy itself.** The policy file is dated; breaking changes to the policy itself (rare) require a bump to a new policy version with a transition window.

#### Worked example: shim-window transition

Rules (3) and (4) above describe a "shim window" abstractly. Below is what one looks like end-to-end. Suppose MJ needs to add a *required* `@OwnerID` parameter to `__mj.spCreateEntity` (no sensible default exists at the schema level). Per rule (3) this is a disallowed signature change and requires a shim. The transition plays out across three MJ releases:

**Release N (introduces the new SP, keeps the old one).**

```sql
-- New canonical proc — has the new required parameter
CREATE PROCEDURE [__mj].[spCreateEntity_v2]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @BaseTable nvarchar(255),
    @OwnerID uniqueidentifier,                 -- new, required
    @AllowAuditLog bit = NULL,
    -- ... rest of the parameter list ...
AS
BEGIN
    INSERT INTO [__mj].[Entity] ([ID], [Name], [BaseTable], [OwnerID], [AllowAuditLog], ...)
    VALUES (ISNULL(@ID, NEWSEQUENTIALID()), @Name, @BaseTable, @OwnerID, ISNULL(@AllowAuditLog, 0), ...);
END
GO

-- Old proc — body re-routes to the new one with a synthesized @OwnerID, raises an informational warning
CREATE OR ALTER PROCEDURE [__mj].[spCreateEntity]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @BaseTable nvarchar(255),
    @AllowAuditLog bit = NULL,
    -- ... pre-N parameter list, no @OwnerID ...
AS
BEGIN
    -- Severity 10 = informational; does NOT fail the migration. Caller sees a notice in the log.
    RAISERROR(
        'spCreateEntity is deprecated in MJ release N. Migrate to spCreateEntity_v2 by release N+2.',
        10, 1
    ) WITH NOWAIT;

    -- Synthesize a default for the new column. The system-owner UUID is conventional; a future
    -- audit can find rows where OwnerID = system-owner and re-attribute them.
    DECLARE @SystemOwnerID uniqueidentifier = '00000000-0000-0000-0000-000000000001';

    EXEC [__mj].[spCreateEntity_v2]
        @ID = @ID,
        @Name = @Name,
        @BaseTable = @BaseTable,
        @OwnerID = @SystemOwnerID,
        @AllowAuditLog = @AllowAuditLog;
END
```

At release N, every existing downstream codegen migration that calls `EXEC __mj.spCreateEntity @Name='X', @BaseTable='X', ...` continues working — it goes through the shim, gets the synthesized `@OwnerID`, lands in the new table.

Codegen output for release N is regenerated to call `spCreateEntity_v2` directly. **New** migrations generated at or after release N call the v2 form. Old migrations stay as they are.

**Release N+1 (deprecation lint).**

CodeGen's `mj codegen` step (and the §3.4 CI validator) gain a **deprecation lint rule**: any newly-generated SQL file that calls `__mj.spCreateEntity` (the deprecated form, not v2) produces a CI error. Existing historical migrations are exempt — the lint only applies to files that would be authored after release N. This catches stragglers without rewriting history.

The shim itself remains in the database, still routing calls through to v2.

**Release N+2 (removal allowed but not mandatory).**

The shim can now be removed. MJ ships a new migration:

```sql
DROP PROCEDURE IF EXISTS [__mj].[spCreateEntity];
```

Any downstream-app migration history that still calls the deprecated form starts failing at this point. By policy, this is the customer's signal that they have one MJ release window to regen their downstream codegen. Removal is the "final" step but in practice we'd keep the shim around longer than N+2 if any active customer's history still calls it — the shim's runtime cost is one `RAISERROR` call, which is negligible.

**What this gets us:**
- **Old migration history keeps applying** — that's the whole point of the shim. The downstream app's historical SQL doesn't change.
- **New code stops paying for the deprecation** — N+1's lint catches new authorship of deprecated calls.
- **The transition is observable** — `RAISERROR` severity 10 surfaces in `mj migrate`'s output, so customers see deprecation notices on every replay even before lint catches anything.
- **Policy-driven, not vibes-driven** — the next maintainer who needs to add a required SP param has a worked template. Without this example, "use a shim window" is just words.

**What this doesn't address:** if MJ needs to *remove* a column entirely (not just change a parameter), the shim approach doesn't help — the rows that depend on that column still exist. Column removal is a different (rarer) class of change and warrants its own policy entry. We'll add that section if the situation arises; until then, removing a column is treated as a major-version-bump-warranting change.

**Acceptance criteria:**

- The doc is approved by the architecture reviewers identified on issue #2487 and the CodeGen owner before §4.2 implementation begins.
- Every rule has a one-sentence rationale that ties back to a specific failure mode in #2487 or a concrete past incident.
- The doc passes a "stress test": for the last 5 SP-signature-changing PRs in MJ, the policy unambiguously says whether each one is allowed.
- The shim-window worked example above is included in the policy doc verbatim, not just referenced.

---

### 3.3 Migration header dependency declarations

**Tag:** `[Skyway]` (parser) + `[MJ]` (emitter, validator)
**Owner:** Split — parser change in skyway-core, emitter/validator in this repo
**Effort:** Medium (~2-3 days across both repos)
**Dependencies:** §3.1 (CLI emits the header), §3.2 (policy informs what dependencies look like)

**Problem.** Timestamps alone are necessary but not sufficient. A migration in `bizapps-tasks` may depend on a specific migration from `__mj_BizAppsCommon` having run first — not just "any earlier timestamp from BAC", a *specific* version. Today nothing captures or enforces that.

**Approach.** Add a parsed `Requires:` field to the migration header. Extend Skyway's parser to read it. CI (§3.4) walks the dependency graph at PR time. Runtime (§4.1) honors it during topological merging.

**Files to modify in `MemberJunction/skyway` repo:**

- `packages/core/src/migration/parser.ts` — extend `ParseMigrationFilename` and add a sibling `ParseMigrationHeader` that scans the SQL preamble for `-- Requires:` blocks. Returns `string[]` of upstream-migration version stamps (e.g., `v5.30.x:V202604222142`).
- `packages/core/src/migration/types.ts` — add `requires?: string[]` to `MigrationInfo` / `ResolvedMigration`.
- `packages/core/src/migration/resolver.ts` — populate the new field when resolving migrations.
- `packages/core/src/__tests__/parser.test.ts` — header-parse coverage (no requires, single, multiple, malformed, comments inside `Requires:` block, etc.).

**Files to modify in this repo:**

- [packages/MJCLI/src/commands/migrate/create.ts](packages/MJCLI/src/commands/migrate/create.ts) (added in §3.1) — when `--requires <stamp>` flag is supplied (repeatable), emit the lines into the generated stub.
- [migrations/CLAUDE.md](migrations/CLAUDE.md) — document the `Requires:` syntax.

**Header syntax:**

```sql
-- Requires:
--   __mj:v5.30.x:V202604222142
--   __mj_BizAppsCommon:v1.2.x:V202604201200
```

Format: `<schema>:<version>:<filename-prefix>`. The filename-prefix is the leading `V<YYYYMMDDHHMM>` (12 digits) — uniquely identifies the upstream migration. Schema and version are belt-and-suspenders so a typo'd prefix doesn't accidentally match a different schema's migration.

**Why this format and not Flyway/Skyway-internal IDs.** The trio is human-readable, copy-pasteable from filenames, and doesn't depend on Skyway's internal `installed_rank`. The parser doesn't need to query the database — it can resolve dependencies purely from the migration files on disk.

**Acceptance criteria:**

- Skyway-core's parser extracts a `Requires:` array and surfaces it on `ResolvedMigration`. Backwards-compatible: existing migrations with no `Requires:` block continue parsing fine.
- A round-trip test: `mj migrate create ... --requires foo:bar:V123` followed by parsing the generated file recovers the same dependency string.
- Skyway-core ships a minor version bump (0.5.x → 0.6.0) reflecting the new optional API. MJCLI's `package.json` is updated to require `>=0.6.0`.

---

### 3.4 CI graph validation

**Tag:** `[MJ]` (this repo's CI; Skyway provides the parsing primitives in §3.3)
**Owner:** TBD (Build/CI maintainer)
**Effort:** Medium (~2-3 days)
**Dependencies:** §3.3 (parsing landed in skyway-core)

**Problem.** A `Requires:` declaration that points at a non-existent upstream migration must fail PR review, not surface at customer install time. Likewise, a cycle (A requires B requires A) must fail. Likewise, a downstream migration whose timestamp is *earlier* than its declared upstream dependency is wrong by construction.

**Approach.** Add a Vitest-based validator that runs as part of the existing test suite (so it shows up in PR checks) and as a standalone CLI step. The validator scans all migration directories Skyway would scan (the `Locations` array from `mj.config.cjs`), parses each, builds the `Requires:` graph, and asserts:

1. Every declared dependency resolves to an actual migration file somewhere in scope.
2. The graph is acyclic.
3. For every edge `A → B`, `A.timestamp > B.timestamp`. (Catches mis-dated migrations whose ordering would be wrong even if they were declared correctly.)

**Files to add:**

- [packages/MJCLI/src/lib/migrationGraphValidator.ts](packages/MJCLI/src/lib/migrationGraphValidator.ts) (new) — pure validator that takes `ResolvedMigration[]` from skyway-core and returns `{ ok: true } | { ok: false, errors: ValidationError[] }`.
- [packages/MJCLI/src/commands/migrate/validate.ts](packages/MJCLI/src/commands/migrate/validate.ts) (new) — oclif command. Loads config, walks all configured `Locations`, runs the validator, prints results, exits with non-zero on errors.
- [packages/MJCLI/src/__tests__/migrationGraphValidator.test.ts](packages/MJCLI/src/__tests__/migrationGraphValidator.test.ts) (new) — Vitest coverage for the four failure modes (missing dep, cycle, timestamp inversion, malformed `Requires:`).

**Files to modify:**

- [.github/workflows/](.github/workflows/) (existing CI) — add a step that runs `mj migrate validate` against a checkout of the PR. Failing validation fails the PR check.

**Output format:**

```
$ mj migrate validate
Scanning migrations in:
  - ./migrations
  - ./packages/SchemaEngine/migrations/rsu

✓ Parsed 247 migrations
✗ V202604281200__v5.31.x__Foo.sql: Requires "__mj:v5.30.x:V999999999999" does not resolve
✗ V202604280915__v5.31.x__Bar.sql: depends on V202604281200 but predates it (timestamp inversion)

2 errors found.
```

**Acceptance criteria:**

- Running `mj migrate validate` on the current `next` branch (with no `Requires:` blocks anywhere yet) succeeds — the validator is opt-in: missing `Requires:` is fine, malformed/inconsistent `Requires:` is not.
- A deliberately broken test fixture (each of the four failure modes) produces the expected error and a non-zero exit.
- CI integration: a PR that adds a migration with a malformed `Requires:` block fails the existing "build + test" check on GitHub Actions.

---

## 4. Phase 2 — Core Runtime

Phase 2 is the substantial engineering work that delivers the user-visible behavior change. Phase 1 must be in place first because Phase 2 relies on the policies and parsing primitives Phase 1 establishes. Items within Phase 2 can be parallelized.

### 4.1 Holistic cross-schema ordering in Skyway

**Tag:** `[Skyway]` (primary) + `[MJ]` (CLI surface)
**Owner:** Split between repos
**Effort:** Large (~1-2 weeks)
**Dependencies:** §3.3 (`Requires:` parsing landed)

**Problem.** Skyway-core's [scanner.ts](node_modules/@memberjunction/skyway-core/dist/migration/scanner.ts) walks each `Migrations.Locations` entry but produces a single global list ordered by timestamp. That's adequate when a single application owns every migration in scope. With multiple apps' migrations co-resident in the same database, today's ordering is "all paths' migrations interleaved by timestamp alone." That's the right *default* but provides no way to express "this BCSaaS migration must run *after* this specific BAC migration regardless of timestamps."

**Approach.** Extend the resolver in skyway-core to perform a stable topological merge:

- Primary key: `Requires:` graph edges (from §3.3).
- Tiebreaker: timestamp.
- Failure: cycle in `Requires:` graph → `MigrationParseError` at resolve time.

`Migrations.Locations` continues to be an array. The CLI assembles it from `mj.config.cjs` plus any per-app discovery:

**Files to modify in `MemberJunction/skyway`:**

- `packages/core/src/migration/resolver.ts` — replace pure timestamp sort with a Kahn-style topological sort that reads `requires` from each migration. Stable: when two migrations have no dependency between them, fall back to timestamp order.
- `packages/core/src/migration/scanner.ts` — when scanning multiple Locations, retain the originating Location on each `MigrationInfo` so callbacks/diagnostics can show which app a migration came from.
- `packages/core/src/core/skyway.ts` — log the resolved order on a verbose flag (`Migrations.LogResolvedOrder: true`) for debugging.
- `packages/core/src/__tests__/resolver.test.ts` — coverage: no deps (timestamp order preserved), linear chain across schemas, diamond, cycle (must throw), missing dep (must throw), `Requires:` referencing a migration in a different `Location`.

**Files to modify in this repo:**

- [packages/MJCLI/src/config.ts](packages/MJCLI/src/config.ts) — extend `getSkywayConfig` to assemble multiple `Locations`. Read a new optional config key `additionalMigrationsLocations: string[]` from `mj.config.cjs`. Apps that want their migrations included declare them there; CLI passes the array straight through to Skyway.
- [packages/MJCLI/src/commands/migrate/index.ts](packages/MJCLI/src/commands/migrate/index.ts) — accept `--include <path>` (repeatable) flag for ad-hoc additions without modifying config. Useful for OpenApp install flows that need to layer additional locations without rewriting the config file.
- [packages/MJCLI/src/__tests__/config.test.ts](packages/MJCLI/src/__tests__/config.test.ts) (extend) — `additionalMigrationsLocations` parsing.

**Config example:**

```javascript
// mj.config.cjs
module.exports = {
  migrationsLocation: 'filesystem:./migrations',
  additionalMigrationsLocations: [
    'filesystem:./packages/Apps/Committees/migrations',
    'filesystem:./packages/Apps/Subscriptions/migrations',
  ],
  // ...
};
```

**Backwards compatibility.** A migration with no `Requires:` block participates in pure timestamp ordering — same behavior as today. `additionalMigrationsLocations` is optional and defaults to `[]`. A repo that doesn't use any of this gets identical behavior to before. The behavior change is opt-in.

**Existing-database safety.** Skyway already tracks applied migrations in `__mj.flyway_schema_history` per-schema. Adding `Requires:` to a migration that's already applied is a no-op (Skyway sees it's applied and skips it; the new edge becomes informational only). Adding new migrations with `Requires:` works because every dependency is, by definition, already applied (otherwise it couldn't have been declared).

**Behavior when a `Requires:` declaration cannot be resolved.** If a migration declares `Requires: foo:bar:V202604300000` and that migration is neither in any configured `Location` nor already recorded in `flyway_schema_history`, the resolver **fails fast at resolve time** with a structured error. No "warn and proceed" mode. No soft-required distinction.

```
MissingDependencyError: Migration BCSaaS:V202604300100 requires
Izzy:V202604280100 which is not present in any configured migration
location and has not been applied to this database. Refusing to proceed.
Either include the Izzy migration directory in additionalMigrationsLocations,
or upgrade Izzy to a version that includes that migration before retrying.
```

This behavior is **load-bearing for cross-app entity replacement migrations** (see §6.X playbook). When a downstream app drops a table that another app's schema depends on, the drop must declare a hard dependency on the dependent app's FK-removal migration. If the dependent app hasn't been upgraded, "warn and proceed" would let SQL Server's FK-violation error surface mid-install instead — far worse than refusing to start. The strict-fail behavior is what makes cross-app entity replacement safe to author.

If a softer behavior is ever needed in the future (e.g., truly optional cross-app coordination), introduce a separate `Suggests:` header that's advisory-only. Don't relax the `Requires:` semantics.

#### Worked example: diamond dependency

The diamond case is the one that explicitly killed Options 2 and 3 on the #2487 thread (composite snapshots fragment combinatorially when an app pulls in two sibling OpenApps). Phase 2.1 has to handle it cleanly, so let's walk through one concretely.

**Stack:**

```
                    MJ (5.31.0)
                    /         \
        BizAppsCommon         BizAppsCommon  (same — both children share the same BAC ver)
              |                       |
         Committees              Subscriptions
                    \         /
              CustomerSummary  ← consumes BOTH Committees AND Subscriptions
```

CustomerSummary's migration #C5 wants to add an FK from `__cs.SummaryRow.CommitteeID` (introduced by Committees migration #C-100) and from `__cs.SummaryRow.SubscriptionID` (introduced by Subscriptions migration #S-200). Both Committees and Subscriptions, in turn, depend on a BizAppsCommon migration #BAC-50 that introduced the contact-link table they both join through.

**Migration files in scope** (timestamps shown for clarity; in practice they're the standard `Vyyyymmddhhmm` prefix):

| File | Timestamp | `Requires:` declared |
|---|---|---|
| `__mj_BizAppsCommon/V202604010000__BAC-50.sql` | t=10:00 | (none) |
| `__mj_Committees/V202604020000__C-100.sql` | t=11:00 | `__mj_BizAppsCommon:v1.x:V202604010000` |
| `__mj_Subscriptions/V202604020100__S-200.sql` | t=11:01 | `__mj_BizAppsCommon:v1.x:V202604010000` |
| `__cs/V202604020200__C5.sql` | t=11:02 | both of the above |

**What pure timestamp ordering would produce:** BAC-50, C-100, S-200, C5. That happens to be correct here *because timestamps are well-behaved*. But the moment any of these files gets re-dated (say, a hotfix patches BAC-50 with a new file dated 10:30 that's *actually* a backport of an earlier change), pure timestamp ordering breaks. Phase 2.1 doesn't need timestamps to be well-behaved — it needs the `Requires:` edges to be correct.

**What Phase 2.1's topological merge produces, in this scenario:**

1. Build the graph: edges `C-100 → BAC-50`, `S-200 → BAC-50`, `C5 → C-100`, `C5 → S-200`.
2. Kahn's algorithm picks any node with in-degree 0 first. That's BAC-50.
3. Removing BAC-50 drops in-degree of C-100 and S-200 to 0. Both are now eligible.
4. **Tiebreaker = timestamp.** C-100 (t=11:00) runs before S-200 (t=11:01). Stable.
5. Removing both drops C5's in-degree to 0. C5 runs last.

Final order: `BAC-50, C-100, S-200, C5`. Same as pure timestamps in this happy case, **but** the order is now *guaranteed* by the graph rather than implied by clock-stamping discipline. If any of those timestamps were jittered or backdated, the topological order would still be correct.

**Where this fails fast (and why that's good):** if CustomerSummary's `C5` declares `Requires: Committees:V202604020000` but Committees forgot to ship `C-100` (or the customer hasn't installed Committees at the required version), §3.4's CI validator catches it at PR time (validator says: "C5 depends on V202604020000 which is not present in any configured Location"). At install time §4.1's resolver throws a `MissingDependencyError` with the same message. Either way, the failure is **explicit and named** rather than emerging as a downstream FK-creation failure during migration replay.

**Where the diamond case still hurts** — and what's out of scope for §4.1 to solve: if Committees and Subscriptions disagree about *which version* of BizAppsCommon they need (Committees wants BAC ≥ 1.0, Subscriptions wants BAC ≥ 1.5), §4.1 does nothing. That's a §4.3 (OpenApp pinning) job — semver ranges across the install set need to compose. The two phases work together; neither solves the whole problem alone.

**Acceptance criteria:**

- Resolver test suite covers all six scenarios listed under "Files to modify in skyway."
- **A specific test case implements the diamond walked through above** (4 migrations, 4 `Requires:` edges, expected order asserted) and is added to `packages/core/src/__tests__/resolver.test.ts`.
- A live test run on a snapshot of the current `next` branch's migrations produces an identical applied-migration ordering to today (no `Requires:` blocks → behavior unchanged).
- A constructed test scenario with two repos worth of migrations and three `Requires:` edges between them produces the topologically correct order — verified by inspecting `flyway_schema_history.installed_rank` after running.
- Documentation in [migrations/CLAUDE.md](migrations/CLAUDE.md) shows the canonical pattern for declaring cross-schema dependencies.

---

### 4.2 Tolerant metadata-management SPs (`__mj.spCreateEntity` and friends)

**Tag:** `[MJ]`
**Owner:** TBD (CodeGen maintainer)
**Effort:** Medium (~1 week including tests + a one-time regen pass for the targeted SPs)
**Dependencies:** §3.2 (policy approved)

**Problem.** This is the metadata-migration version-skew fix — the single highest-leverage item in the plan. Downstream-app migrations call MJ's metadata-management SPs directly: a generated CodeGen migration emits SQL like `EXEC [__mj].[spCreateEntity] @Name='Foo', @BaseTable='Foo', @SchemaName='__mj_Tasks', ...` with the parameter list as it existed at the moment that migration was generated. That EXEC sits in the migration history forever. When MJ later adds a new required parameter to `spCreateEntity` (e.g. `@AllowAuditLog`), the historical EXEC fails on every fresh database that replays the migration history against the newer MJ.

**Critically, this problem is narrow.** It applies to the small set of `__mj`-schema SPs that downstream migrations actually `EXEC`:

- `spCreateEntity`
- `spCreateEntityField`
- `spUpdateExistingEntitiesFromSchema`
- `spDeleteUnneededEntityFields`
- `spRecompileAllViews`
- `spRecompileAllProceduresInDependencyOrder`
- and a handful of similar metadata-management SPs

Per-entity SPs (`spCreateAddress`, `spUpdatePerson`, etc.) are **out of scope here**. They're emitted by codegen alongside their entity, called only by `BaseEntity.Save()` at runtime, and regenerated whenever the entity changes — they cannot be version-skewed because the running app and the SP it calls always come from the same codegen run. Putting tolerance rules on per-entity SPs would expand the surface area of the change without addressing any real failure mode.

**Approach.** Per the SP compatibility policy (§3.2), modify the codegen path that emits the metadata-management SPs so that:

- Every non-required parameter gets a default of `NULL`. The SP body applies the column's database default via `ISNULL(@Param, <default>)`.
- For `spUpdate*` flavors, all non-PK parameters get `NULL` defaults and use `[Col] = ISNULL(@Param, [Col])` merge semantics — omitting a parameter preserves the existing row value.
- For nullable columns where `NULL` is itself meaningful, codegen emits a companion `@<Param>_Clear bit = 0` parameter so callers can distinguish "leave unchanged" from "set to NULL."

The MJ-build CodeGen run regenerates the targeted SPs once. The result lands as a single new migration in `migrations/v5/` that drops and recreates the metadata-management SPs in the `__mj` schema with the tolerant signatures. Going forward, the policy in §3.2 guards against regressions; the codegen emission for these specific SPs ensures any future regen produces tolerant output.

**Files to modify (primary change):**

- [packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts](packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts) — the SP-emission code path used by the MJ build to produce the metadata-management SPs. Concretely:
  - `generateCRUDParamString` (around line 801) — broaden the `= NULL` default emission to cover any non-required parameter, not just primary keys + has-default fields. The current narrow rule was correct when the only problem to solve was "let callers omit auto-generated PKs"; the new rule reflects the §3.2 policy.
  - `generateSPCreate` (the function that builds the `spCreate*` body — search for `CREATE PROCEDURE.*spCreate`) — wrap column references with `ISNULL` against database defaults pulled from entity-field metadata. Existing GUID-default handling at lines 168 and 817-820 (per the prior research note) is the pattern to extend.
  - `generateSPUpdate` (sibling) — wrap target columns with `ISNULL(@Param, [Column])` for merge semantics. Add the `_Clear` companion-parameter emission for nullable columns whose `NULL` is semantic.
- [packages/CodeGenLib/src/Database/providers/sqlserver/__tests__/SQLServerCodeGenProvider.test.ts](packages/CodeGenLib/src/Database/providers/sqlserver/__tests__/SQLServerCodeGenProvider.test.ts) (new file, or extend the existing test surface in this package) — golden-master tests on the generated SQL for: a metadata-management SP with all parameter shapes (PK, required, nullable, default-bearing, semantic-NULL).

**Per-entity SPs are not modified.** The `generateCRUDParamString` change *would* affect per-entity SP emission too, since it's the same shared code path. Two options:

1. **Apply the change uniformly.** All codegen-emitted SPs (per-entity and metadata-management) get the tolerant signatures. Cost: every per-entity SP across every consumer regenerates with broader signatures on next codegen run. No real downside since the change is strictly broader (every previously-accepted call still works), but it's a larger blast radius than necessary.
2. **Apply the change only to metadata-management SPs.** Add a flag or a separate emission path for SPs that downstream migrations call directly. Smaller blast radius but more code complexity.

**Recommendation: Option 1.** Per-entity SPs gaining merge-update semantics is a programmer-UX win (the issue thread flagged this explicitly). The blast radius is just "next codegen run produces broader signatures everywhere," which is exactly the kind of change codegen exists to absorb. Option 2 is available if reviewers prefer the narrower scope.

**Files to verify (not modify):**

- A regen pass against the MJ core entities should produce metadata-management SPs whose signatures are strictly broader than today. Concretely: every parameter that *was* required must still accept its previous values; previously-required parameters may become optional.
- Existing migration history (any `EXEC __mj.spCreateEntity ...` call from old downstream migrations) must continue to apply cleanly against a fresh database that has the new tolerant SPs.

**SQL pattern emitted (illustrative, not exhaustive):**

`spCreate*` parameter list (after change):

```sql
CREATE PROCEDURE [__mj].[spCreateEntity]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),                        -- required: NOT NULL, no default
    @SchemaName nvarchar(255) = NULL,           -- has default in schema
    @BaseTable nvarchar(255),                   -- required
    @AllowUserSearchAPI bit = NULL,             -- has default in schema
    @AllowAuditLog bit = NULL,                  -- new column, default in schema
    -- ...
AS
BEGIN
    INSERT INTO [__mj].[Entity] (
        [ID], [Name], [SchemaName], [BaseTable], [AllowUserSearchAPI], [AllowAuditLog], ...
    ) VALUES (
        ISNULL(@ID, NEWSEQUENTIALID()),
        @Name,
        ISNULL(@SchemaName, '__mj'),
        @BaseTable,
        ISNULL(@AllowUserSearchAPI, 1),
        ISNULL(@AllowAuditLog, 0),
        ...
    );
    -- ...
END
```

`spUpdate*` parameter list (after change):

```sql
CREATE PROCEDURE [__mj].[spUpdateEntity]
    @ID uniqueidentifier,                       -- PK, required
    @Name nvarchar(255) = NULL,
    @SchemaName nvarchar(255) = NULL,
    @AllowAuditLog bit = NULL,
    @Description_Clear bit = 0,                 -- companion: set to 1 to clear nullable Description
    @Description nvarchar(max) = NULL,
    -- ...
AS
BEGIN
    UPDATE [__mj].[Entity] SET
        [Name] = ISNULL(@Name, [Name]),
        [SchemaName] = ISNULL(@SchemaName, [SchemaName]),
        [AllowAuditLog] = ISNULL(@AllowAuditLog, [AllowAuditLog]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        -- ...
    WHERE [ID] = @ID;
END
```

**The key win.** A historical downstream migration that called `EXEC __mj.spCreateEntity @Name='X', @BaseTable='X'` (without `@AllowAuditLog`) now succeeds against the newer MJ because `@AllowAuditLog` defaults to `NULL` and `ISNULL(@AllowAuditLog, 0)` applies the schema default. The historical SQL doesn't change; the SP it calls is now tolerant.

**Acceptance criteria:**

- Golden-master tests for the metadata-management SP signature shapes pass: PK-only, all-required, mixed required/nullable/default-bearing, and at least one with a semantic-NULL column requiring the `_Clear` companion.
- A regen pass on the MJ core entities produces metadata-management SPs whose signatures strictly subsume the current behavior. No previously-working `EXEC __mj.sp*` call from any historical migration in this repo breaks.
- Manual smoke test: take a representative downstream app (e.g. `bizapps-tasks`), run its full migration history against a fresh MJ database that has the regenerated tolerant SPs applied. All historical migrations apply cleanly.
- The policy doc (§3.2) is referenced in code comments at the top of `generateCRUDParamString` so future maintainers know why the defaults are there.
- A test fixture deliberately invokes `EXEC __mj.spCreateEntity` with a parameter list that's missing one new optional parameter; the EXEC succeeds and the resulting row has the column's database default applied via `ISNULL`.

#### Cleanup pattern for retired entities

When an app drops an entity (e.g., BCSaaS dropping `Contact` in step 5 of the §6.5 playbook), the entity's metadata rows in `__mj.Entity`, `__mj.EntityField`, etc. become orphans pointing at a non-existent table. Without explicit cleanup, those rows persist forever — `RunView` calls against the dead entity would fail with confusing errors, and `__mj.spUpdateExistingEntitiesFromSchema` would either leave them alone or attempt a re-sync that fails on the missing table.

**Today's `__mj.spDeleteEntity` does NOT cascade.** It only deletes the `__mj.Entity` row. Dependent rows in `EntityField`, `EntityFieldValue`, `EntityRelationship`, `EntityPermission`, etc. remain. A naive `EXEC __mj.spDeleteEntity` against an entity with relationships will succeed and produce a more orphaned mess.

**Canonical cleanup sequence** (apply in order; each step is idempotent):

```sql
-- 1. Remove relationship rows (both directions)
DELETE FROM [__mj].[EntityRelationship]
WHERE EntityID = @RetiredEntityID OR RelatedEntityID = @RetiredEntityID;

-- 2. Remove permission grants
DELETE FROM [__mj].[EntityPermission] WHERE EntityID = @RetiredEntityID;

-- 3. Remove value-list entries (dropdowns reference EntityField; capture those EntityField IDs first)
DELETE FROM [__mj].[EntityFieldValue]
WHERE EntityFieldID IN (SELECT ID FROM [__mj].[EntityField] WHERE EntityID = @RetiredEntityID);

-- 4. Remove field rows
DELETE FROM [__mj].[EntityField] WHERE EntityID = @RetiredEntityID;

-- 5. Remove the entity row itself (or use spDeleteEntity which only does this step)
EXEC [__mj].[spDeleteEntity] @ID = @RetiredEntityID;
```

**Recommendation: extend `spDeleteEntity` to be the canonical cleanup**. Wrap steps 1-5 above into the existing `spDeleteEntity` body, with the existing single-row DELETE replaced by the full cascade. Two reasons:

1. Right now consumers either know to do all five steps or they don't. The plan's stated goal is to reduce the surface area where developers have to know things that aren't documented in code. Folding the cascade into the SP turns it into one EXEC call that's hard to misuse.
2. Per the §3.2 policy, `spDeleteEntity` already accepts a single `@ID` parameter. Making it do more on the same input is a strictly broader behavior change — the existing single-row delete is now a degenerate case of "delete this entity and everything that points at it." Compatible with the SP-tolerance policy.

**Caveat that the SP rewrite must handle:** if any rows in `__mj.EntityRelationship` reference the retired entity from *other* apps (e.g., a custom relationship somebody added that joins the retired entity to one of their own), the cascade will silently delete those custom relationship rows too. This is correct behavior (the relationship can't be valid once the entity is gone), but the SP should log a `RAISERROR(..., 10, ...)` informational notice listing how many cross-entity relationships were removed, so a customer running the migration sees the cleanup happened.

**Files to modify** (additive to §4.2's primary changes):

- The same codegen path that emits `__mj.spDeleteEntity` — extend the SP body to include the cascade as documented above.
- A test fixture in the SP test suite: insert a multi-row metadata graph (Entity + 3 fields + 2 relationships + 5 permissions + 4 field values), invoke `spDeleteEntity`, assert all 15 rows are gone.

---

### 4.3 OpenApp version pinning (semver-style)

**Tag:** `[MJ]`
**Owner:** TBD (Open App team)
**Effort:** Medium-Large (~1 week)
**Dependencies:** §3.3 (header dependencies provide the per-migration grain that pinning constrains at the app grain)

**Problem.** When App A consumes OpenApps B and C (sibling apps that themselves depend on MJ + BAC), there's no contract today that says "App A is built against B@1.x and C@2.x." If A's customer installs B@2.0 (a major version with breaking changes), A may break. This is the npm dependency-resolution problem applied to OpenApps.

This is distinct from SaaS-product MJ-version pinning (which we're explicitly deferring). It applies between **sibling OpenApps** and is the npm-style contract identified on the issue thread as the right scope for "Option 4."

**Approach.** Add a `consumes` block to OpenApp manifests with semver-style range strings. At install time, the Open App engine resolves the dependency graph and either succeeds (compatible versions present) or fails with a clear "App A wants B in range X but B@Y is installed" error.

**Files to modify in `packages/Apps/OpenAppEngine/`** (or wherever the engine lives — exact path TBD pending engine maintainer input):

- Manifest schema — add `consumes: { [appName: string]: string }` where the value is a semver range (`^1.0.0`, `~2.1`, `>=1.5 <2`, etc.).
- Install resolver — before applying any migrations, check the engine's installed-app registry for each name in `consumes` and verify the installed version satisfies the declared range. Use the existing semver library if one is already a dependency; otherwise add `semver`.
- Install-time error path — fail fast with a structured error listing every unsatisfied dependency.

**Files to add:**

- [docs/openapp/version-pinning.md](docs/openapp/version-pinning.md) (new) — user-facing documentation: how to declare `consumes`, what range syntax is supported, what happens at install time when ranges aren't satisfied, how to upgrade a pinned dependency.

**Manifest example:**

```json
{
  "name": "Committees Pro",
  "version": "1.4.2",
  "consumes": {
    "Committees": "^1.4.0",
    "Tasks": "~2.1",
    "BizAppsCommon": ">=0.9 <2.0"
  }
}
```

**Interaction with `Requires:` (§3.3).** Migration-level `Requires:` is *finer-grained* than app-level `consumes`. Migration-level says "this specific migration depends on this specific upstream migration." App-level says "this app depends on this version range of that other app." Both are necessary:
- Migration-level catches "BCSaaS migration #47 depends on BAC migration #12" — fine-grained ordering.
- App-level catches "Committees Pro requires Committees ≥ 1.4.0" — coarse-grained compatibility envelope.
- They don't replace each other; they work together.

**Acceptance criteria:**

- A test app that declares `consumes: { OtherApp: "^1.0.0" }` installs successfully when `OtherApp@1.5.0` is present.
- The same test app fails fast with a clear error when `OtherApp@2.0.0` is present.
- Upgrade flow: bumping a `consumes` constraint on App A from `^1.0.0` to `^2.0.0` is caught by §3.4's CI validation (the manifest-validation step verifies range syntax) and triggers a re-resolution at install time.
- Documentation walks through the npm-parallel mental model so consumers of OpenApps already familiar with npm semver get oriented in under five minutes.

---

## 5. Phase 3 — Deferred / Conditional

The following items from #2487 are explicitly **not** in scope for Phase 1 or Phase 2. They are listed here for completeness so future readers don't re-litigate.

### 5.1 Composite baselines (Issue Option 2)

**Status:** Deferred indefinitely.
**Rationale:** Per the issue thread: "blows up componentization/encapsulation that OpenApp intends to create." Composite snapshots assume a linear stack; OpenApp diamond dependencies fragment the snapshot model combinatorially. Phase 2.2 (tolerant SPs) absorbs the metadata version-skew problem that baselines were partially solving, *without* the encapsulation cost.
**Revisit trigger:** Significant operational pain on the fresh-install case for an OpenApp consumed at three or more layers deep, where Phase 2.1 ordering proves insufficient. Not anticipated.

### 5.2 Composer-tool distribution (Issue Option 3, distribution case)

**Status:** Deferred indefinitely.
**Rationale:** Same encapsulation concern as 5.1, plus significant new tool to build, maintain, and version. Reframed during review as **composer-lite for validation/planning**, not distribution — see 5.3.
**Revisit trigger:** Diamond-dependency pain that Phase 1.4 (CI graph validation) can't surface at PR time.

### 5.3 Composer-lite for validation (Issue Option 3, validation-only reframe)

**Status:** Conditional. Build only if Phase 1.4 + Phase 2.1 prove insufficient.
**What it would be:** A tool that, given a declared set of installed app versions, *validates* that the implied migration set composes coherently — without actually generating or shipping a snapshot. Output is a pass/fail diagnostic, not a migration artifact.
**Revisit trigger:** Three or more reported incidents where Phase 1.4 missed a cross-app conflict that only surfaced at install time.

### 5.4 SaaS-product-level MJ-version pinning

**Status:** Deferred to a separate conversation.
**Rationale:** Different problem from inter-app pinning (§4.3). SaaS products pinning MJ versions slows downstream MJ uptake, which the org has explicitly *not* been willing to accept. A separate doc should weigh that tradeoff once Phase 2 is in production for a quarter.
**Revisit trigger:** A specific SaaS product's quarterly planning surfaces a need to lag MJ versions. At that point, decide per-product, not as a global policy.

---

## 6. Cross-Cutting Concerns

### 6.1 Order of Operations (Phase 1 → Phase 2)

| Item | Blocks | Is blocked by |
|---|---|---|
| §3.1 CLI generator | §3.3, §3.4 (both consume the canonical filename + header format) | Nothing |
| §3.2 SP policy | §4.2 implementation | Nothing |
| §3.3 `Requires:` parsing | §3.4, §4.1, §4.3 | §3.1 (header format) |
| §3.4 CI validation | (gates everything in Phase 2) | §3.3 |
| §4.1 Holistic ordering | (none in this plan) | §3.3, §3.4 |
| §4.2 Tolerant SPs | (none in this plan) | §3.2 |
| §4.3 OpenApp pinning | (none in this plan) | §3.3 |

**Concrete recommended sequencing:**

1. Land §3.1 (CLI generator) and §3.2 (SP policy) in parallel — both small, independent, unblock everything else.
2. Land §3.3 (`Requires:` parsing) — small, blocked only by §3.1.
3. Land §3.4 (CI validation) — turns the parser into an enforcement mechanism.
4. Begin §4.1 (holistic ordering), §4.2 (tolerant SPs), and §4.3 (OpenApp pinning) in parallel. They share no code; they can land independently.

### 6.2 Backward Compatibility

Every Phase 1 item is opt-in. Existing migrations work unchanged. Existing CLI invocations work unchanged. Existing CI works unchanged.

Phase 2.1 (holistic ordering) is opt-in via `additionalMigrationsLocations` and `Requires:` — repos that don't use either get pure-timestamp ordering identical to today.

Phase 2.2 (tolerant SPs) is the only item that changes generated output. The change is strictly broader (no parameter that was accepted before is rejected after). A regen pass during Phase 2.2 produces a single migration that updates the SPs in place — no new entity columns, no schema changes, just SP body rewrites.

Phase 2.3 (OpenApp pinning) is opt-in via the manifest. Apps without a `consumes` block install unchanged.

### 6.3 Testing Strategy

- Unit tests for every new parser/validator/generator module live alongside the source.
- Integration test for §4.1 lives in skyway-core's repo: scan a fixture directory tree, resolve, compare expected order.
- End-to-end test for §4.2 lives here: run a representative downstream app's full migration history against a fresh MJ database after the SP changes ship. Asserts every historical migration applies.
- §3.4 validates *this repo's own* migrations on every PR — that's the dogfood.

### 6.4 Rollout Plan

- Phase 1 ships in a normal MJ minor version (e.g. 5.31.x). No customer impact; tooling additions only.
- Phase 2.1 ships when skyway-core 0.6.x is released and MJCLI bumps its dependency. Customer-visible: nothing, unless they opt into `Requires:` or `additionalMigrationsLocations`.
- Phase 2.2 ships in a normal MJ minor with a regen of `__mj` SPs. Customer-visible: SPs in their `__mj` schema get updated. The update is backwards-compatible. Document in release notes that downstream-app migrations now have stronger version-skew tolerance.
- Phase 2.3 ships when the Open App team is ready. Customer-visible: OpenApps can declare `consumes`; the engine starts enforcing them. Existing OpenApps without `consumes` continue working unchanged.

### 6.5 Cross-app entity replacement playbook

This subsection documents the canonical sequence for replacing one app's entity with another app's entity across multiple consumer products. The first concrete instance is the BAC/BCSaaS lift (Izzy/Skip/MJC migrating from `BCSaaS.Contact`/`BCSaaS.Organization` to `BAC.Person`/`BAC.Organization`), but the pattern applies to any future case where multiple apps consume an entity that's being relocated to a shared layer.

**The plan ships the primitives that make this safe** (`Requires:` headers, holistic ordering, tolerant metadata SPs, OpenApp pinning). This subsection ties them together into an authoring sequence so three independent product teams writing migrations against the same lift have a shared mental model. **Per-product migrations themselves are out of scope** — those are authored by the product teams against their own data.

#### The canonical sequence

The replacement is structured as a chain of migrations across the source-app, target-app, and each consumer-app. Every migration after the first declares `Requires:` against the previous step. CI validation (§3.4) catches a broken chain at PR review; runtime (§4.1) refuses to install a broken chain at customer install.

| Step | Owner | What it does | `Requires:` |
|---|---|---|---|
| 1 | Target app (BAC) | Ensures target entity exists with the columns consumers will need. Either no-op (already exists) or an additive schema change. | (none) |
| 2 | Source app (BCSaaS) | Backfill migration: copies data from source entity (`BCSaaS.Contact`) into target entity (`BAC.Person`). Idempotent — safe to re-run. Establishes a stable identity mapping (preserve old `Contact.ID` as new `Person.ID`, or maintain a translation table — must be decided per-lift). | Step 1 |
| 3a, 3b, 3c, ... | Each consumer (Izzy, Skip, MJC) | For each consumer: add new FK columns pointing at the target entity, copy values from old FK columns to new FK columns, drop old FK constraints, drop old FK columns. **Each consumer's step is independent of the others and can run in parallel.** | Step 2 |
| 4 | Source app (BCSaaS) | Drop the old source table. | **Step 3 in EVERY consumer.** This is the cross-cutting `Requires:` that the plan's primitives are designed to enforce. |
| 5 | Source app (BCSaaS) | Clean up `__mj.Entity` row (and dependent metadata rows) for the now-dropped source entity. | Step 4 |
| 6 | Each consumer | Bump the consumer's `consumes:` declaration (§4.3) for the source app to a version range that requires step 4 to be installed. Prevents a customer from installing an old version of the consumer against a post-step-4 source app. | Step 4 |

#### What each plan primitive buys you for this sequence

- **§3.1 (`mj migrate create`)** — UTC timestamps mean step 4's drop migration in BCSaaS can't accidentally end up dated *before* step 3 in a consumer just because somebody authored the file in a different timezone.
- **§3.3 (`Requires:` headers)** — encodes the dependency chain explicitly. Step 4 declares `Requires: Izzy:V<step3-Izzy>; Skip:V<step3-Skip>; MJC:V<step3-MJC>` — the resolver enforces it.
- **§3.4 (CI graph validation)** — at PR time, when BCSaaS authors the step-4 drop migration, the validator checks that every declared `Requires:` resolves to a real migration somewhere. If Izzy hasn't shipped its step-3 migration yet, CI fails the PR with a structured error and the engineer knows to coordinate with Izzy first.
- **§4.1 (holistic ordering, strict-fail)** — at install time, if a customer tries to install BCSaaS step 4 without having installed Izzy step 3, the resolver refuses with a `MissingDependencyError` *before any DDL runs*. No half-migrated state, no FK violation mid-script.
- **§4.2 (tolerant metadata-management SPs)** — step 5's metadata cleanup uses `__mj.spDeleteEntity` and similar. With tolerant signatures, those calls keep working even as MJ evolves.
- **§4.3 (OpenApp pinning)** — step 6 prevents the inverse of the install-time check: a customer trying to install an *old* consumer (still expecting the dropped table) against a *new* source app (where the table is gone). Pinning enforces "this version of Izzy requires BCSaaS in a range that has the old `Contact` removed."

#### What's out of scope of this playbook

- **Identity reconciliation strategy.** Whether to preserve old PKs, generate new ones with a translation table, or merge with existing target rows is per-lift. Step 2's backfill migration is where this decision lives, and it's hand-authored by the source-app team.
- **Per-customer data execution.** Some customers will have dirty data (orphaned FKs, missing rows, casing differences in canonical strings). The migration shouldn't silently paper over those — author it to fail loudly on inconsistencies, then triage per-customer.
- **Release sequencing.** The order in which products ship the migrations to customers (BAC's release first, then BCSaaS's backfill, then each consumer, then BCSaaS's drop) is a release-management decision. The plan's primitives ensure no customer can install them in the wrong order, but they don't decide what order you ship them in.
- **Runtime entity-name changes in consumer code.** When Izzy code references `BCSaaS.Contact` as a string, that's a code change that ships alongside (not as part of) the migrations. Out of scope here.

#### What this playbook does NOT replace

This is a structural template, not a per-lift plan. Each replacement effort still needs its own:

- **Per-lift plan document** (e.g., `plans/bac-bcsaas-entity-lift.md`) covering the data-reconciliation strategy, per-product mappings, customer rollout schedule, rollback considerations.
- **Per-product migration code** authored by Izzy, Skip, and MJC teams.
- **End-to-end test pass** against representative customer database snapshots before any production rollout.

This section ensures three teams writing against the same template produce migrations that compose. It does not write the migrations for them.

---

## 7. File Inventory

### 7.1 Files to add (this repo)

| File | Phase | Purpose |
|---|---|---|
| [packages/MJCLI/src/commands/migrate/create.ts](packages/MJCLI/src/commands/migrate/create.ts) | §3.1 | New oclif command |
| [packages/MJCLI/src/commands/migrate/validate.ts](packages/MJCLI/src/commands/migrate/validate.ts) | §3.4 | New oclif command |
| [packages/MJCLI/src/lib/migrationFilename.ts](packages/MJCLI/src/lib/migrationFilename.ts) | §3.1 | Pure filename builder |
| [packages/MJCLI/src/lib/migrationGraphValidator.ts](packages/MJCLI/src/lib/migrationGraphValidator.ts) | §3.4 | Pure graph validator |
| [packages/MJCLI/src/__tests__/migrationFilename.test.ts](packages/MJCLI/src/__tests__/migrationFilename.test.ts) | §3.1 | Vitest |
| [packages/MJCLI/src/__tests__/migrationGraphValidator.test.ts](packages/MJCLI/src/__tests__/migrationGraphValidator.test.ts) | §3.4 | Vitest |
| [docs/standards/SP_COMPATIBILITY_POLICY.md](docs/standards/SP_COMPATIBILITY_POLICY.md) | §3.2 | Written contract |
| [docs/openapp/version-pinning.md](docs/openapp/version-pinning.md) | §4.3 | User docs |

### 7.2 Files to modify (this repo)

| File | Phase | Change |
|---|---|---|
| [packages/MJCLI/src/config.ts](packages/MJCLI/src/config.ts) | §4.1 | Add `additionalMigrationsLocations`, extend `getSkywayConfig` |
| [packages/MJCLI/src/commands/migrate/index.ts](packages/MJCLI/src/commands/migrate/index.ts) | §4.1 | Add `--include` flag |
| [packages/MJCLI/README.md](packages/MJCLI/README.md) | §3.1, §3.4 | Document new commands |
| [packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts](packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts) | §4.2 | Tolerant SP emission |
| [migrations/CLAUDE.md](migrations/CLAUDE.md) | §3.1, §3.3, §4.1 | New filename rules, `Requires:` syntax, multi-location |
| [CLAUDE.md](CLAUDE.md) | §3.2 | Link the SP compatibility policy |
| [packages/CodeGenLib/CLAUDE.md](packages/CodeGenLib/CLAUDE.md) | §3.2 | Link the SP compatibility policy |
| [.github/workflows/](.github/workflows/) | §3.4 | Add `mj migrate validate` step |

### 7.3 Files to add/modify in `MemberJunction/skyway`

| File | Phase | Change |
|---|---|---|
| `packages/core/src/migration/parser.ts` | §3.3 | `ParseMigrationHeader` for `Requires:` |
| `packages/core/src/migration/types.ts` | §3.3 | Add `requires?: string[]` |
| `packages/core/src/migration/resolver.ts` | §3.3, §4.1 | Topological merge with timestamp tiebreaker |
| `packages/core/src/migration/scanner.ts` | §4.1 | Retain originating Location on each `MigrationInfo` |
| `packages/core/src/core/skyway.ts` | §4.1 | `LogResolvedOrder` verbose flag |
| `packages/core/src/__tests__/parser.test.ts` | §3.3 | Header-parsing coverage |
| `packages/core/src/__tests__/resolver.test.ts` | §4.1 | Topological merge coverage |

### 7.4 Per-repo work breakdown (for parallel execution)

**`MemberJunction/MJ` (this repo):**

- Phase 1: §3.1, §3.2, §3.4 (consumer-side of §3.3)
- Phase 2: §4.1 CLI surface, §4.2, §4.3

**`MemberJunction/skyway`:**

- Phase 1: §3.3 (parser/types/resolver primitives)
- Phase 2: §4.1 runner-side (topological merge, multi-location scanner, verbose logging)

The skyway-side work in each phase is small relative to the MJ-side work. Once §3.3 lands in skyway-core 0.6.0 and MJ bumps the dependency, MJ-side Phase 1 tasks unblock. Once §4.1's runner work lands in skyway-core 0.7.0, MJ's Phase 2 ordering integration unblocks.

---

## 8. Open Questions

These are issues this plan deliberately does not resolve. Each needs a decision before the corresponding section enters implementation.

1. **§3.3 dependency string format — schema:version:prefix vs just prefix?** The plan currently mandates the trio. Argument for shorter (`prefix` only): less typo surface. Argument for trio: unambiguous if a customer happens to have two apps with overlapping timestamp prefixes. **Default:** keep the trio unless the parser implementation surfaces a reason to change.

2. **§4.2 — should the tolerant SP changes ship as part of a normal codegen regen, or as a one-time hand-authored migration?** Regen is consistent; hand-authored is faster to land. **Default:** regen, because it ensures every entity's SPs are updated uniformly and stays consistent with the source of truth.

3. **§4.2 — what's the policy for nullable columns where `NULL` is genuinely meaningful?** The plan proposes `@<Param>_Clear bit = 0` companions. Alternatives: a single `@__ClearFields nvarchar(max)` listing column names. The companion approach scales linearly in parameter count; the list approach scales linearly in *one* parameter but pushes complexity into the parser. **Default:** companion approach for clarity.

4. **§4.3 — does pinning apply to the OpenApp's MJ dependency too, or only inter-app?** The plan as written is inter-app-only. Adding MJ-pinning here would conflict with §5.4 (deferred SaaS-product MJ-pinning). **Default:** inter-app only; MJ-version pinning stays out.

5. **§3.4 — should CI validation be advisory (warn) or blocking (fail) for the first release?** Blocking is the goal but may surface false positives during initial rollout. **Default:** advisory for the release that introduces it; flip to blocking one release later if no false positives are reported.

6. **Skyway repo dependency.** This plan assumes the Skyway team can commit to the §3.3 and §4.1 work on a parallel cadence. If they can't, the order of operations shifts: §3.4 can still ship in MJ as advisory-only, but §4.1 blocks until Skyway lands. **Default:** confirm with Skyway maintainer before locking the timeline.

---

*End of plan. Comment inline on this file to discuss specific items.*
