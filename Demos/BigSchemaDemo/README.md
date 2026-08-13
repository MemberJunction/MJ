# BigSchemaDemo

A droppable, regenerable **schema-scale test bed** for MemberJunction CodeGen.

Real customer databases are not one schema with 2,000 tables. They are **two to three dozen schemas, 100–150 tables each**, foreign-keyed inside the schema and occasionally across schemas. This demo builds that shape on demand, seeds just enough data that every FK is real, and is designed to be thrown away.

Use it to prove the work in [`guides/CODEGEN_LARGE_SCHEMA_GUIDE.md`](../../guides/CODEGEN_LARGE_SCHEMA_GUIDE.md): per-schema emit, write-if-changed, dirty-schema regen, skip-entity strings, schema-parallel file gen, incremental `tsc`, hydrate-by-schema, and `schemaOutput` routing.

It is **not** in the npm workspace. It will not slow a `pnpm build`. It will not publish 2,880 entity classes.

---

## What you get

| Profile | Schemas | Tables / schema | Total tables | When |
|---|---|---|---|---|
| `smoke` | 3 | 12 | 36 | Every change. Seconds. **SQL is committed.** |
| `standard` | 24 | 120 | 2,880 | The realistic test bed. Generate on demand. |
| `large` | 36 | 150 | 5,400 | Upper bound of the brief. Overnight / CI job. |

Each schema is named `bsd_<domain>` (`bsd_crm`, `bsd_billing`, …) so it is trivial to find and drop.

Inside a schema the tables are a small, honest domain model, not `Table_001`…`Table_120` with no relationships:

```
Hub  1───*  Child_*  1───*  Grandchild_*
 │ \         │
 │  \        └── Lookup_01   (nullable)
 │   \
 │    *  XRef_*  (Hub + Lookup, many-to-many stand-in)
 │
 └──  Bridge.LocalHubID          (every schema except the first)
         Bridge.RemoteHubID  ──►  previous schema's Hub
```

Counts scale with the profile. On `standard`, a schema is roughly 1 hub, 8 lookups, ~77 children, ~20 grandchildren, ~13 xrefs, and 1 bridge.

Seed data is **logical and tiny**: 5 hubs, 4 lookup rows, 8 children, 6 grandchildren, 6 xrefs, 4 bridges. Every FK lands on a real parent. IDs are deterministic UUIDs (`B5D00000-0000-4000-80ss-00000ttttrrrr`) so drop + recreate does not leave orphans and two machines generate the same bytes.

---

## Safety

The recreate scripts **refuse** to run against shared database names (`MJ_6_1_0`, `MJ_DEV`, `master`, …). They read `DB_*` from **this worktree's `.env`**, not from whoever happens to be in `~/develop/M5/MJ`.

The private database this work used:

```
DB_DATABASE=MJ_6_1_0_BIG_SCHEMA_CODEGEN
GRAPHQL_PORT=4102
```

Drop it whenever you want. Recreate it whenever you want. It is not anyone else's environment.

---

## Quick start (smoke, no MJ bootstrap)

You need `sqlcmd` and a SQL Server. You do **not** need a MemberJunction install to apply the SQL — the scripts are ordinary T-SQL.

```bash
cd Demos/BigSchemaDemo
chmod +x recreate.sh generate.mjs

# 1. Point THIS checkout's .env at a private database. Do not edit a sibling worktree.
# 2. Create the empty database if it does not exist:
./recreate.sh --profile smoke --recreate-database

# That DROP/CREATE's the DB and applies sql/smoke/*.sql.
# Inspect:
#   sqlcmd … -Q "SELECT s.name, COUNT(*) FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE s.name LIKE 'bsd_%' GROUP BY s.name"
```

Smoke SQL is committed under `sql/smoke/` so you can apply it without Node. `standard` and `large` are generated on demand (they are large and 100% determined by `generate.mjs` + the profile JSON).

---

## Full start (MJ + CodeGen, the actual test bed)

CodeGen can only *discover* `bsd_*` tables if `__mj` already exists. The four-step bootstrap is the same as [`bootstrap-clean-db`](../../.claude/skills/bootstrap-clean-db/SKILL.md) and it is **not negotiable**:

```bash
# From the worktree root. Uses THIS .env. npx is local to this tree.
./Demos/BigSchemaDemo/recreate.sh --profile smoke --bootstrap
```

`--bootstrap` means:

1. `DROP` + `CREATE` the private database
2. `npx mj migrate`
3. `npx mj codegen --skipfiles`     ← database side only. A full codegen here would wipe `remote_operations.ts`
4. `npx mj sync push --dir=metadata --ci`
5. `npx mj codegen --skipdb`        ← files from complete metadata
6. Apply BigSchemaDemo SQL

Then run CodeGen again so it *sees* the new tables:

```bash
# Still from the worktree root
npx mj codegen
```

Without `schemaOutput` / `includeSchemas`, those 2,880 entities would try to land in the host's `EntitySubClasses` directory. **Do not do that in this repo.** Add this to the worktree `mj.config.cjs` (do not commit a machine-local path that hijacks core-entities):

```js
module.exports = {
  // …
  includeSchemas: undefined, // leave unset for a full run; or list ['__mj', 'bsd_crm', …]
  excludeTables: [
    { schema: '%', table: 'sys%' },
    { schema: '%', table: 'flyway_schema_history' },
    // prove item 4: these strings are real config, not comments
    // 'bsd_crm.XRef_01',
    // '%.%History',
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
    {
      schema: 'bsd_%',
      EntitySubClasses: './Demos/BigSchemaDemo/generated/entities',
      GraphQLServer: './Demos/BigSchemaDemo/generated/graphql',
      skip: ['Angular'],
    },
  ],
};
```

After the run you should see:

```
Demos/BigSchemaDemo/generated/entities/entity_subclasses.ts   # barrel
Demos/BigSchemaDemo/generated/entities/entities/bsd_crm.ts
Demos/BigSchemaDemo/generated/entities/entities/bsd_billing.ts
…
```

and **no** new classes in `packages/MJCoreEntities/src/generated/`.

A second `npx mj codegen` with no DDL change should rewrite **nothing** (write-if-changed + dirty-schema). Compare mtimes. Compare `~/.mj/codegen-state/run-*.json` if you passed `--report`.

---

## Regenerating the SQL

```bash
node generate.mjs --profile smoke      # writes sql/smoke/
node generate.mjs --profile standard   # writes sql/standard/
node generate.mjs --profile large      # writes sql/large/
```

`generate.mjs` has no npm dependencies. Same profile + same script = same files. If you change the generator, regenerate smoke and commit the new `sql/smoke/*`.

Windows: `.\recreate.ps1 -Profile smoke`.

---

## How to use it as a CodeGen test bed

These are the experiments the eight improvements were written for.

1. **Per-schema emit.** After a smoke codegen, `generated/entities/entities/` has one file per `bsd_*` schema, and the barrel only re-exports. Open `bsd_crm.ts` — you should see Hub, Lookup_*, Child_*, FKs as typed properties.

2. **Write-if-changed.** Run codegen twice. `stat` the generated files. Second run: mtimes unchanged.

3. **Dirty-schema regen.** `ALTER TABLE bsd_crm.Child_001 ADD ExtraNote NVARCHAR(80) NULL;` then codegen. Only `bsd_crm.ts` (and metadata for that entity) should change. `bsd_billing.ts` should keep its mtime.

4. **Skip-entity strings.** Add `'bsd_crm.XRef_01'` to `excludeTables`, drop the entity row if CodeGen already created it, rerun. That table must not come back as an MJ entity.

5. **Schema-parallel.** `fileEmit.concurrency: 1` vs `8` on `standard`. The file-emit phase is CPU; the wall-clock should drop until you saturate cores.

6. **Incremental tsc.** `cd packages/MJCoreEntities && pnpm exec tsc -b --pretty false` twice after a one-schema change. Second compile should be a cache hit on the untouched schema files.

7. **Hydrate-by-schema.** In a small script against the running API:

   ```ts
   const crm = md.EntitiesInSchema('bsd_crm');
   const summary = summarizeEntitiesForContext(md.Entities, { schemas: ['bsd_crm'], maxEntities: 20 });
   ```

   `md.Entities.length` is still the full catalog. The summary is what you would hand an agent.

8. **Package topology.** Confirm `schemaOutput` kept `bsd_*` out of `packages/MJCoreEntities`. Confirm `entityPackageName` still works for an installed Open App (unchanged).

---

## Drop / recreate

```bash
# schemas only, keep the MJ catalog
./recreate.sh --profile smoke

# the whole private database
./recreate.sh --profile smoke --recreate-database

# the whole private database, rebuilt from migrations
./recreate.sh --profile smoke --bootstrap
```

There is no precious state in `MJ_6_1_0_BIG_SCHEMA_CODEGEN`. If it looks weird, drop it.

---

## What this demo is careful not to do

- It does **not** add `__mj_CreatedAt` / `__mj_UpdatedAt`. CodeGen owns those.
- It does **not** create FK indexes. CodeGen owns those.
- It does **not** seed `__mj` metadata. CodeGen discovers the tables.
- It does **not** live in `packages/`. A `pnpm` filter will not see it.
- It does **not** author PostgreSQL. Convert at release time like every other T-SQL artifact.

---

## Layout

```
Demos/BigSchemaDemo/
  generate.mjs              # the source of truth
  recreate.sh / recreate.ps1
  profiles/{smoke,standard,large}.json
  sql/smoke/                # committed, 36 tables
  sql/standard/             # generated, gitignored
  sql/large/                # generated, gitignored
  generated/                # CodeGen output, gitignored
  README.md                 # this file
```

---

## Related

- [CodeGen at schema scale](../../guides/CODEGEN_LARGE_SCHEMA_GUIDE.md)
- [Demos index](../README.md)
- [bootstrap-clean-db](../../.claude/skills/bootstrap-clean-db/SKILL.md)
- [Large-schema operational plan](../../plans/codegen-large-schema-improvements.md)
