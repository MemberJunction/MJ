# MemberJunction on Aurora DSQL — proof of concept

Not for merge. This keeps the tooling from a spike that ran MJAPI and MJExplorer locally against an Aurora DSQL cluster (2026-10-21). The provider changes it needs are in the same branch (`IsAuroraDSQLHost` in `packages/PostgreSQLDataProvider`).

## Result

- The v6.2 schema loads: 424 tables, 902 foreign keys (`NOT VALID`), views and data.
- 1,620 of ~1,650 CodeGen CRUD functions convert from plpgsql to `LANGUAGE sql` and work, including the `RecordChange` CTE and the JSON-argument functions for AI Agents / AI Agent Runs / AI Prompt Runs.
- MJAPI boots and Explorer logs in and saves records. Agent chat reached the database but was not verified end to end (the first try had no AI keys loaded).

## Known gaps

- Remaining plpgsql procs (scheduler lock, stale-run sweep, session recording purge) fail every cycle.
- Self-referencing delete cascades are not converted.
- DSQL caps a table at 24 indexes; ~18 indexes on the busiest tables are dropped. DESC index keys are not supported.
- No per-statement timeout, no savepoints (a nested rollback dooms the transaction), 3,000 rows per transaction, connections closed after 60 minutes.

## Files

| File | What it does |
|---|---|
| `main.tf` | The DSQL cluster (OpenTofu, AWS profile `mj`, us-east-1). `tofu apply` / `tofu destroy`. |
| `probe.sql` | First feature probe of what DSQL accepts. |
| `split.mjs` | Splits a SQL dump into statements (quotes, comments, dollar-quoting aware). |
| `crud.mjs` | Converts CodeGen `spCreate`/`spUpdate`/`spDelete` plpgsql to `LANGUAGE sql`. |
| `rewrite.mjs` | Rewrites DDL for DSQL: inline PKs, `NOT VALID` FKs, `CREATE INDEX ASYNC`, drops triggers/extensions/grants. |
| `fn_sql_ports.sql` | Hand SQL ports of `GetClassNameSchemaPrefix` and `GetProgrammaticName`. |
| `heartbeat.sql` | Hand SQL port of `spStampAIAgentRunHeartbeat`. |
| `prepare.mjs` | `pg_dump` of a migrated MJ database → DSQL SQL (runs `crud.mjs` and `rewrite.mjs`). |
| `jsonarg.mjs` | Converts the JSON-argument (`p_data jsonb`) CRUD functions, reading definitions from the source database. |
| `load.mjs` | Applies SQL to DSQL one statement per transaction, with OCC retry and dependency retry rounds; writes `results.jsonl`. |
| `run-mjapi.sh` | Mints an IAM token and starts MJAPI against the cluster. Needs `auth.env` (Auth0, encryption key, `AI_VENDOR_API_KEY__*`) beside it. |

## Rebuild

1. Build a v6.2 PostgreSQL database with `mj migrate` (create roles `cdp_Developer`, `cdp_Integration`, `cdp_UI` first).
2. `pg_dump` the database to `stage.dump.sql`
3. `node prepare.mjs stage.dump.sql stage.dsql.sql` and `node jsonarg.mjs <db> jsonarg.sql`
4. `tofu apply`, then `node load.mjs stage.dsql.sql "$(tofu output -raw endpoint)"`, then the same for `jsonarg.sql` and `heartbeat.sql`
5. `./run-mjapi.sh`, and `pnpm run start:explorer` from the repo root
