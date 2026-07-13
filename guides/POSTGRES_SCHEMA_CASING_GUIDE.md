# PostgreSQL Schema Casing & Canonical Class Names

**Audience:** MJ engineers touching schema-prefixed identifiers (entity `ClassName`/`CodeName`, GraphQL type names), the OpenApp install path, or CodeGen's metadata sync.

**TL;DR:** On PostgreSQL, unquoted DDL folds schema names to lowercase, so an app's physical schema `__mj_bizappscommon` no longer carries the casing its published entity classes need (`mjBizAppsCommon…Entity`). The casing the class names require **does not exist in the database** on a PG install — it survives only in the app manifest. We persist that case-stable name in a new `SchemaInfo.CanonicalSchemaName` column and prefer it (with a `COALESCE`/`??` fallback to `SchemaName`) wherever the schema prefix is derived: the `vwEntities` SQL view **and** the runtime GraphQL type-name path. NULL everywhere it isn't set → **net-zero** on SQL Server and every existing install.

---

## 1. The problem

On PostgreSQL, consuming-app builds fail with:

```
generated.ts(20,10): error TS2724: '"@mj-biz-apps/common-entities"' has no exported member
'mjbizappscommonAddressEntity'. Did you mean 'mjBizAppsCommonAddressEntity'?
```

CodeGen-generated TypeScript references entity classes named `mjbizappscommon…Entity`
(all-lowercase schema segment), but the published `@mj-biz-apps/common-entities` package
exports `mjBizAppsCommon…Entity` (PascalCase). The casings don't match → build break.

This affects **every mixed-case-schema OpenApp installed on PostgreSQL** — common, tasks,
issues, accounting, SaaS, and any future app whose schema name isn't all-lowercase.

## 2. Root cause

Entity `ClassName` (and `CodeName`) are computed in the core `__mj.vwEntities` view, which
prefixes the base table with a programmatic form of the schema name:

```sql
GetProgrammaticName( GetClassNameSchemaPrefix(e.SchemaName) + e.BaseTable + ISNULL(e.NameSuffix,'') ) AS ClassName
```

`GetClassNameSchemaPrefix` preserves the **input case verbatim** (special-cases only `__mj` → `MJ`,
and a literal `MJ` → `MJCustom`). So the prefix is only as well-cased as `e.SchemaName`:

- **SQL Server:** schema is stored as authored → `__mj_BizAppsCommon` → prefix `mjBizAppsCommon`. ✓
- **PostgreSQL:** unquoted DDL folds the physical schema to lowercase → `__mj_bizappscommon`
  → prefix `mjbizappscommon`. ✗

The TS side mirrors this exactly: `getSchemaPrefix(schemaName)` in
[`graphqlTypeNames.ts`](../packages/MJCore/src/generic/graphqlTypeNames.ts) lowercases only for
its `__mj`/`mj` comparisons and otherwise sanitizes the name **case-preserved** via
`sanitizeGraphQLName`. Same input → same lossy result on PG.

### Why we can't "just fix the schema casing"

The lowercase physical schema on PG is **correct and required**. It's what MJ's own OpenApp
engine canonicalizes to (`SQLDialect.CanonicalSchemaName` → lowercase on PG) and what the runtime
`QuoteSchema` resolves. Making the physical schema PascalCase would split a mixed-case name into a
quoted-mixed schema and a folded-lowercase schema — two physical schemas, which is worse.

So the casing the `ClassName` needs is **simply not present in the database** on a PG install:
`SchemaInfo.SchemaName`, `Entity.SchemaName`, and the catalog are all lowercase. The canonical
casing survives **only** in the app manifest (`mj-app.json` `schema.name`), because OpenApp does
`physical = SQLDialect.CanonicalSchemaName(manifest.schema.name)` — the manifest value is the
canonical form, the physical schema is its folded shadow.

### Why the fix must touch BOTH the SQL view and the TS path

The runtime GraphQL type name uses the **same** prefix logic: `getGraphQLTypeNameBase(entity)` →
`getSchemaPrefix(entity.SchemaName)`, called by both `GraphQLDataProvider` (client) and the
server's GraphQL codegen. Today client/server/view agree because all three derive from the same
lowercase `SchemaName`. If we made the SQL-view `ClassName` PascalCase while the TS GraphQL type
stayed lowercase, the entity class name and the GraphQL type name would **diverge** and break the
client. The fix is therefore applied in both places, keyed off the **same** canonical value.

## 3. The fix

Add a case-stable `SchemaInfo.CanonicalSchemaName`, sourced from `mj-app.json` `schema.name`, and
prefer it when computing the schema prefix — with a `COALESCE(CanonicalSchemaName, SchemaName)`
(SQL) / `CanonicalSchemaName ?? SchemaName` (TS) fallback so behavior is **net-zero** wherever it
is NULL: every existing install, the core `__mj` schema, and all of SQL Server (where `SchemaName`
is already canonical).

### 3a. `SchemaInfo.CanonicalSchemaName` column + `vwEntities`
Migration `V202606301331__v5.44.x__Canonical_Schema_Name_For_ClassName.sql`:
- Adds `SchemaInfo.CanonicalSchemaName NVARCHAR(50) NULL`.
- `CREATE OR ALTER VIEW vwEntities` — reproduces the current view verbatim, changing only the two
  `GetClassNameSchemaPrefix(e.SchemaName)` calls (in `CodeName` and `ClassName`) to
  `GetClassNameSchemaPrefix(COALESCE(si.CanonicalSchemaName, e.SchemaName))`, and exposing
  `si.CanonicalSchemaName AS CanonicalSchemaName` as a new virtual output column. `vwEntities` is a
  **hand-maintained core view** (`BaseViewGenerated = 0`) that CodeGen does not regenerate, so
  editing it in a migration is correct and precedented (the original `V202602190836` prefix
  migration did the same). `GetClassNameSchemaPrefix`/`GetProgrammaticName` are unchanged — only the
  input changes.

### 3b. `EntityInfo.CanonicalSchemaName`
Added to [`entityInfo.ts`](../packages/MJCore/src/generic/entityInfo.ts) as a virtual field. It
auto-populates from the new `vwEntities` output column via `copyInitData`. (This file is
hand-maintained, not generated — it coexists with the CodeGen-generated `EntityField` row.)

### 3c. Runtime GraphQL type-name path
[`graphqlTypeNames.ts`](../packages/MJCore/src/generic/graphqlTypeNames.ts) →
`getGraphQLTypeNameBase` now feeds `getSchemaPrefix(entity.CanonicalSchemaName ?? entity.SchemaName)`.
`getSchemaPrefix` itself is unchanged; it just receives the canonical name. Client, server, and the
SQL view stay in lockstep off one value.

### 3d. Populating `CanonicalSchemaName`
The value flows manifest → DB:
1. **OpenApp install** records the canonical (case-preserved) name on `OpenApp.SchemaName` (it
   already did this — `manifest.schema.name`). `PersistCanonicalSchemaName` in
   [`install-orchestrator.ts`](../packages/OpenApp/Engine/src/install/install-orchestrator.ts) also
   issues a best-effort idempotent `UPDATE SchemaInfo SET CanonicalSchemaName … WHERE LOWER(SchemaName)=LOWER(physical)`
   right after schema creation (a no-op when the `SchemaInfo` row doesn't exist yet).
2. **CodeGen backfill** — `spUpdateSchemaInfoFromDatabase` (the metadata-sync proc) backfills
   `CanonicalSchemaName` from the `OpenApp` record for any `SchemaInfo` row where it's still NULL,
   joined **case-insensitively** (`LOWER(si.SchemaName) = LOWER(app.SchemaName)`), filling NULLs only.
   This is **catalog-only** — CodeGen never reads `mj-app.json`.

> **Sequencing:** at install time the `SchemaInfo` row usually doesn't exist yet (it's materialized
> by CodeGen's proc, which INSERTs it with `CanonicalSchemaName` NULL). So the canonical value
> typically lands at **CodeGen time** via the backfill, not at install time. The install's own
> UPDATE covers reinstall/upgrade where the row already exists. The `OpenApp` record is the durable
> carrier in between.

## 4. The dual-source-of-truth caveat (read before editing the proc)

`spUpdateSchemaInfoFromDatabase` exists in **two** places that must stay in sync:
- **SQL Server:** hand-maintained in the baseline + this migration's `CREATE OR ALTER`. CodeGen does
  not regenerate it.
- **PostgreSQL:** regenerated on **every** CodeGen run from
  [`metadataSupportObjects.ts`](../packages/CodeGenLib/src/Database/providers/postgresql/metadataSupportObjects.ts).

The canonical-name backfill is implemented in **both**. If you only patched the SQL migration, PG
(the entire reason this fix exists) would lose the backfill on the next codegen. Any future change
to this proc's logic must be made in both locations.

## 5. Design alternatives considered (and rejected)

| Approach | Why rejected |
|---|---|
| Derive from `EntityNamePrefix` | Heuristic (`MJ_BizApps_Common:` needs a special `MJ`→`mj` rule); NULL-prefix schemas still break; re-couples class names to display naming that `V202602190836` deliberately decoupled. |
| `mj.config.cjs` fields | `NameRulesBySchema[].SchemaName` is unreliable (bizapps-common omits its own schema); `schemaPlaceholders[].schema` includes `'%'` and referenced-not-owned schemas (needs filtering). |
| Teach CodeGen to read `mj-app.json` | CodeGen is catalog-only by design; adds repo-scanning + schema→manifest mapping. Larger blast radius than sourcing from the `OpenApp` row CodeGen already sees. |
| **`mj-app.json` `schema.name` via the `OpenApp` record (chosen)** | Full coverage, exactly one per app, canonical-cased, and it IS the source of truth. The `OpenApp` row already carries it; the proc backfills catalog-only. |

## 6. Operating this — remediating existing PG installs

After the core fix ships → `mj migrate` → `mj codegen`:

- **Apps installed via `mj app install`** (have an `OpenApp` row): ClassNames **auto-fix** on the
  next codegen — the backfill reads the canonical name from the `OpenApp` record. No manual work.
- **Apps installed via raw migrations** (no `OpenApp` row): the backfill has no source, so they
  **stay lowercase** until you seed the `OpenApp` row. Insert one row per app with `SchemaName` =
  the **canonical** manifest name (e.g. `__mj_BizAppsCommon`), then run `mj codegen`. Seeding the
  `OpenApp` row is the right move anyway — it also makes the app visible to
  `mj app list`/`upgrade`/`remove`.

Then re-run codegen in each app's repo and republish its entity package (MJ core fix ships first).

## 7. Verification performed

- **SQL Server net-zero:** applied the full combined migration to a real DB (420 entities incl.
  mixed-case `__mj_BizAppsCommon`, `__BCSaaS`); `vwEntities.ClassName`/`CodeName`/`BaseTableCodeName`
  **byte-identical** before/after. `CanonicalSchemaName` NULL → `COALESCE` → `SchemaName`.
- **PostgreSQL end-to-end:** virgin DB via real `mj migrate` → real `mj app install bizapps-common`
  (wrote the `OpenApp` canonical name) → real `mj codegen`. Result: `SchemaInfo.CanonicalSchemaName`
  backfilled to `__mj_BizAppsCommon`; `vwEntities.ClassName` → `mjBizAppsCommonAddress…`; emitted
  `entity_subclasses.ts` contained `export class mjBizAppsCommonAddressEntity` (PascalCase) with
  zero lowercase classes — i.e., the file that threw TS2724 now generates correctly.
- **Alignment:** `getGraphQLTypeNameBase` and the SQL `vwEntities.ClassName` produce the identical
  string off the canonical name (client/server/view in lockstep).

## 8. Key files

- Migration: [`migrations/v5/V202606301331__v5.44.x__Canonical_Schema_Name_For_ClassName.sql`](../migrations/v5/V202606301331__v5.44.x__Canonical_Schema_Name_For_ClassName.sql)
- TS prefix: [`packages/MJCore/src/generic/graphqlTypeNames.ts`](../packages/MJCore/src/generic/graphqlTypeNames.ts)
- EntityInfo: [`packages/MJCore/src/generic/entityInfo.ts`](../packages/MJCore/src/generic/entityInfo.ts)
- PG proc (keep in sync with the migration): [`packages/CodeGenLib/src/Database/providers/postgresql/metadataSupportObjects.ts`](../packages/CodeGenLib/src/Database/providers/postgresql/metadataSupportObjects.ts)
- Install population: [`packages/OpenApp/Engine/src/install/install-orchestrator.ts`](../packages/OpenApp/Engine/src/install/install-orchestrator.ts) (`PersistCanonicalSchemaName`)
- Related: [`guides/UUID_COMPARISON_GUIDE.md`](UUID_COMPARISON_GUIDE.md) (the other SS-vs-PG casing hazard)
