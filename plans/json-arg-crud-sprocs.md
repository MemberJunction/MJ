# JSON-Arg CRUD Sprocs — Implementation Plan

Tracks GitHub issue [#2552](https://github.com/MemberJunction/MJ/issues/2552). PR branch: `claude/issue-2552-json-arg-crud-sprocs`.

## Goal

Retire `_Clear` companion BOOLEAN parameters across every `spCreate*`/`spUpdate*`/`spDelete*` sproc on both PostgreSQL and SQL Server. Replace each multi-arg sproc signature with a single JSON-object argument:

- PG: `JSONB`
- SS: `NVARCHAR(MAX)` (parsed via `JSON_VALUE` / `OPENJSON`)

Tri-state semantics carried by JSON key presence:

| Wire shape | Effect on column |
|---|---|
| Key absent | Unchanged |
| `"Field": <value>` | Set to value |
| `"Field": null` | Set to SQL NULL |

This eliminates:
- Postgres 100-arg function limit problems on wide entities (AIPromptRun, AIAgent, EntityField, Entity, AIPrompt, AIAgentRun)
- The PG/SS rule divergence (`pgNeedsClearCompanion` vs. `EntityFieldInfo.NeedsClearCompanion`)
- The ScheduledJob stale-lock-clear regression introduced by the PG-side narrowing
- Per-field `_Clear` boolean params from every CRUD sproc, both providers

## Phasing

The work is broken into discrete phases that ship as their own commits and reviews. Each phase is self-contained — earlier phases should not depend on later phases shipping.

### Phase 0 — Alignment (this commit)
- Open draft PR linked to #2552 with this plan.
- Capture open design questions inline (see issue for the canonical list).
- Get team sign-off on phasing and on the open questions before code lands.

### Phase 1 — POC: ScheduledJob on PostgreSQL only
- Hand-write the JSON-arg version of `spUpdateScheduledJob` and `spDeleteScheduledJob` (PG).
- Update `PostgreSQLDataProvider.GetSaveSQL()` (or equivalent path) on a `BypassFor: ['ScheduledJob']` switch to construct JSON instead of N args, just for ScheduledJob.
- Round-trip test: `releaseLock()` actually nulls the four lock fields on PG.
- Validates the design end-to-end on the smallest realistic surface before generalizing.

### Phase 2 — Codegen template change (PG only)
- New sproc generator path in `PostgreSQLCodeGenProvider`. Old per-field-arg path stays available for fallback during the rollout.
- Output shape:
  ```sql
  CREATE OR REPLACE FUNCTION __mj.spUpdate<Entity>(p_data JSONB)
  RETURNS __mj."<View>" AS $$ ... $$ LANGUAGE plpgsql;
  ```
- Generation rules:
  - One arg per sproc: `p_data JSONB`.
  - Body uses `p_data ? 'Field'` to detect key presence.
  - Per-column casting: `CASE WHEN p_data ? 'Field' THEN (p_data->>'Field')::<TargetType> ELSE "Field" END`.
  - Special handling for: `UNIQUEIDENTIFIER`/`UUID`, `NUMERIC` precision (string in JSON), `BYTEA` (base64), `TIMESTAMPTZ` parsing.
- All entities regenerate. Migration outputs a single drop+create cycle for every CRUD sproc on PG.
- Delete `pgNeedsClearCompanion` and the call site that uses it.

### Phase 3 — Data provider rewrite (PG)
- `PostgreSQLDataProvider` `GetSaveSQL` / `GetDeleteSQL` paths switch to building a JSONB payload.
- Construction uses dirty-field tracking + explicit-clear tracking from `BaseEntity`, identical inputs to today's flow — only the serialization changes.
- Cast helpers for non-JSON-native types (binary, NUMERIC, dates) live in one place.

### Phase 4 — Codegen template change (SS)
- Mirror Phase 2 on SQL Server side.
- Output shape:
  ```sql
  CREATE OR ALTER PROCEDURE __mj.spUpdate<Entity> @data NVARCHAR(MAX)
  AS BEGIN ... END
  ```
- Use `JSON_PATH_EXISTS` (SS 2022+) or `OPENJSON` (SS 2019 compat). Pick based on min-supported-version target — see open question 4 in the issue.

### Phase 5 — Data provider rewrite (SS)
- `SQLServerDataProvider` matches the PG path. Both providers stringify to JSON; only dialect differs.

### Phase 6 — Migration
- One CodeGen-driven migration on each side: drop every existing typed-arg sproc, create every JSON-arg sproc.
- PG side: take care that drop-and-create order respects view dependencies (the `viewFallback.ts` capture/replay path already handles this).
- SS side: standard CREATE OR ALTER pattern, no view dependency drama.

### Phase 7 — SQLConverter / pg-migrate simplification
- Provider-aware sproc-shape rewriting in the converter is removed.
- Converter now sees uniform JSON-arg sproc DDL on the SS side and emits dialect-translated equivalent on PG. No reshaping.
- This eliminates the kind of failure modes that produced the 136k-line `V202605032310__…__Self_Heal.pg-only.sql` artifact in PR #2541.

### Phase 8 — Tests
- Round-trip null-clear for every nullable-no-default field on the wide entities (AIPromptRun, AIAgent, EntityField, Entity, AIPrompt, AIAgentRun).
- ScheduledJob lock-release round-trip on both providers.
- Cast error path: invalid UUID, invalid NUMERIC, invalid base64.
- Precision tests for NUMERIC(38,10) and similar wide-decimal columns.
- Binary round-trip (`BYTEA` / `VARBINARY(MAX)`).
- TIMESTAMPTZ with non-UTC offset.

### Phase 9 — Cleanup
- Delete `EntityFieldInfo.NeedsClearCompanion` and `pgNeedsClearCompanion`.
- Audit any other `_Clear` references — all should be gone.
- Release notes + migration guidance for direct-sproc callers (see issue for the breaking-change disclosure).

## Open Design Questions

Carried from the issue — these should be resolved before Phase 2 lands. **The team needs to agree on these before significant code is written.**

1. **Empty-string-vs-null for TEXT.** Recommended: `""` is empty string, `null` is null.
2. **NUMERIC precision through JSON.** Recommended: send NUMERIC as JSON string, cast inside sproc.
3. **Binary encoding.** Recommended: base64 string, decode in sproc.
4. **SS JSON dialect target version.** Recommended: support SS 2019 floor → emit `OPENJSON`-compatible shape always; revisit when min-version bumps to SS 2022.
5. **Direct-sproc-caller migration helper.** Recommended: defer; release notes only for v1, helper utility as a fast-follow if customer feedback warrants.
6. **Per-field cast error localization.** Recommended: Phase 1 ships with raw cast errors; Phase 9 cleanup adds field-name wrapping if the loss of localization is hurting debug experience.
7. **Audit-log readability.** Recommended: accept the regression for v1; revisit after observing real audit-log usage.
8. **Generated TypeScript Save-shape interfaces.** Recommended: defer; entity classes already document the field set, redundant codegen.

## Risk Profile

This is **CodeGen-driven**, not hand-written surgery. Risk is bounded by:
- The codegen template change is one path that produces every sproc.
- If Phase 1 POC works on ScheduledJob, the template change in Phase 2 either works for everything or nothing — there's no per-entity risk that escapes test coverage.
- The data provider rewrite in Phase 3 / Phase 5 is one chokepoint serving every `BaseEntity.Save()` and `Delete()` — uniform coverage from existing entity tests.

The breaking-change surface is **direct sproc callers outside MJ** — customer admin scripts, SQL Agent jobs, third-party tools that bypass the data provider abstraction. Inside MJ everything routes through the data provider and migrates atomically.

## Status

- [x] Phase 0 — Plan committed, draft PR opened
- [ ] Phase 1 — ScheduledJob POC on PG
- [ ] Phase 2 — PG CodeGen template
- [ ] Phase 3 — PG data provider rewrite
- [ ] Phase 4 — SS CodeGen template
- [ ] Phase 5 — SS data provider rewrite
- [ ] Phase 6 — Migration generation
- [ ] Phase 7 — SQLConverter / pg-migrate simplification
- [ ] Phase 8 — Tests
- [ ] Phase 9 — Cleanup + release notes
