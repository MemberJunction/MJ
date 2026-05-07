# Cross-Application Migration Ordering — Architecture Plan

**Status:** Active (revised 2026-04-30 to reflect 2026-04-29 architecture meeting)
**Tracking issue:** [#2487](https://github.com/MemberJunction/MJ/issues/2487)
**Pre-meeting version:** [plans/archive/cross-app-migration-ordering.pre-meeting-revision.md](archive/cross-app-migration-ordering.pre-meeting-revision.md)
**Repos affected:** `MemberJunction/MJ` (this repo). **Skyway needs no changes.**

---

## Table of Contents

1. [Context](#1-context)
2. [The Three Pillars](#2-the-three-pillars)
3. [Phase 1 — Foundation](#3-phase-1--foundation)
   - 3.1 [Tolerant `spCreate` / `spUpdate` codegen](#31-tolerant-spcreate--spupdate-codegen-mj) `[MJ]`
   - 3.2 [Publish-then-no-breaking-changes policy](#32-publish-then-no-breaking-changes-policy-policy) `[Policy]`
   - 3.3 [New baseline cadence](#33-new-baseline-cadence-mj) `[MJ]`
4. [Phase 2 — Installer integration](#4-phase-2--installer-integration)
   - 4.1 [OpenApp installer respects the dependency graph](#41-openapp-installer-respects-the-dependency-graph-mj) `[MJ]`
   - 4.2 [OpenApp version pinning enforcement](#42-openapp-version-pinning-enforcement-mj) `[MJ]`
   - 4.3 [Pre-install validation](#43-pre-install-validation-mj) `[MJ]`
5. [Phase 3 — Deferred / Out of scope](#5-phase-3--deferred--out-of-scope)
6. [Cross-cutting concerns](#6-cross-cutting-concerns)
7. [File inventory](#7-file-inventory)
8. [Open questions](#8-open-questions)

---

## 1. Context

This plan operationalizes the architectural direction agreed on issue [#2487](https://github.com/MemberJunction/MJ/issues/2487) and the 2026-04-29 cross-application migration meeting. It supersedes the original draft, which was authored before the meeting and proposed a topological-sort-with-`Requires:`-headers approach to cross-schema migration ordering.

### The problem

Our application stack is no longer a single product. A SaaS deployment is composed of layers — MJ → Biz Apps Common → BCSaaS → SaaS product (Skip / Izzy / MJC) — plus optional OpenApps that consume one or more of the layers below. Each layer has its own migration history, its own release cadence, and can introduce changes that other layers depend on. Two failure classes have surfaced:

- **DDL ordering across schemas.** A downstream FK references an upstream table; upstream wants to drop or restructure that table; SQL Server refuses the drop because the FK is physically present. Or fresh-install replay produces a logical contradiction.
- **Metadata-migration version-skew.** Codegen-emitted migrations call MJ's metadata-management SPs (`spCreateEntity`, etc.) with the parameter list as it existed at codegen time. If MJ later adds a required parameter, the historical EXEC fails on every fresh database that replays that migration history against a newer MJ.

The BAC/BCSaaS Person/Organization lift surfaced both classes simultaneously and forced the architecture decision.

### The meeting's resolution

The architecture rests on **three pillars** plus one Phase 2 enforcement layer:

- **Tolerant SP signatures** (Pillar 1) — eliminate version-skew by construction.
- **Publish-then-no-breaking-changes policy** (Pillar 2) — prevent the schema-drop scenarios that require cross-schema ordering in the first place.
- **OpenApp dependency-order installation** (Pillar 3) — already partially in place; the OpenApp manifest declares dependencies and the installer runs apps in topological order. Skyway runs one schema at a time as it always has.
- **OpenApp version pinning** (Phase 2) — npm-style semver ranges between sibling apps so an installer refuses incompatible combinations.

### What was rejected

- `Requires:` headers in migration files — couples schemas at the wrong grain when the OpenApp manifest already encodes the dependency.
- Cross-schema topological merge in Skyway — Skyway stays per-schema; ordering across apps is the installer's job.
- Composite baselines per SaaS product (original Option 2) — antithetical to OpenApp componentization.
- Composer-tool distribution (original Option 3) — same reason.
- SP versioning shims (`spCreateEntity_v2` + `RAISERROR` deprecation cycle) — directly contradict the publish-no-break policy.
- `mj migrate create` CLI generator — was raised mid-meeting in support of cross-schema interleaving; both got walked back in the wrap-up consensus.
- Cross-schema interleaving by timestamp — explicitly rejected as "really brittle" once the OpenApp installer's dependency-order solution was understood.

### Constraints carried forward from #2487

- Do not edit historical migrations in place (Skyway checksum validation, audit trail).
- Do not require product teams to manually orchestrate cross-layer ordering on every upgrade.
- Must serve both populations: existing databases (in-place upgrade path) and fresh databases (replay or compose without contradictions).
- Cannot slow upstream layers down. MJ iterates fast; that's a non-negotiable.

---

## 2. The Three Pillars

The architecture rests on three independent pieces. Each is necessary; together they're sufficient.

### Pillar 1 — Tolerant SP signatures

`spCreate*` and `spUpdate*` codegen emits SPs that accept `NULL` for any non-required parameter, preserve existing values on update when a parameter is omitted, and apply column defaults on create when a parameter is omitted. Eliminates the metadata-migration version-skew failure class by construction. See §3.1 for implementation.

### Pillar 2 — Publish-then-no-breaking-changes policy

Once an OpenApp version is published, within that major version: no dropping tables, no dropping columns, no narrowing column types, no removing/renaming SP parameters. Only additive changes. Breaking changes force a major version bump (OpenApp 1.x → 2.0). The policy is a hard rule, not a guideline. See §3.2 for the full rule and the BAC/BCSaaS lift as the cautionary example.

### Pillar 3 — OpenApp dependency-order installation

The OpenApp installer reads each app's manifest, walks the dependency graph, and runs each app's migrations in dependency order. Within each app, Skyway handles per-schema migration ordering exactly as it does today; ordering *across* apps is the installer's job, not Skyway's. See §4.1 for the contract.

> **Note on the schema mapping:** "App" and "schema" are not strictly 1:1. Most OpenApps own a dedicated schema (BizApps Common → `__mj_BizAppsCommon`, BCSaaS → `__BCSaaS`, etc.), but some apps will attach to an existing schema (e.g. the Salesforce / CRM integration metadata that lives in MJ's `__mj` schema). The dependency graph operates at the app grain regardless; the installer dispatches each app's migrations to the appropriate schema target.

---

## 3. Phase 1 — Foundation

Land the foundational pieces first. Validate stability before building anything on top. The meeting consensus was explicit: set the foundation, validate against existing apps, then do the migration-ordering work after.

### 3.1 Tolerant `spCreate` / `spUpdate` codegen `[MJ]`

**Owner:** TBD (CodeGen maintainer)
**Effort:** Medium (~1 week including tests + a one-time regen pass)
**Dependencies:** §3.2 policy approved before implementation begins

#### Problem

Downstream-app migrations call MJ's metadata-management SPs directly: a generated CodeGen migration emits SQL like `EXEC [__mj].[spCreateEntity] @Name='Foo', @BaseTable='Foo', @SchemaName='__mj_Tasks', ...` with the parameter list as it existed at the moment that migration was generated. That EXEC sits in the migration history forever. When MJ later adds a new required parameter to `spCreateEntity` (e.g. `@AllowAuditLog`), the historical EXEC fails on every fresh database that replays the migration history against the newer MJ.

The fix is contractual: tolerant SP signatures by default, so omitting a parameter is always safe.

#### Approach

Modify the codegen path that emits SPs so that:

- Every non-required parameter gets a default of `NULL`. The SP body applies the column's database default via `ISNULL(@Param, <default>)`.
- For `spUpdate*` flavors, all non-PK parameters get `NULL` defaults and use `[Col] = ISNULL(@Param, [Col])` merge semantics — omitting a parameter preserves the existing row value.
- For nullable columns where `NULL` is itself meaningful, codegen emits a companion `@<Param>_Clear bit = 0` parameter so callers can distinguish "leave unchanged" from "set to NULL." The `_Clear` companion applies to **both** `spCreate*` and `spUpdate*`:
  - **`spUpdate*`:** distinguishes "leave the existing row value unchanged" (omit the parameter, default `NULL`) from "explicitly set this column to NULL" (`@<Param>_Clear = 1`).
  - **`spCreate*`:** distinguishes "apply the column's database default" (omit the parameter) from "explicitly insert NULL" (`@<Param>_Clear = 1`). Without this, a caller can't get NULL into a nullable column that has a non-NULL default — the `ISNULL(@Param, <default>)` wrapper would always substitute the default. The companion parameter avoids "magic value" sentinels (e.g. passing `-1` to mean NULL) that have caused problems in the past.
  - Codegen detects these columns from the schema (nullable + has default) and emits the companion automatically. Humans don't decide per-column — the rule is uniform.

#### Files to modify

- [packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts](../packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts) — primary changes:
  - `generateCRUDParamString` (around line 801) — broaden the `= NULL` default emission to cover any non-required parameter.
  - `generateSPCreate` body — wrap column references with `ISNULL` against database defaults pulled from entity-field metadata. The existing GUID-default handling at lines ~168 and ~817-820 is the pattern to extend.
  - `generateSPUpdate` body — wrap target columns with `ISNULL(@Param, [Column])` for merge semantics. Add the `_Clear` companion-parameter emission for nullable columns whose `NULL` is semantic.
- [packages/CodeGenLib/src/Database/providers/sqlserver/__tests__/SQLServerCodeGenProvider.test.ts](../packages/CodeGenLib/src/Database/providers/sqlserver/__tests__/SQLServerCodeGenProvider.test.ts) — golden-master tests for the SP signature shapes: PK-only, all-required, mixed required/nullable/default-bearing, semantic-NULL with `_Clear` companion.

#### One-time force-regenerate run

Set the `mj codegen` force-regenerate flag for a single regeneration to bring the corpus of existing SPs up to the new tolerance standard, then turn it back off — subsequent codegen runs follow the normal "regenerate only what changed" behavior. The one-time run produces a substantial generated SQL migration (one per entity that needed its SP updated) bundled with the next MJ release.

#### SQL pattern emitted (illustrative)

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
END
```

`spUpdate*` parameter list (after change):

```sql
CREATE PROCEDURE [__mj].[spUpdateEntity]
    @ID uniqueidentifier,                       -- PK, required
    @Name nvarchar(255) = NULL,
    @SchemaName nvarchar(255) = NULL,
    @AllowAuditLog bit = NULL,
    @Description_Clear bit = 0,                 -- companion for nullable @Description
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

#### Acceptance criteria

- Golden-master tests for the SP signature shapes pass: PK-only, all-required, mixed required/nullable/default-bearing, and at least one with a semantic-NULL column requiring the `_Clear` companion.
- A regen pass on the MJ core entities produces SPs whose signatures strictly subsume current behavior. No previously-working `EXEC __mj.sp*` call from any historical migration in this repo breaks.
- Smoke test against the existing apps in the wild (Izzy, Skip, MJC, BizApps Common, BC SaaS): their existing `EXEC` calls against MJ's metadata-management SPs continue to work unchanged.
- Stability gate: ship this in a release with no other migration-architecture changes. Validate against existing apps. Only after that's stable does the rest of the plan proceed.
- A test fixture invokes `EXEC __mj.spCreateEntity` with a parameter list missing one new optional parameter; the EXEC succeeds and the resulting row has the column's database default applied via `ISNULL`.

---

### 3.2 Publish-then-no-breaking-changes policy `[Policy]`

**Owner:** TBD (CodeGen maintainer + a reviewer from each consumer team)
**Effort:** Small (writing exercise, ~1 day) but must land *before* §3.1 implementation
**Dependencies:** None

#### The hard rule

Once an OpenApp version is published, within that major version:

- **No dropping tables.**
- **No dropping columns.**
- **No narrowing a column's type** (widening is allowed: `nvarchar(50)` → `nvarchar(100)`).
- **No removing or renaming SP parameters.** (Pillar 1 makes signature changes rarely *necessary*, but the policy is what *forbids* them — adding a required parameter to an existing published SP is technically possible at the codegen level and would still violate the policy.)
- **No removing or renaming entities.**
- **No removing relationships that downstream code depends on.**
- **Deprecation IS allowed** — entities and columns can be marked deprecated at the MJ metadata level (this has been supported for over a year). Deprecated things stay physically present and continue to work; they just shouldn't be used by new code.

#### Breaking changes force a major version bump

OpenApp 1.x → 2.0 is allowed to drop things, but installations of 2.0 are then a manual migration path from 1.x — not an automatic upgrade.

#### No SP versioning shims

An earlier draft of this plan described a `spCreateEntity_v2`-style shim mechanism with `RAISERROR` deprecation warnings, a 3-release transition cycle, and a deprecation lint. That mechanism is **removed**. It contradicted this policy directly: if we don't make breaking SP signature changes within a major version, there's nothing for a shim to bridge. Deprecation at the metadata level (column-level / entity-level) is the correct pattern when something needs to be retired — it stays physically present, continues to work, and just gets flagged as not-for-new-use.

#### Why this works

If every app obeys this rule going forward, the only ordering problem the installer needs to solve is the dependency graph (which it already has). The "drop X in app A after app B has dropped its FK to X" scenario only arises when an app violates the policy by dropping a table or column — exactly what the BAC/BCSaaS lift is paying for, and exactly what the policy prevents in the future. Cross-schema interleaving stops being a requirement once the policy is in force.

#### The BAC/BCSaaS lift as the cautionary example

The plan documents the lift concretely so future readers understand why the policy exists:

- BCSaaS Contact → BAC Person migration is the situation we're in *because* we violated this rule (BCSaaS dropped tables that downstream Skip migrations had FKs to).
- Doing this properly going forward means: BC SaaS 2.0 (a new major version) is the formal home for the cleaned-up structure. Existing customers upgrade through a hand-authored, one-time "open-heart surgery" migration that walks them from 1.x to 2.0. There is no parallel 1.x maintenance track — the lift IS the upgrade path. Future apps don't get into this position because the policy prevents it.
- The lift will be done with manual coordination — file dates set so things execute in the right order, with Skip's FK-drop migration scheduled to run before BCSaaS's table-drop migration. This is one-time work, not a recurring pattern.

#### Files to add

- `docs/standards/PUBLISH_NO_BREAK_POLICY.md` — formal write-up of the rule, with examples of allowed vs. disallowed changes, how deprecation works, and what triggers a major version bump.

#### Files to modify

- [CLAUDE.md](../CLAUDE.md) — add a top-level link in the "MemberJunction Development Guide" section.
- [packages/CodeGenLib/CLAUDE.md](../packages/CodeGenLib/CLAUDE.md) — link from CodeGen-specific guidance.
- The OpenApp manifest spec doc (path TBD during implementation) — formalize the publish-no-break rule in the published spec.

#### Acceptance criteria

- Policy doc reviewed and approved before any apps are published under it.
- An audit pass on existing OpenApp manifests confirms which apps have already-shipped versions that need to be honored as immutable from this point forward.

---

### 3.3 New baseline cadence `[MJ]`

**Owner:** TBD (Release engineering)
**Effort:** Small (~1-2 days for the baseline regen + verification)
**Dependencies:** §3.1 (must capture the new SP shape)

The meeting committed to producing a fresh baseline after Phase 1 lands.

- After 3.1 (tolerant SPs) ships and is validated, regenerate a new baseline that captures the new SP shape.
- Escapes the "gazillion-line 5.30 migration" problem by letting fresh installs apply a single baseline rather than replaying that monster.
- Baselines are an operational hygiene measure for fresh installs, not a fix for the cross-app problem (the original Option 2 from the issue).

#### Implementation notes

- The baseline is **not** a major version bump. Whatever MJ minor release follows the validated tolerant-SP work ships the new baseline; there's no implication that we move to 6.0 just because we're regenerating a baseline. Baselines are an internal Skyway/Flyway concept; they don't drive the externally-visible MJ version number.
- The 5.30 metadata-heavy migration content (Salesforce / CRM integration metadata, etc.) is **excluded** from the baseline so fresh installs don't pay for it. Existing customer databases that already applied that metadata stay as they are — the metadata sits in the database and just doesn't get used.
- **Republishing those integrations as standalone OpenApps is deferred.** The meeting's closing exchange clarified that the OpenApp installer doesn't currently support attaching to an existing schema (the integrations live in `__mj`, not their own schema). Building "auxiliary OpenApps that append to an existing schema" is a separate piece of infrastructure for a future date — out of scope for this plan. For now: existing customers keep the metadata they already have; fresh installs don't get it; if/when an integration is needed, it's a manual addition.
- Existing customer databases past the baseline version are unaffected — Skyway just continues forward from where they are.
- Per the meeting: baselines are versioned, the runner detects fresh-database state and applies the latest baseline, then applies versioned migrations after that. The baseline is purely a fresh-install optimization — it does not change the externally-visible MJ version number, does not gate other features, and does not warrant a major-version bump. A baseline can be regenerated at any time without ceremony.

---

## 4. Phase 2 — Installer integration

Once Phase 1 is in production and stable, build out the installer's dependency-order handling.

### 4.1 OpenApp installer respects the dependency graph `[MJ]`

**Owner:** TBD (MJCLI installer maintainer)
**Effort:** Medium (~1 week including verification across the existing apps)
**Dependencies:** Phase 1 stable

Already partially done — the OpenApp installer has dependency-graph awareness via the manifest JSON files. This section formalizes the ordering contract.

**Key principle from the meeting:** Skyway runs one schema at a time. The installer (not Skyway) handles ordering across schemas. Skyway has no awareness of OpenApp dependencies and doesn't need any. The installer is the orchestrator.

#### The installer's contract

- Reads each app's manifest, builds a topological sort across all apps it's about to install.
- For each app in dependency order, invokes Skyway against that app's schema. Each Skyway invocation runs to completion (all of that schema's pending migrations applied) before the next app's invocation begins.
- Per-schema migration ordering inside each Skyway invocation works as it does today (timestamp order within the single schema; Skyway's existing Flyway-compatible behavior).
- No cross-schema interleaving. If app A's migrations need app B's migrations to have already run, that's expressed as A consuming B in the OpenApp manifest, and the installer's topological sort runs B's migrations to completion before A's begin.

#### Files to modify

- The OpenApp manifest JSON files at the repo root of each published OpenApp — the dependency graph is already declared there per the meeting. The work is to verify each app's manifest correctly enumerates its upstream dependencies and that the installer code in MJCLI honors the order at install time.
- [packages/MJCLI/src/commands/migrate/index.ts](../packages/MJCLI/src/commands/migrate/index.ts) — when invoked across multiple apps, assemble the dependency-ordered app list and invoke Skyway per app.

#### Acceptance criteria

- Multi-app install on a fresh database produces correctly-ordered migrations: MJ first (full), then BizApps Common (full), then BC SaaS (full), then per-product (Izzy / Skip / MJC) in declared dependency order.
- Multi-app upgrade against an existing database walks the same dependency graph, applying each app's pending migrations one app at a time.
- Skyway has no awareness of cross-schema ordering — it remains a per-schema migration runner.

---

### 4.2 OpenApp version pinning enforcement `[MJ]`

**Owner:** TBD (Open App team)
**Effort:** Medium (~1 week)
**Dependencies:** Phase 1 stable; semver library available

Pinning means **semver ranges between sibling apps**, npm-style. Apps declare in their manifest:

```json
{
  "consumes": {
    "BizAppsCommon": "^1.4.0",
    "BCSaaS": "~2.1.0"
  }
}
```

#### The installer's behavior

- Refuses to install if a declared range can't be satisfied by what's currently installed.
- Suggests the correct upgrade path (which app, which version range) on failure.
- Honors `^` (caret), `~` (tilde), explicit ranges, exact pins.

Per the meeting, this needs to be ranges (not absolute versions) because the speed of upstream change makes absolute pinning impractical. The original issue's "Option 4" was ambiguous between absolute pinning and range pinning; the meeting settled on npm-style semver ranges as the right interpretation.

#### Files to modify

- The OpenApp manifest JSON schema — add a `consumes` block with semver ranges to the manifest format. The MJCLI installer code that reads manifests already exists; extend it to validate the `consumes` ranges against installed versions and refuse the install if any range can't be satisfied.
- Documentation: `docs/openapp/version-pinning.md` (new) — user-facing doc on how to declare ranges and what happens at install time when ranges aren't satisfied.

#### Acceptance criteria

- Test app declaring `consumes: { OtherApp: "^1.0.0" }` installs against `OtherApp@1.5.0`; fails with a clear error against `OtherApp@2.0.0`.
- Range syntax matches npm convention (caret, tilde, comparison operators, ranges).

---

### 4.3 Pre-install validation `[MJ]`

**Owner:** TBD (MJCLI installer maintainer)
**Effort:** Small (~3 days)
**Dependencies:** §4.1, §4.2

Lightweight check: before running migrations, the installer validates the proposed install set is internally consistent. Catches obvious problems (missing dependency, version range can't be satisfied, schema collision) at the start of an install rather than mid-migration.

A pre-run check, surfaced during the meeting: "validate if you've got some weird invalid combination of things" before any migrations execute. The validation is OpenApp-manifest-level (declared dependency present? semver range satisfiable? schema collision?) — it does NOT walk migration files or `Requires:` graphs. The original plan's CI-graph-validation idea is replaced by this lighter manifest-level check.

---

## 5. Phase 3 — Deferred / Out of scope

Documented here so future readers don't re-litigate.

- **`Requires:` headers in migration files.** Considered and rejected. Ordering between schemas is the installer's job, not the migration file's.
- **Cross-schema topological merge in Skyway.** Considered and rejected. Skyway processes one schema at a time.
- **Composite baselines per SaaS product** (original Option 2). Killed by the OpenApp componentization model and by the new policy making them unnecessary.
- **Composer-tool distribution** (original Option 3). Same reason. The "composer-lite for validation only" reframe is also dropped — manifest validation in §4.3 is enough.
- **Cross-app entity replacement as a recurring pattern.** The BAC/BCSaaS lift is one-time. The publish-no-break policy prevents future instances. No need for a generalized playbook.
- **Cartesian-explosion testing across all version combinations.** Discussed in the meeting; consensus was to lean on the established npm-style practices (test against your declared minimum + latest within range, rely on consumers to test specific combos for their use case).

---

## 6. Cross-cutting concerns

### 6.1 Order of operations

| Phase | Item | Depends on |
|---|---|---|
| 1 | 3.1 Tolerant SPs | (none) |
| 1 | 3.2 Publish-no-break policy | (none) |
| 1 | 3.3 New baseline | 3.1 (must be in the baseline) |
| 2 | 4.1 Installer dependency-order | Phase 1 stable |
| 2 | 4.2 Version pinning enforcement | Phase 1 stable |
| 2 | 4.3 Pre-install validation | 4.1, 4.2 |

Phase 1 items can ship in parallel except 3.3 which gates on 3.1.

### 6.2 Backward compatibility

- **Tolerant SPs:** strictly broader behavior — every previously-accepted call still works.
- **Publish-no-break policy:** applies prospectively to **every release authored after policy adoption**, not just to major-version bumps. A 1.5 → 1.6 release on a currently-shipping app is expected to follow the rule. Past published versions are honored as-is — no retroactive enforcement on history that's already shipped — but every new release from policy-adoption forward is bound by it.
- **OpenApp pinning:** opt-in via manifest. Apps without `consumes` declarations install unchanged.
- **Baseline:** standard Skyway behavior; existing databases past the baseline version continue applying versioned migrations from where they are.

### 6.3 The BAC/BCSaaS lift specifically

The lift is the example of a class of problem we're *avoiding* via the publish-no-break policy, not the canonical example of a class of problem we're tooling for.

For the lift itself:

- Phase 1's tolerant SPs unblock the metadata-cleanup migrations (no more version skew on `spCreateEntity` etc.).
- The lift's coordination is hand-authored: Skip migration drops the FKs first, BCSaaS migration drops the tables second, dates set so they execute in the right order.
- Skip will use a new baseline for fresh installs (agreed at the meeting as a special case for the Skip dev workflow).
- BC SaaS 2.0 is the formal home for the cleaned-up structure. Existing customers upgrade *through* the lift to land on 2.0; there is no maintained 1.x track.

This is a one-time exception, not a template.

---

## 7. File inventory

### 7.1 Files to add

| File | Phase | Purpose |
|---|---|---|
| `docs/standards/PUBLISH_NO_BREAK_POLICY.md` | §3.2 | Formal publish-no-break policy |
| `docs/openapp/version-pinning.md` | §4.2 | User-facing semver-pinning doc |

### 7.2 Files to modify

| File | Phase | Change |
|---|---|---|
| [packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts](../packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts) | §3.1 | Tolerant SP emission |
| [packages/MJCLI/src/commands/migrate/index.ts](../packages/MJCLI/src/commands/migrate/index.ts) | §4.1 | Multi-app dependency-order invocation |
| [migrations/CLAUDE.md](../migrations/CLAUDE.md) | §3.2 | Reference the publish-no-break policy |
| [CLAUDE.md](../CLAUDE.md) | §3.2 | Top-level link to the policy |
| [packages/CodeGenLib/CLAUDE.md](../packages/CodeGenLib/CLAUDE.md) | §3.2 | CodeGen-specific link |
| The OpenApp manifest spec doc (path TBD) | §3.2, §4.2 | Formalize `consumes` block + publish-no-break rule |
| Each currently-published OpenApp's manifest JSON | §4.1, §4.2 | Add `consumes` declarations where missing |
| The MJCLI installer code that reads OpenApp manifests at install time (path within `packages/MJCLI/` TBD) | §4.1, §4.2, §4.3 | Honor dependency order; validate `consumes` ranges; pre-install validation |

### 7.3 Removed from the original plan

- The `Requires:` header parser changes in skyway-core
- **The CI graph validation as originally scoped** — replaced by the lighter OpenApp-manifest-level pre-install check in §4.3, not deferred
- The cross-schema topological merge in Skyway's resolver
- The cross-app entity replacement playbook from the original plan's §6.5 (folded into §3.2 as the BAC/BCSaaS cautionary example)
- The diamond-dependency worked example (no longer relevant)
- **The `mj migrate create` CLI generator.** Was raised in the meeting but did not get explicit buy-in in the wrap-up consensus. The argument it was supporting (cross-schema interleaving by timestamp, with a generator to keep timestamps consistent) was itself walked back later in the meeting. With per-schema execution in OpenApp dependency order, there's no cross-schema timestamp coordination to harden against.
- **Cross-schema interleaving by timestamp.** Tentatively explored mid-meeting but explicitly rejected later in favor of per-schema execution. Skyway runs one schema at a time; the OpenApp installer orchestrates across schemas via the dependency graph.
- **The SP versioning shim mechanism (`spCreateEntity_v2`, `RAISERROR` deprecation notices, the 3-release transition cycle, the deprecation lint).** Per PR feedback: shims directly contradict the publish-no-break policy. If we adopt the policy, breaking SP signature changes are simply not allowed — there's nothing for a shim to bridge. Deprecation at the metadata level (entity-level / column-level deprecation, already supported for over a year) replaces the shim mechanism cleanly: a column you no longer want stays physically present, gets marked deprecated, and continues to work for old callers.

---

## 8. Open questions

1. **Major version naming for BC SaaS** — call it BCSaaS 2.0 explicitly, or some other versioning scheme? Need product/release input.
2. **MJCLI installer code paths** — exact file paths for the manifest-reading and install-orchestration code need to be confirmed by whoever owns the MJCLI install command.
3. **OpenApps-attaching-to-existing-schema infrastructure** — the work needed to republish integrations (Salesforce, CRM, etc.) as standalone OpenApps. Deferred per the meeting's closing exchange; needs its own follow-up plan when prioritized.

---

*End of plan. The pre-meeting version is preserved at [plans/archive/cross-app-migration-ordering.pre-meeting-revision.md](archive/cross-app-migration-ordering.pre-meeting-revision.md) for historical reference.*
