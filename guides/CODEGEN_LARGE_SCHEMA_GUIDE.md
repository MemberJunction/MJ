# CodeGen at schema scale

**Who this is for.** You are about to point MemberJunction at a database that is not a handful of `__mj` tables. Typical shape: **two to three dozen schemas, 100–150 tables each**, foreign keys inside a schema and a few across schemas. Two thousand entities is normal. Five thousand happens. One schema with two thousand tables is possible and this guide still applies — it is just the less common case.

**What this is not.** This is not "make the 49-million-row audit table faster to backfill." Skip that table. It is not a rewrite of `GetAllMetadata`. The catalog stays complete. And it is not a promise that the first CodeGen run on a new brownfield is instant — discovery still has to happen once.

Companion test bed: [`Demos/BigSchemaDemo`](../Demos/BigSchemaDemo/README.md). Droppable private database. Regenerable SQL. Use it before you point CodeGen at a customer.

---

## The invariant

> **Entity is the identity. Schema is the incremental unit.**

Every entity still has a name, a class, a row in `MJ: Entities`, fields, FKs. `Metadata.Entities` is the complete catalog and stays that way — nothing is sharded, nothing is "the CRM metadata provider."

Everything that can be incremental keys off the schema:

| Concern | Unit | Why |
|---|---|---|
| File emit | one `.ts` file per schema + a barrel | A change in `bsd_crm` must not rewrite `bsd_billing.ts` |
| Dirty regen | schemas that contain a new/modified entity | 1 dirty table → 1 dirty schema → 1 file |
| Parallelism | schemas are independent string-builds | 24 schemas, 8-wide, no shared mutable file |
| Output routing | schema → directory / npm package | Demo and Open App schemas must not land in `@memberjunction/core-entities` |
| Agent / MCP context | schema-filtered projection of the catalog | 2,880 table definitions do not fit in a prompt |
| Skip-entity | schema.table (or `%.%History`) | Skip the 49M-row table entirely |

If you take one thing from this document: **do not split by entity** (thousands of tiny files, terrible barrel, worse GraphQL availability) **and do not keep one monolith** (one byte change dirties a 200k-line file and incremental `tsc` throws the cache away). Schema is the unit that matches how the databases actually look.

---

## The eight improvements

### 1. Per-schema emit

`EntitySubClassGeneratorBase.generateAllEntitySubClasses` and `GraphQLServerGeneratorBase.generateGraphQLServerCode` write:

```
generated/
  entity_subclasses.ts          # barrel: loadModule + export * from each schema
  entities/
    __mj.ts
    bsd_crm.ts
    bsd_billing.ts
    …

generated/
  generated.ts                  # GraphQL barrel
  graphql-schemas/
    __mj.ts
    bsd_crm.ts
    …
```

Public import paths do not change. `@memberjunction/core-entities` still does `export * from './generated/entity_subclasses.js'`. MJServer still does `export * from './generated/generated.js'`. The barrel is the stable surface; the per-schema files are the incremental ones.

Core GraphQL files live one directory deeper (`generated/graphql-schemas/__mj.ts`) than the old monolith (`generated/generated.ts`). Their `mj_core_schema` import is therefore `../../config.js`, not `../config.js`. A wrong relative path compiles the barrel and then fails `tsc` in `@memberjunction/server` with `Cannot find module '../config.js'`.

Cross-schema GraphQL child-array fields are omitted on purpose. A bare ObjectType name only compiles when that class is declared in the same file (`GeneratedTypeAvailability`). A `bsd_billing` invoice that points at a `bsd_crm` customer still has the FK field; it does not get a `Customers: Customer_[]` resolver in the billing file. Use `RunView` for that, the same way the unused `*Array` FieldResolvers were retired.

Legacy single-file emit is still available: `fileEmit.perSchema: false`.

### 2. Write only when bytes change

`writeFileIfChanged` (SQL generation already had this; entity and GraphQL emit now share it) compares the would-be file to what is on disk and skips the write when they are identical.

This is what makes incremental `tsc` (item 6) actually work. TypeScript's `.tsbuildinfo` keys off file mtimes. Rewriting a 200k-line `entity_subclasses.ts` with the same bytes still counts as dirty. Not writing it is the whole optimization.

A no-op CodeGen run on an unchanged database should produce **zero mtime changes** in generated TypeScript.

### 3. Dirty-schema scoped regen

On a full CodeGen run (`mj codegen`, database + files), only schemas that contain an entity in `newEntityList ∪ modifiedEntityList` are rebuilt — plus any schema whose file is missing, so a fresh clone is complete.

`--skipdb` (files only, from current metadata) rebuilds every schema and still uses write-if-changed. That is the correct "the metadata is already right, refresh the artifacts" path.

Disable with `fileEmit.dirtySchemaOnly: false`.

This is scoped regen at the **schema** grain, not the entity grain. Entity-level regen of views/SPs already exists (`newEntityList` / `modifiedEntityList` in `sql_codegen`). File emit is the piece that was still all-or-nothing.

### 4. Schema-qualified `excludeTables` strings

`excludeTables` still accepts `{ schema, table }` objects. It now also accepts strings, because that is how operators actually want to write "skip this":

```js
excludeTables: [
  { schema: '%', table: 'sys%' },          // historical
  { schema: '%', table: 'flyway_schema_history' },
  'aptify.EntityRecordVersions',           // one 49M-row table
  '%.%History',                            // family glob, any schema
  '%Audit%',                               // table-only → schema '%'
]
```

The string is parsed by `parseExcludeTableEntry` (last `.` splits schema from table; no dot means any schema) and fed to the same LIKE/equals predicate `createExcludeTablesAndSchemasFilter` already emits. Excluded tables never become MJ entities, so they never get audit columns, CRUD procs, or TypeScript.

Skipping the table is strictly better than backfilling it faster.

### 5. Schema-parallel file generation

Independent schema files are assembled with a bounded `mapLimit` (default 8). This is CPU-bound string building, not `worker_threads` and not more SQL connections. PostgreSQL SQL generation stays serial (catalog deadlocks under parallel phased DDL — that constraint is unchanged). SQL Server per-entity SQL width is now `fileEmit.sqlEntityBatchSize` (default 8, was hardcoded 5).

Tune with `fileEmit.concurrency` and `fileEmit.parallel`.

### 6. Incremental `tsc`

`@memberjunction/core-entities` and `@memberjunction/server` now set `"incremental": true` with `tsBuildInfoFile` under `dist/` (already gitignored via `*.tsbuildinfo`). Combined with items 1–3, a one-schema change recompiles that schema's `.ts` and the barrel, not the other 23 files.

The first build after a clean `dist/` is the same cost as before. Every build after that is proportional to what actually changed.

### 7. Runtime hydrate-by-schema — catalog stays complete

`GetAllMetadata` / `md.Entities` is **not** sharded. A 2,000-entity catalog is a 2,000-row array in memory and that is fine. The expensive part of a prompt or an MCP tool is *serializing* it.

Use the projection helpers in `@memberjunction/core`:

```ts
import { summarizeEntitiesForContext, entitiesInSchemas } from '@memberjunction/core';

const crmOnly = md.EntitiesInSchema('bsd_crm');
const summary = summarizeEntitiesForContext(md.Entities, {
  schemas: ['bsd_crm', 'bsd_billing'],
  maxEntities: 80,
  includeFields: false,
});
```

`Metadata.SchemaNames()` and `Metadata.EntitiesInSchema(name)` are the same idea on the helper class.

**What this is not:** lazy-loading `EntityField` rows per schema on `GetAllMetadata`. That would be a real follow-up (the `EntityFields` dataset item is the payload that actually hurts at 60k+ rows) and it is deliberately not the default — too many callers assume every `EntityInfo` already has `Fields`. When that lands it will be an opt-in on the provider, not a silent behavior change.

### 8. Package topology (`entityPackageName` + `schemaOutput`)

Two maps, two jobs:

- **`entityPackageName`** — already existed. String (legacy: every non-core schema is `mj_generatedentities`) or `Record<schema, npmPackage>` so an installed Open App is imported from its own package and **not** re-emitted by the host.
- **`schemaOutput`** — new. Route (or skip) generated *files* for matching schemas to a directory that is not the host's default. First match wins. `%` wildcards are allowed; `_` is literal.

```js
schemaOutput: [
  {
    schema: 'bsd_%',
    EntitySubClasses: './Demos/BigSchemaDemo/generated/entities',
    GraphQLServer: './Demos/BigSchemaDemo/generated/graphql',
    skip: ['Angular'],
  },
]
```

This is how BigSchemaDemo stays out of `@memberjunction/core-entities`. 2,880 demo classes are a test artifact, not a published package.

Together with `includeSchemas` (positive scope, already resolved into `excludeSchemas`) you can run CodeGen against *just* the demo schemas after the first MJ bootstrap, or against *just* one Open App in a multi-app database.

---

## Config reference

```js
// mj.config.cjs — the knobs this guide adds or leans on
module.exports = {
  includeSchemas: ['__mj', 'bsd_crm'],   // optional positive scope
  excludeSchemas: ['sys', 'staging'],
  excludeTables: [
    { schema: '%', table: 'sys%' },
    'aptify.EntityRecordVersions',
    '%.%History',
  ],
  fileEmit: {
    perSchema: true,
    writeIfChanged: true,
    parallel: true,
    concurrency: 8,
    dirtySchemaOnly: true,
    sqlEntityBatchSize: 8,
  },
  schemaOutput: [
    { schema: 'bsd_%', EntitySubClasses: './Demos/BigSchemaDemo/generated/entities', skip: ['Angular'] },
  ],
  entityPackageName: {
    // 'events': '@memberjunction/open-app-events',
  },
};
```

All `fileEmit` fields default as shown. Omitting the block is the new recommended behavior.

---

## What a run looks like

```
First run on a new brownfield
  discover tables → create Entity rows → emit every schema file → incremental tsc is a full compile

Second run, no schema change
  newEntityList = [] , modifiedEntityList = []
  dirty schemas = ∅ , every file exists
  string-build skipped, disk writes skipped, tsc is a cache hit

One column added on bsd_crm.Child_014
  modifiedEntityList = ['bsd_crm Child 014']
  dirty schemas = { bsd_crm }
  only entities/bsd_crm.ts is rewritten
  barrel unchanged (write-if-changed)
  tsc recompiles bsd_crm.ts
```

Time is then proportional to **dirty schemas**, not to entity count.

---

## What this does not do (yet)

- **Checkpoint / `--resume` of a killed CodeGen run.** The run-state JSON is telemetry, not a cursor. If skip-entity + dirty-schema make full runs fast enough, resume may never pay for its semantics. See `plans/codegen-large-schema-improvements.md` Workstream D.
- **`worker_threads` for the string-build.** `mapLimit` on the main thread is the first cut. Profiling on BigSchemaDemo `standard` will tell us if workers are worth the `EntityInfo` serialization cost.
- **Default-on lazy `EntityField` hydration.** Item 7 is the projection API. The dataset split is a follow-up.
- **PostgreSQL SQL generation in parallel.** Still serial, on purpose.

---

## Measuring it

Use BigSchemaDemo.

```bash
# in a worktree whose .env points at a PRIVATE database
cd Demos/BigSchemaDemo
./recreate.sh --profile smoke            # 36 tables, seconds
./recreate.sh --profile standard         # 2,880 tables
# then, from the worktree root
npx mj codegen --report
```

Compare `~/.mj/codegen-state/run-*.json` phase timings: `generateEntitySubclasses`, `generateGraphQL`, `manageSQLScriptsAndExecution`. A second run with no DDL change should show the file-emit phases collapsing to near-zero.

AFTER commands in this repo are `pnpm run build` in the packages CodeGen just wrote. `runCommand` treats **exit code only** as success — `tsc` / `pnpm` print the word `error` to stderr on successful builds, and that must not fail the run. A real non-zero exit keeps the captured stdout/stderr in the reporter notes so you can see the diagnostic. On a fresh worktree the AFTER packages must already have their workspace dependencies built (`pnpm exec turbo run build --filter=@memberjunction/ng-core-entity-forms --filter=@memberjunction/server`) or those two commands will fail for missing `dist/`, not because CodeGen is wrong.

For a 2,880-entity first discovery, set `advancedGeneration.enableAdvancedGeneration: false` for that run only. The LLM pass is per-new-entity and is not what this guide is measuring.

Dropping and recreating `bsd_*` schemas (the demo `00_drop.sql`) deletes the stored procedures but leaves the `MJ: Entities` rows. Those entities are not in `newEntityList` / `modifiedEntityList`, so incremental SQL execution would skip them. CodeGen now snapshots `sys.procedures` at the start of the SQL pass and force-emits `CREATE PROC` for any missing routine. The SQL Server CRUD validator also implements `getRoutineNamesBySchemaSQL` — without that override the validator returned an empty "missing" list and reported a green pass over holes.

---

## Related

- [BigSchemaDemo](../Demos/BigSchemaDemo/README.md) — the droppable test bed
- [Scoped entity regeneration](../plans/codegen/scoped-entity-regeneration-plan.md) — the older entity-grain plan this complements
- [Large-schema operational plan](../plans/codegen-large-schema-improvements.md) — skip-entity, parallelism, observability, resume
- Issue #3784 — generated monoliths
- Issue #2908 — runtime all-at-once architecture (CodeGen split is necessary, not sufficient)
