# Target Sproc Shapes — JSON-Arg (PG, Wide Entities)

Reference DDL for the JSON-arg sproc shape that PG will emit for entities that exceed `ProcedureParamLimit`. **Not yet a migration** — design artifact for review before CodeGen generalizes this template.

This doc covers the JSON-arg shape only. Entities under the limit (e.g., `ScheduledJob`, the entity that exposed the v5.33 regression) stay on typed-arg + `_Clear` companions and are not redesigned — they only need broad rule restored on the PG provider, which removes the regression without changing sproc shape.

## Design rules embodied here

1. **One arg**: `p_data JSONB`. Eliminates the per-field arg explosion entirely.
2. **Tri-state via key presence**: `p_data ? 'Field'` distinguishes "key absent" (column unchanged) from "key present" (column is being assigned). When present, the value (which can be JSON `null`) goes through.
3. **Per-column casting** uses `(p_data->>'Field')::<TargetType>`. The `->>'Field'` operator returns `NULL` when JSON value is `null` OR when key is absent — so it can't carry "absent vs. null" alone, hence the explicit `?` check.
4. **Identity column (`ID`)** is required for UPDATE/DELETE; raise on missing.
5. **No `_Clear` companion params** on JSON-arg sprocs — key presence carries the tri-state.
6. **Audit columns** (`__mj_CreatedAt`, `__mj_UpdatedAt`) handled by sproc, not by caller — same as today.
7. **Returns `SETOF` view** for INSERT/UPDATE, `UUID` for DELETE — preserves existing client read patterns.
8. **GRANTs unchanged** — same role list as today's typed-arg sprocs.

## Worked example: `spUpdateAIPromptRun` (wide entity, 99 base + 82 nullable = 180 args under broad rule)

`AIPromptRun` is the largest wide entity in the v5.33 schema (99 columns, 82 nullable). Under broad rule it would project to 180 args, well past PG's 100-arg limit.

```sql
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIPromptRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIPromptRuns" AS
$$
DECLARE
    v_id UUID;
    v_row_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIPromptRun: p_data must include "ID"';
    END IF;
    v_id := (p_data->>'ID')::UUID;

    UPDATE __mj."AIPromptRun"
       SET "PromptID"          = CASE WHEN p_data ? 'PromptID'          THEN (p_data->>'PromptID')::UUID                 ELSE "PromptID"          END,
           "ModelID"            = CASE WHEN p_data ? 'ModelID'            THEN (p_data->>'ModelID')::UUID                 ELSE "ModelID"            END,
           "VendorID"           = CASE WHEN p_data ? 'VendorID'           THEN (p_data->>'VendorID')::UUID                ELSE "VendorID"           END,
           "ConfigurationID"    = CASE WHEN p_data ? 'ConfigurationID'    THEN (p_data->>'ConfigurationID')::UUID         ELSE "ConfigurationID"    END,
           "Status"             = CASE WHEN p_data ? 'Status'             THEN (p_data->>'Status')                         ELSE "Status"             END,
           "RunType"            = CASE WHEN p_data ? 'RunType'            THEN (p_data->>'RunType')                        ELSE "RunType"            END,
           "Messages"           = CASE WHEN p_data ? 'Messages'           THEN (p_data->>'Messages')                       ELSE "Messages"           END,
           "Result"             = CASE WHEN p_data ? 'Result'             THEN (p_data->>'Result')                         ELSE "Result"             END,
           "TokensPrompt"       = CASE WHEN p_data ? 'TokensPrompt'       THEN (p_data->>'TokensPrompt')::INTEGER          ELSE "TokensPrompt"       END,
           "TokensCompletion"   = CASE WHEN p_data ? 'TokensCompletion'   THEN (p_data->>'TokensCompletion')::INTEGER      ELSE "TokensCompletion"   END,
           "TokensUsed"         = CASE WHEN p_data ? 'TokensUsed'         THEN (p_data->>'TokensUsed')::INTEGER            ELSE "TokensUsed"         END,
           "TotalCost"          = CASE WHEN p_data ? 'TotalCost'          THEN (p_data->>'TotalCost')::NUMERIC             ELSE "TotalCost"          END,
           -- ...remaining 87 columns same pattern...
           "CompletedAt"        = CASE WHEN p_data ? 'CompletedAt'        THEN (p_data->>'CompletedAt')::TIMESTAMPTZ       ELSE "CompletedAt"        END,
           "ErrorMessage"       = CASE WHEN p_data ? 'ErrorMessage'       THEN (p_data->>'ErrorMessage')                   ELSE "ErrorMessage"       END,
           "__mj_UpdatedAt"     = NOW()
     WHERE "ID" = v_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIPromptRuns" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIPromptRuns" WHERE "ID" = v_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun"(JSONB) TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun"(JSONB) TO "cdp_Integration";
```

## `spCreateAIPromptRun` design notes

INSERT is the same pattern with one twist: keys absent from `p_data` should fall back to **column DEFAULT** (or `NULL` if no default), not preserve any pre-existing value.

Three implementation options:

1. **Static column list, value-side `COALESCE` to a sentinel** — doesn't work cleanly because PG doesn't expose `DEFAULT` as a value expression.
2. **Dynamic SQL via `EXECUTE format(...)`** — works, slight readability cost. Caller builds the column list from key presence; values come from JSON.
3. **Always-emit column list, NULL when absent** — simplest. Loses the "DEFAULT applies for absent key" semantic. Acceptable if codegen explicitly generates a `DEFAULT_OR_NULL` expression per column from the column metadata.

**Recommendation:** option 2 (dynamic SQL) for INSERT. Caller-facing semantics match expectation ("absent key = use DEFAULT"), and the dynamic-SQL pattern stays inside one sproc body — callers don't see it.

```sql
CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIPromptRuns" AS
$$
DECLARE
    v_id UUID;
    v_columns TEXT;
    v_values  TEXT;
BEGIN
    -- ID handling: caller-supplied or generated
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    -- Build column / value lists from keys present in p_data
    -- (codegen emits a per-column case here, omitted for brevity in this design doc)

    EXECUTE format(
        'INSERT INTO __mj."AIPromptRun" (%s) VALUES (%s) RETURNING "ID"',
        v_columns,
        v_values
    ) INTO v_id;

    RETURN QUERY SELECT * FROM __mj."vwAIPromptRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
```

## `spDeleteAIPromptRun` — typed-arg (no shape change)

`spDelete*` only takes PK params. For single-UUID-PK entities like `AIPromptRun`, that's 1 param. The `useJsonArgShape` predicate runs the same projection math on it as it does on `spCreate`/`spUpdate`, gets a result far below the limit, and stays on typed-arg. No special case in code — the predicate is uniform; `spDelete`'s low param count just lands it on the typed-arg side of the branch naturally.

So a wide entity like `AIPromptRun` ends up with **mixed shape**: typed-arg `spDelete`, JSON-arg `spCreate`/`spUpdate`. That's fine — the data provider already dispatches differently per CRUD verb, and each sproc gets the cleanest shape it can support.

```sql
-- Unchanged from today's typed-arg shape:
CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptRun"(p_id UUID)
RETURNS UUID AS
$$
DECLARE v_row_count INTEGER;
BEGIN
    DELETE FROM __mj."AIPromptRun" WHERE "ID" = p_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN RETURN NULL; END IF;
    RETURN p_id;
END;
$$ LANGUAGE plpgsql;
```

## Caller side — `BaseEntity.Save()` translation (PG, wide entity)

**Today (after PG narrow rule, with the regression on nullable-no-default fields):**
```typescript
job.LockToken = null;  // narrow case — but ScheduledJob isn't wide, just illustrative
await job.Save();
```

**After the rewrite, for a wide entity:**
```typescript
run.Status = 'Completed';
run.CompletedAt = new Date();
run.ErrorMessage = null;
await run.Save();

// Translates to:
//   SELECT * FROM __mj.spUpdateAIPromptRun('{
//     "ID": "...",
//     "Status": "Completed",
//     "CompletedAt": "2026-05-07T...",
//     "ErrorMessage": null
//   }'::jsonb);
//
// - "Status" / "CompletedAt": key present, value non-null → set
// - "ErrorMessage": key present, value null → cleared
// - All other 96 columns: key absent → unchanged
```

The user-visible API (`run.Foo = ...; await run.Save()`) is **unchanged**. Only the wire serialization changes, and only for entities that exceed the param limit.

## Narrow-entity case — `ScheduledJob` (no shape change)

`ScheduledJob` has 31 columns, 14 nullable. Projected param count under broad rule is 45 — well under the 90 headroom limit. It stays on typed-arg + `_Clear` companions.

The fix for the v5.33 regression is **not** in this doc; it's in the plan: restore broad rule on PG by deleting `pgNeedsClearCompanion` and using `EntityFieldInfo.NeedsClearCompanion` for entities under the limit. Once that's done, `ScheduledJob`'s sproc gets `_Clear` companions for `LockToken`/`LockedAt`/`LockedByInstance`/`ExpectedCompletionAt`, and `releaseLock()` works.

No DDL change to `ScheduledJob`'s sproc shape. Just regenerate it with broad rule applied.

## What this validates for codegen generalization

If the JSON-arg shape works end-to-end on `AIPromptRun` (the largest wide entity, exercising NUMERIC, multiple UUID FKs, TIMESTAMPTZ, INTEGER, plain TEXT):

- JSONB key-presence semantics work for the full column-type spectrum on a real entity.
- The data provider's JSON-payload construction works for: UUID, NUMERIC, INTEGER, TEXT, TIMESTAMPTZ, BOOLEAN.

Type categories not exercised by `AIPromptRun` and needing separate validation:
- **`BYTEA` / binary** — no current wide entity has binary columns. Validate with a synthetic test fixture or defer to "if a wide entity with binary columns is ever added."
- **JSON-typed columns** (PG `JSON` or `JSONB`) — wide entities don't have these in v5.33; validate when added.
- **Composite primary keys** — wide entities all have single-column UUID PKs in v5.33; validate when needed.

## Type-cast reference table

| MJ Field Type | PG Type | Cast from JSON |
|---|---|---|
| `nvarchar`, `varchar`, `text` | `TEXT`, `VARCHAR(n)` | `(p_data->>'Field')` (no cast needed) |
| `int` | `INTEGER` | `(p_data->>'Field')::INTEGER` |
| `bigint` | `BIGINT` | `(p_data->>'Field')::BIGINT` |
| `decimal`, `numeric` | `NUMERIC(p,s)` | `(p_data->>'Field')::NUMERIC` (sent as JSON string by client) |
| `float`, `real` | `DOUBLE PRECISION`, `REAL` | `(p_data->>'Field')::DOUBLE PRECISION` |
| `bit`, `boolean` | `BOOLEAN` | `(p_data->>'Field')::BOOLEAN` |
| `uniqueidentifier` | `UUID` | `(p_data->>'Field')::UUID` |
| `datetime`, `datetime2`, `datetimeoffset` | `TIMESTAMPTZ`, `TIMESTAMP` | `(p_data->>'Field')::TIMESTAMPTZ` |
| `date` | `DATE` | `(p_data->>'Field')::DATE` |
| `varbinary`, `bytea` | `BYTEA` | `decode(p_data->>'Field', 'base64')` |
| `json`, `jsonb` | `JSONB` | `(p_data->'Field')` (note: `->` not `->>`, returns JSONB directly) |

The codegen template uses this table to emit the right cast per column.
