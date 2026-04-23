
-- ===================== DDL: Tables, PKs, Indexes =====================

ALTER TABLE __mj."DuplicateRun" ALTER COLUMN "SourceListID" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID" ON __mj."DuplicateRun" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID" ON __mj."DuplicateRun" ("StartedByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID" ON __mj."DuplicateRun" ("SourceListID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID" ON __mj."DuplicateRun" ("ApprovedByUserID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwDuplicateRuns';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwDuplicateRuns"
AS SELECT
    d.*,
    "MJEntity_EntityID"."Name" AS "Entity",
    "MJUser_StartedByUserID"."Name" AS "StartedByUser",
    "MJList_SourceListID"."Name" AS "SourceList",
    "MJUser_ApprovedByUserID"."Name" AS "ApprovedByUser"
FROM
    __mj."DuplicateRun" AS d
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    d."EntityID" = "MJEntity_EntityID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_StartedByUserID"
  ON
    d."StartedByUserID" = "MJUser_StartedByUserID"."ID"
LEFT OUTER JOIN
    __mj."List" AS "MJList_SourceListID"
  ON
    d."SourceListID" = "MJList_SourceListID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_ApprovedByUserID"
  ON
    d."ApprovedByUserID" = "MJUser_ApprovedByUserID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateDuplicateRun"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_StartedByUserID UUID DEFAULT NULL,
    IN p_SourceListID UUID DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ApprovalStatus VARCHAR(20) DEFAULT NULL,
    IN p_ApprovalComments TEXT DEFAULT NULL,
    IN p_ApprovedByUserID UUID DEFAULT NULL,
    IN p_ProcessingStatus VARCHAR(20) DEFAULT NULL,
    IN p_ProcessingErrorMessage TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwDuplicateRuns" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."DuplicateRun"
            (
                "ID",
                "EntityID",
                "StartedByUserID",
                "SourceListID",
                "StartedAt",
                "EndedAt",
                "ApprovalStatus",
                "ApprovalComments",
                "ApprovedByUserID",
                "ProcessingStatus",
                "ProcessingErrorMessage"
            )
        VALUES
            (
                p_ID,
                p_EntityID,
                p_StartedByUserID,
                p_SourceListID,
                COALESCE(p_StartedAt, NOW()),
                p_EndedAt,
                COALESCE(p_ApprovalStatus, 'Pending'),
                p_ApprovalComments,
                p_ApprovedByUserID,
                COALESCE(p_ProcessingStatus, 'Pending'),
                p_ProcessingErrorMessage
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."DuplicateRun"
            (
                "EntityID",
                "StartedByUserID",
                "SourceListID",
                "StartedAt",
                "EndedAt",
                "ApprovalStatus",
                "ApprovalComments",
                "ApprovedByUserID",
                "ProcessingStatus",
                "ProcessingErrorMessage"
            )
        VALUES
            (
                p_EntityID,
                p_StartedByUserID,
                p_SourceListID,
                COALESCE(p_StartedAt, NOW()),
                p_EndedAt,
                COALESCE(p_ApprovalStatus, 'Pending'),
                p_ApprovalComments,
                p_ApprovedByUserID,
                COALESCE(p_ProcessingStatus, 'Pending'),
                p_ProcessingErrorMessage
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDuplicateRun"(
    IN p_ID UUID,
    IN p_EntityID UUID,
    IN p_StartedByUserID UUID,
    IN p_SourceListID UUID,
    IN p_StartedAt TIMESTAMPTZ,
    IN p_EndedAt TIMESTAMPTZ,
    IN p_ApprovalStatus VARCHAR(20),
    IN p_ApprovalComments TEXT,
    IN p_ApprovedByUserID UUID,
    IN p_ProcessingStatus VARCHAR(20),
    IN p_ProcessingErrorMessage TEXT
)
RETURNS SETOF __mj."vwDuplicateRuns" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."DuplicateRun"
    SET
        "EntityID" = p_EntityID,
        "StartedByUserID" = p_StartedByUserID,
        "SourceListID" = p_SourceListID,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "ApprovalStatus" = p_ApprovalStatus,
        "ApprovalComments" = p_ApprovalComments,
        "ApprovedByUserID" = p_ApprovedByUserID,
        "ProcessingStatus" = p_ProcessingStatus,
        "ProcessingErrorMessage" = p_ProcessingErrorMessage
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRuns" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRuns" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDuplicateRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DuplicateRun"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ===================== Triggers =====================

CREATE OR REPLACE FUNCTION __mj."trgUpdateDuplicateRun_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateDuplicateRun" ON __mj."DuplicateRun";
CREATE TRIGGER "trgUpdateDuplicateRun"
    BEFORE UPDATE ON __mj."DuplicateRun"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateDuplicateRun_func"();


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwDuplicateRuns" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: Permissions for vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwDuplicateRuns" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spCreateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateDuplicateRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Duplicate Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateDuplicateRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spUpdateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateDuplicateRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateDuplicateRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spDeleteDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Duplicate Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Comments =====================

COMMENT ON COLUMN __mj."DuplicateRun"."SourceListID" IS 'Optional List ID to narrow the scope of duplicate detection. When NULL, all records in the entity are scanned. When set, only records in the specified list are checked for duplicates.';


-- ===================== Other =====================

-- Make SourceListID nullable on DuplicateRun to support scanning all entity records
-- without requiring a pre-existing list. When NULL, the duplicate detection engine
-- scans all records in the entity (or filtered by ViewID/ExtraFilter).

/* spUpdate Permissions for MJ: Duplicate Runs */
