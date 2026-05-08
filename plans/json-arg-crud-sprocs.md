# JSON-Arg CRUD Sprocs — Implementation Plan

Tracks GitHub issue [#2552](https://github.com/MemberJunction/MJ/issues/2552). PR branch: `claude/issue-2552-json-arg-crud-sprocs`.

## Goal

Resolve the conflict between PostgreSQL's 100-argument function limit and the broad `_Clear` companion rule that's required for correct `BaseEntity.Save()` semantics on nullable-no-default columns (notably `ScheduledJob`'s lock fields).

## Approach (per issue 2552 consensus)

Threshold-based branching on PG only. SQL Server is unchanged.

| Provider | Entity param count | Sproc shape |
|---|---|---|
| SQL Server | any | typed-arg + `_Clear` companions (today's shape) |
| PostgreSQL | under `ProcedureParamLimit` | typed-arg + `_Clear` companions (today's shape) |
| PostgreSQL | at or over `ProcedureParamLimit` | single `JSONB` arg, key-presence semantics |

Once the JSON-arg shape exists for wide entities, the PG-side narrow `_Clear` rule (`pgNeedsClearCompanion`) is no longer needed: typed-arg PG sprocs can use the broad rule (`AllowsNull`) without busting the arg limit, because the entities that would have busted it are now on the JSON-arg shape.

This restores correct `Save()` semantics for nullable-no-default columns on the typed-arg PG entities (fixing the `ScheduledJob` regression) without forcing every entity onto JSON.

### Why threshold branching, not universal JSON

- **SS has 2100-arg headroom and no functional problem.** Forcing SS onto JSON pays migration cost and dev-UX cost (loss of typed-arg type safety, harder SQL tooling, opaque audit logs) for symmetry alone. Issue 2552 thread (Amith, Rob, Craig) explicitly preferred not hamstringing SS for PG's limitation.
- **Most entities don't hit the limit.** Only AIPromptRun (180 args under broad rule) and AIAgent (116) actually exceed 100 in v5.33. Forcing every entity onto JSON pays JSON.stringify/parse overhead on every `Save()` to solve a problem that affects two entities.
- **JSON is an extended-support workaround for edge cases.** Wide entities are not the norm — tables that wide are usually questionable on their own merits. Treating JSON-arg as the exception, not the rule, keeps typed-arg as the privileged path.

### Tri-state semantics for the JSON-arg case

When an entity is over the limit and emits JSON-arg shape, key presence drives clear-vs-set-vs-leave:

| Wire shape | Effect on column |
|---|---|
| Key absent | Unchanged |
| `"Field": <value>` | Set to value |
| `"Field": null` | Set to SQL NULL |

No `_Clear` companion params on JSON-arg sprocs.

## Architecture

### `ProcedureParamLimit` abstraction

Add an abstract getter on `GenericDatabaseProvider`:

```typescript
public abstract get ProcedureParamLimit(): number;
```

Implementations:

```typescript
// PostgreSQLDataProvider
public get ProcedureParamLimit(): number { return 90; }  // PG hard limit is 100; 90 leaves headroom

// SQLServerDataProvider
public get ProcedureParamLimit(): number { return Infinity; }
```

The same getter exists on the corresponding CodeGen subclass (`PostgreSQLCodeGenProvider`, `SQLServerCodeGenProvider`) — or the providers expose it to CodeGen via shared metadata, depending on which package owns the limit value. Decision: **keep the value on the data provider**, have CodeGen read it through a shared accessor.

### Param count projection (the pre-check)

The branch decision is a **projection** computed before any sproc DDL is emitted. CodeGen knows the entity's full field set; it computes what the typed-arg sproc *would* take under broad rule, then decides which shape to emit.

The predicate is **per-sproc**, not per-entity, and applied uniformly to all three CRUD verbs:

```typescript
function projectedParamCount(entity: EntityInfo, sprocType: 'create' | 'update' | 'delete'): number {
    const fields = entity.Fields.filter(f => shouldIncludeFieldInParams(f, sprocType));
    const clearCompanions = sprocType === 'delete'
        ? 0
        : fields.filter(f => needsClearCompanion(f)).length;  // broad rule
    return fields.length + clearCompanions;
}

function useJsonArgShape(entity: EntityInfo, sprocType: 'create' | 'update' | 'delete', provider: IMetadataProvider): boolean {
    return projectedParamCount(entity, sprocType) >= provider.ProcedureParamLimit;
}
```

Order is: **decide shape → emit accordingly.** Never "emit typed-arg, then notice we busted the limit."

**`spCreate` and `spUpdate` track each other in practice.** In MJ's schema today, the field-inclusion rules (`shouldIncludeFieldInParams`) produce identical column sets for create and update, because:
- PKs are UUID with DEFAULT `gen_random_uuid()` / `NEWSEQUENTIALID()`, not auto-increment — so they're included in both.
- Non-PK inclusion is gated on `AllowUpdateAPI`, which is the same flag for both.

So if `spCreate` busts the limit, `spUpdate` does too, by the same amount. The predicate still computes them independently for defensive correctness — if MJ ever adds an auto-increment column or a create-only / update-only field, the predicate handles it without code changes.

**`spDelete` never busts the limit.** It takes only PK params (1 for single-UUID PK entities, ~2-3 for composite-PK entities), no nullable fields, no `_Clear` companions. The predicate runs the same math on it as create/update; for any realistic schema, the result is far below the limit and `spDelete` stays on typed-arg. No special case needed in code — the predicate is honest about what each sproc actually needs.

**Outcome for wide entities:** mixed shape per entity. For AIPromptRun and AIAgent, `spCreate` and `spUpdate` emit as JSON-arg; `spDelete` emits as typed-arg. The data provider already dispatches differently per CRUD verb (separate `GetSaveSQL` and `GetDeleteSQL` paths), so caller-side ergonomics are unaffected.

### Synchronization between CodeGen and provider call-site

CodeGen and the data provider must agree on which shape every entity uses, every time, or every save fails. Two-arg call vs. one-JSON-arg call against the wrong sproc shape = runtime error.

**Approach:** the same predicate (`useJsonArgShape`) lives in shared code (likely on `EntityInfo` or as a static helper), and both sides call it with the same provider's `ProcedureParamLimit`. No metadata column needed; the decision is recomputed from field info every time.

This avoids a metadata round-trip but requires that CodeGen and provider use the same predicate implementation. If the predicate ever changes (e.g., headroom adjusted), both regenerate sprocs and update provider call construction in lockstep — same migration boundary.

### Per-sproc, not per-entity

The branch decision is computed independently for each CRUD verb on each entity. The same predicate runs against `spCreate`, `spUpdate`, and `spDelete`; whichever one would bust the limit gets the JSON-arg shape, others stay typed-arg.

In practice this produces uniform shape on most entities and **mixed shape on wide entities only**:
- Narrow entities: all three sprocs typed-arg (predicate returns false for all).
- Wide entities: `spCreate` and `spUpdate` JSON-arg, `spDelete` typed-arg (predicate returns true only for create/update, since `spDelete`'s PK-only param list can't bust the limit).

The data provider already dispatches differently per CRUD verb (separate `GetSaveSQL` and `GetDeleteSQL` paths), so caller-side ergonomics are unaffected by mixed shape on wide entities.

## What this kills

- `pgNeedsClearCompanion` on `PostgreSQLDataProvider` — narrow rule disappears entirely. PG returns to using the broad `EntityFieldInfo.NeedsClearCompanion` for typed-arg sprocs. Wide entities don't go through the typed-arg path at all.
- The `ScheduledJob` lock-cleanup regression — `ScheduledJob` (31 cols, ~45 projected args) stays on typed-arg sprocs with broad rule applied. `LockToken`/`LockedAt`/`LockedByInstance`/`ExpectedCompletionAt` all get `_Clear` companions emitted again; `releaseLock()` works.
- The 100-arg ceiling as a runtime concern — wide entities use JSON-arg, no arg count.

## What stays

- `_Clear` companions on every entity under the threshold, on both providers. The `_Clear` plumbing is **not** retired; it's still the design for the typed-arg path.
- `EntityFieldInfo.NeedsClearCompanion` (broad rule) remains on the abstract base.
- SS sproc shape — no changes.

## Phasing

### Phase 0 — Alignment (this commit)
- Plan committed reflecting issue 2552 consensus.
- Open questions for review captured below.

### Phase 1 — `ProcedureParamLimit` abstraction
- Add abstract `ProcedureParamLimit` getter to `GenericDatabaseProvider`.
- Implement on `PostgreSQLDataProvider` (return 90) and `SQLServerDataProvider` (return `Infinity`).
- Add `useJsonArgShape(entity, provider)` shared predicate.
- No sproc generation changes yet — just the abstraction in place.

### Phase 2 — Restore broad rule on PG typed-arg path
- Delete `pgNeedsClearCompanion` from `PostgreSQLDataProvider`.
- PG provider's save-path uses `EntityFieldInfo.NeedsClearCompanion` (broad rule) for entities under the limit.
- PG provider's save-path **gates the broad rule** behind `useJsonArgShape(entity) === false` — entities at/over the limit don't go through typed-arg path.
- Without Phase 3 yet, sprocs for wide entities are still in their current narrow-rule state, so wide entities are temporarily incorrect. Phase 3 closes that gap.

### Phase 3 — JSON-arg sproc generation for wide entities (PG)
- New code path in `PostgreSQLCodeGenProvider` that emits JSON-arg sprocs for entities where `useJsonArgShape` returns true.
- Output shape:
  ```sql
  CREATE OR REPLACE FUNCTION __mj.spUpdate<Entity>(p_data JSONB)
  RETURNS SETOF __mj."<View>" AS $$ ... $$ LANGUAGE plpgsql;
  ```
- Generation rules for the JSON-arg case:
  - One arg per sproc: `p_data JSONB`.
  - Body uses `p_data ? 'Field'` to detect key presence.
  - Per-column casting: `CASE WHEN p_data ? 'Field' THEN (p_data->>'Field')::<TargetType> ELSE "Field" END` (UPDATE) / direct cast (INSERT/DELETE).
  - Special handling for: `UNIQUEIDENTIFIER`/`UUID`, `NUMERIC` precision (string in JSON), `BYTEA` (base64), `TIMESTAMPTZ` parsing.
- Old typed-arg sprocs for wide entities are dropped via the migration (Phase 5).

### Phase 4 — PG data provider call-site branching
- `PostgreSQLDataProvider.GetSaveSQL` / `GetDeleteSQL` paths inspect `useJsonArgShape(entity)` and either:
  - Build typed-arg `EXEC` with broad-rule `_Clear` companions (existing path); or
  - Build a JSONB payload and call the JSON-arg sproc.
- Cast helpers for non-JSON-native types (binary, NUMERIC, dates) live in one place on the provider.

### Phase 5 — Migration
- CodeGen-driven migration that drops the wide-entity old typed-arg sprocs and creates the JSON-arg replacements.
- Narrow-entity sprocs are also regenerated under broad rule (so the `_Clear` companions emitted for `ScheduledJob`'s nullable-no-default fields actually exist on disk).
- View-dependency capture/replay (`viewFallback.ts`) handles drop-cascade ordering.

### Phase 6 — Tests
- `ScheduledJob` lock-release round-trip on PG (regression test for the v5.33 bug).
- Round-trip null-clear for sample of nullable-no-default fields on the *narrow* entities under broad rule.
- Round-trip for wide-entity JSON-arg sprocs:
  - `AIPromptRun` save with mix of set/clear/leave fields.
  - `AIAgent` same.
- Cast error path on JSON-arg sprocs: invalid UUID, invalid NUMERIC, invalid base64.
- Precision tests for `NUMERIC(38,10)` on a wide entity.
- Binary round-trip (`BYTEA`) on a wide entity, if any wide entity has a binary column. (None currently — flag for future work if added.)

### Phase 7 — Cleanup
- Audit any other `_Clear` references — narrow-rule callers should all be gone on PG.
- Release notes for the wide-entity sproc shape change (breaking change for anyone calling those specific sprocs directly).

## Open Design Questions

These should be resolved before Phase 3 lands.

1. **Empty-string-vs-null for TEXT in JSON-arg sprocs.** Recommended: `""` is empty string, `null` is null. JSON-arg sprocs only — typed-arg path is unchanged.
2. **NUMERIC precision through JSON.** Recommended: send NUMERIC as JSON string, cast inside sproc. Avoids IEEE-754 round-trip issues on wide-decimal columns.
3. **Binary encoding (BYTEA).** Recommended: base64 string, decode in sproc. Only wide entities need this; no current wide entity has binary columns, but the codegen template should support it.
4. **Headroom in `ProcedureParamLimit`.** Recommended: 90. Leaves room for column adds without flipping shape unexpectedly. Worth team review — could go higher if column-add churn on wide entities is rare.
5. **Per-field cast error localization on JSON-arg sprocs.** Recommended: ship without field-name wrapping initially; revisit if the loss of localization hurts debug experience.
6. **Audit-log readability for wide-entity saves.** Recommended: accept that wide-entity `pg_stat_statements` entries show JSON blobs instead of typed args. Wide-entity saves are rare; not worth audit-tooling investment up front.

## Risk Profile

This is **CodeGen-driven**, not hand-written surgery. Risk is bounded by:
- The `useJsonArgShape` predicate is computed identically by CodeGen and provider; if it diverges, every save on the affected entity fails loudly.
- The typed-arg path is unchanged for entities under the limit — no regression risk for narrow entities.
- The JSON-arg path is new code, but applied to a small set of wide entities with comprehensive round-trip tests.

The breaking-change surface is **direct sproc callers of wide entities** — anyone calling `EXEC __mj.spUpdateAIPromptRun @ID=...` directly outside the framework. This is a much narrower break than universal JSON would have been (which would've broken every entity). For narrow entities, there's no breaking change at all.

## Status

- [ ] Phase 0 — Plan reflects issue 2552 consensus
- [ ] Phase 1 — `ProcedureParamLimit` abstraction
- [ ] Phase 2 — Restore broad rule on PG typed-arg path
- [ ] Phase 3 — JSON-arg sproc generation for wide entities (PG)
- [ ] Phase 4 — PG data provider call-site branching
- [ ] Phase 5 — Migration
- [ ] Phase 6 — Tests
- [ ] Phase 7 — Cleanup + release notes
