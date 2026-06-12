# Session: OpenWater (CREATE) — isolated overnight run

You are creating the **OpenWater** connector from scratch. This worktree is one of two concurrent
overnight sessions — **use ONLY the isolated resources below**; never touch port 1444/4007 or the
`sql-claude` container (that's the other infra).

## Isolated infra for THIS session (no drift)
| Resource | Value |
|---|---|
| SQL Server container | `sql-ow` at `localhost:1446` (sa / `Claude2Sql99`) |
| Fresh DB name | `MJ_OW_E2E` |
| MJAPI GraphQL port | `4012` |
| Credentials | **NONE** → run **[B] credential-free**. `source-auditor` researches OpenWater's public API docs itself; build to what the docs prove. Honest ceiling = `format-verified-no-creds` + mock-floor. |

> Note: the operator does NOT know OpenWater's API surface ("idk what they have") — so DISCOVER it.
> Find OpenWater's developer/API documentation (OpenWater runs awards/abstracts/event-submission
> software; check developer portal / API reference / OpenAPI). The provided context is NOT exhaustive;
> absence in any provided slice is NOT evidence of absence in the system. Enumerate the FULL object
> universe via a script over the source (never an in-context list).

## MJAPI launch flags that MUST be set (learned 2026-06-11 — do NOT re-derive)
- `DB_TRUST_SERVER_CERTIFICATE=true` (checked `=== '1' || 'true'` — `Y` does NOT work → self-signed-cert crash)
- `ALLOW_RUNTIME_SCHEMA_UPDATE=1` (ApplyAll/RSU disabled without it)
- `CODEGEN_DB_USERNAME=sa CODEGEN_DB_PASSWORD=Claude2Sql99` (RSU CodeGen child; missing → `Login failed for user ''`)
- advancedGeneration OFF in `mj.config.cjs`; launch via `tsx`; `MJ_API_KEY` in env.

## Env bring-up (per packages/Integration/connectors/test/CANONICAL_CONNECTOR_SETUP.md, with THIS session's ports)
Fresh `MJ_OW_E2E` on `sql-ow:1446` → `mj migrate` → scoped `mj sync push` → `mj codegen` (advancedGen off) → `turbo build --filter=mj_api` → start MJAPI on `:4012`. Then run `/build-connector openwater` Step 0 ([B] credential-free).

## Connector-builder reminders (today's lessons)
- Nested-graph / reporting APIs: tables ≠ doors — emit per-IO `AccessPath { Door, Segments[] }`; `FetchChanges` walks the nesting path. Never ship a 0-row IO silently.
- FK authoring is conditional: keep the `@lookup` for sparse/backward-ordered FK graphs; soft-FK only for dense forward-ref graphs (and only when the connector re-derives FKs at runtime).
- A clean `mj sync push` proves DEPLOY, not runtime FK-resolution — verify the latter via the mock fetch.
