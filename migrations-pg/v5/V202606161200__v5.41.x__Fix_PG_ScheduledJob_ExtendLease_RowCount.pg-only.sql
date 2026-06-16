-- PG-ONLY forward fix for a PostgreSQL-specific defect in the v5.41 heartbeat-lease sproc.
-- Does not exist on SQL Server (the T-SQL spExtendScheduledJobLease returns @@ROWCOUNT correctly),
-- so there is no T-SQL counterpart — this is applied only on the PostgreSQL side.

-- ---------------------------------------------------------------------------
-- Defect: spExtendScheduledJobLease never captured the UPDATE row count
-- ---------------------------------------------------------------------------
-- V202606151055 (v5.41) created the plpgsql spExtendScheduledJobLease but DECLAREd
-- _v_row_count without ever assigning it (the `GET DIAGNOSTICS _v_row_count = ROW_COUNT;`
-- line its sibling lock sprocs have was missing). So `p_RowsAffected := _v_row_count`
-- bound NULL and the function returned Extended = NULL — never 1 — meaning a heartbeat
-- lease extension on PostgreSQL would always read as "not extended" even on success.
-- Recreate the function with the diagnostics capture (and COALESCE to 0 for safety).
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
       SET ExpectedCompletionAt = p_NewExpectedCompletionAt
     WHERE ID = p_JobID
       AND LockToken = p_ExpectedToken;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT COALESCE(_v_row_count, 0) AS Extended;
END;
$$ LANGUAGE plpgsql;
