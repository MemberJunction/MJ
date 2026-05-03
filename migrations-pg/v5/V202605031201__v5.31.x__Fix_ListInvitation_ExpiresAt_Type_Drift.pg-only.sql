-- =============================================================================
-- V202605031201__v5.31.x__Fix_ListInvitation_ExpiresAt_Type_Drift.pg-only.sql
-- =============================================================================
--
-- WHY THIS MIGRATION EXISTS:
--   The SS baseline defines ListInvitation.ExpiresAt as `datetime NOT NULL`
--   (a tz-naive timestamp). The PG converter rendered it as `TIMESTAMPTZ
--   NOT NULL` (tz-aware), introducing a real semantic divergence:
--
--     - SS  : `datetime`     → no tz info stored or returned
--     - PG  : `TIMESTAMPTZ`  → stored in UTC, displayed in session tz; tz info
--                              round-trips to clients
--
--   On a single-tz install the values look identical, but anywhere a client
--   inspects the raw column or compares timestamps across tz-shifting
--   pathways, PG and SS would diverge. To match SS exactly, this migration
--   converts the PG column AND the corresponding sproc parameter types to
--   tz-naive TIMESTAMP, mirroring SS `datetime` semantics end-to-end.
--
-- WHY .pg-only.sql:
--   SS already has the correct type from the baseline. This is a one-sided
--   PG correction.
--
-- DEPENDENCIES TOUCHED:
--   - __mj."vwListInvitations"          (DROP CASCADE → recreate)
--   - __mj."spCreateListInvitation"     (dropped by CASCADE → recreate with
--                                        TIMESTAMP param to match SS)
--   - __mj."spUpdateListInvitation"     (same)
--   - __mj."spDeleteListInvitation"     (same — body unchanged but signature
--                                        re-stated for completeness)
--   The view definition is captured dynamically via pg_get_viewdef so any
--   downstream codegen-applied additions to the view are preserved.
--
-- DATA SAFETY:
--   The USING clause `("ExpiresAt" AT TIME ZONE 'UTC')` is the canonical PG
--   pattern for converting tz-aware timestamps to tz-naive while preserving
--   the underlying instant. Application code writes UTC values via NOW() AT
--   TIME ZONE 'UTC' (PG) or GETUTCDATE() (SS), so the conversion is
--   loss-free under that invariant.
--
--   Fresh installs have zero ListInvitation rows; for installs with data, the
--   conversion preserves each stored UTC instant exactly as a naive UTC
--   timestamp — identical to how SS would have stored it.
-- =============================================================================

DO $do$
DECLARE
    v_view_def TEXT;
BEGIN
    -- Capture current vwListInvitations definition so we can recreate it
    -- after the column alter. pg_get_viewdef returns just the SELECT body.
    SELECT pg_get_viewdef('${flyway:defaultSchema}."vwListInvitations"'::regclass, true)
      INTO v_view_def;

    -- CASCADE drops the dependent CRUD functions; we recreate them below.
    DROP VIEW IF EXISTS ${flyway:defaultSchema}."vwListInvitations" CASCADE;

    -- Convert the column. AT TIME ZONE 'UTC' applied to a TIMESTAMPTZ value
    -- yields the naive timestamp at UTC — the inverse of how SS would have
    -- stored the same instant.
    ALTER TABLE ${flyway:defaultSchema}."ListInvitation"
        ALTER COLUMN "ExpiresAt"
        TYPE TIMESTAMP WITHOUT TIME ZONE
        USING ("ExpiresAt" AT TIME ZONE 'UTC');

    -- Recreate the view from the captured definition.
    EXECUTE format(
        'CREATE VIEW %I.%I AS %s',
        '${flyway:defaultSchema}',
        'vwListInvitations',
        v_view_def
    );
END $do$;

COMMENT ON COLUMN ${flyway:defaultSchema}."ListInvitation"."ExpiresAt" IS
    'When this invitation expires. Stored as a tz-naive UTC timestamp to match '
    'the SS baseline definition (datetime NOT NULL). Application code is '
    'responsible for treating the value as UTC.';

-- ---------------------------------------------------------------------------
-- Recreate the CRUD functions that CASCADE dropped.
-- Bodies mirror the v5.31 regen file (V202605021056) with one signature change:
-- p_ExpiresAt now declared TIMESTAMP WITHOUT TIME ZONE (matching SS @datetime
-- param type) instead of TIMESTAMPTZ.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateListInvitation"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ListID UUID DEFAULT NULL,
    IN p_Email VARCHAR(255) DEFAULT NULL,
    IN p_Role VARCHAR(50) DEFAULT NULL,
    IN p_Token VARCHAR(100) DEFAULT NULL,
    IN p_ExpiresAt TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    IN p_CreatedByUserID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."vwListInvitations" AS
$$
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO ${flyway:defaultSchema}."ListInvitation"
            ("ID", "ListID", "Email", "Role", "Token", "ExpiresAt", "CreatedByUserID", "Status")
        VALUES
            (p_ID, p_ListID, p_Email, p_Role, p_Token, p_ExpiresAt, p_CreatedByUserID, COALESCE(p_Status, 'Pending'));
    ELSE
        INSERT INTO ${flyway:defaultSchema}."ListInvitation"
            ("ListID", "Email", "Role", "Token", "ExpiresAt", "CreatedByUserID", "Status")
        VALUES
            (p_ListID, p_Email, p_Role, p_Token, p_ExpiresAt, p_CreatedByUserID, COALESCE(p_Status, 'Pending'));
    END IF;
    RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."vwListInvitations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateListInvitation"(
    IN p_ID UUID,
    IN p_ListID UUID DEFAULT NULL,
    IN p_Email VARCHAR(255) DEFAULT NULL,
    IN p_Role VARCHAR(50) DEFAULT NULL,
    IN p_Token VARCHAR(100) DEFAULT NULL,
    IN p_ExpiresAt TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    IN p_CreatedByUserID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."vwListInvitations" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."ListInvitation"
    SET
        "ListID" = COALESCE(p_ListID, "ListID"),
        "Email" = COALESCE(p_Email, "Email"),
        "Role" = COALESCE(p_Role, "Role"),
        "Token" = COALESCE(p_Token, "Token"),
        "ExpiresAt" = COALESCE(p_ExpiresAt, "ExpiresAt"),
        "CreatedByUserID" = COALESCE(p_CreatedByUserID, "CreatedByUserID"),
        "Status" = COALESCE(p_Status, "Status")
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."vwListInvitations" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM ${flyway:defaultSchema}."vwListInvitations" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteListInvitation"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
    DELETE FROM ${flyway:defaultSchema}."ListInvitation" WHERE "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Re-grant the same role permissions the regen file granted.
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateListInvitation"(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, TIMESTAMP WITHOUT TIME ZONE, UUID, VARCHAR) TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateListInvitation"(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, TIMESTAMP WITHOUT TIME ZONE, UUID, VARCHAR) TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spDeleteListInvitation"(UUID) TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
