-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609191819__v6.2.x__TaskGraph_Guarded_Write_Sprocs.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The AST transpiler reported all 21 CREATE PROCEDUREs as unhandled and emitted only their
-- `DROP PROCEDURE` / `GRANT EXECUTE ON __mj."…"` stubs — which named routines that did not exist
-- (and a bare `GRANT EXECUTE ON <name>` parses as a TABLE grant, so the file could not apply).
-- Every routine is hand-authored below. See the T-SQL original's header for WHY these exist
-- (least-privilege cdp_* logins; guarded writes whose row count is the arbitration signal).
-- ╚════════════════════════════════════════╝
--
-- TRANSLATION DECISIONS (same idiom as V202608140100__v6.1.x__Durable_Sync_Runs.pg.sql and
-- V202606040230__v5.39.x__AgentRunWatchdog_Maintenance_Sprocs.pg.sql):
--
--  * CALL SHAPE. TaskClaimStore invokes every routine through
--    `Dialect.ProcedureCallSyntax`, which on PostgreSQL emits
--    `SELECT * FROM __mj."spX"($1, $2, …)` — positional, reading a result set. So each T-SQL
--    procedure ending in `SELECT …` becomes a plpgsql FUNCTION … RETURNS TABLE, and the parameter
--    ORDER below is exactly the order TaskClaimStore passes (which is also the T-SQL declaration
--    order). Do not reorder parameters: PostgreSQL binds by position here, not by name.
--
--  * ARBITRATION. Each routine is still ONE conditional UPDATE; `@@ROWCOUNT` becomes
--    `GET DIAGNOSTICS … = ROW_COUNT`, returned as "AffectedRows" INTEGER (node-pg yields int4 as a
--    JS number; TaskClaimStore compares it to 1). Never read-then-write — except
--    spTaskGraphWriteDebugFields, which (as in T-SQL) reads under a row lock; see its comment.
--
--  * ONE CLOCK. SYSUTCDATETIME() becomes NOW() on BOTH sides of every lease comparison and in every
--    stamp. The columns are TIMESTAMPTZ, so NOW() is the correct absolute instant irrespective of
--    the session TimeZone (`NOW() AT TIME ZONE 'UTC'` yields a zone-less timestamp that would be
--    re-interpreted in the session zone on assignment). It is the database server's clock, never
--    the caller's — the property the T-SQL header insists on.
--
--  * QUALIFIED COLUMNS. RETURNS TABLE introduces OUT parameters ("AffectedRows", and "ID" for
--    spTaskGraphReleaseExpiredClaims); every column reference is table-qualified so none can be
--    ambiguous with them.
--
--  * JSON. Task.InputPayload is TEXT on PostgreSQL. The JSON routines parse it as jsonb, edit it,
--    and store `jsonb::text` back (key order/whitespace are normalised; content is identical).
--      - `ISJSON(x) = 1`  → `x IS JSON OBJECT` (PG16+). Narrower than ISJSON (which also accepts a
--        top-level array), deliberately: jsonb_set raises on a non-object where JSON_MODIFY's lax
--        mode would silently no-op, and a task payload is always an object.
--      - `JSON_VALUE(x, p) IS NULL` → the path is missing, JSON null, or an object/array (JSON_VALUE
--        returns NULL for non-scalars in lax mode) — expressed exactly via jsonb_typeof.
--      - `JSON_QUERY(x, p) IS NULL` → the path is missing or not an object/array.
--      - `JSON_MODIFY(x, p, NULL)` deletes the key → `#-`; any other value → jsonb_set (which
--        creates a missing leaf key, like JSON_MODIFY, and — like it — does not create intermediate
--        objects, which is why the callers pass container paths first).
--      - `OPENJSON(@TaskIDs)` → jsonb_array_elements_text(…)::uuid.
--
--  * DROP. A prior version of any of these (a stale function, or a procedure of the same name)
--    is dropped up front by name so re-applying on a database that already has them is clean.
--
--  * GRANTS. cdp_Developer and cdp_Integration only — NOT cdp_UI — mirroring the T-SQL file and the
--    Task entity's CRUD routines. Each grant is independent and tolerates only a missing role
--    (undefined_object), with a NOTICE naming it; any other failure aborts the migration.
--    NOTE: like every MJ PostgreSQL routine, these are SECURITY INVOKER and PostgreSQL's default
--    PUBLIC EXECUTE is left in place — the same privilege model as the rest of the PG install
--    (e.g. spUpdateTask); it is not changed piecemeal here.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
             FROM pg_proc p
            WHERE p.pronamespace = '__mj'::regnamespace
              AND p.proname = ANY (ARRAY[
                  'spTaskGraphClaimTask', 'spTaskGraphHeartbeat', 'spTaskGraphCompleteClaimed',
                  'spTaskGraphReleaseExpiredClaims', 'spTaskGraphSettleParent',
                  'spTaskGraphUpdateParentProgress', 'spTaskGraphStampParentStart',
                  'spTaskGraphCancelTask', 'spTaskGraphSkipPending', 'spTaskGraphMarkHumanNotified',
                  'spTaskGraphSetParentOutput', 'spTaskGraphUpdateInputPayload',
                  'spTaskGraphForceComplete', 'spTaskGraphClaimContinuation',
                  'spTaskGraphDeclareEarlyFinish', 'spTaskGraphClearDebugState',
                  'spTaskGraphConsumeStepMarker', 'spTaskGraphPauseAtBreakpoint',
                  'spTaskGraphWriteDebugFields', 'spTaskGraphSetRunCostRollup', 'spTaskGraphSettleRun'])
  LOOP
    EXECUTE 'DROP ROUTINE IF EXISTS ' || r.sig;
  END LOOP;
END $$;

/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
/* Claim protocol */
/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/* Claim one task. The Status='Pending' predicate is the whole contract: a task another instance */
/* already moved to 'In Progress' fails it and yields rowcount 0. The ClaimedBy/ClaimExpiresAt arm */
/* additionally lets an expired claim be taken over without waiting for a reconciliation pass. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphClaimTask"(
    IN p_TaskID          UUID,
    IN p_ClaimedBy       VARCHAR(100),
    IN p_ClaimTTLSeconds INTEGER
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "Status"         = 'In Progress',
           "ClaimedBy"      = p_ClaimedBy,
           "ClaimExpiresAt" = NOW() + make_interval(secs => p_ClaimTTLSeconds),
           "StartedAt"      = NOW()
     WHERE "t"."ID" = p_TaskID
       AND "t"."Status" = 'Pending'
       AND ("t"."ClaimedBy" IS NULL
            OR "t"."ClaimExpiresAt" IS NULL
            OR "t"."ClaimExpiresAt" < NOW());
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Extend this instance's claim on a task it is actively running. Guarded on ClaimedBy=@me so a */
/* heartbeat can never resurrect a claim reconciliation already released. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphHeartbeat"(
    IN p_TaskID          UUID,
    IN p_ClaimedBy       VARCHAR(100),
    IN p_ClaimTTLSeconds INTEGER
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "ClaimExpiresAt" = NOW() + make_interval(secs => p_ClaimTTLSeconds)
     WHERE "t"."ID" = p_TaskID
       AND "t"."ClaimedBy" = p_ClaimedBy
       AND "t"."Status" = 'In Progress';
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Record a terminal outcome and release the claim in one guarded statement. Guarded on both */
/* Status='In Progress' and ClaimedBy=@me, so a task cancelled or reassigned while running fails the */
/* predicate rather than having the newer decision overwritten. */
/* p_SetConfiguration separates "write NULL" from "leave alone": a step whose run produced no runtime */
/* artefacts must not have its authored configuration blanked as a side effect of finishing. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphCompleteClaimed"(
    IN p_TaskID           UUID,
    IN p_ClaimedBy        VARCHAR(100),
    IN p_Status           VARCHAR(50),
    IN p_OutputPayload    TEXT,
    IN p_ErrorMessage     TEXT,
    IN p_AgentRunID       UUID,
    IN p_Configuration    TEXT,
    IN p_SetConfiguration BOOLEAN
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "Status"          = p_Status,
           "CompletedAt"     = NOW(),
           "PercentComplete" = CASE WHEN p_Status = 'Complete' THEN 100 ELSE 0 END,
           -- Released in the same atomic write: a separate release could be interrupted, leaving a
           -- terminal task holding a claim the sweep would then flag.
           "ClaimedBy"       = NULL,
           "ClaimExpiresAt"  = NULL,
           "OutputPayload"   = p_OutputPayload,
           "ErrorMessage"    = p_ErrorMessage,
           "AgentRunID"      = p_AgentRunID,
           -- NULL flag takes the ELSE branch, exactly as T-SQL's `@SetConfiguration = 1` does.
           "Configuration"   = CASE WHEN p_SetConfiguration THEN p_Configuration ELSE "t"."Configuration" END
     WHERE "t"."ID" = p_TaskID
       AND "t"."Status" = 'In Progress'
       AND "t"."ClaimedBy" = p_ClaimedBy;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Return lapsed claims to Pending so any instance can pick them up. */
/* p_TaskIDs is the candidate set the caller just read, as a JSON array. Scoping by id rather than by */
/* re-stating "a dispatcher completes this task" keeps that definition in ONE place — the */
/* `task-predicates` module. The lease predicate IS restated here, because that is the part that must */
/* be evaluated at write time: a claim refreshed between the read and this statement is correctly */
/* skipped. */
/* The T-SQL original routes OUTPUT through a table variable only because SQL Server refuses a bare */
/* OUTPUT on a table with triggers; PostgreSQL's UPDATE … RETURNING has no such restriction and is */
/* still one atomic statement. Returning the released ids (not a count) lets the caller name exactly */
/* which tasks it reclaimed. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphReleaseExpiredClaims"(
    IN p_TaskIDs TEXT
)
RETURNS TABLE("ID" UUID) AS
$mjfn$
BEGIN
    RETURN QUERY
    WITH "released" AS (
        UPDATE __mj."Task" AS "t"
           SET "Status"         = 'Pending',
               "ClaimedBy"      = NULL,
               "ClaimExpiresAt" = NULL
         WHERE "t"."ID" IN (SELECT "ids"."value"::UUID
                              FROM jsonb_array_elements_text(p_TaskIDs::JSONB) AS "ids"("value"))
           AND "t"."Status" = 'In Progress'
           AND "t"."ClaimedBy" IS NOT NULL
           AND "t"."ClaimExpiresAt" IS NOT NULL
           AND "t"."ClaimExpiresAt" < NOW()
        RETURNING "t"."ID"
    )
    SELECT "released"."ID" FROM "released";
END;
$mjfn$ LANGUAGE plpgsql;

/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
/* Graph parent lifecycle */
/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/* Settle a graph parent, and only if it is not already terminal. The terminal list is */
/* TERMINAL_TASK_GRAPH_STATUSES in ai-core-plus; a unit test pins the T-SQL literal against it, */
/* because two lists that must agree is how a graph becomes invisible to the machinery meant to */
/* rescue it. This literal must match the T-SQL one. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphSettleParent"(
    IN p_ParentTaskID    UUID,
    IN p_Status          VARCHAR(50),
    IN p_PercentComplete INTEGER
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "Status"          = p_Status,
           "PercentComplete" = p_PercentComplete,
           "CompletedAt"     = NOW()
     WHERE "t"."ID" = p_ParentTaskID
       AND "t"."Status" NOT IN ('Complete','Failed','Cancelled','Skipped','Blocked');
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Progress-only write. Separate from settling on purpose: settling is a once-only transition that */
/* stamps CompletedAt, and handing a terminal status to this one is a compile error on the caller. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphUpdateParentProgress"(
    IN p_ParentTaskID    UUID,
    IN p_Status          VARCHAR(50),
    IN p_PercentComplete INTEGER
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "Status"          = p_Status,
           "PercentComplete" = p_PercentComplete
     WHERE "t"."ID" = p_ParentTaskID
       AND "t"."Status" NOT IN ('Complete','Failed','Cancelled','Skipped','Blocked');
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Stamp the graph's start once. Guarded on StartedAt IS NULL so the first writer wins and a later */
/* pass cannot move the graph's start time forward. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphStampParentStart"(
    IN p_ParentTaskID UUID,
    IN p_StartedAt    TIMESTAMPTZ
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "StartedAt" = p_StartedAt
     WHERE "t"."ID" = p_ParentTaskID
       AND "t"."StartedAt" IS NULL;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Cancel a task that has not already settled. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphCancelTask"(
    IN p_TaskID UUID
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "Status" = 'Cancelled'
     WHERE "t"."ID" = p_TaskID
       AND "t"."Status" NOT IN ('Complete','Failed','Cancelled','Skipped','Blocked');
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Skip a task that has not started. Type-guarded so a graph verb can never touch a row outside the */
/* workflow substrate. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphSkipPending"(
    IN p_TaskID     UUID,
    IN p_TaskTypeID UUID
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "Status" = 'Skipped'
     WHERE "t"."ID" = p_TaskID
       AND "t"."TypeID" = p_TaskTypeID
       AND "t"."Status" = 'Pending';
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Mark a human task as notified, once. ClaimedBy doubles as the notification marker for human tasks, */
/* and the IS NULL guard is what makes the notification exactly-once across instances. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphMarkHumanNotified"(
    IN p_TaskID UUID,
    IN p_Marker VARCHAR(100)
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "ClaimedBy" = p_Marker
     WHERE "t"."ID" = p_TaskID
       AND "t"."Status" = 'Pending'
       AND "t"."ClaimedBy" IS NULL;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Write the graph's output payload. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphSetParentOutput"(
    IN p_ParentTaskID  UUID,
    IN p_TaskTypeID    UUID,
    IN p_OutputPayload TEXT
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "OutputPayload" = p_OutputPayload
     WHERE "t"."ID" = p_ParentTaskID
       AND "t"."TypeID" = p_TaskTypeID;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Replace a task's input payload before it runs (the debugger's edit-input verb). Status-guarded so */
/* an edit cannot land on a task that has already started. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphUpdateInputPayload"(
    IN p_TaskID         UUID,
    IN p_TaskTypeID     UUID,
    IN p_InputPayload   TEXT,
    IN p_ExpectedStatus VARCHAR(50)
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "InputPayload" = p_InputPayload
     WHERE "t"."ID" = p_TaskID
       AND "t"."TypeID" = p_TaskTypeID
       AND "t"."Status" = p_ExpectedStatus;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Force a task complete (the debugger's force-complete verb). Refuses a LIVE claim — an executor */
/* holding an unexpired lease is still running, and completing underneath it would attribute its work */
/* to a decision it never made. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphForceComplete"(
    IN p_TaskID        UUID,
    IN p_TaskTypeID    UUID,
    IN p_OutputPayload TEXT
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "Status"          = 'Complete',
           "OutputPayload"   = p_OutputPayload,
           "ErrorMessage"    = NULL,
           "CompletedAt"     = NOW(),
           "PercentComplete" = 100,
           "ClaimedBy"       = NULL,
           "ClaimExpiresAt"  = NULL
     WHERE "t"."ID" = p_TaskID
       AND "t"."TypeID" = p_TaskTypeID
       AND ("t"."Status" IN ('Pending','Failed','Blocked')
            OR ("t"."Status" = 'In Progress'
                AND ("t"."ClaimExpiresAt" IS NULL
                     OR "t"."ClaimExpiresAt" < NOW())));
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
/* Graph payload markers (JSON) — InputPayload is TEXT; parsed as jsonb, written back as text */
/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/* Claim the right to deliver a graph's continuation, exactly once. Delivery is at-least-once by */
/* nature, so the marker is claimed BEFORE delivery: the worst case becomes a missed notification */
/* that shows in the record as delivered, rather than a reinvoke loop that bills a fresh agent turn */
/* on every reconciliation sweep, forever. */
/* The CASEs reproduce JSON_MODIFY's "a NULL value deletes the key" (the caller never passes NULL). */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphClaimContinuation"(
    IN p_ParentTaskID UUID,
    IN p_TaskTypeID   UUID,
    IN p_DeliveredAs  VARCHAR(50),
    IN p_DeliveredAt  VARCHAR(50)
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "InputPayload" = (
               SELECT CASE WHEN p_DeliveredAs IS NULL THEN "s1"."j" - 'continuationDeliveredAs'
                           ELSE jsonb_set("s1"."j", '{continuationDeliveredAs}', to_jsonb(p_DeliveredAs)) END
                 FROM (SELECT CASE WHEN p_DeliveredAt IS NULL THEN "t"."InputPayload"::JSONB - 'continuationDeliveredAt'
                                   ELSE jsonb_set("t"."InputPayload"::JSONB, '{continuationDeliveredAt}', to_jsonb(p_DeliveredAt)) END AS "j") AS "s1"
           )::TEXT
     WHERE "t"."ID" = p_ParentTaskID
       AND "t"."TypeID" = p_TaskTypeID
       -- ISJSON gate inside CASE so the ::JSONB cast is never evaluated for a non-JSON payload
       -- (PostgreSQL does not promise AND short-circuit order). The inner test is
       -- JSON_VALUE(...) IS NULL: missing, JSON null, or a non-scalar.
       AND CASE WHEN "t"."InputPayload" IS JSON OBJECT
                THEN COALESCE(jsonb_typeof("t"."InputPayload"::JSONB -> 'continuationDeliveredAt'), 'null')
                         NOT IN ('string','number','boolean')
                ELSE FALSE END;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Declare a graph finished early (every remaining node unreachable), once. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphDeclareEarlyFinish"(
    IN p_ParentTaskID UUID,
    IN p_TaskTypeID   UUID,
    IN p_FinishedAt   VARCHAR(50)
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "InputPayload" = (CASE WHEN p_FinishedAt IS NULL THEN "t"."InputPayload"::JSONB - 'earlyFinishedAt'
                                  ELSE jsonb_set("t"."InputPayload"::JSONB, '{earlyFinishedAt}', to_jsonb(p_FinishedAt)) END)::TEXT
     WHERE "t"."ID" = p_ParentTaskID
       AND "t"."TypeID" = p_TaskTypeID
       AND CASE WHEN "t"."InputPayload" IS JSON OBJECT
                THEN COALESCE(jsonb_typeof("t"."InputPayload"::JSONB -> 'earlyFinishedAt'), 'null')
                         NOT IN ('string','number','boolean')
                ELSE FALSE END;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Drop the whole debug bag (leaving a debug session). */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphClearDebugState"(
    IN p_ParentTaskID UUID,
    IN p_TaskTypeID   UUID
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "InputPayload" = ("t"."InputPayload"::JSONB - 'debug')::TEXT
     WHERE "t"."ID" = p_ParentTaskID
       AND "t"."TypeID" = p_TaskTypeID
       AND "t"."InputPayload" IS JSON OBJECT;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Consume the single-step allowance, exactly once. This is the CAS that stops one press of Step */
/* releasing two waves. The guard is JSON_VALUE(...) IS NOT NULL: `$.debug.step` is a scalar. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphConsumeStepMarker"(
    IN p_ParentTaskID UUID,
    IN p_TaskTypeID   UUID
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "InputPayload" = ("t"."InputPayload"::JSONB #- '{debug,step}')::TEXT
     WHERE "t"."ID" = p_ParentTaskID
       AND "t"."TypeID" = p_TaskTypeID
       AND CASE WHEN "t"."InputPayload" IS JSON OBJECT
                THEN COALESCE(jsonb_typeof("t"."InputPayload"::JSONB #> '{debug,step}'), 'null')
                         IN ('string','number','boolean')
                ELSE FALSE END;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Pause a graph at a breakpoint, once. Guarded on "not already paused" so the first dispatcher to */
/* reach the breakpoint owns the pause and a second cannot rewrite why it paused. */
/* `debug` is created first when it is not an object: jsonb_set (like JSON_MODIFY) does not create */
/* intermediate objects. (T-SQL tests JSON_QUERY IS NULL, which also passes a top-level array; here */
/* only an object is kept, because jsonb_set would raise on an array — a debug bag is never one.) */
/* `JSON_VALUE(...,'$.debug.paused') = 'false'` matches both JSON false and the string "false"; */
/* `#>>` returns 'false' for exactly those two. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphPauseAtBreakpoint"(
    IN p_ParentTaskID     UUID,
    IN p_BreakpointTaskID VARCHAR(100),
    IN p_TaskTypeID       UUID
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."Task" AS "t"
       SET "InputPayload" = (
               SELECT CASE WHEN p_BreakpointTaskID IS NULL THEN "s"."j" #- '{debug,pausedAtTaskID}'
                           ELSE jsonb_set("s"."j", '{debug,pausedAtTaskID}', to_jsonb(p_BreakpointTaskID)) END
                 FROM (SELECT jsonb_set(jsonb_set(
                                  CASE WHEN jsonb_typeof("t"."InputPayload"::JSONB -> 'debug') = 'object'
                                       THEN "t"."InputPayload"::JSONB
                                       ELSE jsonb_set("t"."InputPayload"::JSONB, '{debug}', '{}'::JSONB) END,
                                  '{debug,paused}', 'true'::JSONB),
                                  '{debug,pausedReason}', '"breakpoint"'::JSONB) AS "j") AS "s"
           )::TEXT
     WHERE "t"."ID" = p_ParentTaskID
       AND "t"."TypeID" = p_TaskTypeID
       AND CASE WHEN "t"."InputPayload" IS JSON OBJECT
                THEN (COALESCE(jsonb_typeof("t"."InputPayload"::JSONB #> '{debug,paused}'), 'null')
                          NOT IN ('string','number','boolean')
                      OR ("t"."InputPayload"::JSONB #>> '{debug,paused}') = 'false')
                ELSE FALSE END;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Write named fields of the debug bag, leaving every other field alone. */
/* FIELD-SCOPED, NOT A BAG REWRITE. A verb that reads the bag, merges its change and writes the whole */
/* thing back puts back whatever the fields it does NOT own held at read time. The sharp case is the */
/* step allowance: if the dispatcher consumes it between a SetBreakpoints read and its write, the */
/* rewrite RESURRECTS the consumed allowance and one press of Step releases two waves. */
/* WHY THIS ONE IS A LOOP AND NOT ONE STATEMENT. The caller decides how many fields; as in T-SQL the */
/* row is read under a row lock (SELECT … FOR UPDATE, the counterpart of UPDLOCK, HOLDLOCK), edited, */
/* and written back. A function runs inside the caller's transaction, so the lock is held until that */
/* transaction ends and any concurrent writer to the row blocks rather than interleaving. */
/* p_Containers are the object paths that must exist first, computed by the caller (ContainingPaths), */
/* shortest first. p_Fields is [{Path, Kind, Value}] with Kind in (null|bool|string|json). */
/* Paths use SQL Server JSON-path syntax — `$.debug.x` or `$.debug.edgeOverrides."<id>"` — and are */
/* converted to a jsonb text[] path by splitting on unquoted dots and unquoting quoted segments. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphWriteDebugFields"(
    IN p_ParentTaskID UUID,
    IN p_TaskTypeID   UUID,
    IN p_Containers   TEXT,
    IN p_Fields       TEXT
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
    _v_payload   JSONB;
    _v_path_text TEXT;
    _v_path      TEXT[];
    _v_field     JSONB;
    _v_kind      TEXT;
    _v_value     JSONB;
BEGIN
    SELECT "t"."InputPayload"::JSONB
      INTO _v_payload
      FROM __mj."Task" AS "t"
     WHERE "t"."ID" = p_ParentTaskID
       AND "t"."TypeID" = p_TaskTypeID
       AND "t"."InputPayload" IS JSON OBJECT
       FOR UPDATE;

    IF _v_payload IS NULL THEN
        RETURN QUERY SELECT 0;
        RETURN;
    END IF;

    -- Bounded by the caller-supplied array; no unbounded loop.
    FOR _v_path_text IN SELECT "c"."value" FROM jsonb_array_elements_text(p_Containers::JSONB) WITH ORDINALITY AS "c"("value", "ord") ORDER BY "c"."ord"
    LOOP
        IF _v_path_text IS NULL OR left(_v_path_text, 2) <> '$.' THEN
            RAISE EXCEPTION 'spTaskGraphWriteDebugFields(task %): JSON path % is not of the form $.a.b', p_ParentTaskID, COALESCE(_v_path_text, '<null>');
        END IF;
        SELECT array_agg(COALESCE("m"."seg"[1], "m"."seg"[2]) ORDER BY "m"."ord")
          INTO _v_path
          FROM regexp_matches(substr(_v_path_text, 3), '"([^"]*)"|([^.]+)', 'g') WITH ORDINALITY AS "m"("seg", "ord");
        -- JSON_QUERY(...) IS NULL: missing, or not an object/array.
        IF COALESCE(jsonb_typeof(_v_payload #> _v_path), 'null') NOT IN ('object','array') THEN
            _v_payload := jsonb_set(_v_payload, _v_path, '{}'::JSONB);
        END IF;
    END LOOP;

    FOR _v_field IN SELECT "f"."value" FROM jsonb_array_elements(p_Fields::JSONB) WITH ORDINALITY AS "f"("value", "ord") ORDER BY "f"."ord"
    LOOP
        _v_path_text := _v_field ->> 'Path';
        IF _v_path_text IS NULL OR left(_v_path_text, 2) <> '$.' THEN
            RAISE EXCEPTION 'spTaskGraphWriteDebugFields(task %): JSON path % is not of the form $.a.b', p_ParentTaskID, COALESCE(_v_path_text, '<null>');
        END IF;
        SELECT array_agg(COALESCE("m"."seg"[1], "m"."seg"[2]) ORDER BY "m"."ord")
          INTO _v_path
          FROM regexp_matches(substr(_v_path_text, 3), '"([^"]*)"|([^.]+)', 'g') WITH ORDINALITY AS "m"("seg", "ord");
        _v_kind  := _v_field ->> 'Kind';
        _v_value := _v_field -> 'Value';

        IF _v_kind = 'null' THEN
            -- A NULL write DELETES the key, which is what "this verb cleared it" means.
            _v_payload := _v_payload #- _v_path;
        ELSIF _v_kind = 'bool' THEN
            _v_payload := jsonb_set(_v_payload, _v_path, to_jsonb((_v_field ->> 'Value') = 'true'));
        ELSIF _v_kind = 'string' THEN
            -- JSON_VALUE on a non-scalar is NULL, and JSON_MODIFY(NULL) deletes: mirrored exactly.
            IF COALESCE(jsonb_typeof(_v_value), 'null') IN ('string','number','boolean') THEN
                _v_payload := jsonb_set(_v_payload, _v_path, to_jsonb(_v_field ->> 'Value'));
            ELSE
                _v_payload := _v_payload #- _v_path;
            END IF;
        ELSIF _v_kind = 'json' THEN
            -- Objects and arrays are stored as JSON, not as a string (JSON_QUERY semantics); a
            -- scalar makes JSON_QUERY NULL, which deletes — mirrored exactly.
            IF jsonb_typeof(_v_value) IN ('object','array') THEN
                _v_payload := jsonb_set(_v_payload, _v_path, _v_value);
            ELSE
                _v_payload := _v_payload #- _v_path;
            END IF;
        END IF;
        -- Any other Kind is ignored, exactly as the T-SQL IF chain ignores it.
    END LOOP;

    UPDATE __mj."Task" AS "t"
       SET "InputPayload" = _v_payload::TEXT
     WHERE "t"."ID" = p_ParentTaskID
       AND "t"."TypeID" = p_TaskTypeID;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
/* Submitting agent run */
/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/* Credit a settled graph's cost back to the run that submitted it — those four columns and no */
/* others. The full-row Save() this replaces could revert a peer's settle: instance B's rollup, loaded */
/* before A settled the run, would write Paused back over A's Completed along with every other column */
/* it had read. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphSetRunCostRollup"(
    IN p_AgentRunID                      UUID,
    IN p_TotalCostRollup                 NUMERIC(19, 8),
    IN p_TotalTokensUsedRollup           INTEGER,
    IN p_TotalPromptTokensUsedRollup     INTEGER,
    IN p_TotalCompletionTokensUsedRollup INTEGER
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentRun" AS "r"
       SET "TotalCostRollup"                 = p_TotalCostRollup,
           "TotalTokensUsedRollup"           = p_TotalTokensUsedRollup,
           "TotalPromptTokensUsedRollup"     = p_TotalPromptTokensUsedRollup,
           "TotalCompletionTokensUsedRollup" = p_TotalCompletionTokensUsedRollup
     WHERE "r"."ID" = p_AgentRunID;
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* Complete the run that parked on this graph, guarded on it still being parked. A run already */
/* Completed, Failed or Cancelled is left exactly as it is. */
/* The error message APPENDS rather than replaces: a run that parked with a warning and then failed */
/* for a second reason should carry both. */
CREATE OR REPLACE FUNCTION __mj."spTaskGraphSettleRun"(
    IN p_AgentRunID   UUID,
    IN p_Succeeded    BOOLEAN,
    IN p_ErrorMessage TEXT
)
RETURNS TABLE("AffectedRows" INTEGER) AS
$mjfn$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentRun" AS "r"
       SET "Status"       = CASE WHEN p_Succeeded THEN 'Completed' ELSE 'Failed' END,
           "Success"      = p_Succeeded,
           "CompletedAt"  = NOW(),
           "ErrorMessage" = CASE
               WHEN p_ErrorMessage IS NULL THEN "r"."ErrorMessage"
               ELSE COALESCE("r"."ErrorMessage" || chr(10) || chr(10), '') || p_ErrorMessage
           END
     WHERE "r"."ID" = p_AgentRunID
       AND "r"."Status" = 'Paused';
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$mjfn$ LANGUAGE plpgsql;

/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
/* Grants — cdp_Developer and cdp_Integration only (NOT cdp_UI), matching the T-SQL file */
/* ═══════════════════════════════════════════════════════════════════════════════════════════════ */
DO $$
DECLARE
    _fn   TEXT;
    _role TEXT;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
      'spTaskGraphClaimTask', 'spTaskGraphHeartbeat', 'spTaskGraphCompleteClaimed',
      'spTaskGraphReleaseExpiredClaims', 'spTaskGraphSettleParent',
      'spTaskGraphUpdateParentProgress', 'spTaskGraphStampParentStart',
      'spTaskGraphCancelTask', 'spTaskGraphSkipPending', 'spTaskGraphMarkHumanNotified',
      'spTaskGraphSetParentOutput', 'spTaskGraphUpdateInputPayload',
      'spTaskGraphForceComplete', 'spTaskGraphClaimContinuation',
      'spTaskGraphDeclareEarlyFinish', 'spTaskGraphClearDebugState',
      'spTaskGraphConsumeStepMarker', 'spTaskGraphPauseAtBreakpoint',
      'spTaskGraphWriteDebugFields', 'spTaskGraphSetRunCostRollup', 'spTaskGraphSettleRun']
  LOOP
    FOREACH _role IN ARRAY ARRAY['cdp_Developer', 'cdp_Integration']
    LOOP
      BEGIN
        EXECUTE format('GRANT EXECUTE ON FUNCTION __mj.%I TO %I', _fn, _role);
      EXCEPTION WHEN undefined_object THEN
        RAISE NOTICE 'Skipping GRANT EXECUTE ON __mj.% TO %: role does not exist on this install', _fn, _role;
      END;
    END LOOP;
  END LOOP;
END $$;
