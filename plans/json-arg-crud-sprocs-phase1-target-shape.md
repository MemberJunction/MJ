# Phase 1 — Target Sproc Shape (PG, ScheduledJob)

Reference DDL for the JSON-arg `spUpdateScheduledJob` / `spDeleteScheduledJob` POC. Hand-derived from the v5.32 baseline shape ([V202605032116](../migrations-pg/v5/V202605032116__v5.32.x__Force_Regen_Tolerant_SP_All_Nullable_Columns.pg.sql)) at line 35970. **Not yet a migration** — design artifact for review before Phase 2 generalizes this template across every entity.

## Design rules embodied here

1. **One arg**: `p_data JSONB`. Eliminates the per-field arg explosion entirely.
2. **Tri-state via key presence**: `p_data ? 'Field'` distinguishes "key absent" (column unchanged) from "key present" (column is being assigned). When present, the value (which can be JSON `null`) goes through.
3. **Per-column casting** uses `(p_data->>'Field')::<TargetType>`. The `->>'Field'` operator returns `NULL` when JSON value is `null` OR when key is absent — so it can't carry "absent vs. null" alone, hence the explicit `?` check.
4. **Identity column (`ID`)** is required for UPDATE; raise on missing.
5. **No `_Clear` companion params anywhere.** None.
6. **Audit columns** (`__mj_CreatedAt`, `__mj_UpdatedAt`) handled by sproc, not by caller — same as today.
7. **Returns `SETOF` view** unchanged from current shape; preserves existing client read patterns.

## spUpdateScheduledJob (PG, JSON-arg shape)

```sql
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateScheduledJob'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION __mj."spUpdateScheduledJob"(p_data JSONB)
RETURNS SETOF __mj."vwScheduledJobs" AS
$$
DECLARE
    v_id UUID;
    v_row_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateScheduledJob: p_data must include "ID"';
    END IF;
    v_id := (p_data->>'ID')::UUID;

    UPDATE __mj."ScheduledJob"
       SET "JobTypeID"            = CASE WHEN p_data ? 'JobTypeID'            THEN (p_data->>'JobTypeID')::UUID                ELSE "JobTypeID"            END,
           "Name"                 = CASE WHEN p_data ? 'Name'                 THEN (p_data->>'Name')                            ELSE "Name"                 END,
           "Description"          = CASE WHEN p_data ? 'Description'          THEN (p_data->>'Description')                     ELSE "Description"          END,
           "CronExpression"       = CASE WHEN p_data ? 'CronExpression'       THEN (p_data->>'CronExpression')                  ELSE "CronExpression"       END,
           "Timezone"             = CASE WHEN p_data ? 'Timezone'             THEN (p_data->>'Timezone')                        ELSE "Timezone"             END,
           "StartAt"              = CASE WHEN p_data ? 'StartAt'              THEN (p_data->>'StartAt')::TIMESTAMPTZ            ELSE "StartAt"              END,
           "EndAt"                = CASE WHEN p_data ? 'EndAt'                THEN (p_data->>'EndAt')::TIMESTAMPTZ              ELSE "EndAt"                END,
           "Status"               = CASE WHEN p_data ? 'Status'               THEN (p_data->>'Status')                          ELSE "Status"               END,
           "Configuration"        = CASE WHEN p_data ? 'Configuration'        THEN (p_data->>'Configuration')                   ELSE "Configuration"        END,
           "OwnerUserID"          = CASE WHEN p_data ? 'OwnerUserID'          THEN (p_data->>'OwnerUserID')::UUID               ELSE "OwnerUserID"          END,
           "LastRunAt"            = CASE WHEN p_data ? 'LastRunAt'            THEN (p_data->>'LastRunAt')::TIMESTAMPTZ          ELSE "LastRunAt"            END,
           "NextRunAt"            = CASE WHEN p_data ? 'NextRunAt'            THEN (p_data->>'NextRunAt')::TIMESTAMPTZ          ELSE "NextRunAt"            END,
           "RunCount"             = CASE WHEN p_data ? 'RunCount'             THEN (p_data->>'RunCount')::INTEGER               ELSE "RunCount"             END,
           "SuccessCount"         = CASE WHEN p_data ? 'SuccessCount'         THEN (p_data->>'SuccessCount')::INTEGER           ELSE "SuccessCount"         END,
           "FailureCount"         = CASE WHEN p_data ? 'FailureCount'         THEN (p_data->>'FailureCount')::INTEGER           ELSE "FailureCount"         END,
           "NotifyOnSuccess"      = CASE WHEN p_data ? 'NotifyOnSuccess'      THEN (p_data->>'NotifyOnSuccess')::BOOLEAN        ELSE "NotifyOnSuccess"      END,
           "NotifyOnFailure"      = CASE WHEN p_data ? 'NotifyOnFailure'      THEN (p_data->>'NotifyOnFailure')::BOOLEAN        ELSE "NotifyOnFailure"      END,
           "NotifyUserID"         = CASE WHEN p_data ? 'NotifyUserID'         THEN (p_data->>'NotifyUserID')::UUID              ELSE "NotifyUserID"         END,
           "NotifyViaEmail"       = CASE WHEN p_data ? 'NotifyViaEmail'       THEN (p_data->>'NotifyViaEmail')::BOOLEAN         ELSE "NotifyViaEmail"       END,
           "NotifyViaInApp"       = CASE WHEN p_data ? 'NotifyViaInApp'       THEN (p_data->>'NotifyViaInApp')::BOOLEAN         ELSE "NotifyViaInApp"       END,
           "LockToken"            = CASE WHEN p_data ? 'LockToken'            THEN (p_data->>'LockToken')::UUID                 ELSE "LockToken"            END,
           "LockedAt"             = CASE WHEN p_data ? 'LockedAt'             THEN (p_data->>'LockedAt')::TIMESTAMPTZ           ELSE "LockedAt"             END,
           "LockedByInstance"     = CASE WHEN p_data ? 'LockedByInstance'     THEN (p_data->>'LockedByInstance')                ELSE "LockedByInstance"     END,
           "ExpectedCompletionAt" = CASE WHEN p_data ? 'ExpectedCompletionAt' THEN (p_data->>'ExpectedCompletionAt')::TIMESTAMPTZ ELSE "ExpectedCompletionAt" END,
           "ConcurrencyMode"      = CASE WHEN p_data ? 'ConcurrencyMode'      THEN (p_data->>'ConcurrencyMode')                 ELSE "ConcurrencyMode"      END,
           "__mj_UpdatedAt"       = NOW()
     WHERE "ID" = v_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwScheduledJobs" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwScheduledJobs" WHERE "ID" = v_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION __mj."spUpdateScheduledJob"(JSONB) TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateScheduledJob"(JSONB) TO "cdp_Integration";
```

## ScheduledJobEngine.releaseLock() — caller shape

**Today (after PG narrow rule regression):**
```typescript
job.LockToken = null;
job.LockedAt = null;
job.LockedByInstance = null;
job.ExpectedCompletionAt = null;
await job.Save();
// Translates to a sproc call that does NOT pass *_Clear := TRUE for these fields,
// because narrow rule says they don't have a default. UPDATE is a no-op for them.
```

**Phase 1 target:**
```typescript
job.LockToken = null;
job.LockedAt = null;
job.LockedByInstance = null;
job.ExpectedCompletionAt = null;
await job.Save();
// Translates to:
//   SELECT * FROM __mj.spUpdateScheduledJob('{
//     "ID": "...",
//     "LockToken": null,
//     "LockedAt": null,
//     "LockedByInstance": null,
//     "ExpectedCompletionAt": null
//   }'::jsonb);
// Key-presence drives the clear; value-NULL is honored by the body's CASE expression.
```

The user-visible API (`job.Foo = null; await job.Save()`) is **unchanged**. Only the wire serialization changes.

## spDeleteScheduledJob (PG, JSON-arg shape)

```sql
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteScheduledJob'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledJob"(p_data JSONB)
RETURNS UUID AS
$$
DECLARE
    v_id UUID;
    v_row_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spDeleteScheduledJob: p_data must include "ID"';
    END IF;
    v_id := (p_data->>'ID')::UUID;

    DELETE FROM __mj."ScheduledJob" WHERE "ID" = v_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
        RETURN NULL;
    END IF;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;
```

## spCreateScheduledJob — design notes (not yet drafted)

Insert is the same pattern with one twist: keys absent from `p_data` should fall back to **column DEFAULT**, not preserve any pre-existing value (there isn't one). PG syntax:

```sql
INSERT INTO __mj."ScheduledJob" (
    "ID", "JobTypeID", "Name", ...
) VALUES (
    CASE WHEN p_data ? 'ID' THEN (p_data->>'ID')::UUID ELSE gen_random_uuid() END,
    (p_data->>'JobTypeID')::UUID,                        -- required, no fallback
    (p_data->>'Name'),                                    -- required, no fallback
    ...
);
```

For columns with database DEFAULTs, the INSERT can omit the column entirely when key is absent — but that requires building the column list dynamically. Two implementation options:

- **Static column list, value-side fallback to DEFAULT keyword via `COALESCE` substitute** — doesn't work cleanly because PG doesn't expose `DEFAULT` as a value expression.
- **Dynamic SQL via `EXECUTE format(...)`** — works, slight readability cost, makes the sproc body more complex.
- **Always-emit column list, NULL when absent, rely on column-level DEFAULT only when caller explicitly passes `null`** — simplest, but loses the "DEFAULT applies for absent key" semantic.

Open question for review. Recommendation: dynamic SQL, on the grounds that column-default-on-absence is the semantic users expect, and the dynamic-SQL pattern stays inside one sproc body (callers don't see it).

## What this validates for Phase 2

If Phase 1 deploys cleanly and `releaseLock()` works on PG against the new sproc:

- The JSONB key-presence semantics work end-to-end.
- The data provider's JSON-payload construction works for ScheduledJob's column types: UUID, VARCHAR, TEXT, TIMESTAMPTZ, INTEGER, BOOLEAN.
- No NUMERIC, no BYTEA, no JSON-typed columns in this entity — those need their own validation in Phase 2 against entities that have them.

## Phase 2 generalization concerns surfaced by this exercise

- **NUMERIC precision** (open question 2): no NUMERIC columns on ScheduledJob, so precision behavior won't be exercised by Phase 1. Need a separate POC entity or test fixture that has `NUMERIC(38,10)` to validate the string-cast strategy before generalizing.
- **BYTEA / VARBINARY** (open question 3): same — no binary columns on ScheduledJob. Pick a second POC entity with binary columns.
- **JSON-typed columns**: ScheduledJob's `Configuration` is `TEXT`, not `JSON`. PG-side JSON columns will need `(p_data->'Field')::JSONB` (object access, not text access) — open question for the codegen template.
- **Composite primary keys**: ScheduledJob's PK is single-column. Composite-PK entities need a different ID-extraction pattern.

These don't block Phase 1 but should be addressed before Phase 2 ships.
