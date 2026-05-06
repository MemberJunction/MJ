# Publish-Then-No-Breaking-Changes Policy

**Status:** Adopted at the 2026-04-29 cross-app migration meeting; applies prospectively from each app's next published version going forward.
**Applies to:** All MemberJunction OpenApps.
**Source of record:** §3.2 of [plans/cross-app-migration-ordering.md](https://github.com/MemberJunction/MJ/blob/plan/cross-app-migration-ordering/plans/cross-app-migration-ordering.md).

## The rule

Once an OpenApp version is **published**, within that major version the app's schema is **immutable except for additive changes**. The exhaustive list of what is and isn't allowed is below.

This is a hard rule, not a guideline. Breaking it forces a major version bump (1.x → 2.0), which is a manual upgrade path — not an automatic one.

## What's not allowed within a published major version

| Forbidden | Why |
|---|---|
| Dropping a table | Both internal callers (views, SPs, code in the same app) and downstream apps with foreign keys to it are broken; the cross-app foreign-key case is the motivating one for this policy |
| Dropping a column | Downstream code may read or write it; codegen will also regenerate SPs without that column's parameter, breaking historical `EXEC` calls |
| Renaming a column | The old name disappears (same blast radius as dropping the column — see above), and any view, custom SQL, or downstream code that referenced it by name silently breaks |
| Narrowing a column's type (`nvarchar(100)` → `nvarchar(50)`, `bigint` → `int`, `decimal(18,4)` → `decimal(10,2)`) | Existing data may not fit; downstream callers may pass values that no longer round-trip |
| Removing or renaming an entity | Same reasoning as dropping a table, plus metadata-level breakage |
| Removing or renaming a stored-procedure parameter | Historical `EXEC` calls in migration history will fail because they reference the dropped/renamed parameter by name |
| Adding a *required* (NOT NULL, no database default) column or stored-procedure parameter | Pillar 1 (tolerant SP signatures) makes additive changes safe *only* when the new parameter is optional. A required addition breaks every historical `EXEC` that doesn't pass it |
| Dropping a foreign-key constraint or `EntityRelationship` row that downstream code, UI, or referential-integrity expectations depend on | Removes a documented navigation path or referential-integrity guarantee; downstream code that traverses the relationship via metadata, or that relies on the FK to enforce data shape, stops working as expected |

## What IS allowed

| Allowed | Notes |
|---|---|
| Adding a new table | Pure addition; no risk to existing callers |
| Adding a new column | Must be either nullable, have a database default, or both. NOT NULL with no default would break existing INSERTs |
| Widening a column's type (`nvarchar(50)` → `nvarchar(100)`, `int` → `bigint`) | Existing data still fits |
| Adding a new SP parameter (with a default) | Pillar 1 codegen makes this safe by default — every non-required param gets `= NULL` and is wrapped with `ISNULL(@Param, <db_default>)` in the body |
| Adding a new entity | Same as adding a table at the metadata layer |
| Adding a new `EntityRelationship` row, or adding a foreign key to a column that doesn't already have one | Adds a navigation path or constraint; existing callers that didn't reference the relationship aren't affected. Caveat: adding a foreign key that's actually violated by existing data will fail at migration time — check first |
| Marking an entity or column as **deprecated** at the metadata level | The recommended replacement for "I want to retire this." See § "Deprecation" below |

## Deprecation

Deprecation at the MJ metadata level has been supported for over a year and is the correct pattern for retiring something within a published major version.

A deprecated entity or column:

- **Stays physically present** in the schema. Existing callers continue to work.
- **Continues to function** at runtime. Reads, writes, and SP calls behave identically.
- **Is flagged as not-for-new-use.** Tooling, documentation, and developer awareness should steer new code away from it.

Deprecation does NOT mean "scheduled for deletion in version X.Y." Once deprecated within a published major version, a thing stays present indefinitely. If the app eventually bumps a major version, that's the moment when accumulated deprecations can be physically removed; some apps may never bump major, and that's fine — the deprecated columns are harmless dead weight.

To physically remove a deprecated entity or column, you need a major version bump (see below).

## Breaking changes force a major version bump

When an app genuinely needs to make a breaking change — drop, narrow, rename, or anything else from the Forbidden list — the path is a major version bump:

- **OpenApp 1.x → 2.0** is allowed to drop tables, drop columns, narrow types, rename entities, etc.
- The 2.0 release is treated as a new app from the customer's perspective. Installation is a manual migration path — typically a one-time hand-authored "open-heart surgery" migration that walks an existing 1.x customer to 2.0. There is no parallel 1.x maintenance track once 2.0 ships.
- 2.0 does not automatically upgrade an existing 1.x installation. The customer (or the release team on the customer's behalf) explicitly opts into the upgrade.

## Why this works

If every app obeys this rule going forward, the only ordering problem the OpenApp installer needs to solve is the dependency graph derived from each app's manifest. (Formalizing that installer model is the Pillar 3 work — §4.1 of [plans/cross-app-migration-ordering.md](https://github.com/MemberJunction/MJ/blob/plan/cross-app-migration-ordering/plans/cross-app-migration-ordering.md) — and isn't fully in place yet, but the policy is what makes it *sufficient* once it ships.) The "drop X in app A after app B has dropped its FK to X" scenario only arises when an app violates the policy. With the policy in force, cross-schema interleaving stops being a requirement and the simpler "install each app's migrations in dependency order" model is enough.

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

**Correct path:** add `NewName` as a new column, mark `OldName` as deprecated at the metadata level, populate `NewName` from `OldName` going forward. `OldName` stays physically present indefinitely; if the app eventually bumps a major version, that's a chance to drop accumulated deprecations, but it's not required.

### Example 4: Narrowing a column's type

**Not allowed within the same major version.**

```sql
-- ❌ FORBIDDEN within v1.x
ALTER TABLE ${flyway:defaultSchema}.MyTable ALTER COLUMN MyText nvarchar(50);
-- (was nvarchar(255))
```

Existing rows may have values longer than 50 characters; the migration would fail or truncate. Downstream callers may pass strings up to 255 characters; their writes would now fail.

**Correct path:** if you genuinely need to narrow, ship a v2.0 with the new type and a migration that either truncates with explicit consent or rejects rows that don't fit.

### Example 5: Removing an SP parameter (by dropping its underlying column)

**Not allowed within the same major version.** SP parameters in MJ aren't authored by hand — codegen emits them from the schema. So removing a parameter is really a side effect of dropping its underlying column, and that's what's forbidden: historical `EXEC` calls in the migration stream reference the parameter by name, and they'll fail forever once codegen regenerates the SP without it.

```sql
-- ❌ FORBIDDEN within v1.x — drops the LegacyFlag column.
-- Codegen will then emit spCreateMyTable / spUpdateMyTable WITHOUT @LegacyFlag,
-- breaking every historical EXEC that named it.
ALTER TABLE ${flyway:defaultSchema}.MyTable DROP COLUMN LegacyFlag;
```

Historical migration `EXEC __mj.spCreateMyTable @Name='X', @LegacyFlag=1` will fail with "could not find @LegacyFlag" against the regenerated SP. The historical EXEC sits in the migration stream forever, so this is a permanent break.

**Correct path:** mark the `LegacyFlag` column as deprecated at the metadata level. The column stays physically present, codegen continues to emit `@LegacyFlag` as an optional parameter on `spCreateMyTable` / `spUpdateMyTable`, and historical `EXEC` calls keep working. New code stops using it. The deprecated column can stay indefinitely — it's harmless dead weight — and only needs physical removal if and when the app does a major version bump.

### Example 6: Adding a required column (and thus a required SP parameter)

**Not allowed within the same major version.** Pillar 1 makes additive changes safe *only* when the new parameter is optional, which means the underlying column has to be nullable, have a database default, or both. A new column declared NOT NULL with no default produces a required SP parameter, which breaks every historical EXEC that doesn't pass it.

```sql
-- ❌ FORBIDDEN within v1.x — adds a NOT NULL column with no default.
-- Codegen will emit @MyRequiredParam in spCreateMyTable / spUpdateMyTable
-- with no default value, breaking historical EXECs.
ALTER TABLE ${flyway:defaultSchema}.MyTable
    ADD MyRequiredParam int NOT NULL;
```

**Correct path:** declare the column either nullable or with a database default (or both). Codegen will then emit the parameter with `= NULL` and the SP body will apply the default. New callers can pass a value; old callers continue to work without one. See Example 2 for the worked-out NOT-NULL-with-default case.

## How to enforce

This policy is enforced primarily by review. Migration PRs that drop tables, drop columns, narrow types, rename entities/columns, or drop columns whose names appear as SP parameters should be flagged. When a breaking change is genuinely needed, the PR description should propose the major version bump path instead of attempting the change in-place.

Tooling support to catch some of these mechanically at install time is described in §4.3 of [plans/cross-app-migration-ordering.md](https://github.com/MemberJunction/MJ/blob/plan/cross-app-migration-ordering/plans/cross-app-migration-ordering.md) (pre-install OpenApp manifest validation). That tooling isn't in place yet; review is the gate until it lands.

## How this applies to versions already in the wild

The policy is **prospective**. Past published versions of any app stay as they are — the policy doesn't retroactively make their already-shipped migrations a violation, and it doesn't require rewriting history. From each app's next published version going forward, the rule applies to that app.

## See also

- [plans/cross-app-migration-ordering.md](https://github.com/MemberJunction/MJ/blob/plan/cross-app-migration-ordering/plans/cross-app-migration-ordering.md) — the architecture document this policy is part of
- §3.1 of that plan — Pillar 1 (tolerant SP signatures), the tooling that makes this policy practical
- §4.1 of that plan — Pillar 3 (OpenApp dependency-order installation), the installer model that makes this policy *sufficient*
- §6.3 of that plan — the BAC/BCSaaS lift, treated as a one-time exception