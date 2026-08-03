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

ALTER TABLE __mj."MaterializedResult"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MaterializedResult */
ALTER TABLE __mj."MaterializedResult"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MaterializedResult_SourceQueryID" ON __mj."MaterializedResult" ("SourceQueryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MaterializedResult_SourceEntityID" ON __mj."MaterializedResult" ("SourceEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MaterializedResult_GeneratedEntityID" ON __mj."MaterializedResult" ("GeneratedEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_CategoryID" ON __mj."Query" ("CategoryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID" ON __mj."Query" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_SQLDialectID" ON __mj."Query" ("SQLDialectID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_ExternalDataSourceID" ON __mj."Query" ("ExternalDataSourceID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_MaterializedResultID" ON __mj."Query" ("MaterializedResultID");


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

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwQueries';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwQueries"
AS SELECT
    q.*,
    "MJQueryCategory_CategoryID"."Name" AS "Category",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel",
    "MJSQLDialect_SQLDialectID"."Name" AS "SQLDialect",
    "MJExternalDataSource_ExternalDataSourceID"."Name" AS "ExternalDataSource"
FROM
    __mj."Query" AS q
LEFT OUTER JOIN
    __mj."QueryCategory" AS "MJQueryCategory_CategoryID"
  ON
    q."CategoryID" = "MJQueryCategory_CategoryID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    q."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"
INNER JOIN
    __mj."SQLDialect" AS "MJSQLDialect_SQLDialectID"
  ON
    q."SQLDialectID" = "MJSQLDialect_SQLDialectID"."ID"
LEFT OUTER JOIN
    __mj."ExternalDataSource" AS "MJExternalDataSource_ExternalDataSourceID"
  ON
    q."ExternalDataSourceID" = "MJExternalDataSource_ExternalDataSourceID"."ID"$vsql$;
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
    IN p_SourceRowCount BIGINT DEFAULT NULL
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
                "SourceRowCount"
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
                CASE WHEN p_SourceRowCount_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceRowCount, NULL) END
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
                "SourceRowCount"
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
                CASE WHEN p_SourceRowCount_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceRowCount, NULL) END
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
    IN p_SourceRowCount BIGINT DEFAULT NULL
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
        "SourceRowCount" = CASE WHEN p_SourceRowCount_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceRowCount, "SourceRowCount") END
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateQuery'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateQuery"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_CategoryID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CategoryID UUID DEFAULT NULL,
    IN p_UserQuestion_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserQuestion TEXT DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_SQL_Clear BOOLEAN DEFAULT FALSE,
    IN p_SQL TEXT DEFAULT NULL,
    IN p_TechnicalDescription_Clear BOOLEAN DEFAULT FALSE,
    IN p_TechnicalDescription TEXT DEFAULT NULL,
    IN p_OriginalSQL_Clear BOOLEAN DEFAULT FALSE,
    IN p_OriginalSQL TEXT DEFAULT NULL,
    IN p_Feedback_Clear BOOLEAN DEFAULT FALSE,
    IN p_Feedback TEXT DEFAULT NULL,
    IN p_Status VARCHAR(15) DEFAULT NULL,
    IN p_QualityRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_QualityRank INTEGER DEFAULT NULL,
    IN p_ExecutionCostRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExecutionCostRank INTEGER DEFAULT NULL,
    IN p_UsesTemplate_Clear BOOLEAN DEFAULT FALSE,
    IN p_UsesTemplate BOOLEAN DEFAULT NULL,
    IN p_AuditQueryRuns BOOLEAN DEFAULT NULL,
    IN p_CacheEnabled BOOLEAN DEFAULT NULL,
    IN p_CacheTTLMinutes_Clear BOOLEAN DEFAULT FALSE,
    IN p_CacheTTLMinutes INTEGER DEFAULT NULL,
    IN p_CacheMaxSize_Clear BOOLEAN DEFAULT FALSE,
    IN p_CacheMaxSize INTEGER DEFAULT NULL,
    IN p_EmbeddingVector_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingVector TEXT DEFAULT NULL,
    IN p_EmbeddingModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_CacheValidationSQL_Clear BOOLEAN DEFAULT FALSE,
    IN p_CacheValidationSQL TEXT DEFAULT NULL,
    IN p_SQLDialectID UUID DEFAULT NULL,
    IN p_Reusable BOOLEAN DEFAULT NULL,
    IN p_ExternalDataSourceID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalDataSourceID UUID DEFAULT NULL,
    IN p_IsMaterialized BOOLEAN DEFAULT NULL,
    IN p_MaterializedResultID_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaterializedResultID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwQueries" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."Query"
            (
                "ID",
                "Name",
                "CategoryID",
                "UserQuestion",
                "Description",
                "SQL",
                "TechnicalDescription",
                "OriginalSQL",
                "Feedback",
                "Status",
                "QualityRank",
                "ExecutionCostRank",
                "UsesTemplate",
                "AuditQueryRuns",
                "CacheEnabled",
                "CacheTTLMinutes",
                "CacheMaxSize",
                "EmbeddingVector",
                "EmbeddingModelID",
                "CacheValidationSQL",
                "SQLDialectID",
                "Reusable",
                "ExternalDataSourceID",
                "IsMaterialized",
                "MaterializedResultID"
            )
        VALUES
            (
                p_ID,
                p_Name,
                CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, NULL) END,
                CASE WHEN p_UserQuestion_Clear = TRUE THEN NULL ELSE COALESCE(p_UserQuestion, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_SQL_Clear = TRUE THEN NULL ELSE COALESCE(p_SQL, NULL) END,
                CASE WHEN p_TechnicalDescription_Clear = TRUE THEN NULL ELSE COALESCE(p_TechnicalDescription, NULL) END,
                CASE WHEN p_OriginalSQL_Clear = TRUE THEN NULL ELSE COALESCE(p_OriginalSQL, NULL) END,
                CASE WHEN p_Feedback_Clear = TRUE THEN NULL ELSE COALESCE(p_Feedback, NULL) END,
                COALESCE(p_Status, 'Pending'),
                CASE WHEN p_QualityRank_Clear = TRUE THEN NULL ELSE COALESCE(p_QualityRank, 0) END,
                CASE WHEN p_ExecutionCostRank_Clear = TRUE THEN NULL ELSE COALESCE(p_ExecutionCostRank, NULL) END,
                CASE WHEN p_UsesTemplate_Clear = TRUE THEN NULL ELSE COALESCE(p_UsesTemplate, FALSE) END,
                COALESCE(p_AuditQueryRuns, FALSE),
                COALESCE(p_CacheEnabled, FALSE),
                CASE WHEN p_CacheTTLMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_CacheTTLMinutes, NULL) END,
                CASE WHEN p_CacheMaxSize_Clear = TRUE THEN NULL ELSE COALESCE(p_CacheMaxSize, NULL) END,
                CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, NULL) END,
                CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, NULL) END,
                CASE WHEN p_CacheValidationSQL_Clear = TRUE THEN NULL ELSE COALESCE(p_CacheValidationSQL, NULL) END,
                CASE WHEN p_SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE COALESCE(p_SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                COALESCE(p_Reusable, FALSE),
                CASE WHEN p_ExternalDataSourceID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalDataSourceID, NULL) END,
                COALESCE(p_IsMaterialized, FALSE),
                CASE WHEN p_MaterializedResultID_Clear = TRUE THEN NULL ELSE COALESCE(p_MaterializedResultID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."Query"
            (
                "Name",
                "CategoryID",
                "UserQuestion",
                "Description",
                "SQL",
                "TechnicalDescription",
                "OriginalSQL",
                "Feedback",
                "Status",
                "QualityRank",
                "ExecutionCostRank",
                "UsesTemplate",
                "AuditQueryRuns",
                "CacheEnabled",
                "CacheTTLMinutes",
                "CacheMaxSize",
                "EmbeddingVector",
                "EmbeddingModelID",
                "CacheValidationSQL",
                "SQLDialectID",
                "Reusable",
                "ExternalDataSourceID",
                "IsMaterialized",
                "MaterializedResultID"
            )
        VALUES
            (
                p_Name,
                CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, NULL) END,
                CASE WHEN p_UserQuestion_Clear = TRUE THEN NULL ELSE COALESCE(p_UserQuestion, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_SQL_Clear = TRUE THEN NULL ELSE COALESCE(p_SQL, NULL) END,
                CASE WHEN p_TechnicalDescription_Clear = TRUE THEN NULL ELSE COALESCE(p_TechnicalDescription, NULL) END,
                CASE WHEN p_OriginalSQL_Clear = TRUE THEN NULL ELSE COALESCE(p_OriginalSQL, NULL) END,
                CASE WHEN p_Feedback_Clear = TRUE THEN NULL ELSE COALESCE(p_Feedback, NULL) END,
                COALESCE(p_Status, 'Pending'),
                CASE WHEN p_QualityRank_Clear = TRUE THEN NULL ELSE COALESCE(p_QualityRank, 0) END,
                CASE WHEN p_ExecutionCostRank_Clear = TRUE THEN NULL ELSE COALESCE(p_ExecutionCostRank, NULL) END,
                CASE WHEN p_UsesTemplate_Clear = TRUE THEN NULL ELSE COALESCE(p_UsesTemplate, FALSE) END,
                COALESCE(p_AuditQueryRuns, FALSE),
                COALESCE(p_CacheEnabled, FALSE),
                CASE WHEN p_CacheTTLMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_CacheTTLMinutes, NULL) END,
                CASE WHEN p_CacheMaxSize_Clear = TRUE THEN NULL ELSE COALESCE(p_CacheMaxSize, NULL) END,
                CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, NULL) END,
                CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, NULL) END,
                CASE WHEN p_CacheValidationSQL_Clear = TRUE THEN NULL ELSE COALESCE(p_CacheValidationSQL, NULL) END,
                CASE WHEN p_SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE COALESCE(p_SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                COALESCE(p_Reusable, FALSE),
                CASE WHEN p_ExternalDataSourceID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalDataSourceID, NULL) END,
                COALESCE(p_IsMaterialized, FALSE),
                CASE WHEN p_MaterializedResultID_Clear = TRUE THEN NULL ELSE COALESCE(p_MaterializedResultID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwQueries" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateQuery'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateQuery"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_CategoryID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CategoryID UUID DEFAULT NULL,
    IN p_UserQuestion_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserQuestion TEXT DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_SQL_Clear BOOLEAN DEFAULT FALSE,
    IN p_SQL TEXT DEFAULT NULL,
    IN p_TechnicalDescription_Clear BOOLEAN DEFAULT FALSE,
    IN p_TechnicalDescription TEXT DEFAULT NULL,
    IN p_OriginalSQL_Clear BOOLEAN DEFAULT FALSE,
    IN p_OriginalSQL TEXT DEFAULT NULL,
    IN p_Feedback_Clear BOOLEAN DEFAULT FALSE,
    IN p_Feedback TEXT DEFAULT NULL,
    IN p_Status VARCHAR(15) DEFAULT NULL,
    IN p_QualityRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_QualityRank INTEGER DEFAULT NULL,
    IN p_ExecutionCostRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExecutionCostRank INTEGER DEFAULT NULL,
    IN p_UsesTemplate_Clear BOOLEAN DEFAULT FALSE,
    IN p_UsesTemplate BOOLEAN DEFAULT NULL,
    IN p_AuditQueryRuns BOOLEAN DEFAULT NULL,
    IN p_CacheEnabled BOOLEAN DEFAULT NULL,
    IN p_CacheTTLMinutes_Clear BOOLEAN DEFAULT FALSE,
    IN p_CacheTTLMinutes INTEGER DEFAULT NULL,
    IN p_CacheMaxSize_Clear BOOLEAN DEFAULT FALSE,
    IN p_CacheMaxSize INTEGER DEFAULT NULL,
    IN p_EmbeddingVector_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingVector TEXT DEFAULT NULL,
    IN p_EmbeddingModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_CacheValidationSQL_Clear BOOLEAN DEFAULT FALSE,
    IN p_CacheValidationSQL TEXT DEFAULT NULL,
    IN p_SQLDialectID UUID DEFAULT NULL,
    IN p_Reusable BOOLEAN DEFAULT NULL,
    IN p_ExternalDataSourceID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalDataSourceID UUID DEFAULT NULL,
    IN p_IsMaterialized BOOLEAN DEFAULT NULL,
    IN p_MaterializedResultID_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaterializedResultID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwQueries" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."Query"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "CategoryID" = CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, "CategoryID") END,
        "UserQuestion" = CASE WHEN p_UserQuestion_Clear = TRUE THEN NULL ELSE COALESCE(p_UserQuestion, "UserQuestion") END,
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "SQL" = CASE WHEN p_SQL_Clear = TRUE THEN NULL ELSE COALESCE(p_SQL, "SQL") END,
        "TechnicalDescription" = CASE WHEN p_TechnicalDescription_Clear = TRUE THEN NULL ELSE COALESCE(p_TechnicalDescription, "TechnicalDescription") END,
        "OriginalSQL" = CASE WHEN p_OriginalSQL_Clear = TRUE THEN NULL ELSE COALESCE(p_OriginalSQL, "OriginalSQL") END,
        "Feedback" = CASE WHEN p_Feedback_Clear = TRUE THEN NULL ELSE COALESCE(p_Feedback, "Feedback") END,
        "Status" = COALESCE(p_Status, "Status"),
        "QualityRank" = CASE WHEN p_QualityRank_Clear = TRUE THEN NULL ELSE COALESCE(p_QualityRank, "QualityRank") END,
        "ExecutionCostRank" = CASE WHEN p_ExecutionCostRank_Clear = TRUE THEN NULL ELSE COALESCE(p_ExecutionCostRank, "ExecutionCostRank") END,
        "UsesTemplate" = CASE WHEN p_UsesTemplate_Clear = TRUE THEN NULL ELSE COALESCE(p_UsesTemplate, "UsesTemplate") END,
        "AuditQueryRuns" = COALESCE(p_AuditQueryRuns, "AuditQueryRuns"),
        "CacheEnabled" = COALESCE(p_CacheEnabled, "CacheEnabled"),
        "CacheTTLMinutes" = CASE WHEN p_CacheTTLMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_CacheTTLMinutes, "CacheTTLMinutes") END,
        "CacheMaxSize" = CASE WHEN p_CacheMaxSize_Clear = TRUE THEN NULL ELSE COALESCE(p_CacheMaxSize, "CacheMaxSize") END,
        "EmbeddingVector" = CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, "EmbeddingModelID") END,
        "CacheValidationSQL" = CASE WHEN p_CacheValidationSQL_Clear = TRUE THEN NULL ELSE COALESCE(p_CacheValidationSQL, "CacheValidationSQL") END,
        "SQLDialectID" = COALESCE(p_SQLDialectID, "SQLDialectID"),
        "Reusable" = COALESCE(p_Reusable, "Reusable"),
        "ExternalDataSourceID" = CASE WHEN p_ExternalDataSourceID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalDataSourceID, "ExternalDataSourceID") END,
        "IsMaterialized" = COALESCE(p_IsMaterialized, "IsMaterialized"),
        "MaterializedResultID" = CASE WHEN p_MaterializedResultID_Clear = TRUE THEN NULL ELSE COALESCE(p_MaterializedResultID, "MaterializedResultID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwQueries" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwQueries" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQuery'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQuery"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJDataContextItems_QueryIDID UUID;
    p_MJDataContextItems_QueryID_DataContextID UUID;
    p_MJDataContextItems_QueryID_Type VARCHAR(50);
    p_MJDataContextItems_QueryID_ViewID UUID;
    p_MJDataContextItems_QueryID_QueryID UUID;
    p_MJDataContextItems_QueryID_EntityID UUID;
    p_MJDataContextItems_QueryID_RecordID VARCHAR(450);
    p_MJDataContextItems_QueryID_SQL TEXT;
    p_MJDataContextItems_QueryID_DataJSON TEXT;
    p_MJDataContextItems_QueryID_LastRefreshedAt TIMESTAMPTZ;
    p_MJDataContextItems_QueryID_Description TEXT;
    p_MJDataContextItems_QueryID_CodeName VARCHAR(255);
    p_MJMaterializedResults_SourceQueryIDID UUID;
    p_MJMaterializedResults_SourceQueryID_SourceType VARCHAR(20);
    p_MJMaterializedResults_SourceQueryID_SourceQueryID UUID;
    p_MJMaterializedResults_SourceQueryID_SourceEntityID UUID;
    p_MJMaterializedResults_SourceQueryID_GeneratedEntityID UUID;
    p_MJMaterializedResults_SourceQueryID_SchemaName VARCHAR(255);
    p_MJMaterializedResults_SourceQueryID_TableName VARCHAR(255);
    p_MJMaterializedResults_SourceQueryID_ViewName VARCHAR(255);
    p_MJMaterializedResults_SourceQueryID_ParamMode VARCHAR(20);
    p_MJMaterializedResults_SourceQueryID_RefreshStrategy VARCHAR(30);
    p_MJMaterializedResults_SourceQueryID_RefreshSchedule VARCHAR(255);
    p_MJMaterializedResults_SourceQueryID_LastRefreshedAt TIMESTAMPTZ;
    p_MJMaterializedResults_SourceQueryID_NextRefreshAt TIMESTAMPTZ;
    p_MJMaterializedResults_SourceQueryID_Watermark TIMESTAMPTZ;
    p_MJMaterializedResults_SourceQueryID_Status VARCHAR(20);
    p_MJMaterializedResults_SourceQueryID_RowCount BIGINT;
    p_MJMaterializedResults_SourceQueryID_ApproxBuildCostMs BIGINT;
    p_MJMaterializedResults_SourceQueryID_IntendedWorkload TEXT;
    p_MJMaterializedResults_SourceQueryID_RowFilterColumns TEXT;
    p_MJMaterializedResults_SourceQueryID_BroadSQL TEXT;
    p_MJMaterializedResults_SourceQueryID_KeyColumns TEXT;
    p_MJMaterializedResults_SourceQueryID_SourceRowCount BIGINT;
    p_MJQueryDependencies_QueryIDID UUID;
    p_MJQueryDependencies_DependsOnQueryIDID UUID;
    p_MJQueryEntities_QueryIDID UUID;
    p_MJQueryFields_QueryIDID UUID;
    p_MJQueryParameters_QueryIDID UUID;
    p_MJQueryPermissions_QueryIDID UUID;
    p_MJQuerySQLs_QueryIDID UUID;
BEGIN
-- Cascade update on DataContextItem using cursor to call spUpdateDataContextItem


    FOR _rec IN SELECT "ID", "DataContextID", "Type", "ViewID", "QueryID", "EntityID", "RecordID", "SQL", "DataJSON", "LastRefreshedAt", "Description", "CodeName" FROM __mj."DataContextItem" WHERE "QueryID" = p_ID
    LOOP
        p_MJDataContextItems_QueryIDID := _rec."ID";
        p_MJDataContextItems_QueryID_DataContextID := _rec."DataContextID";
        p_MJDataContextItems_QueryID_Type := _rec."Type";
        p_MJDataContextItems_QueryID_ViewID := _rec."ViewID";
        p_MJDataContextItems_QueryID_QueryID := _rec."QueryID";
        p_MJDataContextItems_QueryID_EntityID := _rec."EntityID";
        p_MJDataContextItems_QueryID_RecordID := _rec."RecordID";
        p_MJDataContextItems_QueryID_SQL := _rec."SQL";
        p_MJDataContextItems_QueryID_DataJSON := _rec."DataJSON";
        p_MJDataContextItems_QueryID_LastRefreshedAt := _rec."LastRefreshedAt";
        p_MJDataContextItems_QueryID_Description := _rec."Description";
        p_MJDataContextItems_QueryID_CodeName := _rec."CodeName";
        -- Set the FK field to NULL
        p_MJDataContextItems_QueryID_QueryID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateDataContextItem"(p_ID => p_MJDataContextItems_QueryIDID, p_DataContextID => p_MJDataContextItems_QueryID_DataContextID, p_Type => p_MJDataContextItems_QueryID_Type, p_ViewID => p_MJDataContextItems_QueryID_ViewID, p_QueryID_Clear => 1, p_QueryID => p_MJDataContextItems_QueryID_QueryID, p_EntityID => p_MJDataContextItems_QueryID_EntityID, p_RecordID => p_MJDataContextItems_QueryID_RecordID, p_SQL => p_MJDataContextItems_QueryID_SQL, p_DataJSON => p_MJDataContextItems_QueryID_DataJSON, p_LastRefreshedAt => p_MJDataContextItems_QueryID_LastRefreshedAt, p_Description => p_MJDataContextItems_QueryID_Description, p_CodeName => p_MJDataContextItems_QueryID_CodeName);

    END LOOP;

    
    -- Cascade update on MaterializedResult using cursor to call spUpdateMaterializedResult


    FOR _rec IN SELECT "ID", "SourceType", "SourceQueryID", "SourceEntityID", "GeneratedEntityID", "SchemaName", "TableName", "ViewName", "ParamMode", "RefreshStrategy", "RefreshSchedule", "LastRefreshedAt", "NextRefreshAt", "Watermark", "Status", "RowCount", "ApproxBuildCostMs", "IntendedWorkload", "RowFilterColumns", "BroadSQL", "KeyColumns", "SourceRowCount" FROM __mj."MaterializedResult" WHERE "SourceQueryID" = p_ID
    LOOP
        p_MJMaterializedResults_SourceQueryIDID := _rec."ID";
        p_MJMaterializedResults_SourceQueryID_SourceType := _rec."SourceType";
        p_MJMaterializedResults_SourceQueryID_SourceQueryID := _rec."SourceQueryID";
        p_MJMaterializedResults_SourceQueryID_SourceEntityID := _rec."SourceEntityID";
        p_MJMaterializedResults_SourceQueryID_GeneratedEntityID := _rec."GeneratedEntityID";
        p_MJMaterializedResults_SourceQueryID_SchemaName := _rec."SchemaName";
        p_MJMaterializedResults_SourceQueryID_TableName := _rec."TableName";
        p_MJMaterializedResults_SourceQueryID_ViewName := _rec."ViewName";
        p_MJMaterializedResults_SourceQueryID_ParamMode := _rec."ParamMode";
        p_MJMaterializedResults_SourceQueryID_RefreshStrategy := _rec."RefreshStrategy";
        p_MJMaterializedResults_SourceQueryID_RefreshSchedule := _rec."RefreshSchedule";
        p_MJMaterializedResults_SourceQueryID_LastRefreshedAt := _rec."LastRefreshedAt";
        p_MJMaterializedResults_SourceQueryID_NextRefreshAt := _rec."NextRefreshAt";
        p_MJMaterializedResults_SourceQueryID_Watermark := _rec."Watermark";
        p_MJMaterializedResults_SourceQueryID_Status := _rec."Status";
        p_MJMaterializedResults_SourceQueryID_RowCount := _rec."RowCount";
        p_MJMaterializedResults_SourceQueryID_ApproxBuildCostMs := _rec."ApproxBuildCostMs";
        p_MJMaterializedResults_SourceQueryID_IntendedWorkload := _rec."IntendedWorkload";
        p_MJMaterializedResults_SourceQueryID_RowFilterColumns := _rec."RowFilterColumns";
        p_MJMaterializedResults_SourceQueryID_BroadSQL := _rec."BroadSQL";
        p_MJMaterializedResults_SourceQueryID_KeyColumns := _rec."KeyColumns";
        p_MJMaterializedResults_SourceQueryID_SourceRowCount := _rec."SourceRowCount";
        -- Set the FK field to NULL
        p_MJMaterializedResults_SourceQueryID_SourceQueryID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateMaterializedResult"(p_ID => p_MJMaterializedResults_SourceQueryIDID, p_SourceType => p_MJMaterializedResults_SourceQueryID_SourceType, p_SourceQueryID_Clear => 1, p_SourceQueryID => p_MJMaterializedResults_SourceQueryID_SourceQueryID, p_SourceEntityID => p_MJMaterializedResults_SourceQueryID_SourceEntityID, p_GeneratedEntityID => p_MJMaterializedResults_SourceQueryID_GeneratedEntityID, p_SchemaName => p_MJMaterializedResults_SourceQueryID_SchemaName, p_TableName => p_MJMaterializedResults_SourceQueryID_TableName, p_ViewName => p_MJMaterializedResults_SourceQueryID_ViewName, p_ParamMode => p_MJMaterializedResults_SourceQueryID_ParamMode, p_RefreshStrategy => p_MJMaterializedResults_SourceQueryID_RefreshStrategy, p_RefreshSchedule => p_MJMaterializedResults_SourceQueryID_RefreshSchedule, p_LastRefreshedAt => p_MJMaterializedResults_SourceQueryID_LastRefreshedAt, p_NextRefreshAt => p_MJMaterializedResults_SourceQueryID_NextRefreshAt, p_Watermark => p_MJMaterializedResults_SourceQueryID_Watermark, p_Status => p_MJMaterializedResults_SourceQueryID_Status, p_RowCount => p_MJMaterializedResults_SourceQueryID_RowCount, p_ApproxBuildCostMs => p_MJMaterializedResults_SourceQueryID_ApproxBuildCostMs, p_IntendedWorkload => p_MJMaterializedResults_SourceQueryID_IntendedWorkload, p_RowFilterColumns => p_MJMaterializedResults_SourceQueryID_RowFilterColumns, p_BroadSQL => p_MJMaterializedResults_SourceQueryID_BroadSQL, p_KeyColumns => p_MJMaterializedResults_SourceQueryID_KeyColumns, p_SourceRowCount => p_MJMaterializedResults_SourceQueryID_SourceRowCount);

    END LOOP;

    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency

    FOR _rec IN SELECT "ID" FROM __mj."QueryDependency" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryDependencies_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryDependency"(p_ID => p_MJQueryDependencies_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency

    FOR _rec IN SELECT "ID" FROM __mj."QueryDependency" WHERE "DependsOnQueryID" = p_ID
    LOOP
        p_MJQueryDependencies_DependsOnQueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryDependency"(p_ID => p_MJQueryDependencies_DependsOnQueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryEntity using cursor to call spDeleteQueryEntity

    FOR _rec IN SELECT "ID" FROM __mj."QueryEntity" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryEntities_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryEntity"(p_ID => p_MJQueryEntities_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryField using cursor to call spDeleteQueryField

    FOR _rec IN SELECT "ID" FROM __mj."QueryField" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryFields_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryField"(p_ID => p_MJQueryFields_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryParameter using cursor to call spDeleteQueryParameter

    FOR _rec IN SELECT "ID" FROM __mj."QueryParameter" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryParameters_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryParameter"(p_ID => p_MJQueryParameters_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryPermission using cursor to call spDeleteQueryPermission

    FOR _rec IN SELECT "ID" FROM __mj."QueryPermission" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryPermissions_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryPermission"(p_ID => p_MJQueryPermissions_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QuerySQL using cursor to call spDeleteQuerySQL

    FOR _rec IN SELECT "ID" FROM __mj."QuerySQL" WHERE "QueryID" = p_ID
    LOOP
        p_MJQuerySQLs_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQuerySQL"(p_ID => p_MJQuerySQLs_QueryIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."Query"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateQuery_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateQuery" ON __mj."Query";
CREATE TRIGGER "trgUpdateQuery"
    BEFORE UPDATE ON __mj."Query"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateQuery_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO __mj."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'e42067ed-8a1e-4adc-a722-dbfec2f7dea0',
         'MJ: Materialized Results',
         'Materialized Results',
         NULL,
         NULL,
         'MaterializedResult',
         'vwMaterializedResults',
         '__mj',
         TRUE,
         TRUE,
         TRUE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );

/* SQL generated to add new entity MJ: Materialized Results to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e42067ed-8a1e-4adc-a722-dbfec2f7dea0', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Materialized Results for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('e42067ed-8a1e-4adc-a722-dbfec2f7dea0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Materialized Results for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('e42067ed-8a1e-4adc-a722-dbfec2f7dea0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Materialized Results for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('e42067ed-8a1e-4adc-a722-dbfec2f7dea0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL text to add special date field __mj_CreatedAt to entity __mj."MaterializedResult" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."MaterializedResult" */
UPDATE __mj."MaterializedResult" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MaterializedResult */
ALTER TABLE __mj."MaterializedResult" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MaterializedResult"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."MaterializedResult" */
UPDATE __mj."MaterializedResult" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MaterializedResult */
ALTER TABLE __mj."MaterializedResult" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MaterializedResult"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a87d24be-cf27-4f40-822b-0315c66bab60' OR ("EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'IsMaterialized')
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
        'a87d24be-cf27-4f40-822b-0315c66bab60',
        '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Queries"
        100057,
        'IsMaterialized',
        'Is Materialized',
        'Author''s declared intent that this Query should be materialized. CodeGen scans for IsMaterialized = 1 and, if the query qualifies (§9/§10), materializes it. The authoritative state lives on the linked MJ: Materialized Results row.',
        'BOOLEAN',
        1,
        1,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e42906e0-e5e1-4273-8968-76f9b11b8a6c' OR ("EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'MaterializedResultID')
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
        'e42906e0-e5e1-4273-8968-76f9b11b8a6c',
        '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Queries"
        100058,
        'MaterializedResultID',
        'Materialized Result ID',
        'Back-link to the MJ: Materialized Results row produced for this Query (NULL until CodeGen materializes it).',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b0617f4d-7cc3-4cf0-9d4d-1160d907d0fa' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'ID')
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
        'b0617f4d-7cc3-4cf0-9d4d-1160d907d0fa',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d0e5d87-2f2c-40e6-9ce8-8d9e8508ffc9' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'SourceType')
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
        '7d0e5d87-2f2c-40e6-9ce8-8d9e8508ffc9',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100002,
        'SourceType',
        'Source Type',
        'Which materialization door produced this row: ''Query'' (a materialized stored Query, surfaced as a new read-only Virtual Entity) or ''EntityBaseView'' (a 1:1 materialized copy of an existing entity''s base view, which reuses the source entity).',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '726663a3-1794-45db-9480-1f8f4c037e79' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'SourceQueryID')
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
        '726663a3-1794-45db-9480-1f8f4c037e79',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100003,
        'SourceQueryID',
        'Source Query ID',
        'For the Query case, the stored Query whose result is materialized. NULL for the EntityBaseView case.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '1B248F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c52f5bfe-5092-4b19-8dee-44cfac269d75' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'SourceEntityID')
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
        'c52f5bfe-5092-4b19-8dee-44cfac269d75',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100004,
        'SourceEntityID',
        'Source Entity ID',
        'For the EntityBaseView case, the existing entity whose base view is materialized (RLS applies unchanged). NULL for the Query case.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'E0238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '612a501e-e948-4fc0-b26e-718be1334f38' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'GeneratedEntityID')
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
        '612a501e-e948-4fc0-b26e-718be1334f38',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100005,
        'GeneratedEntityID',
        'Generated Entity ID',
        'For the Query case, the new read-only Virtual Entity CodeGen mints for the materialized result shape. NULL for the EntityBaseView case (which reuses the source entity).',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'E0238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e93c56b0-1f22-42f1-92cf-7bcc1c656b2e' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'SchemaName')
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
        'e93c56b0-1f22-42f1-92cf-7bcc1c656b2e',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100006,
        'SchemaName',
        'Schema Name',
        'Schema of the physical materialized table and its wrapper view.',
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7a62ed2b-9a49-44c0-ba82-8e4b2353f8ac' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'TableName')
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
        '7a62ed2b-9a49-44c0-ba82-8e4b2353f8ac',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100007,
        'TableName',
        'Table Name',
        'Physical materialized table (swappable storage, repointed on atomic refresh). Convention: materialized_<Name>.',
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '837e3c1c-3874-40c1-a6cd-4fc63a40abb5' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'ViewName')
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
        '837e3c1c-3874-40c1-a6cd-4fc63a40abb5',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100008,
        'ViewName',
        'View Name',
        'Wrapper view (the stable read contract; body is SELECT * FROM the physical table). Convention: materialized_vw<Name>. The atomic swap repoints this view, never truncates the table in place.',
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6386b125-8f0c-40ba-9878-ceb8d367f8bf' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'ParamMode')
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
        '6386b125-8f0c-40ba-9878-ceb8d367f8bf',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100009,
        'ParamMode',
        'Param Mode',
        'Parameterization classification: ''None'' (unparameterized), ''RowFilterBroad'' (materialize broad, filter at read), ''PerValueCache'' (bounded structural variant), or ''BoundFixed'' (params bound to fixed values). v1 supports ''None'' and ''RowFilterBroad''; ''PerValueCache'' and ''BoundFixed'' are reserved for later phases.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'None',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '66c5702b-32d9-48af-b4ee-f81bf273efc3' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'RefreshStrategy')
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
        '66c5702b-32d9-48af-b4ee-f81bf273efc3',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100010,
        'RefreshStrategy',
        'Refresh Strategy',
        'Refresh strategy: ''FullRebuild'' (rebuild the whole result), ''Incremental'' (MERGE on the surrogate key), or ''DirtyGroupRecompute'' (recompute groups changed since Watermark). v1 ships all three: ''FullRebuild'' for unkeyed materializations, and ''Incremental''/''DirtyGroupRecompute'' auto-selected by CodeGen for eligible keyed aggregations.',
        'TEXT',
        60,
        0,
        0,
        FALSE,
        'FullRebuild',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2e68c8c1-13d3-4c6e-84d8-fbd76ba3deb8' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'RefreshSchedule')
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
        '2e68c8c1-13d3-4c6e-84d8-fbd76ba3deb8',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100011,
        'RefreshSchedule',
        'Refresh Schedule',
        'Cron expression for scheduled rehydration via the ScheduledJobEngine. NULL means manual refresh only. Stagger across materializations to avoid refresh-window contention.',
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '63ded54b-fcda-4d7d-9b6e-f21952f815fc' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'LastRefreshedAt')
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
        '63ded54b-fcda-4d7d-9b6e-f21952f815fc',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100012,
        'LastRefreshedAt',
        'Last Refreshed At',
        'Timestamp of the last successful refresh (freshness surfacing for the selection contract).',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '632184b1-523f-42d4-be9c-acb533164f6d' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'NextRefreshAt')
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
        '632184b1-523f-42d4-be9c-acb533164f6d',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100013,
        'NextRefreshAt',
        'Next Refresh At',
        'Next scheduled refresh time, computed from RefreshSchedule; the scheduler reads this as its due-work signal.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ee27587c-a2d9-4b66-a04b-3388b7471c89' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'Watermark')
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
        'ee27587c-a2d9-4b66-a04b-3388b7471c89',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100014,
        'Watermark',
        'Watermark',
        'Last-seen MAX(__mj_UpdatedAt) of the source data; the staleness probe for incremental / dirty-group refresh (later phases). Reuses the existing query smart-cache fingerprint pattern.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '80b8f2dd-1563-41f8-9908-e0ff6b6caee6' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'Status')
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
        '80b8f2dd-1563-41f8-9908-e0ff6b6caee6',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100015,
        'Status',
        'Status',
        'Lifecycle state: ''Building'' (materializing), ''Active'' (fresh, readable), ''Stale'' (past expected freshness), ''Disabled'' (turned off), ''DriftHold'' (upstream schema drift detected; held for review).',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Building',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1049bd5f-1534-405f-82f5-4fff3b6ab388' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'RowCount')
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
        '1049bd5f-1534-405f-82f5-4fff3b6ab388',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100016,
        'RowCount',
        'Row Count',
        'Approximate row count of the last build — part of the cost/size profile an agent (Skip) uses to choose live vs. materialized.',
        'bigint',
        8,
        19,
        0,
        TRUE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '72f7adc1-c6f0-4db5-afb6-916e91cafc27' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'ApproxBuildCostMs')
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
        '72f7adc1-c6f0-4db5-afb6-916e91cafc27',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100017,
        'ApproxBuildCostMs',
        'Approx Build Cost Ms',
        'Approximate build cost in milliseconds of the last refresh — part of the cost/size profile for the selection contract.',
        'bigint',
        8,
        19,
        0,
        TRUE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '76a9b456-9ad0-4b3b-8241-c02b9b660571' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'IntendedWorkload')
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
        '76a9b456-9ad0-4b3b-8241-c02b9b660571',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100018,
        'IntendedWorkload',
        'Intended Workload',
        'Human/structured note describing what this materialization is good for; surfaced in the selection contract so callers pick the right variant.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '89054f21-3908-4caa-b0c9-b84ee97b9aef' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'RowFilterColumns')
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
        '89054f21-3908-4caa-b0c9-b84ee97b9aef',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100019,
        'RowFilterColumns',
        'Row Filter Columns',
        'JSON array of the output column names that the row-filter parameters map to. Populated when ParamMode is RowFilterBroad. The materialization holds all rows broad and these columns are filtered at read time (plan section 6.4). NULL for non-row-filter materializations.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8d4809f6-c3bc-4270-9750-282bc9b982ca' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'BroadSQL')
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
        '8d4809f6-c3bc-4270-9750-282bc9b982ca',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100020,
        'BroadSQL',
        'Broad SQL',
        'For a RowFilterBroad materialization, the broad source SELECT that the refresh engine materializes: the source query with its row-filter WHERE predicates removed, so the materialized table holds every row the query could return for any parameter value. NULL for non-parameterized materializations, which use the source query SQL directly.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4327e5f2-61fc-4847-b660-5b44721f1784' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'KeyColumns')
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
        '4327e5f2-61fc-4847-b660-5b44721f1784',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100021,
        'KeyColumns',
        'Key Columns',
        'Phase 3: JSON array of the key columns ({name, type}) for a keyed/aggregation materialization — the combined key hashed into the surrogate (the stable match key for incremental refresh / dirty-group recompute). NULL means not keyed, in which case a synthetic IDENTITY/ROW_NUMBER surrogate is used.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '20fd4805-0810-47e5-9a3a-67f6b1a7a2b2' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'SourceRowCount')
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
        '20fd4805-0810-47e5-9a3a-67f6b1a7a2b2',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100022,
        'SourceRowCount',
        'Source Row Count',
        'Phase 3 (DirtyGroupRecompute): the SOURCE table row count observed at the last successful refresh. Delete-detection guard — if the current source COUNT(*) is lower than this, rows were deleted and the refresh falls back to a full rebuild (dirty-group recompute cannot localize deletes from surviving rows). NULL means no baseline yet (first run does a full rebuild and sets it). Distinct from RowCount, which counts materialized rows (groups).',
        'bigint',
        8,
        19,
        0,
        TRUE,
        NULL,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '07b53c4a-9e60-4539-bcca-7d87483baa10' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = '__mj_CreatedAt')
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
        '07b53c4a-9e60-4539-bcca-7d87483baa10',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100023,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f7bd03bd-95f0-4be7-ba36-b5f439d9c1da' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = '__mj_UpdatedAt')
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
        'f7bd03bd-95f0-4be7-ba36-b5f439d9c1da',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100024,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('a45a3ef5-e0a3-4088-991b-0e407947824b', '7D0E5D87-2F2C-40E6-9CE8-8D9E8508FFC9', 1, 'EntityBaseView', 'EntityBaseView', NOW(), NOW());

/* SQL text to insert entity field value with ID f356e374-a9b1-4524-bb42-3670392f93ac */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('f356e374-a9b1-4524-bb42-3670392f93ac', '7D0E5D87-2F2C-40E6-9CE8-8D9E8508FFC9', 2, 'Query', 'Query', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 7D0E5D87-2F2C-40E6-9CE8-8D9E8508FFC9 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='7D0E5D87-2F2C-40E6-9CE8-8D9E8508FFC9';

/* SQL text to insert entity field value with ID 17c1a16a-e1d0-4e94-914f-821d586c6f44 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('17c1a16a-e1d0-4e94-914f-821d586c6f44', '6386B125-8F0C-40BA-9878-CEB8D367F8BF', 1, 'BoundFixed', 'BoundFixed', NOW(), NOW());

/* SQL text to insert entity field value with ID 895e9b04-0b3a-4d52-8a5b-c013d22ca486 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('895e9b04-0b3a-4d52-8a5b-c013d22ca486', '6386B125-8F0C-40BA-9878-CEB8D367F8BF', 2, 'None', 'None', NOW(), NOW());

/* SQL text to insert entity field value with ID d2d3de09-337b-48f7-8126-5e6a95e86338 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d2d3de09-337b-48f7-8126-5e6a95e86338', '6386B125-8F0C-40BA-9878-CEB8D367F8BF', 3, 'PerValueCache', 'PerValueCache', NOW(), NOW());

/* SQL text to insert entity field value with ID 2c6345be-3dc2-4ceb-b9ec-ad3042a93987 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('2c6345be-3dc2-4ceb-b9ec-ad3042a93987', '6386B125-8F0C-40BA-9878-CEB8D367F8BF', 4, 'RowFilterBroad', 'RowFilterBroad', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 6386B125-8F0C-40BA-9878-CEB8D367F8BF */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='6386B125-8F0C-40BA-9878-CEB8D367F8BF';

/* SQL text to insert entity field value with ID 778dd19c-cd4b-4a7f-92f4-278f8fdc07bd */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('778dd19c-cd4b-4a7f-92f4-278f8fdc07bd', '66C5702B-32D9-48AF-B4EE-F81BF273EFC3', 1, 'DirtyGroupRecompute', 'DirtyGroupRecompute', NOW(), NOW());

/* SQL text to insert entity field value with ID 02fe358b-2d11-4b48-82c3-a4fc61224309 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('02fe358b-2d11-4b48-82c3-a4fc61224309', '66C5702B-32D9-48AF-B4EE-F81BF273EFC3', 2, 'FullRebuild', 'FullRebuild', NOW(), NOW());

/* SQL text to insert entity field value with ID 071cf5c6-72b3-4a94-9935-330cd2ca5980 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('071cf5c6-72b3-4a94-9935-330cd2ca5980', '66C5702B-32D9-48AF-B4EE-F81BF273EFC3', 3, 'Incremental', 'Incremental', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 66C5702B-32D9-48AF-B4EE-F81BF273EFC3 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='66C5702B-32D9-48AF-B4EE-F81BF273EFC3';

/* SQL text to insert entity field value with ID d1911ea7-8cf4-4921-9ce3-f9160ef02f1c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d1911ea7-8cf4-4921-9ce3-f9160ef02f1c', '80B8F2DD-1563-41F8-9908-E0FF6B6CAEE6', 1, 'Active', 'Active', NOW(), NOW());

/* SQL text to insert entity field value with ID d28f0204-8b5e-419b-8a0b-7d1385fca0fc */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d28f0204-8b5e-419b-8a0b-7d1385fca0fc', '80B8F2DD-1563-41F8-9908-E0FF6B6CAEE6', 2, 'Building', 'Building', NOW(), NOW());

/* SQL text to insert entity field value with ID 73da7973-afbf-4eed-81e1-7af2d168f0f0 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('73da7973-afbf-4eed-81e1-7af2d168f0f0', '80B8F2DD-1563-41F8-9908-E0FF6B6CAEE6', 3, 'Disabled', 'Disabled', NOW(), NOW());

/* SQL text to insert entity field value with ID b171a0c8-f8d7-4d58-8bbd-f054f1445b2f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('b171a0c8-f8d7-4d58-8bbd-f054f1445b2f', '80B8F2DD-1563-41F8-9908-E0FF6B6CAEE6', 4, 'DriftHold', 'DriftHold', NOW(), NOW());

/* SQL text to insert entity field value with ID 4daf15cb-7e5e-4569-9cf0-e229fb0413b5 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('4daf15cb-7e5e-4569-9cf0-e229fb0413b5', '80B8F2DD-1563-41F8-9908-E0FF6B6CAEE6', 5, 'Stale', 'Stale', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 80B8F2DD-1563-41F8-9908-E0FF6B6CAEE6 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='80B8F2DD-1563-41F8-9908-E0FF6B6CAEE6';


/* Create Entity Relationship: MJ: Entities -> MJ: Materialized Results (One To Many via SourceEntityID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '887690fd-d878-4b86-89a3-973641e76665'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('887690fd-d878-4b86-89a3-973641e76665', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', 'SourceEntityID', 'One To Many', TRUE, TRUE, 72, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c818fe6f-242b-4807-beb2-4a17aa920a29'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('c818fe6f-242b-4807-beb2-4a17aa920a29', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', 'GeneratedEntityID', 'One To Many', TRUE, TRUE, 73, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'badf8c98-8ff4-4845-b3d2-689fd08e0ea3'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('badf8c98-8ff4-4845-b3d2-689fd08e0ea3', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', 'SourceQueryID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '757e7332-4700-4601-8295-91575a02e183'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('757e7332-4700-4601-8295-91575a02e183', 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'MaterializedResultID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e3dbe44c-2239-4b7a-8fbf-48864559d8f8' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'SourceQuery')
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
        'e3dbe44c-2239-4b7a-8fbf-48864559d8f8',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100049,
        'SourceQuery',
        'Source Query',
        NULL,
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9ce834ad-1e8b-4972-80c2-5e5f5b22331b' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'SourceEntity')
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
        '9ce834ad-1e8b-4972-80c2-5e5f5b22331b',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100050,
        'SourceEntity',
        'Source Entity',
        NULL,
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0d56f7ee-9f38-4e93-9ae2-0347bdf6af6c' OR ("EntityID" = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND "Name" = 'GeneratedEntity')
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
        '0d56f7ee-9f38-4e93-9ae2-0347bdf6af6c',
        'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- "Entity": "MJ": "Materialized" "Results"
        100051,
        'GeneratedEntity',
        'Generated Entity',
        NULL,
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
/* Index for Foreign Keys for Query */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Query;

DO $$ BEGIN GRANT SELECT ON __mj."vwQueries" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Permissions for vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwQueries" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spCreateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Query
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Queries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spUpdateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Query
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spDeleteQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Query
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Queries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert 3 new entity field(s) */


-- ===================== Other =====================

-- =====================================================================================
-- Materialization — CodeGen-generated database objects
-- =====================================================================================
-- The four preceding materialization migrations add the MaterializedResult table +
-- Query.IsMaterialized / Query.MaterializedResultID columns (DDL + extended properties only).
-- This migration carries the CodeGen output those DDL changes require so a from-scratch
-- database (CI, new installs) provisions the feature completely without a live `mj codegen`:
--
--   * MJ: Materialized Results entity + application link + role permissions
--   * EntityField metadata for every MaterializedResult field and the two new Query fields
--     (this is what fixes the "vwQueries exposes N columns but the entity declares N-2 fields"
--      base-view/metadata misalignment that fails the integration tier)
--   * EntityField value lists + Entity relationships (Query<->MaterializedResult, Entity->MaterializedResult)
--   * FK indexes, base views (vwQueries, vwMaterializedResults) and CRUD procs
--     (spCreate/Update/Delete for Query + MaterializedResult)
--
-- Generated by `mj codegen` against a fresh DB with all committed migrations applied.
-- Unrelated generator drift (e.g. ContentItemChunk) was deliberately excluded — this file
-- is scoped to the materialization feature only.
-- =====================================================================================

/* SQL generated to create new entity MJ: Materialized Results */

/* SQL text to insert 26 new entity field(s) */

/* spUpdate Permissions for MJ: Materialized Results */

/* spUpdate Permissions for MJ: Queries */
