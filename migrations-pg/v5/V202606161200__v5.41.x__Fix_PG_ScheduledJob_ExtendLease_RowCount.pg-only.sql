-- PG-ONLY forward fix for a PostgreSQL-specific defect in the v5.41 heartbeat-lease sproc.
-- Does not exist on SQL Server (the T-SQL spExtendScheduledJobLease returns @@ROWCOUNT correctly),
-- so there is no T-SQL counterpart — this is applied only on the PostgreSQL side.

-- ---------------------------------------------------------------------------
-- Two defects in the v5.41 plpgsql spExtendScheduledJobLease (V202606151055)
-- ---------------------------------------------------------------------------
-- 1. Unquoted mixed-case columns. The UPDATE body referenced ScheduledJob columns
--    bare — `SET ExpectedCompletionAt`, `WHERE ID`, `AND LockToken`. PostgreSQL
--    folds unquoted identifiers to lower-case, so the function fails on EVERY call
--    with `column "id" does not exist` (the columns are "ID"/"ExpectedCompletionAt"/
--    "LockToken"). The function was therefore completely non-functional on PG — it
--    never even reached the row-count line.
-- 2. Row count never captured. It DECLAREd _v_row_count without ever assigning it
--    (the `GET DIAGNOSTICS _v_row_count = ROW_COUNT;` line its sibling lock sprocs
--    have was missing), so it would return Extended = NULL — never 1 — meaning a
--    heartbeat lease extension always read as "not extended" even on success.
-- Recreate the function with quoted identifiers AND the diagnostics capture
-- (COALESCE to 0 for safety). Verified on PG: matching token -> Extended=1,
-- non-matching token -> 0.
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spExtendScheduledJobLease"(
    IN p_JobID UUID,
    IN p_ExpectedToken UUID,
    IN p_NewExpectedCompletionAt TIMESTAMPTZ
)
RETURNS TABLE("Extended" INTEGER) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."ScheduledJob"
       SET "ExpectedCompletionAt" = p_NewExpectedCompletionAt
     WHERE "ID" = p_JobID
       AND "LockToken" = p_ExpectedToken;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT COALESCE(_v_row_count, 0) AS Extended;
END;
$$ LANGUAGE plpgsql;
