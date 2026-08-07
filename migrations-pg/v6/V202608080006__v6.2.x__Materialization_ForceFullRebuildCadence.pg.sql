-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== DDL: Tables, PKs, Indexes =====================

-- =====================================================================================
-- Materialization — forced-full-rebuild cadence (incremental self-heal)
-- =====================================================================================
-- The Incremental / DirtyGroupRecompute strategies recompute only the groups whose source
-- rows changed since the watermark, and fall back to a full rebuild when the source row
-- COUNT drops (the delete-detection guard). That guard does NOT catch a delete BALANCED by
-- an insert in the same window (delete from group A + insert into group B → net count
-- unchanged): group A is never recomputed, so its aggregate stays stale until another change
-- touches it. To bound that drift without author vigilance, the refresher forces a periodic
-- full rebuild every N consecutive incremental refreshes.
--
-- This migration adds the counter the refresher uses:
--   - RefreshesSinceFullRebuild : consecutive incremental refreshes since the last full
--                                 rebuild. Reset to 0 on every full rebuild; incremented on
--                                 every incremental refresh; when it reaches the refresher's
--                                 threshold the next refresh is forced to full-rebuild (which
--                                 reconciles any balanced-delete drift, then resets the counter).
--
-- NOTE: Views / EntityField metadata / stored procedures are handled by CodeGen. This file
--       contains the DDL + extended property; the CodeGen output is appended below.
-- =====================================================================================

ALTER TABLE __mj."MaterializedResult"
 ADD COLUMN IF NOT EXISTS "RefreshesSinceFullRebuild" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MaterializedResult_SourceQueryID" ON __mj."MaterializedResult" ("SourceQueryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MaterializedResult_SourceEntityID" ON __mj."MaterializedResult" ("SourceEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MaterializedResult_GeneratedEntityID" ON __mj."MaterializedResult" ("GeneratedEntityID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwMaterializedResults';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMaterializedResults"
AS SELECT
    m.*,
    "MJQuery_SourceQueryID"."Name" AS "SourceQuery",
    "MJEntity_SourceEntityID"."Name" AS "SourceEntity",
    "MJEntity_GeneratedEntityID"."Name" AS "GeneratedEntity"
FROM
    __mj."MaterializedResult" AS m
LEFT OUTER JOIN
    __mj."Query" AS "MJQuery_SourceQueryID"
  ON
    m."SourceQueryID" = "MJQuery_SourceQueryID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_SourceEntityID"
  ON
    m."SourceEntityID" = "MJEntity_SourceEntityID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_GeneratedEntityID"
  ON
    m."GeneratedEntityID" = "MJEntity_GeneratedEntityID"."ID"$vsql$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateMaterializedResult'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateMaterializedResult"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SourceType VARCHAR(20) DEFAULT NULL,
    IN p_SourceQueryID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceQueryID UUID DEFAULT NULL,
    IN p_SourceEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceEntityID UUID DEFAULT NULL,
    IN p_GeneratedEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_GeneratedEntityID UUID DEFAULT NULL,
    IN p_SchemaName VARCHAR(255) DEFAULT NULL,
    IN p_TableName VARCHAR(255) DEFAULT NULL,
    IN p_ViewName VARCHAR(255) DEFAULT NULL,
    IN p_ParamMode VARCHAR(20) DEFAULT NULL,
    IN p_RefreshStrategy VARCHAR(30) DEFAULT NULL,
    IN p_RefreshSchedule_Clear BOOLEAN DEFAULT FALSE,
    IN p_RefreshSchedule VARCHAR(255) DEFAULT NULL,
    IN p_LastRefreshedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRefreshedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_NextRefreshAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_NextRefreshAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Watermark_Clear BOOLEAN DEFAULT FALSE,
    IN p_Watermark TIMESTAMPTZ DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_RowCount_Clear BOOLEAN DEFAULT FALSE,
    IN p_RowCount BIGINT DEFAULT NULL,
    IN p_ApproxBuildCostMs_Clear BOOLEAN DEFAULT FALSE,
    IN p_ApproxBuildCostMs BIGINT DEFAULT NULL,
    IN p_IntendedWorkload_Clear BOOLEAN DEFAULT FALSE,
    IN p_IntendedWorkload TEXT DEFAULT NULL,
    IN p_RowFilterColumns_Clear BOOLEAN DEFAULT FALSE,
    IN p_RowFilterColumns TEXT DEFAULT NULL,
    IN p_BroadSQL_Clear BOOLEAN DEFAULT FALSE,
    IN p_BroadSQL TEXT DEFAULT NULL,
    IN p_KeyColumns_Clear BOOLEAN DEFAULT FALSE,
    IN p_KeyColumns TEXT DEFAULT NULL,
    IN p_SourceRowCount_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceRowCount BIGINT DEFAULT NULL,
    IN p_RefreshesSinceFullRebuild INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwMaterializedResults" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."MaterializedResult"
            (
                "ID",
                "SourceType",
                "SourceQueryID",
                "SourceEntityID",
                "GeneratedEntityID",
                "SchemaName",
                "TableName",
                "ViewName",
                "ParamMode",
                "RefreshStrategy",
                "RefreshSchedule",
                "LastRefreshedAt",
                "NextRefreshAt",
                "Watermark",
                "Status",
                "RowCount",
                "ApproxBuildCostMs",
                "IntendedWorkload",
                "RowFilterColumns",
                "BroadSQL",
                "KeyColumns",
                "SourceRowCount",
                "RefreshesSinceFullRebuild"
            )
        VALUES
            (
                p_ID,
                p_SourceType,
                CASE WHEN p_SourceQueryID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceQueryID, NULL) END,
                CASE WHEN p_SourceEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceEntityID, NULL) END,
                CASE WHEN p_GeneratedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_GeneratedEntityID, NULL) END,
                p_SchemaName,
                p_TableName,
                p_ViewName,
                COALESCE(p_ParamMode, 'None'),
                COALESCE(p_RefreshStrategy, 'FullRebuild'),
                CASE WHEN p_RefreshSchedule_Clear = TRUE THEN NULL ELSE COALESCE(p_RefreshSchedule, NULL) END,
                CASE WHEN p_LastRefreshedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRefreshedAt, NULL) END,
                CASE WHEN p_NextRefreshAt_Clear = TRUE THEN NULL ELSE COALESCE(p_NextRefreshAt, NULL) END,
                CASE WHEN p_Watermark_Clear = TRUE THEN NULL ELSE COALESCE(p_Watermark, NULL) END,
                COALESCE(p_Status, 'Building'),
                CASE WHEN p_RowCount_Clear = TRUE THEN NULL ELSE COALESCE(p_RowCount, NULL) END,
                CASE WHEN p_ApproxBuildCostMs_Clear = TRUE THEN NULL ELSE COALESCE(p_ApproxBuildCostMs, NULL) END,
                CASE WHEN p_IntendedWorkload_Clear = TRUE THEN NULL ELSE COALESCE(p_IntendedWorkload, NULL) END,
                CASE WHEN p_RowFilterColumns_Clear = TRUE THEN NULL ELSE COALESCE(p_RowFilterColumns, NULL) END,
                CASE WHEN p_BroadSQL_Clear = TRUE THEN NULL ELSE COALESCE(p_BroadSQL, NULL) END,
                CASE WHEN p_KeyColumns_Clear = TRUE THEN NULL ELSE COALESCE(p_KeyColumns, NULL) END,
                CASE WHEN p_SourceRowCount_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceRowCount, NULL) END,
                COALESCE(p_RefreshesSinceFullRebuild, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."MaterializedResult"
            (
                "SourceType",
                "SourceQueryID",
                "SourceEntityID",
                "GeneratedEntityID",
                "SchemaName",
                "TableName",
                "ViewName",
                "ParamMode",
                "RefreshStrategy",
                "RefreshSchedule",
                "LastRefreshedAt",
                "NextRefreshAt",
                "Watermark",
                "Status",
                "RowCount",
                "ApproxBuildCostMs",
                "IntendedWorkload",
                "RowFilterColumns",
                "BroadSQL",
                "KeyColumns",
                "SourceRowCount",
                "RefreshesSinceFullRebuild"
            )
        VALUES
            (
                p_SourceType,
                CASE WHEN p_SourceQueryID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceQueryID, NULL) END,
                CASE WHEN p_SourceEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceEntityID, NULL) END,
                CASE WHEN p_GeneratedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_GeneratedEntityID, NULL) END,
                p_SchemaName,
                p_TableName,
                p_ViewName,
                COALESCE(p_ParamMode, 'None'),
                COALESCE(p_RefreshStrategy, 'FullRebuild'),
                CASE WHEN p_RefreshSchedule_Clear = TRUE THEN NULL ELSE COALESCE(p_RefreshSchedule, NULL) END,
                CASE WHEN p_LastRefreshedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRefreshedAt, NULL) END,
                CASE WHEN p_NextRefreshAt_Clear = TRUE THEN NULL ELSE COALESCE(p_NextRefreshAt, NULL) END,
                CASE WHEN p_Watermark_Clear = TRUE THEN NULL ELSE COALESCE(p_Watermark, NULL) END,
                COALESCE(p_Status, 'Building'),
                CASE WHEN p_RowCount_Clear = TRUE THEN NULL ELSE COALESCE(p_RowCount, NULL) END,
                CASE WHEN p_ApproxBuildCostMs_Clear = TRUE THEN NULL ELSE COALESCE(p_ApproxBuildCostMs, NULL) END,
                CASE WHEN p_IntendedWorkload_Clear = TRUE THEN NULL ELSE COALESCE(p_IntendedWorkload, NULL) END,
                CASE WHEN p_RowFilterColumns_Clear = TRUE THEN NULL ELSE COALESCE(p_RowFilterColumns, NULL) END,
                CASE WHEN p_BroadSQL_Clear = TRUE THEN NULL ELSE COALESCE(p_BroadSQL, NULL) END,
                CASE WHEN p_KeyColumns_Clear = TRUE THEN NULL ELSE COALESCE(p_KeyColumns, NULL) END,
                CASE WHEN p_SourceRowCount_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceRowCount, NULL) END,
                COALESCE(p_RefreshesSinceFullRebuild, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwMaterializedResults" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateMaterializedResult'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateMaterializedResult"(
    IN p_ID UUID,
    IN p_SourceType VARCHAR(20) DEFAULT NULL,
    IN p_SourceQueryID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceQueryID UUID DEFAULT NULL,
    IN p_SourceEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceEntityID UUID DEFAULT NULL,
    IN p_GeneratedEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_GeneratedEntityID UUID DEFAULT NULL,
    IN p_SchemaName VARCHAR(255) DEFAULT NULL,
    IN p_TableName VARCHAR(255) DEFAULT NULL,
    IN p_ViewName VARCHAR(255) DEFAULT NULL,
    IN p_ParamMode VARCHAR(20) DEFAULT NULL,
    IN p_RefreshStrategy VARCHAR(30) DEFAULT NULL,
    IN p_RefreshSchedule_Clear BOOLEAN DEFAULT FALSE,
    IN p_RefreshSchedule VARCHAR(255) DEFAULT NULL,
    IN p_LastRefreshedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRefreshedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_NextRefreshAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_NextRefreshAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Watermark_Clear BOOLEAN DEFAULT FALSE,
    IN p_Watermark TIMESTAMPTZ DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_RowCount_Clear BOOLEAN DEFAULT FALSE,
    IN p_RowCount BIGINT DEFAULT NULL,
    IN p_ApproxBuildCostMs_Clear BOOLEAN DEFAULT FALSE,
    IN p_ApproxBuildCostMs BIGINT DEFAULT NULL,
    IN p_IntendedWorkload_Clear BOOLEAN DEFAULT FALSE,
    IN p_IntendedWorkload TEXT DEFAULT NULL,
    IN p_RowFilterColumns_Clear BOOLEAN DEFAULT FALSE,
    IN p_RowFilterColumns TEXT DEFAULT NULL,
    IN p_BroadSQL_Clear BOOLEAN DEFAULT FALSE,
    IN p_BroadSQL TEXT DEFAULT NULL,
    IN p_KeyColumns_Clear BOOLEAN DEFAULT FALSE,
    IN p_KeyColumns TEXT DEFAULT NULL,
    IN p_SourceRowCount_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceRowCount BIGINT DEFAULT NULL,
    IN p_RefreshesSinceFullRebuild INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwMaterializedResults" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."MaterializedResult"
    SET
        "SourceType" = COALESCE(p_SourceType, "SourceType"),
        "SourceQueryID" = CASE WHEN p_SourceQueryID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceQueryID, "SourceQueryID") END,
        "SourceEntityID" = CASE WHEN p_SourceEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceEntityID, "SourceEntityID") END,
        "GeneratedEntityID" = CASE WHEN p_GeneratedEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_GeneratedEntityID, "GeneratedEntityID") END,
        "SchemaName" = COALESCE(p_SchemaName, "SchemaName"),
        "TableName" = COALESCE(p_TableName, "TableName"),
        "ViewName" = COALESCE(p_ViewName, "ViewName"),
        "ParamMode" = COALESCE(p_ParamMode, "ParamMode"),
        "RefreshStrategy" = COALESCE(p_RefreshStrategy, "RefreshStrategy"),
        "RefreshSchedule" = CASE WHEN p_RefreshSchedule_Clear = TRUE THEN NULL ELSE COALESCE(p_RefreshSchedule, "RefreshSchedule") END,
        "LastRefreshedAt" = CASE WHEN p_LastRefreshedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRefreshedAt, "LastRefreshedAt") END,
        "NextRefreshAt" = CASE WHEN p_NextRefreshAt_Clear = TRUE THEN NULL ELSE COALESCE(p_NextRefreshAt, "NextRefreshAt") END,
        "Watermark" = CASE WHEN p_Watermark_Clear = TRUE THEN NULL ELSE COALESCE(p_Watermark, "Watermark") END,
        "Status" = COALESCE(p_Status, "Status"),
        "RowCount" = CASE WHEN p_RowCount_Clear = TRUE THEN NULL ELSE COALESCE(p_RowCount, "RowCount") END,
        "ApproxBuildCostMs" = CASE WHEN p_ApproxBuildCostMs_Clear = TRUE THEN NULL ELSE COALESCE(p_ApproxBuildCostMs, "ApproxBuildCostMs") END,
        "IntendedWorkload" = CASE WHEN p_IntendedWorkload_Clear = TRUE THEN NULL ELSE COALESCE(p_IntendedWorkload, "IntendedWorkload") END,
        "RowFilterColumns" = CASE WHEN p_RowFilterColumns_Clear = TRUE THEN NULL ELSE COALESCE(p_RowFilterColumns, "RowFilterColumns") END,
        "BroadSQL" = CASE WHEN p_BroadSQL_Clear = TRUE THEN NULL ELSE COALESCE(p_BroadSQL, "BroadSQL") END,
        "KeyColumns" = CASE WHEN p_KeyColumns_Clear = TRUE THEN NULL ELSE COALESCE(p_KeyColumns, "KeyColumns") END,
        "SourceRowCount" = CASE WHEN p_SourceRowCount_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceRowCount, "SourceRowCount") END,
        "RefreshesSinceFullRebuild" = COALESCE(p_RefreshesSinceFullRebuild, "RefreshesSinceFullRebuild")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwMaterializedResults" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwMaterializedResults" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteMaterializedResult'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteMaterializedResult"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."MaterializedResult"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateMaterializedResult_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateMaterializedResult" ON __mj."MaterializedResult";
CREATE TRIGGER "trgUpdateMaterializedResult"
    BEFORE UPDATE ON __mj."MaterializedResult"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateMaterializedResult_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8f889e2d-db14-4a98-997e-2a9be8691d24' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'RefreshesSinceFullRebuild')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '8f889e2d-db14-4a98-997e-2a9be8691d24',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100052,
        'RefreshesSinceFullRebuild',
        'Refreshes Since Full Rebuild',
        'Count of consecutive incremental refreshes since the last full rebuild; the refresher forces a full rebuild at its threshold to reconcile balanced-delete drift. Reset to 0 on full rebuild; incremented on incremental refresh.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwMaterializedResults" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Materialized Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Results
-- Item: Permissions for vwMaterializedResults
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwMaterializedResults" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Materialized Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Results
-- Item: spCreateMaterializedResult
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MaterializedResult
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateMaterializedResult" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Materialized Results */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateMaterializedResult" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Materialized Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Results
-- Item: spUpdateMaterializedResult
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MaterializedResult
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateMaterializedResult" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateMaterializedResult" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Materialized Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Results
-- Item: spDeleteMaterializedResult
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MaterializedResult
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMaterializedResult" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Materialized Results */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMaterializedResult" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Comments =====================

COMMENT ON COLUMN __mj."MaterializedResult"."RefreshesSinceFullRebuild" IS 'Count of consecutive incremental (Incremental/DirtyGroupRecompute) refreshes since the last full rebuild. The refresher forces a full rebuild once this reaches its threshold, reconciling drift that a balanced delete+insert (net-zero source row-count change) leaves uncaught by the delete-detection guard. Reset to 0 on every full rebuild; incremented on every incremental refresh.';


-- ===================== Other =====================

-- =====================================================================================
-- CodeGen output (MJ: Materialized Results regenerated for the new column): EntityField
-- metadata, FK index, base view, and CRUD procs. Generated by mj codegen; Query-family
-- drift from the same run was excluded (this migration is scoped to MaterializedResult).
-- =====================================================================================

/* SQL text to insert 1 new entity field(s) */

/* spUpdate Permissions for MJ: Materialized Results */
