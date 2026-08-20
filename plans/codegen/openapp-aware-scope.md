# CodeGen OpenApp-Aware Scope — Proposal

**Status:** Draft — pending team review
**Author:** JF
**Related PRs:** #3350 (type-availability gate + includeSchemas), #3304 (original diagnosis), #3279 (external schema filter)
**Related Issues:** #3384 (cleanup paths treat "out of scope" as "deleted"), #3273 (`mj app link`), #3457 (installer writes app schema into excludeSchemas)

## Problem Statement

CodeGen has no concept of "installed app" vs "app I'm actively developing." It relies entirely on manual configuration (`excludeSchemas`, `entityPackageName` maps) to determine which schemas are in scope for code generation. This is error-prone, doesn't scale as more OpenApps are built, and has produced multiple bugs:

- **Dangling reverse-relationship references** (#3350): The relationship walker reads `Metadata.Entities` (all entities in the DB), but the old `isRelatedTypeOutOfScope` heuristic only checked the `entityPackageName` map — not the `excludeSchemas` filter. Entities excluded by schema but not in the package map still produced uncompilable `@Field` references. Fixed defensively in #3350 by Change A (type-availability gate).
- **Manual config burden**: Developers must hand-maintain `excludeSchemas` and `entityPackageName` maps that grow O(N²) with installed apps and can't name schemas the developer doesn't know about (e.g., a client's own schemas in a deployed instance).
- **Installer/CodeGen conflict** (#3457): `mj app install` writes the app's schema into `excludeSchemas`, which also gates entity *discovery* — silently preventing CodeGen from creating that app's entities if the app relies on host CodeGen for metadata.

## Proposed Solution

Derive CodeGen's scope from data (`__mj.OpenApp`) rather than manual config. The classification:

| Category | Source of truth | CodeGen behavior |
|---|---|---|
| **Mine** | Declared in `mj-app.json` (via `schema.name`) or the core `__mj` schema for the MJ repo | Generate: entity subclasses, GraphQL resolvers, Angular forms |
| **Not mine** | Has an `Active` row in `__mj.OpenApp` with a `SchemaName` set | Exclude from generation — code ships in the app's published npm packages |
| **Unowned** | Present in DB catalog, no OpenApp row, not core | Exclude by default; opt-in to generate via explicit config |

### Implementation: Derive `getExternalEntitySchemas()` from `__mj.OpenApp`

The key insight: the filtering mechanism already exists. `getExternalEntitySchemas()` (`Config/config.ts:1168`) returns the schemas that should be excluded from local generation. Today it reads from the `entityPackageName` map. The change is to derive that list from the database instead:

1. During `manageMetadata()`, query `__mj.OpenApp` for all rows with `Status = 'Active'` and a non-null `SchemaName`
2. Exclude the schema declared in the current project's `mj-app.json` (that's "mine")
3. Feed the result into the same exclusion path `getExternalEntitySchemas()` already drives
4. Retain `entityPackageName` as a manual override when set — populate from the registry when absent

This is a single function change. Everything downstream (`runFileGenerationPhase` filtering at `runCodeGen.ts:517-520`, GraphQL generation, entity subclass generation, Angular generation) is untouched.

### Development Convention

The proposal includes a recommended development workflow convention:

**App developers should use Flyway/Skyway migrations for their own app during development, and `mj app install` only for dependencies.**

This creates a natural boundary:
- **Your app** → applied via migrations → no `OpenApp` row (or row with `Development` status) → CodeGen processes it
- **Dependency apps** → installed via `mj app install` → `OpenApp` row with `Active` status → CodeGen auto-excludes

Under this convention:
- Developing BizApps-Tasks (depends on Common): Common is installed → auto-excluded. Tasks schema exists from own migrations → CodeGen processes it.
- Developing BizApps-Common: Tasks doesn't exist in the DB at all — it depends on Common, not vice versa. No scope conflict possible.

### Distinguishing "Mine" From "Not Mine" — Status vs. Absence

A valid concern was raised during review: using row-absence to mean "developing" is ambiguous (could mean "not set up yet," "registration failed," etc.). An alternative is adding a `Development` status to the `OpenApp.Status` union instead.

**Preferred approach: a `developingSchemas` override in `mj.config.cjs`**

Rather than a new DB status, the developer sets an explicit config override:

```javascript
// mj.config.cjs
module.exports = {
  // ...
  developingSchemas: ['__mj_BizAppsTasks'],
  // ...
};
```

Rationale:
- Developer-explicit and version-controllable (lives in the repo, not mutable DB state)
- Doesn't require schema changes to `__mj.OpenApp`
- Follows the same pattern as existing CodeGen config overrides
- Clear separation: DB state describes what's installed; config describes what you're building

**Fallback (if convention proposal is rejected):** Add `'Development'` to the `OpenApp.Status` union (`entity_subclasses.ts:23309`, currently `'Active' | 'Disabled' | 'Error' | 'Installing' | 'Removed' | 'Removing' | 'Upgrading'`). CodeGen would treat `Development` rows as "mine" (generate) and `Active` rows as "not mine" (exclude). This requires a migration and CodeGen regeneration but keeps the detection data-driven.

### Supporting Feature: `--branch` for `mj app install/update`

To support pre-release dependency testing, add a `--branch` argument to the `mj app install` and `mj app update` CLI commands. This allows installing apps from a `stage` or `next` branch without requiring a production publish — filling the gap for development integration testing.

The GitHub client (`packages/OpenApp/Engine/src/github/github-client.ts`) already fetches from repositories by tag/release. This would extend it to fetch from a named branch.

## Relationship to #3350 (Change A)

Change A (the type-availability gate) remains valuable as defense-in-depth even with OpenApp-aware scoping. The reason:

`excludeSchemas` correctly prevents excluded entities from having their types generated, but `Metadata.Entities` loads all entities from the database regardless. When generating a GraphQL type for an entity, the relationship walker reads `entity.RelatedEntities` from metadata — which includes relationships to entities in excluded schemas. Without the type-availability gate, the old `isRelatedTypeOutOfScope` heuristic could still emit references to types that aren't being generated.

This proposal eliminates the **configuration burden** (how does CodeGen know what to exclude). Change A eliminates the **emission bug** (don't reference types that aren't generated). They are complementary.

## Scope and Sequencing

### This proposal covers:
- Deriving `getExternalEntitySchemas()` from `__mj.OpenApp` + optional `developingSchemas` config
- `--branch` argument for `mj app install/update`
- Documentation of the development convention

### This proposal does NOT cover:
- The destructive cleanup paths (#3384) — those should be addressed first or in parallel, since auto-derived scope narrows the entity list and makes the "out of scope treated as deleted" bug more reachable
- `mj app link` for local development linking (#3273) — complementary but independent
- The `excludeSchemas` installer bug (#3457) — becomes less impactful with auto-derived scope but should still be fixed

### Recommended sequencing:
1. **Fix #3384 items 1-3** (cleanup paths, empty include validation, CRUD validator) — prerequisite for any auto-derived scope
2. **This proposal** — derive scope from `__mj.OpenApp`
3. **Fix #3457** — stop installer from writing to `excludeSchemas` (may be subsumed by this proposal)

## Files to Modify

| File | Change |
|---|---|
| `packages/CodeGenLib/src/Config/config.ts` | Add `developingSchemas` config option; modify `getExternalEntitySchemas()` to accept DB-derived data |
| `packages/CodeGenLib/src/Database/manage-metadata.ts` | Query `__mj.OpenApp` during metadata phase; pass installed app schemas to config |
| `packages/CodeGenLib/src/runCodeGen.ts` | Wire the derived scope into `runFileGenerationPhase` |
| `packages/MJCLI/src/commands/app/install.ts` | Add `--branch` flag |
| `packages/MJCLI/src/commands/app/upgrade.ts` | Add `--branch` flag |
| `packages/OpenApp/Engine/src/github/github-client.ts` | Support fetching from a named branch |
| `packages/OpenApp/Engine/src/install/install-orchestrator.ts` | Pass branch option through to GitHub client |

## Open Questions

1. **Should `developingSchemas` be the preferred approach, or should we add a `Development` status to OpenApp?** One argument favors status for dev/prod parity; another favors config for explicitness and version control.
2. **How should "unowned" schemas (third-party, no OpenApp row) be handled?** Current proposal: exclude by default, opt-in via existing config. An alternative: this falls out naturally once every MJ-managed schema has an OpenApp row — unowned = residual.
3. **Should this block on #3384 (cleanup path fixes)?** The destructive paths become more reachable with auto-derived scope. The ordering argument: "harden before CodeGen scope narrows further."
