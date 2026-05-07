# Plan: Update plans/cross-app-migration-ordering.md to reflect 2026-04-29 meeting

## What this plan does

Replaces `plans/cross-app-migration-ordering.md` whole-cloth with a new architecture document reflecting the decisions reached in the 2026-04-29 cross-application migration meeting. The original plan was structured around a topological-sort-with-`Requires:`-headers approach to cross-schema migration ordering. The meeting concluded that approach is unnecessary and chose a simpler architecture built on three pillars: tolerant SP signatures, a hard publish-then-no-breaking-changes policy, and OpenApp dependency-order installation at the installer level. OpenApp version pinning (semver ranges) is a Phase 2 enforcement layer on top of those three.

Source files to be edited (with permission):

- `plans/cross-app-migration-ordering.md` — full replacement of body content; preserve filename and history.

No other files are touched in this plan. Implementation work the new plan describes (CodeGen changes for tolerant SPs, MJCLI installer changes for OpenApp dependency-order traversal, OpenApp manifest schema additions, baseline regeneration) is out of scope here — that's downstream work for follow-up implementation PRs. **Skyway needs no changes**: per the meeting, Skyway continues to run one schema at a time exactly as it does today.

## Why this plan exists

The original `cross-app-migration-ordering.md` was authored before the architecture meeting and proposed an Option-1+Option-4 hybrid with `Requires:` headers, CI graph validation, and a Skyway resolver that did topological merge across schemas. The meeting concluded:

- The OpenApp dependency graph already provides ordering across schemas at the installer level. Skyway runs one schema at a time, and the installer dispatches each app's migrations in dependency order — interleaving migrations across schemas is neither needed nor wanted.
- The actual root cause of the BAC/BCSaaS pain isn't a tooling gap — it's that we violated a discipline that the OpenApp model assumes (publish-then-no-breaking-changes). Tooling can't fix discipline gaps; the policy is the fix.
- `Requires:` headers were considered and rejected at the meeting on the grounds that adding cross-schema dependency declarations at the migration-file level couples schemas in a way the existing OpenApp dependency graph already solves at the right grain.
- Tolerant SP signatures (the "fifth direction" from the original plan) survive unchanged and are now the **first** thing to ship — they're the foundation everything else depends on.
- OpenApp version pinning needs to be honored at the installer level using semver ranges, not absolute pinning.

The plan needs to reflect this reality so future readers don't implement a phantom architecture.

## Replacement plan structure for `plans/cross-app-migration-ordering.md`

The new file will follow this outline:

### §1. Context

- Summary of the cross-app migration problem (still valid).
- Summary of the meeting's resolution: tolerant SPs + publish-no-break policy + installer-level OpenApp ordering. No `Requires:` headers, no cross-schema topological merge in Skyway, no composite baselines.
- Reference to issue #2487 and the 2026-04-29 meeting transcript as the source of record.

### §2. The Three Pillars

The architecture rests on three independent pieces. Each is necessary; together they're sufficient.

**Pillar 1 — Tolerant SP signatures.** `spCreate*` and `spUpdate*` codegen emits SPs that accept `NULL` for any non-required parameter, preserve existing values on update when a parameter is omitted, and apply column defaults on create when a parameter is omitted. Eliminates the metadata-migration version-skew failure class by construction.

**Pillar 2 — Publish-then-no-breaking-changes policy.** Once an OpenApp version is published, within that major version no dropping tables, no dropping columns, no narrowing column types, no removing/renaming SP parameters. Only additive changes. Breaking changes force a major version bump (OpenApp 1.x → 2.0). The policy is a hard rule, not a guideline.

**Pillar 3 — OpenApp dependency-order installation.** The OpenApp installer reads each app's manifest, walks the dependency graph, and runs each app's migrations in dependency order. Within each app, Skyway handles per-schema migration ordering exactly as it does today; ordering *across* apps is the installer's job, not Skyway's.

> **Note on the schema mapping:** "App" and "schema" are not strictly 1:1. Most OpenApps own a dedicated schema (BizApps Common → `__mj_BizAppsCommon`, BCSaaS → `__BCSaaS`, etc.), but some apps will attach to an existing schema (e.g. the Salesforce / CRM integration metadata that lives in MJ's `__mj` schema). The dependency graph operates at the app grain regardless; the installer dispatches each app's migrations to the appropriate schema target.

### §3. Phase 1 — Foundation

Land the foundational pieces first. Validate stability before building anything on top. The meeting consensus was explicit on this: set the foundation, validate against existing apps, then do the migration-ordering work after.

#### 3.1 Tolerant `spCreate` / `spUpdate` codegen `[MJ]`

Largely preserved from the original plan's §4.2 but moved to Phase 1.

Specific changes:

- `generateCRUDParamString` in `packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts` (around line 801) — emit `= NULL` defaults for any non-required parameter.
- `generateSPCreate` body — wrap column references with `ISNULL(@Param, <default>)` against database defaults pulled from entity-field metadata.
- `generateSPUpdate` body — wrap with `ISNULL(@Param, [Column])` for merge semantics. Preserve existing row value when caller omits a parameter.
- For nullable columns where `NULL` is meaningful, emit `@<Param>_Clear bit = 0` companion parameter on **both** `spCreate*` and `spUpdate*`. The use case differs by SP type:
  - **`spUpdate*`:** distinguishes "leave the existing row value unchanged" (omit the parameter, default `NULL`) from "explicitly set this column to NULL" (`@<Param>_Clear = 1`).
  - **`spCreate*`:** distinguishes "apply the column's database default" (omit the parameter) from "explicitly insert NULL" (`@<Param>_Clear = 1`). Without this, a caller can't get NULL into a nullable column that has a non-NULL default — the `ISNULL(@Param, <default>)` wrapper would always substitute the default. The companion parameter avoids "magic value" sentinels (e.g. passing `-1` to mean NULL) that have caused problems in the past.
  - Codegen detects these columns from the schema (nullable + has default) and emits the companion automatically. Humans don't decide per-column — the rule is uniform.
- **One-time** force-regenerate run through `mj codegen` to push the new SP shape across all existing entities in MJ core. The flag is set for this single regeneration to bring the corpus of existing SPs up to the new tolerance standard, then turned back off — subsequent codegen runs follow the normal "regenerate only what changed" behavior. The one-time run produces a substantial generated SQL migration (one per entity that needed its SP updated) bundled with the next MJ release.

Acceptance criteria carried over from the original plan, plus:

- Stability gate (per the meeting): ship this in a release with no other migration-architecture changes. Validate against existing apps. Only after that's stable does the rest of the plan proceed.
- Smoke test against the existing apps in the wild (Izzy, Skip, MJC, BizApps Common, BC SaaS). Their existing `EXEC` calls against MJ's metadata-management SPs must continue to work unchanged.

#### 3.2 Publish-then-no-breaking-changes policy `[Policy]`

New section. The hard rule that makes Pillars 1 and 3 sufficient.

**The rule.** Once an OpenApp version is published, within that major version:

- No dropping tables.
- No dropping columns.
- No narrowing a column's type (widening is allowed: `nvarchar(50)` → `nvarchar(100)`).
- No removing or renaming SP parameters. (Pillar 1 makes signature changes rarely *necessary*, but the policy is what *forbids* them — adding a required parameter to an existing published SP is technically possible at the codegen level and would still violate the policy.)
- No removing or renaming entities.
- No removing relationships that downstream code depends on.
- Deprecation IS allowed — entities and columns can be marked deprecated at the MJ metadata level (this has been supported for over a year). Deprecated things stay physically present and continue to work; they just shouldn't be used by new code.

**Breaking changes force a major version bump.** OpenApp 1.x → 2.0 is allowed to drop things, but installations of 2.0 are then a manual migration path from 1.x — not an automatic upgrade.

**No SP versioning shims.** An earlier draft of this plan described a `spCreateEntity_v2`-style shim mechanism with `RAISERROR` deprecation warnings, a 3-release transition cycle, and a deprecation lint. That mechanism is **removed**. It contradicted this policy directly: if we don't make breaking SP signature changes within a major version, there's nothing for a shim to bridge. Deprecation at the metadata level (column-level / entity-level) is the correct pattern when something needs to be retired — it stays physically present, continues to work, and just gets flagged as not-for-new-use.

**Why this works.** If every app obeys this rule going forward, the only ordering problem the installer needs to solve is the dependency graph (which it already has). The "drop X in app A after app B has dropped its FK to X" scenario only arises when an app violates the policy by dropping a table or column — exactly what the BAC/BCSaaS lift is paying for, and exactly what the policy prevents in the future. Cross-schema interleaving stops being a requirement once the policy is in force.

**The BAC/BCSaaS lift as the cautionary example.** The plan documents the lift concretely so future readers understand why the policy exists:

- BCSaaS Contact → BAC Person migration is the situation we're in *because* we violated this rule (BCSaaS dropped tables that downstream Skip migrations had FKs to).
- Doing this properly going forward means: BC SaaS 2.0 (a new major version) is the formal home for the cleaned-up structure. Existing customers upgrade through a hand-authored, one-time "open-heart surgery" migration that walks them from 1.x to 2.0. There is no parallel 1.x maintenance track — the lift IS the upgrade path. Future apps don't get into this position because the policy prevents it.
- The lift will be done with manual coordination — file dates set so things execute in the right order, with Skip's FK-drop migration scheduled to run before BCSaaS's table-drop migration. This is one-time work, not a recurring pattern.

Files to add:

- `docs/standards/PUBLISH_NO_BREAK_POLICY.md` — formal write-up of the rule, with examples of allowed vs. disallowed changes, how deprecation works, and what triggers a major version bump.

Files to modify:

- `CLAUDE.md` — add a top-level link in the "MemberJunction Development Guide" section.
- `packages/CodeGenLib/CLAUDE.md` — link from CodeGen-specific guidance.
- The OpenApp manifest spec doc (path TBD during implementation) — formalize the publish-no-break rule in the published spec.

Acceptance criteria:

- Policy doc reviewed and approved before any apps are published under it.
- An audit pass on existing OpenApp manifests confirms which apps have already-shipped versions that need to be honored as immutable from this point forward.

#### 3.3 New baseline cadence `[MJ]`

The meeting committed to producing a fresh baseline after Phase 1 lands.

- After 3.1 (tolerant SPs) ships and is validated, regenerate a new baseline that captures the new SP shape.
- Escapes the "gazillion-line 5.30 migration" problem by letting fresh installs apply a single baseline rather than replaying that monster.
- Baselines are not a fix for the cross-app problem (the original Option 2 from the issue) — they're an operational hygiene measure for fresh installs.

Implementation notes:

- The baseline is **not** a major version bump. Whatever MJ minor release follows the validated tolerant-SP work ships the new baseline; there's no implication that we move to 6.0 just because we're regenerating a baseline. Baselines are an internal Skyway/Flyway concept; they don't drive the externally-visible MJ version number.
- The 5.30 metadata-heavy migration content (Salesforce / CRM integration metadata, etc.) is **excluded** from the baseline so fresh installs don't pay for it. Existing customer databases that already applied that metadata stay as they are — the metadata sits in the database and just doesn't get used.
- **Republishing those integrations as standalone OpenApps is deferred.** The meeting's closing exchange clarified that the OpenApp installer doesn't currently support attaching to an existing schema (the integrations live in `__mj`, not their own schema). Building "auxiliary OpenApps that append to an existing schema" is a separate piece of infrastructure for a future date — out of scope for this plan. For now: existing customers keep the metadata they already have; fresh installs don't get it; if/when an integration is needed, it's a manual addition.
- Existing customer databases past the baseline version are unaffected — Skyway just continues forward from where they are.
- Per the meeting: baselines are versioned, the runner detects fresh-database state and applies the latest baseline, then applies versioned migrations after that. The baseline is purely a fresh-install optimization — it does not change the externally-visible MJ version number, does not gate other features, and does not warrant a major-version bump. A baseline can be regenerated at any time without ceremony.

### §4. Phase 2 — Installer integration

Once Phase 1 is in production and stable, build out the installer's dependency-order handling.

#### 4.1 OpenApp installer respects the dependency graph `[MJ]`

Already partially done — the OpenApp installer has dependency-graph awareness. This section formalizes the ordering contract.

**Key principle from the meeting: Skyway runs one schema at a time. The installer (not Skyway) handles ordering across schemas.** Skyway has no awareness of OpenApp dependencies and doesn't need any. The installer is the orchestrator.

The installer's contract:

- Reads each app's manifest, builds a topological sort across all apps it's about to install.
- For each app in dependency order, invokes Skyway against that app's schema. Each Skyway invocation runs to completion (all of that schema's pending migrations applied) before the next app's invocation begins.
- Per-schema migration ordering inside each Skyway invocation works as it does today (timestamp order within the single schema; Skyway's existing Flyway-compatible behavior).
- No cross-schema interleaving. If app A's migrations need app B's migrations to have already run, that's expressed as A consuming B in the OpenApp manifest, and the installer's topological sort runs B's migrations to completion before A's begin.

Files to modify:

- The OpenApp manifest JSON files at the repo root of each published OpenApp — the dependency graph is already declared there per the meeting. The work is to verify each app's manifest correctly enumerates its upstream dependencies and that the installer code in MJCLI honors the order at install time.
- `packages/MJCLI/src/commands/migrate/index.ts` — when invoked across multiple apps, assemble the dependency-ordered app list and invoke Skyway per app.

Acceptance criteria:

- Multi-app install on a fresh database produces correctly-ordered migrations: MJ first (full), then BizApps Common (full), then BC SaaS (full), then per-product (Izzy / Skip / MJC) in declared dependency order.
- Multi-app upgrade against an existing database walks the same dependency graph, applying each app's pending migrations one app at a time.
- Skyway has no awareness of cross-schema ordering — it remains a per-schema migration runner.

#### 4.2 OpenApp version pinning enforcement `[MJ]`

Renamed and promoted from the original plan's §4.3.

Pinning means **semver ranges between sibling apps**, npm-style. Apps declare in their manifest:

```json
{
  "consumes": {
    "BizAppsCommon": "^1.4.0",
    "BCSaaS": "~2.1.0"
  }
}
```

The installer:

- Refuses to install if a declared range can't be satisfied by what's currently installed.
- Suggests the correct upgrade path (which app, which version range) on failure.
- Honors `^` (caret), `~` (tilde), explicit ranges, exact pins.

Per the meeting, this needs to be ranges (not absolute versions) because the speed of upstream change makes absolute pinning impractical. The original issue's "Option 4" was ambiguous between absolute pinning and range pinning; the meeting settled on npm-style semver ranges as the right interpretation.

Files to modify:

- The OpenApp manifest JSON schema — add a `consumes` block with semver ranges to the manifest format. The MJCLI installer code that reads manifests already exists; extend it to validate the `consumes` ranges against installed versions and refuse the install if any range can't be satisfied.
- Documentation: `docs/openapp/version-pinning.md` (new) — user-facing doc on how to declare ranges and what happens at install time when ranges aren't satisfied.

Acceptance criteria:

- Test app declaring `consumes: { OtherApp: "^1.0.0" }` installs against `OtherApp@1.5.0` ✅; fails with a clear error against `OtherApp@2.0.0`.
- Range syntax matches npm convention (caret, tilde, comparison operators, ranges).

#### 4.3 Pre-install validation `[MJ]`

Lightweight check: before running migrations, the installer validates the proposed install set is internally consistent. Catches obvious problems (missing dependency, version range can't be satisfied, schema collision) at the start of an install rather than mid-migration.

A pre-run check, surfaced during the meeting: "validate if you've got some weird invalid combination of things" before any migrations execute. The validation is OpenApp-manifest-level (declared dependency present? semver range satisfiable? schema collision?) — it does NOT walk migration files or `Requires:` graphs. The original plan's CI-graph-validation idea is replaced by this lighter manifest-level check.

### §5. Phase 3 — Deferred / Out of scope

Documented here so future readers don't re-litigate.

- **`Requires:` headers in migration files.** Considered and rejected. Ordering between schemas is the installer's job, not the migration file's.
- **Cross-schema topological merge in Skyway.** Considered and rejected. Skyway processes one schema at a time.
- **Composite baselines per SaaS product** (original Option 2). Killed by the OpenApp componentization model and by the new policy making them unnecessary.
- **Composer-tool distribution** (original Option 3). Same reason. The "composer-lite for validation only" reframe is also dropped — manifest validation in §4.3 is enough.
- **Cross-app entity replacement as a recurring pattern.** The BAC/BCSaaS lift is one-time. The publish-no-break policy prevents future instances. No need for a generalized playbook.
- **Cartesian-explosion testing across all version combinations.** Discussed in the meeting; consensus was to lean on the established npm-style practices (test against your declared minimum + latest within range, rely on consumers to test specific combos for their use case).

### §6. Cross-cutting concerns

#### 6.1 Order of operations

| Phase | Item | Depends on |
|---|---|---|
| 1 | 3.1 Tolerant SPs | (none) |
| 1 | 3.2 Publish-no-break policy | (none) |
| 1 | 3.3 New baseline | 3.1 (must be in the baseline) |
| 2 | 4.1 Installer dependency-order | Phase 1 stable |
| 2 | 4.2 Version pinning enforcement | Phase 1 stable |
| 2 | 4.3 Pre-install validation | 4.1, 4.2 |

Phase 1 items can ship in parallel except 3.3 which gates on 3.1.

#### 6.2 Backward compatibility

- Tolerant SPs: strictly broader behavior — every previously-accepted call still works.
- Publish-no-break policy: applies prospectively to **every release authored after policy adoption**, not just to major-version bumps. A 1.5 → 1.6 release on a currently-shipping app is expected to follow the rule. Past published versions are honored as-is — no retroactive enforcement on history that's already shipped — but every new release from policy-adoption forward is bound by it.
- OpenApp pinning: opt-in via manifest. Apps without `consumes` declarations install unchanged.
- Baseline: standard Skyway behavior; existing databases past the baseline version continue applying versioned migrations from where they are.

#### 6.3 The BAC/BCSaaS lift specifically

What changes vs. the original plan: the lift is no longer treated as the canonical example of a class of problem we're tooling for. It's the example of a class of problem we're *avoiding* via the publish-no-break policy.

For the lift itself:

- Phase 1's tolerant SPs unblock the metadata-cleanup migrations (no more version skew on `spCreateEntity` etc.).
- The lift's coordination is hand-authored: Skip migration drops the FKs first, BCSaaS migration drops the tables second, dates set so they execute in the right order.
- Skip will use a new baseline for fresh installs (agreed at the meeting as a special case for the Skip dev workflow).
- BC SaaS 2.0 is the formal home for the cleaned-up structure. Existing customers upgrade *through* the lift to land on 2.0; there is no maintained 1.x track.

This is a one-time exception, not a template.

### §7. File inventory

**Add:**

- `docs/standards/PUBLISH_NO_BREAK_POLICY.md`
- `docs/openapp/version-pinning.md`

**Modify:**

- `packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts`
- `packages/MJCLI/src/commands/migrate/index.ts` — multi-app dependency-order invocation
- `migrations/CLAUDE.md`
- `CLAUDE.md`
- `packages/CodeGenLib/CLAUDE.md`
- The OpenApp manifest spec doc — formalize the `consumes` block syntax and the publish-no-break rule
- The OpenApp manifest JSON files in each currently-published OpenApp's repo root — add `consumes` declarations where missing
- The MJCLI installer code that reads OpenApp manifests at install time (path within `packages/MJCLI/` to be confirmed during implementation)

**Removed from the original plan (no longer pursued):**

- The `Requires:` header parser changes in skyway-core
- **The CI graph validation as originally scoped** — replaced by the lighter OpenApp-manifest-level pre-install check in §4.3, not deferred
- The cross-schema topological merge in Skyway's resolver
- The cross-app entity replacement playbook from the original plan's §6.5 (folded into the new plan's §3.2 as the BAC/BCSaaS lift cautionary example, rather than carried forward as a recurring pattern)
- The diamond-dependency worked example (no longer relevant)
- **The `mj migrate create` CLI generator.** Was raised in the meeting but did not get explicit buy-in in the wrap-up consensus. The argument it was supporting (cross-schema interleaving by timestamp, with a generator to keep timestamps consistent) was itself walked back later in the meeting. With per-schema execution in OpenApp dependency order, there's no cross-schema timestamp coordination to harden against.
- **Cross-schema interleaving by timestamp.** Tentatively explored mid-meeting but explicitly rejected later in favor of per-schema execution. Skyway runs one schema at a time; the OpenApp installer orchestrates across schemas via the dependency graph.
- **The SP versioning shim mechanism (`spCreateEntity_v2`, `RAISERROR` deprecation notices, the 3-release transition cycle, the deprecation lint).** Per PR feedback: shims directly contradict the publish-no-break policy. If we adopt the policy, breaking SP signature changes are simply not allowed — there's nothing for a shim to bridge. Deprecation at the metadata level (entity-level / column-level deprecation, already supported for over a year) replaces the shim mechanism cleanly: a column you no longer want stays physically present, gets marked deprecated, and continues to work for old callers. The §3.2 worked example for shim transitions is removed entirely from the new plan.

### §8. Open questions

Carried over from the original plan and trimmed to what's still open:

1. **Major version naming for BC SaaS** — call it BCSaaS 2.0 explicitly, or some other versioning scheme? Need product/release input.
2. **MJCLI installer code paths** — exact file paths for the manifest-reading and install-orchestration code need to be confirmed by whoever owns the MJCLI install command.
3. **OpenApps-attaching-to-existing-schema infrastructure** — the work needed to republish integrations (Salesforce, CRM, etc.) as standalone OpenApps. Deferred per the meeting's closing exchange; needs its own follow-up plan when prioritized.

## Verification of this plan against the meeting

Stress-tested by walking the transcript section-by-section:

| Meeting decision | Where in the new plan |
|---|---|
| Tolerant SP signatures going forward | §3.1 (Pillar 1) |
| Publish-then-no-breaking-changes policy | §3.2 (Pillar 2) |
| OpenApp installer handles dependency ordering | §4.1 (Pillar 3) |
| OpenApp pinning is semver ranges, not absolutes | §4.2 |
| `Requires:` headers rejected | §5 (deferred) |
| Cross-schema topological merge rejected | §5 (deferred) |
| `mj migrate create` CLI generator NOT in scope | §7 (removed list) |
| Cross-schema interleaving by timestamp NOT in scope | §7 (removed list) |
| New baseline after SP work lands | §3.3 |
| Skip uses a new baseline for fresh installs | §6.3 |
| BAC/BCSaaS lift is one-time, not a recurring pattern | §3.2 + §6.3 |
| Salesforce/CRM integrations split into separate OpenApps | DEFERRED — §3.3 (excluded from baseline) + §8 open question #3 |
| Skyway stays per-schema; installer orchestrates | §4.1 |
| Sequencing: foundation first, then migration ordering | §6.1 |

## Implementation checklist

When applying this plan to `plans/cross-app-migration-ordering.md`:

1. Read the current file to confirm the line ranges of each section being replaced.
2. Replace the body content with the new structure above. Preserve the file's frontmatter (status, created date, source attribution lines that don't reference specific people).
3. Update the file's "last modified" / "status" lines to reflect this revision.
4. Update PR #2488's description to summarize the architecture change so reviewers see the diff in framing, not just the diff in markdown.
5. Verify the new file passes the same name-stripping discipline applied to the original (no person names, no co-authored-by trailers).

## Out of scope for this plan

- Implementation of any of the items in the new architecture document.
- The actual BAC/BCSaaS lift work — that's the SaaS team's per-product migration code.
- Writing the formal `docs/standards/PUBLISH_NO_BREAK_POLICY.md` file — the plan describes what should be in it but doesn't author it.

PR #2488 will be updated alongside the rewrite of `plans/cross-app-migration-ordering.md` to summarize the architecture change in the description.
