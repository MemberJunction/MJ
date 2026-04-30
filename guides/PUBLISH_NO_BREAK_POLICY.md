# Publish-Then-No-Breaking-Changes Policy

**Status:** Active
**Applies to:** All MemberJunction OpenApps (MJ core, BizApps Common, BC SaaS, Skip, Izzy, MJC, and any future apps)
**Source of record:** Phase 1 of [plans/cross-app-migration-ordering.md](../plans/cross-app-migration-ordering.md) §3.2 (cross-app migration architecture, 2026-04-29 meeting)

## The rule

Once an OpenApp version is **published**, within that major version the app's schema is **immutable except for additive changes**. The exhaustive list of what is and isn't allowed is below.

This is a hard rule, not a guideline. Breaking it forces a major version bump (1.x → 2.0), which is a manual upgrade path — not an automatic one.

## What "published" means

An OpenApp version is **published** the moment the migrations for that version land on a long-lived branch (`next`, `main`, a release branch — anywhere a customer database might end up replaying them). After that, the migrations are part of the historical migration stream forever, and any subsequent change inside the same major version must respect the rule.

A version that's still on a feature branch and hasn't been merged yet is not "published" — you're free to revise its migrations until merge.

## What's not allowed within a published major version

| Forbidden | Why |
|---|---|
| Dropping a table | Downstream apps may have foreign keys to it; dropping breaks their migrations |
| Dropping a column | Downstream code may read or write it |
| Narrowing a column's type (`nvarchar(100)` → `nvarchar(50)`, `bigint` → `int`, `decimal(18,4)` → `decimal(10,2)`) | Existing data may not fit; downstream callers may pass values that no longer round-trip |
| Removing or renaming an entity | Same reasoning as dropping a table, plus metadata-level breakage |
| Removing or renaming a stored-procedure parameter | Historical `EXEC` calls in migration history will fail. Pillar 1 (tolerant SP signatures) makes this rarely *necessary*, but the policy is what *forbids* it — adding a required parameter to an existing published SP is technically possible at the codegen level and would still violate the policy |
| Removing relationships that downstream code depends on | Breaks downstream entity navigation, view JOINs, FK metadata |

## What IS allowed

| Allowed | Notes |
|---|---|
| Adding a new table | Pure addition; no risk to existing callers |
| Adding a new column | Must be either nullable, have a database default, or both. NOT NULL with no default would break existing INSERTs |
| Widening a column's type (`nvarchar(50)` → `nvarchar(100)`, `int` → `bigint`) | Existing data still fits |
| Adding a new SP parameter (with a default) | Pillar 1 codegen makes this safe by default — every non-required param gets `= NULL` and is wrapped with `ISNULL(@Param, <db_default>)` in the body |
| Adding a new entity | Same as adding a table at the metadata layer |
| Adding new relationships | Pure addition |
| Marking an entity or column as **deprecated** at the metadata level | The recommended replacement for "I want to retire this." See § "Deprecation" below |

## Deprecation

Deprecation at the MJ metadata level has been supported for over a year and is the correct pattern for retiring something within a published major version.

A deprecated entity or column:

- **Stays physically present** in the schema. Existing callers continue to work.
- **Continues to function** at runtime. Reads, writes, and SP calls behave identically.
- **Is flagged as not-for-new-use.** Tooling, documentation, and developer awareness should steer new code away from it.

Deprecation does NOT mean "scheduled for deletion in version X.Y." Once deprecated within a published major version, a thing stays present until the next major version bump. It's a soft-removal that preserves backwards compatibility.

To physically remove a deprecated entity or column, ship a new major version (see below).

## Breaking changes force a major version bump

When an app genuinely needs to drop, narrow, or rename something, the path is a major version bump:

- **OpenApp 1.x → 2.0** is allowed to drop tables, drop columns, narrow types, rename entities, etc.
- The 2.0 release is treated as a new app from the customer's perspective. Installation is a manual migration path — typically a one-time hand-authored "open-heart surgery" migration that walks an existing 1.x customer to 2.0. There is no parallel 1.x maintenance track once 2.0 ships.
- 2.0 does not automatically upgrade an existing 1.x installation. The customer (or the release team on the customer's behalf) explicitly opts into the upgrade.

## Why this works

If every app obeys this rule going forward, the only ordering problem the OpenApp installer needs to solve is the dependency graph — which it already does via the manifest's `consumes` block. The "drop X in app A after app B has dropped its FK to X" scenario only arises when an app violates the policy. Once the policy is in force across all apps, cross-schema interleaving stops being a requirement and the simpler "install each app's migrations in dependency order" model is sufficient.

This is why the architecture document calls the policy a **pillar**: the tooling (Pillar 1, tolerant SP signatures; Pillar 3, OpenApp dependency-order installation) is necessary but not sufficient on its own. Without the policy, a single app dropping a column can cascade-break every downstream consumer's migration history regardless of how the tooling orders things.

## The BAC/BCSaaS lift as the cautionary example

The reason this policy exists is the BC SaaS Contact → BAC Person migration we're currently working through. We're in the situation we're in *because* we violated this rule: BCSaaS dropped tables that downstream Skip migrations had FKs to.

Doing it properly going forward means:

- **BC SaaS 2.0** is the formal home for the cleaned-up structure (Person living in BAC, Contact retired in BCSaaS). It's a new major version.
- Existing 1.x customers upgrade through a hand-authored, one-time migration that walks them from 1.x to 2.0. The lift IS the upgrade path; there is no parallel 1.x maintenance track.
- The lift coordination (file dates set so Skip's FK-drop migration runs before BCSaaS's table-drop migration) is one-time work for this specific transition, not a recurring pattern.

Future apps don't get into this position because the policy prevents it. The lift is documented here as a cautionary example, not a template for future cross-app entity replacements.

## Worked examples

### Example 1: Adding a new optional column to a published table

**Allowed.** This is the most common case.

```sql
-- v1.4.x migration
ALTER TABLE ${flyway:defaultSchema}.MyTable
    ADD MyNewColumn nvarchar(100) NULL;
```

CodeGen will pick this up on the next run and emit a tolerant `spCreateMyTable` / `spUpdateMyTable` that accepts `@MyNewColumn` as an optional parameter. Historical `EXEC __mj.spCreateMyTable @Name='X', @Description='Y'` calls (which don't pass `@MyNewColumn`) continue to work unchanged because Pillar 1 makes every non-required param optional with NULL default.

### Example 2: Adding a NOT NULL column with a default

**Allowed.** A NOT NULL column with a database default doesn't break existing INSERTs.

```sql
-- v1.5.x migration
ALTER TABLE ${flyway:defaultSchema}.MyTable
    ADD MyRequiredColumn bit NOT NULL DEFAULT 1;
```

CodeGen will emit `@MyRequiredColumn bit = NULL` in the SP signature and wrap the INSERT body with `ISNULL(@MyRequiredColumn, 1)`. Historical EXEC calls continue to work; the column gets its default applied automatically.

### Example 3: Renaming a column

**Not allowed within the same major version.**

```sql
-- ❌ FORBIDDEN within v1.x
EXEC sp_rename 'MyTable.OldName', 'NewName', 'COLUMN';
```

Two reasons:
1. Downstream apps may have read or written `OldName` directly (in views, in custom SQL, in entity-field references). Renaming silently breaks them.
2. Historical `spUpdateMyTable @OldName=...` calls become invalid because the SP parameter no longer exists.

**Correct path:** add `NewName` as a new column, mark `OldName` as deprecated at the metadata level, populate `NewName` from `OldName` going forward, and physically remove `OldName` in v2.0.

### Example 4: Narrowing a column's type

**Not allowed within the same major version.**

```sql
-- ❌ FORBIDDEN within v1.x
ALTER TABLE ${flyway:defaultSchema}.MyTable ALTER COLUMN MyText nvarchar(50);
-- (was nvarchar(255))
```

Existing rows may have values longer than 50 characters; the migration would fail or truncate. Downstream callers may pass strings up to 255 characters; their writes would now fail.

**Correct path:** if you genuinely need to narrow, ship a v2.0 with the new type and a migration that either truncates with explicit consent or rejects rows that don't fit.

### Example 5: Removing an SP parameter

**Not allowed within the same major version.** Even with Pillar 1's tolerant signatures, *removing* a parameter breaks historical EXEC calls that named it.

```sql
-- ❌ FORBIDDEN within v1.x — drops @LegacyFlag from spCreateMyTable
CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMyTable]
    @Name nvarchar(255),
    @Description nvarchar(MAX) = NULL
    -- @LegacyFlag was here; now removed
AS
BEGIN
    -- ...
END
```

Historical migration `EXEC __mj.spCreateMyTable @Name='X', @LegacyFlag=1` will fail with "could not find @LegacyFlag" against the new SP. The historical EXEC sits in the migration stream forever, so this is a permanent break.

**Correct path:** mark the column behind `@LegacyFlag` as deprecated at the metadata level, leave the SP parameter in place (it just becomes a no-op or always-default), and remove it in v2.0.

### Example 6: Adding a NEW required SP parameter

**Allowed at the codegen level, but a policy violation.** Pillar 1 doesn't *prevent* you from adding a required parameter (NOT NULL, no default) — codegen will faithfully emit `@MyRequiredParam type` with no default. But doing so breaks every historical EXEC that doesn't pass it, even though the parameter is technically "new."

```sql
-- ❌ FORBIDDEN within v1.x — adds @MyRequiredParam with no default
CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMyTable]
    @Name nvarchar(255),
    @MyRequiredParam int   -- new, required, breaks historical EXECs
AS
```

**Correct path:** add the underlying column as nullable or with a database default. Codegen will then emit the parameter with `= NULL` and the SP body will apply the default. New callers can pass a value; old callers continue to work without one.

## How to enforce

This policy is enforced primarily by **review**, not by automation:

- Migration PRs that drop tables, drop columns, narrow types, rename entities/columns, or remove SP parameters should be flagged in code review.
- The CodeGen owner and at least one consumer-team reviewer (BC SaaS, Skip, Izzy, MJC, BizApps Common as relevant) should be tagged on PRs that change schema in a published OpenApp.
- When a breaking change is genuinely needed, the PR description must propose a major version bump path.

Tooling support is forthcoming — see plans/cross-app-migration-ordering.md §4.3 for the planned pre-install validation that catches some of these at install time.

## Audit at adoption

Before this policy formally applies to an existing app, an audit pass confirms which already-shipped versions of that app must be honored as immutable from this point forward. The first major version bump under the new policy is when the rule formally applies. Past published versions stay as they are; the policy applies prospectively.

## See also

- [plans/cross-app-migration-ordering.md](../plans/cross-app-migration-ordering.md) — the architecture document this policy is part of
- §3.1 of that plan — Pillar 1 (tolerant SP signatures), the tooling that makes this policy practical
- §4.1 of that plan — Pillar 3 (OpenApp dependency-order installation), the installer model that makes this policy *sufficient*
- §6.3 of that plan — the BAC/BCSaaS lift, treated as a one-time exception