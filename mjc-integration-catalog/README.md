# Per-connection integration catalog

The `CompanyIntegrationObject` / `CompanyIntegrationObjectField` migration and the generator that
emits it. It lives here, beside the engine code that reads and writes those tables, because it is a
change to the MJ core schema — not to MJ Central.

## How it reaches a workspace

**It does not ride the patch.** `mj migrate` resolves migrations by cloning `mjRepoUrl` at a git
ref; it never reads `node_modules`, which is the only thing a patch-package patch can change. So a
migration cannot be delivered by a patch, and the two halves travel separately:

| half | how |
|---|---|
| engine + server code | `scripts/push-mj-patches.sh <env>` → the workspace's root `patches/` |
| this migration | copied into the workspace's own repo, applied with `mj migrate --dir` |

**Order does not matter.** The engine adds the per-connection datasets only when both entities
resolve, so code-before-migration, migration-before-code, and code-with-no-migration-ever are all
safe — the last simply reads the shared catalog, which is the default anyway.

## Applying it (SANDBOX ONLY, deliberately)

Copy `postgres/` into the workspace repo as `SQL Scripts/mjc-migrations-pg/`, then dispatch
`[MJC] Schema Migration` with `migrations_dir` and `history_schema` set. Those two inputs already
exist on the workflow, so **no template change is needed** — which matters, because a template
change would propagate to every workspace and this is deliberately one workspace.

The dedicated history schema keeps this out of MemberJunction's own Flyway lineage.

## Regenerating

```
python3 mjc-integration-catalog/generator/generate.py --baseline-dir <dir with the two baselines> \
        --out mjc-integration-catalog/postgres
python3 mjc-integration-catalog/generator/validate.py mjc-integration-catalog/postgres mjc-integration-catalog/sqlserver
python3 mjc-integration-catalog/generator/validate_backfill.py mjc-integration-catalog/postgres mjc-integration-catalog/sqlserver
```

The baselines come from this repository at tag `v5.51.0`:

```
git show v5.51.0:migrations/v5/B202607091514__v5.46.x__Baseline.sql       > mj-base-ss.sql
git show v5.51.0:migrations-pg/v5/B202607091514__v5.46.x__Baseline.pg.sql > mj-base-pg.sql
```

The SQL Server pair is emitted by the same code path and kept for the eventual upstream change. It
is **not** proven: the sandbox is Postgres, and nothing else receives this.
