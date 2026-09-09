# Per-connection catalog migration generator

Emits the `V`/`U` migration pair, per dialect, for `CompanyIntegrationObject` and
`CompanyIntegrationObjectField`. Ticket MJC-264; register MJ-CAT-1 through MJ-CAT-9.

```
python3 scripts/catalog-migration/generate.py \
  --baseline-dir <dir containing mj-base-ss.sql and mj-base-pg.sql> \
  --out "SQL Scripts/mjc-migrations-pg"
```

The two baseline inputs come from the MemberJunction repository at tag `v5.51.0`:

```
git show v5.51.0:migrations/v5/B202607091514__v5.46.x__Baseline.sql       > mj-base-ss.sql
git show v5.51.0:migrations-pg/v5/B202607091514__v5.46.x__Baseline.pg.sql > mj-base-pg.sql
```

## Why a generator rather than a hand-written migration

Three facts make hand-authoring wrong rather than merely tedious:

1. **The registration procedures cannot register a table.** `spCreateEntity` and
   `spCreateEntityField` are CodeGen-generated CRUD procedures, and CodeGen omits every column its
   metadata marks not-updatable-through-the-API — which is every schema-derived column. So the
   first has no base-table parameter and the second has no entity-id, name or type parameter, all
   NOT NULL with no default. Every call fails. Direct inserts are the only route, and they are what
   CodeGen itself emits.
2. **On Postgres nothing reconciles the metadata afterwards.** SQL Server's repeatable refresh
   heals type, length, precision, scale, nullability, default, sequence and description from the
   live catalog. The Postgres one heals only nullability, and the Postgres reconcilers have no
   migrate-time caller at all. Four of six workspaces are Postgres.
3. **The metadata records SQL Server type names and byte lengths on every dialect.** A Postgres
   `character varying(255)` is recorded as `nvarchar` length 510, `text` as length -1, `uuid` as
   `uniqueidentifier` length 16. Authoring against the Postgres catalog produces values that are
   wrong and that nothing will correct.

So the generator invents nothing. It **lifts** the real definitions of `IntegrationObject` and
`IntegrationObjectField` out of the baseline — the DDL, the defaults, the constraints, the view,
the CRUD procedures and every metadata row — and rewrites them for the new tables. Only the
columns declared in `model.py` are authored, each with its own type per dialect and its own reason.

## Modules

| file | what it does |
|---|---|
| `model.py` | the columns the source tables do not have, the reserved entity ids, the role ids, and which source columns become view aliases instead of real columns |
| `baseline.py` | string- and depth-aware extraction from the 180k-line baselines; naive regex loses sync on any description containing an apostrophe |
| `ddl.py` | tables, defaults, keys, foreign keys, checks, indexes and the base views |
| `metadata.py` | entity, field, and permission rows, with deterministic ids so re-running produces the same migration |
| `routines.py` | the CRUD procedures, transformed from the source ones |
| `generate.py` | assembles the V and U files in the order the hazards below require |

## Two hazards the statement order exists for

- **The base views must precede nothing that relies on the field metadata surviving.**
  `R__RefreshMetadata` runs on *every* migrate and deletes any field row whose column is absent
  from the entity's base view. Its exclusion list is only `sys,staging`, so the core schema is
  processed. Metadata inserted without its view is removed by the next unrelated migration.
- **Target the core schema through `${mjSchema}`, never the flyway default-schema placeholder.**
  This migration is applied under its own history schema, and under that flag the flyway built-in
  resolves to the history schema rather than the core one. The placeholder must not appear in the
  file at all — not even in a comment, because placeholders are substituted in comments too.

## Determinism

Entity ids are reserved constants; field and permission ids are UUID-v5 derived from the entity id
and the column name. Re-running the generator produces a byte-identical migration, so the workspace
lineage and the upstream pull request agree on which row is which — permanently.
