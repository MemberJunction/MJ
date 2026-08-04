# `@memberjunction/codegen-lib` — CodeGen

CodeGen keeps the database schema, TypeScript types, SQL objects, and Angular UI components in
sync. This file covers what it generates, when it runs, how it connects to the database, and the
class-registration manifest system.

## What CodeGen generates and maintains

1. **Entity classes** (`packages/MJCoreEntities/src/generated/entity_subclasses.ts`)
   - TypeScript classes for all database entities, Zod schemas with validation rules
   - Strongly-typed getters/setters, FK relationships, computed fields
   - Value list unions derived from database CHECK constraints

2. **Database objects** (`migrations/v5/CodeGen_Run_*.sql`)
   - Stored procedures (`spCreate`, `spUpdate`, `spDelete`)
   - Views with proper joins and computed fields
   - Foreign key indexes (`IDX_AUTO_MJ_FKEY_<table>_<column>`)
   - Database permissions and security grants
   - Entity field metadata synchronization

3. **Angular UI components** (`packages/Angular/Explorer/core-entity-forms/src/lib/generated/`)
   - Complete CRUD forms per entity, form field components with proper types
   - Dropdown lists populated from FK relationships
   - Validation derived from database constraints

4. **Server APIs** (`packages/MJServer/src/generated/generated.ts`)

## Base views: generated, custom, or LAYERED

An entity's `BaseView` is its public surface — field discovery, permissions and the generated CRUD
routines all target it. Two `Entity` columns decide who writes it:

| `BaseViewGenerated` | `GeneratedBaseViewName` | Result |
|---|---|---|
| `1` | `NULL` | CodeGen writes `BaseView`. The default. |
| `0` | `NULL` | The app owns `BaseView` entirely; CodeGen writes nothing. |
| `0` | `vwFooGenerated` | **Layered** — CodeGen writes the inner view, the app wraps it. |

**Prefer LAYERED over fully custom.** Fully custom means the application inherits ~80 lines of
generated SQL — every display join, the geo join, the recursive root-ID apply — to add one column,
and must hand-maintain it forever. A foreign key added later then **silently** never appears: the
column is absent rather than wrong, so nothing errors and no test notices. Layering keeps all of that
regenerating underneath:

```sql
CREATE VIEW [orders].[vwOrderHeaders] AS
SELECT g.*, CASE WHEN ... END AS IsOverdue
FROM   [orders].[vwOrderHeadersGenerated] g;
```

Rules if you touch this:

- **Use `EntityInfo.GeneratedViewName`**, never re-derive from `BaseView`. It is the one answer to
  "which view does CodeGen write"; several call sites decide where to write, what to name the file,
  and what to refresh, and any two disagreeing produce a view under a name nothing reads.
- **`EntityInfo.HasLayeredBaseView`** is the layering test. It compares names case-insensitively —
  a view cannot select from itself, and a CHECK constraint on `Entity` refuses equal names too.
- **Refresh inner before outer.** The custom layer does `SELECT g.*` and a view caches its column
  list; refreshing the outer against a stale inner re-caches the old columns and the new one stays
  missing. CodeGen already emits `sp_refreshview` in that order — keep it that way.
- **CRUD routines stay on `BaseView`.** They return the affected row, so custom columns come back on
  create/update/delete. Do not point them at the inner view.

## When CodeGen runs

CodeGen runs when:
- Database schema changes are detected (new tables, columns, constraints)
- Entity metadata is updated in the MJ metadata tables
- Field descriptions or validation rules change
- Foreign key relationships are added or modified

Common triggers: `ALTER TABLE` adding columns, adding CHECK constraints or foreign keys, updating
`sp_addextendedproperty` descriptions, modifying value lists in `EntityFieldValue`, adding new
entities to the `EntityField` metadata.

### Worked example: adding `PromptRole` / `PromptPosition`

1. The **migration** creates the columns with constraints
2. **CodeGen detects** the schema change automatically
3. **Generated code** appears in three places:

```typescript
// entity_subclasses.ts
PromptRole: z.union([z.literal('System'), z.literal('User'), z.literal('Assistant'), z.literal('SystemOrUser')])

get PromptRole(): 'System' | 'User' | 'Assistant' | 'SystemOrUser'
set PromptRole(value: 'System' | 'User' | 'Assistant' | 'SystemOrUser')
```
```sql
-- CodeGen migration file
INSERT INTO EntityField (Name, Type, Description, ...)
INSERT INTO EntityFieldValue (Value, Code, ...)  -- dropdown options
```
```html
<!-- Angular form component -->
<mj-form-field FieldName="PromptRole" Type="dropdownlist" />
```

## Working with CodeGen

**✅ Do:**
- Run CodeGen after every schema change
- Review generated migration files before applying
- Use entity field descriptions — they become the generated documentation

**❌ Don't:**
- Modify files in any `/generated/` directory (they're overwritten)
- Skip CodeGen after database changes
- Assume TypeScript types are current without running CodeGen
- Hand-write CRUD operations — CodeGen owns them

---

## CodeGen Database Connections (SQL Server + PostgreSQL)

CodeGen (`mj codegen`) is a separate process from MJAPI with its own short-lived pool, configured
via `codegenPool` at the top level of `mj.config.cjs`. (The runtime MJAPI pool is
`databaseSettings.connectionPool` — see [`packages/MJAPI/CLAUDE.md`](../MJAPI/CLAUDE.md).)

```javascript
module.exports = {
  // ... other top-level codegen-lib config (dbHost, codeGenLogin, etc.)
  codegenPool: {
    // PG-only today (mssql doesn't honor these from this block yet)
    max: 20,                        // Max pool connections
    min: 2,                         // Min idle connections kept open
    idleTimeoutMillis: 30000,       // Close idle connections after this many ms
    connectionTimeoutMillis: 30000, // New-connection acquisition timeout
    ssl: false,                     // PG SSL (default false — matches the pre-refactor inline pool)

    // Cross-platform (both providers honor it)
    statementTimeoutMs: 120000,     // Per-statement timeout (ms)
  },
};
```

**Per-provider applicability** — not all fields apply to both providers today:

| Field | SQL Server | PostgreSQL |
|---|---|---|
| `statementTimeoutMs` | ✅ mssql `requestTimeout` | ✅ libpq `-c statement_timeout` |
| `max` / `min` / `idleTimeoutMillis` / `connectionTimeoutMillis` | ❌ ignored | ✅ `pg.Pool` config |
| `ssl` | ❌ ignored (SQL Server uses `dbTrustServerCertificate` + mssql's own SSL) | ✅ `pg.Pool` ssl |

The PG-only pool-sizing knobs reflect the asymmetry between mssql and `pg.Pool` configurability
today; they'll converge in a follow-up.

All fields are **optional** — when omitted, each driver's own defaults apply (mssql: 10 max +
`requestTimeout` 120000; `pg.Pool`: 20 max, 2 min, SSL off in codegen). This matches historical
CodeGen behavior, so adding the block is opt-in tuning, not a required change.

### Behavior

- **Lazy + module-cached pool**: both `MSSQLConnection()` (SQL Server) and `PGConnection()` (PostgreSQL) build their config and open the pool on first call, then cache the pool at the module level so repeated CodeGen operations within a single process reuse the same pool. The config is built **after** `initializeConfig()` runs, so config values from `mj.config.cjs` / `.env` are picked up correctly (the previous module-load-time destructure produced empty values when callers did `await import('@memberjunction/codegen-lib')` before `initializeConfig()`).
- **Platform dispatch via factory**: `RunCodeGenBase.setupDataSource()` resolves the concrete `CodeGenDatabaseProvider` via `MJGlobal.Instance.ClassFactory.CreateInstance(CodeGenDatabaseProvider, configInfo.dbPlatform)` and calls its `SetupDataSource()` method. Adding a new platform is `@RegisterClass(CodeGenDatabaseProvider, 'newplatform')` on the new provider class — no orchestrator changes.
- **`statementTimeoutMs`** is the cross-platform per-statement timeout. On SQL Server it maps to the mssql pool's `requestTimeout` (and takes precedence over the legacy top-level `dbRequestTimeout` / `MJ_CODEGEN_REQUEST_TIMEOUT` when both are set). On PostgreSQL it is carried via the libpq `-c statement_timeout=<ms>` startup option, so the server applies it from connection #1 — including the verify-`SELECT 1` connection that `PGConnectionManager.Initialize()` opens. When unset, each driver applies its own default (mssql: 120000ms; PG: no statement timeout).
- **`ssl` (PostgreSQL only)**: defaults to `false` to preserve the pre-multi-provider-refactor inline `pg.Pool` behavior (no SSL key passed → pg default OFF), so local/non-SSL codegen runs against PostgreSQL aren't broken by `PGConnectionManager`'s production-environment SSL auto-default. Set explicitly when the target Postgres requires SSL.

### CodeGen Environment Variables

CodeGen-time connection params come from `configInfo.dbHost` / `dbPort` / `dbDatabase` /
`codeGenLogin` / `codeGenPassword`, resolved (in order) from `mj.config.cjs`, then env vars, then
defaults. When `dbPlatform === 'postgresql'`, the PG-prefixed env vars take precedence over their
SQL-Server-named siblings — so an existing PG-targeted `.env` keeps working without renaming:

| Field            | PostgreSQL env (preferred)  | SQL Server / generic env | Fallback |
|------------------|-----------------------------|--------------------------|----------|
| `dbHost`         | `PG_HOST`                   | `DB_HOST`                | `localhost` |
| `dbPort`         | `PG_PORT`                   | `DB_PORT`                | `5432` (PG) / `1433` (SQL Server) |
| `dbDatabase`     | `PG_DATABASE`               | `DB_DATABASE`            | `''` |
| `codeGenLogin`   | `PG_USERNAME`               | `CODEGEN_DB_USERNAME`    | `''` |
| `codeGenPassword`| `PG_PASSWORD`               | `CODEGEN_DB_PASSWORD`    | `''` |

Env-var precedence is resolved **once**, in `DEFAULT_CODEGEN_CONFIG` inside `Config/config.ts`.
CodeGen provider code reads `configInfo.*` directly — `process.env.PG_*` is not consulted at the
connection layer. This keeps env resolution in one place and avoids the two-layer trap of
"resolved at config time, then re-resolved at connection time."

When both env vars in a row are set AND they differ (e.g. `PG_HOST=postgres.dev` AND
`DB_HOST=localhost`), `Config/config.ts` emits a one-line `console.warn` at module load
identifying which value wins and which is being ignored. The PG-prefixed value continues to take
precedence (existing behavior), but the silent override is now visible. Set only one — or set both
to the same value — to silence the warning.

---

## Class Registration Manifests (Tree-Shaking Prevention)

MemberJunction uses `@RegisterClass` decorators with a dynamic class factory
(`MJGlobal.ClassFactory`). Modern bundlers (ESBuild, Vite) cannot detect dynamic instantiation and
tree-shake these classes out. The **manifest system** prevents this.

**How it works**: `mj codegen manifest` walks the dependency tree, finds all
`@RegisterClass`-decorated classes via TypeScript AST, and emits a manifest with named imports +
an exported `CLASS_REGISTRATIONS` array that creates a static code path the bundler cannot
eliminate.

**Dual-manifest architecture for distribution:**
- **Pre-built manifests** ship inside bootstrap packages (`@memberjunction/server-bootstrap`, `@memberjunction/ng-bootstrap`). Generated at MJ build time; cover all `@memberjunction/*` classes.
- **Supplemental manifests** are generated by MJAPI/MJExplorer's `prestart`/`prebuild` scripts with `--exclude-packages @memberjunction` to capture only user-defined classes.
- This solves the npm distribution gap: published packages only have `dist/` (no `src/`), so the manifest generator can't scan them externally.

**Key scripts:**
- `npm run mj:manifest` — regenerates all 4 manifests (server-bootstrap, ng-bootstrap, MJAPI, MJExplorer)
- `npm run mj:manifest:server-bootstrap` / `mj:manifest:ng-bootstrap` — regenerate bootstrap pre-built manifests
- `npm run mj:manifest:api` / `mj:manifest:explorer` — regenerate app supplemental manifests

**See**: [CLASS_MANIFEST_GUIDE.md](../../plans/complete/codegen/CLASS_MANIFEST_GUIDE.md) for comprehensive
documentation on the manifest system, including how external consumers and MJ distribution users
should configure their projects.

> ⚠️ The browser-facing manifest packages carry a hard "no server-only dependencies" rule —
> see [`packages/Angular/Bootstrap/CLAUDE.md`](../Angular/Bootstrap/CLAUDE.md) and
> [`packages/Angular/BootstrapLite/CLAUDE.md`](../Angular/BootstrapLite/CLAUDE.md).

## Related

- **Migration authoring rules** — [`migrations/CLAUDE.md`](../../migrations/CLAUDE.md)
- **Migration → CodeGen end-to-end workflow** — [`guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md`](../../guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md)
- **Generated entity classes** — [`packages/MJCoreEntities/CLAUDE.md`](../MJCoreEntities/CLAUDE.md)
- **PostgreSQL schema casing** — [`guides/POSTGRES_SCHEMA_CASING_GUIDE.md`](../../guides/POSTGRES_SCHEMA_CASING_GUIDE.md)
