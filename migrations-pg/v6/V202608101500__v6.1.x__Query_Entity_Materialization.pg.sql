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

CREATE TABLE __mj."MaterializedResult" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),

 -- Which door produced this materialization.
 "SourceType" VARCHAR(20) NOT NULL,

 -- Provenance for the base-view case (the Query case links via MaterializedResultQuery).
 "SourceEntityID" UUID NULL, -- base-view case (the source entity; null for query)
 "GeneratedEntityID" UUID NULL, -- Query case: the new read-only Virtual Entity (null for base-view, which reuses the source entity)

 -- Physical objects (the table is swappable storage; the view is the stable contract).
 "SchemaName" VARCHAR(255) NOT NULL,
 "TableName" VARCHAR(255) NOT NULL,
 "ViewName" VARCHAR(255) NOT NULL,

 -- Parameterization classification (§9).
 "ParamMode" VARCHAR(20) NOT NULL DEFAULT 'None',

 -- Refresh model (§11).
 "RefreshStrategy" VARCHAR(30) NOT NULL DEFAULT 'FullRebuild',
 "RefreshSchedule" VARCHAR(255) NULL, -- cron expression; NULL = manual only
 "LastRefreshedAt" TIMESTAMPTZ NULL,
 "NextRefreshAt" TIMESTAMPTZ NULL,
 "Watermark" TIMESTAMPTZ NULL, -- last-seen MAX(__mj_UpdatedAt) for incremental / dirty-group

 -- Lifecycle (§13).
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Building',

 -- Cost / size profile for the selection contract (§8).
 "RowCount" BIGINT NULL,
 "ApproxBuildCostMs" BIGINT NULL,

 -- Free-text / structured note: what this materialization is good for (§8).
 "IntendedWorkload" TEXT NULL,

 -- Row-filter (RowFilterBroad) persistence (§6.4 / §9).
 "RowFilterColumns" TEXT NULL,
 "BroadSQL" TEXT NULL,

 -- Keyed/aggregation surrogate hashing (§ Phase 3).
 "KeyColumns" TEXT NULL,

 -- DirtyGroupRecompute delete-detection guard (§ Phase 3).
 "SourceRowCount" BIGINT NULL,

 -- Incremental forced-full-rebuild cadence (balanced-delete self-heal).
 "RefreshesSinceFullRebuild" INTEGER NOT NULL DEFAULT 0,

 -- Read-time filter predicate contract for RowFilterBroad (§ Phase 2 read injection).
 "ReadFilterSpec" TEXT NULL,

 CONSTRAINT PK_MaterializedResult PRIMARY KEY ("ID"),
 CONSTRAINT FK_MaterializedResult_SourceEntity
 FOREIGN KEY ("SourceEntityID") REFERENCES __mj."Entity"("ID"),
 CONSTRAINT FK_MaterializedResult_GeneratedEntity
 FOREIGN KEY ("GeneratedEntityID") REFERENCES __mj."Entity"("ID"),
 CONSTRAINT CK_MaterializedResult_SourceType
 CHECK ("SourceType" IN ('Query', 'EntityBaseView')),
 CONSTRAINT CK_MaterializedResult_ParamMode
 CHECK ("ParamMode" IN ('None', 'RowFilterBroad', 'PerValueCache', 'BoundFixed')),
 CONSTRAINT CK_MaterializedResult_RefreshStrategy
 CHECK ("RefreshStrategy" IN ('FullRebuild', 'Incremental', 'DirtyGroupRecompute')),
 CONSTRAINT CK_MaterializedResult_Status
 CHECK ("Status" IN ('Active', 'Stale', 'Building', 'Disabled', 'DriftHold'))
);

-- ─── MJ: Materialized Result Queries (join table) ────────────────────────────
-- Carries the MaterializedResult <-> Query relationship as rows (replaces the
-- former SourceQueryID / MaterializedResultID direct FKs, which formed a mutual
-- FK cycle). Both FKs point outward → no cycle. The pairing is 1:1 (a query has
-- at most one materialization and vice-versa), enforced by the two UNIQUE keys.;

CREATE TABLE __mj."MaterializedResultQuery" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "MaterializedResultID" UUID NOT NULL,
 "QueryID" UUID NOT NULL,
 CONSTRAINT PK_MaterializedResultQuery PRIMARY KEY ("ID"),
 CONSTRAINT FK_MaterializedResultQuery_MaterializedResult
 FOREIGN KEY ("MaterializedResultID") REFERENCES __mj."MaterializedResult"("ID"),
 CONSTRAINT FK_MaterializedResultQuery_Query
 FOREIGN KEY ("QueryID") REFERENCES __mj."Query"("ID"),
 CONSTRAINT UQ_MaterializedResultQuery_MaterializedResult UNIQUE ("MaterializedResultID"),
 CONSTRAINT UQ_MaterializedResultQuery_Query UNIQUE ("QueryID")
);

-- ─── Author-intent flag on Query (§3.3) ──────────────────────────────────────
-- The author's *declared intent* that CodeGen scans for; the MaterializedResult row
-- carries the authoritative state, linked via the MaterializedResultQuery join table.;

ALTER TABLE __mj."Query"
 ADD COLUMN IF NOT EXISTS "IsMaterialized"       BOOLEAN              NOT NULL DEFAULT FALSE;

-- ─── Column descriptions (CodeGen reads these into EntityField metadata) ──────;

ALTER TABLE __mj."MaterializedResult"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MaterializedResult */
ALTER TABLE __mj."MaterializedResult"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MaterializedResultQuery */
ALTER TABLE __mj."MaterializedResultQuery"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MaterializedResultQuery */
ALTER TABLE __mj."MaterializedResultQuery"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MaterializedResultQuery_MaterializedResultID" ON __mj."MaterializedResultQuery" ("MaterializedResultID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MaterializedResultQuery_QueryID" ON __mj."MaterializedResultQuery" ("QueryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MaterializedResult_SourceEntityID" ON __mj."MaterializedResult" ("SourceEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MaterializedResult_GeneratedEntityID" ON __mj."MaterializedResult" ("GeneratedEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_CategoryID" ON __mj."Query" ("CategoryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID" ON __mj."Query" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_SQLDialectID" ON __mj."Query" ("SQLDialectID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_ExternalDataSourceID" ON __mj."Query" ("ExternalDataSourceID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwMaterializedResultQueries';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMaterializedResultQueries"
AS SELECT
    m.*,
    "MJQuery_QueryID"."Name" AS "Query"
FROM
    __mj."MaterializedResultQuery" AS m
INNER JOIN
    __mj."Query" AS "MJQuery_QueryID"
  ON
    m."QueryID" = "MJQuery_QueryID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwMaterializedResults';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMaterializedResults"
AS SELECT
    m.*,
    "MJEntity_SourceEntityID"."Name" AS "SourceEntity",
    "MJEntity_GeneratedEntityID"."Name" AS "GeneratedEntity"
FROM
    __mj."MaterializedResult" AS m
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
           WHERE proname = 'spCreateMaterializedResultQuery'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateMaterializedResultQuery"(
    IN p_ID UUID DEFAULT NULL,
    IN p_MaterializedResultID UUID DEFAULT NULL,
    IN p_QueryID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwMaterializedResultQueries" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."MaterializedResultQuery"
            (
                "ID",
                "MaterializedResultID",
                "QueryID"
            )
        VALUES
            (
                p_ID,
                p_MaterializedResultID,
                p_QueryID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."MaterializedResultQuery"
            (
                "MaterializedResultID",
                "QueryID"
            )
        VALUES
            (
                p_MaterializedResultID,
                p_QueryID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwMaterializedResultQueries" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateMaterializedResultQuery'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateMaterializedResultQuery"(
    IN p_ID UUID,
    IN p_MaterializedResultID UUID DEFAULT NULL,
    IN p_QueryID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwMaterializedResultQueries" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."MaterializedResultQuery"
    SET
        "MaterializedResultID" = COALESCE(p_MaterializedResultID, "MaterializedResultID"),
        "QueryID" = COALESCE(p_QueryID, "QueryID")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwMaterializedResultQueries" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwMaterializedResultQueries" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteMaterializedResultQuery'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteMaterializedResultQuery"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."MaterializedResultQuery"
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
           WHERE proname = 'spCreateMaterializedResult'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateMaterializedResult"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SourceType VARCHAR(20) DEFAULT NULL,
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
    IN p_RefreshesSinceFullRebuild INTEGER DEFAULT NULL,
    IN p_ReadFilterSpec_Clear BOOLEAN DEFAULT FALSE,
    IN p_ReadFilterSpec TEXT DEFAULT NULL
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
                "RefreshesSinceFullRebuild",
                "ReadFilterSpec"
            )
        VALUES
            (
                p_ID,
                p_SourceType,
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
                COALESCE(p_RefreshesSinceFullRebuild, 0),
                CASE WHEN p_ReadFilterSpec_Clear = TRUE THEN NULL ELSE COALESCE(p_ReadFilterSpec, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."MaterializedResult"
            (
                "SourceType",
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
                "RefreshesSinceFullRebuild",
                "ReadFilterSpec"
            )
        VALUES
            (
                p_SourceType,
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
                COALESCE(p_RefreshesSinceFullRebuild, 0),
                CASE WHEN p_ReadFilterSpec_Clear = TRUE THEN NULL ELSE COALESCE(p_ReadFilterSpec, NULL) END
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
    IN p_RefreshesSinceFullRebuild INTEGER DEFAULT NULL,
    IN p_ReadFilterSpec_Clear BOOLEAN DEFAULT FALSE,
    IN p_ReadFilterSpec TEXT DEFAULT NULL
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
        "RefreshesSinceFullRebuild" = COALESCE(p_RefreshesSinceFullRebuild, "RefreshesSinceFullRebuild"),
        "ReadFilterSpec" = CASE WHEN p_ReadFilterSpec_Clear = TRUE THEN NULL ELSE COALESCE(p_ReadFilterSpec, "ReadFilterSpec") END
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
    IN p_IsMaterialized BOOLEAN DEFAULT NULL
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
                "IsMaterialized"
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
                COALESCE(p_IsMaterialized, FALSE)
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
                "IsMaterialized"
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
                COALESCE(p_IsMaterialized, FALSE)
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
    IN p_IsMaterialized BOOLEAN DEFAULT NULL
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
        "IsMaterialized" = COALESCE(p_IsMaterialized, "IsMaterialized")
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
    p_MJMaterializedResultQueries_QueryIDID UUID;
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

    
    -- Cascade delete from MaterializedResultQuery using cursor to call spDeleteMaterializedResultQuery

    FOR _rec IN SELECT "ID" FROM __mj."MaterializedResultQuery" WHERE "QueryID" = p_ID
    LOOP
        p_MJMaterializedResultQueries_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteMaterializedResultQuery"(p_ID => p_MJMaterializedResultQueries_QueryIDID);
        
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateMaterializedResultQuery_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateMaterializedResultQuery" ON __mj."MaterializedResultQuery";
CREATE TRIGGER "trgUpdateMaterializedResultQuery"
    BEFORE UPDATE ON __mj."MaterializedResultQuery"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateMaterializedResultQuery_func"();

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
         'e7606da1-ab65-4a6d-bc7e-0970bf30dc50',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e7606da1-ab65-4a6d-bc7e-0970bf30dc50', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Materialized Results for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('e7606da1-ab65-4a6d-bc7e-0970bf30dc50', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Materialized Results for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('e7606da1-ab65-4a6d-bc7e-0970bf30dc50', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Materialized Results for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('e7606da1-ab65-4a6d-bc7e-0970bf30dc50', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ: Materialized Result Queries */

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
         'ab9eca24-70b0-49b8-80cb-0d57c6e63339',
         'MJ: Materialized Result Queries',
         'Materialized Result Queries',
         NULL,
         NULL,
         'MaterializedResultQuery',
         'vwMaterializedResultQueries',
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

/* SQL generated to add new entity MJ: Materialized Result Queries to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ab9eca24-70b0-49b8-80cb-0d57c6e63339', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Materialized Result Queries for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ab9eca24-70b0-49b8-80cb-0d57c6e63339', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Materialized Result Queries for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ab9eca24-70b0-49b8-80cb-0d57c6e63339', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Materialized Result Queries for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ab9eca24-70b0-49b8-80cb-0d57c6e63339', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

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

/* SQL text to add special date field __mj_CreatedAt to entity __mj."MaterializedResultQuery" */
UPDATE __mj."MaterializedResultQuery" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MaterializedResultQuery */
ALTER TABLE __mj."MaterializedResultQuery" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MaterializedResultQuery"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."MaterializedResultQuery" */
UPDATE __mj."MaterializedResultQuery" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MaterializedResultQuery */
ALTER TABLE __mj."MaterializedResultQuery" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MaterializedResultQuery"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ae855067-4272-42c0-9a27-43c54d482a3f' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'ID')
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
        'ae855067-4272-42c0-9a27-43c54d482a3f',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 1,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '220a7546-e3a3-4970-857c-c3d7c5da5069' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'SourceType')
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
        '220a7546-e3a3-4970-857c-c3d7c5da5069',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 2,
        'SourceType',
        'Source Type',
        'Which materialization door produced this row: ''Query'' (a materialized stored Query, surfaced as a new read-only Virtual Entity; the source query is linked via the MaterializedResultQuery join table) or ''EntityBaseView'' (a 1:1 materialized copy of an existing entity''s base view, which reuses the source entity).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e380096f-4e02-4bcd-94a0-6de8d8c95d6d' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'SourceEntityID')
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
        'e380096f-4e02-4bcd-94a0-6de8d8c95d6d',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 3,
        'SourceEntityID',
        'Source Entity ID',
        'For the EntityBaseView case, the existing entity whose base view is materialized (RLS applies unchanged). NULL for the Query case (whose source query is linked via the MaterializedResultQuery join table).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a50de14a-85fd-43d9-ab17-56c2388a2f5e' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'GeneratedEntityID')
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
        'a50de14a-85fd-43d9-ab17-56c2388a2f5e',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 4,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fb315b4d-3751-48de-8bf8-a08c62b54548' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'SchemaName')
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
        'fb315b4d-3751-48de-8bf8-a08c62b54548',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 5,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f8f9c20b-cca4-413a-ba8b-ddec4be897ad' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'TableName')
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
        'f8f9c20b-cca4-413a-ba8b-ddec4be897ad',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 6,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f71c2a95-dbda-4d6e-b942-78ee06ff2873' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'ViewName')
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
        'f71c2a95-dbda-4d6e-b942-78ee06ff2873',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 7,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f7a88fc-346e-4165-9586-3873163ffa08' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'ParamMode')
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
        '5f7a88fc-346e-4165-9586-3873163ffa08',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 8,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e9c7182e-612c-441a-9004-5b1ffd527181' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'RefreshStrategy')
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
        'e9c7182e-612c-441a-9004-5b1ffd527181',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 9,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9667f45f-7a9a-4cfa-9a02-64616a694678' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'RefreshSchedule')
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
        '9667f45f-7a9a-4cfa-9a02-64616a694678',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4f34a70c-498b-4c10-8014-425c7a85ce0d' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'LastRefreshedAt')
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
        '4f34a70c-498b-4c10-8014-425c7a85ce0d',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 11,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bb97e7ab-5e10-4a68-89e7-918154742919' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'NextRefreshAt')
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
        'bb97e7ab-5e10-4a68-89e7-918154742919',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 12,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'db11789a-dedd-4b1f-a401-c4ecd8f61efe' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'Watermark')
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
        'db11789a-dedd-4b1f-a401-c4ecd8f61efe',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 13,
        'Watermark',
        'Watermark',
        'Last-seen MAX(__mj_UpdatedAt) of the source data; the staleness probe for incremental / dirty-group refresh. Reuses the existing query smart-cache fingerprint pattern.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6ad0de01-90f6-4988-928f-00a1aa588691' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'Status')
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
        '6ad0de01-90f6-4988-928f-00a1aa588691',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 14,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb316ab6-9b1a-479c-b1a6-f0f3626c02a1' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'RowCount')
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
        'eb316ab6-9b1a-479c-b1a6-f0f3626c02a1',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 15,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c27d62e3-d1d7-4385-b70a-66bac9a584ce' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'ApproxBuildCostMs')
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
        'c27d62e3-d1d7-4385-b70a-66bac9a584ce',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 16,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dc5e90bd-5cc2-40b9-888f-79ef4b19e204' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'IntendedWorkload')
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
        'dc5e90bd-5cc2-40b9-888f-79ef4b19e204',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 17,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9ef10a27-673b-473f-b3f0-ba10acaf51d8' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'RowFilterColumns')
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
        '9ef10a27-673b-473f-b3f0-ba10acaf51d8',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 18,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1c61bfdd-47b7-40b9-a5dc-3023f6df54fd' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'BroadSQL')
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
        '1c61bfdd-47b7-40b9-a5dc-3023f6df54fd',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 19,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1a671411-66f0-45c6-821c-eadf439389aa' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'KeyColumns')
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
        '1a671411-66f0-45c6-821c-eadf439389aa',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 20,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'debd7ba5-864e-452c-9ab0-16557ca691cf' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'SourceRowCount')
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
        'debd7ba5-864e-452c-9ab0-16557ca691cf',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 21,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '534dcd98-5678-441a-b177-2ba662f370a8' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'RefreshesSinceFullRebuild')
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
        '534dcd98-5678-441a-b177-2ba662f370a8',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 22,
        'RefreshesSinceFullRebuild',
        'Refreshes Since Full Rebuild',
        'Count of consecutive incremental (Incremental/DirtyGroupRecompute) refreshes since the last full rebuild. The refresher forces a full rebuild once this reaches its threshold, reconciling drift that a balanced delete+insert (net-zero source row-count change) leaves uncaught by the delete-detection guard. Reset to 0 on every full rebuild; incremented on every incremental refresh.',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7f4443c7-1f61-4322-b565-537251f85b5f' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'ReadFilterSpec')
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
        '7f4443c7-1f61-4322-b565-537251f85b5f',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 23,
        'ReadFilterSpec',
        'Read Filter Spec',
        'For a RowFilterBroad materialization, a JSON array of read-time filter predicates — each { column, operator, paramName, kind } — that the runtime provider injects against the broad materialized table when a caller runs the query with DataSource=Materialized. operator is one of the read-time-safe set (=, !=, <>, <, >, <=, >=, IN, NOT IN); kind is scalar or list. Values are always bound as SQL parameters, never interpolated. NULL for non-row-filter materializations.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd0c31a10-6977-4c1f-a3bd-33615a245ba4' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = '__mj_CreatedAt')
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
        'd0c31a10-6977-4c1f-a3bd-33615a245ba4',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 24,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd54fcc87-7142-41c8-bfbe-53adf4eca896' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = '__mj_UpdatedAt')
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
        'd54fcc87-7142-41c8-bfbe-53adf4eca896',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 25,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '480b3f08-ae0f-4c5f-b3e2-f398cefebb87' OR ("EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND "Name" = 'ID')
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
        '480b3f08-ae0f-4c5f-b3e2-f398cefebb87',
        'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- "Entity": "MJ": "Materialized" "Result" "Queries"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 1,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a2e6ee3e-9584-4cad-b940-9715470e9e34' OR ("EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND "Name" = 'MaterializedResultID')
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
        'a2e6ee3e-9584-4cad-b940-9715470e9e34',
        'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- "Entity": "MJ": "Materialized" "Result" "Queries"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 2,
        'MaterializedResultID',
        'Materialized Result ID',
        'The materialization (MJ: Materialized Results) side of the query<->materialization link.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'de467b6e-8bc2-47a2-a908-345e94eb5939' OR ("EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND "Name" = 'QueryID')
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
        'de467b6e-8bc2-47a2-a908-345e94eb5939',
        'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- "Entity": "MJ": "Materialized" "Result" "Queries"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 3,
        'QueryID',
        'Query ID',
        'The source Query (MJ: Queries) whose result this materialization was built from. The link lives here (not as a direct FK on either table) to avoid the MaterializedResult<->Query circular dependency.',
        'UUID',
        16,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4be737b3-4430-4c07-85fe-20d4f098960d' OR ("EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND "Name" = '__mj_CreatedAt')
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
        '4be737b3-4430-4c07-85fe-20d4f098960d',
        'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- "Entity": "MJ": "Materialized" "Result" "Queries"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 4,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '15320ca5-af0b-47e7-a597-8f97efa19b58' OR ("EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND "Name" = '__mj_UpdatedAt')
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
        '15320ca5-af0b-47e7-a597-8f97efa19b58',
        'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- "Entity": "MJ": "Materialized" "Result" "Queries"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 5,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ca8eddc4-0ec1-41ed-8f2b-7fb2acc0ccb3' OR ("EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'IsMaterialized')
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
        'ca8eddc4-0ec1-41ed-8f2b-7fb2acc0ccb3',
        '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Queries"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6') + 26,
        'IsMaterialized',
        'Is Materialized',
        'Author''s declared intent that this Query should be materialized. CodeGen scans for IsMaterialized = 1 and, if the query qualifies (§9/§10), materializes it. The authoritative state lives on the linked MJ: Materialized Results row (found via the MaterializedResultQuery join table).',
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('f2c0df9f-a421-483e-babe-ee9c0556ddc2', '220A7546-E3A3-4970-857C-C3D7C5DA5069', 1, 'EntityBaseView', 'EntityBaseView', NOW(), NOW());

/* SQL text to insert entity field value with ID 4e9499aa-dfa2-4136-a1db-96fc9723d4c5 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('4e9499aa-dfa2-4136-a1db-96fc9723d4c5', '220A7546-E3A3-4970-857C-C3D7C5DA5069', 2, 'Query', 'Query', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 220A7546-E3A3-4970-857C-C3D7C5DA5069 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='220A7546-E3A3-4970-857C-C3D7C5DA5069';

/* SQL text to insert entity field value with ID cfee325e-8083-4704-9861-bd9275360cae */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('cfee325e-8083-4704-9861-bd9275360cae', '5F7A88FC-346E-4165-9586-3873163FFA08', 1, 'BoundFixed', 'BoundFixed', NOW(), NOW());

/* SQL text to insert entity field value with ID 3d08948e-e3f6-46a3-bef3-51cfcfde8aa9 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('3d08948e-e3f6-46a3-bef3-51cfcfde8aa9', '5F7A88FC-346E-4165-9586-3873163FFA08', 2, 'None', 'None', NOW(), NOW());

/* SQL text to insert entity field value with ID f7355537-76ab-49e0-8926-13e676b0e849 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('f7355537-76ab-49e0-8926-13e676b0e849', '5F7A88FC-346E-4165-9586-3873163FFA08', 3, 'PerValueCache', 'PerValueCache', NOW(), NOW());

/* SQL text to insert entity field value with ID b2cdab44-af5e-4cfa-be26-d16a4e1ef6b9 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('b2cdab44-af5e-4cfa-be26-d16a4e1ef6b9', '5F7A88FC-346E-4165-9586-3873163FFA08', 4, 'RowFilterBroad', 'RowFilterBroad', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 5F7A88FC-346E-4165-9586-3873163FFA08 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='5F7A88FC-346E-4165-9586-3873163FFA08';

/* SQL text to insert entity field value with ID 6e0b5dfc-41dd-47a1-bc4e-65263711454e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('6e0b5dfc-41dd-47a1-bc4e-65263711454e', 'E9C7182E-612C-441A-9004-5B1FFD527181', 1, 'DirtyGroupRecompute', 'DirtyGroupRecompute', NOW(), NOW());

/* SQL text to insert entity field value with ID eff83664-0aeb-469b-8ab6-6ff5b47bdc56 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('eff83664-0aeb-469b-8ab6-6ff5b47bdc56', 'E9C7182E-612C-441A-9004-5B1FFD527181', 2, 'FullRebuild', 'FullRebuild', NOW(), NOW());

/* SQL text to insert entity field value with ID 98164d3b-bb86-41a9-a23e-5efde48a26c3 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('98164d3b-bb86-41a9-a23e-5efde48a26c3', 'E9C7182E-612C-441A-9004-5B1FFD527181', 3, 'Incremental', 'Incremental', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID E9C7182E-612C-441A-9004-5B1FFD527181 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='E9C7182E-612C-441A-9004-5B1FFD527181';

/* SQL text to insert entity field value with ID e806bf74-93a8-474a-834f-17aaba7401aa */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e806bf74-93a8-474a-834f-17aaba7401aa', '6AD0DE01-90F6-4988-928F-00A1AA588691', 1, 'Active', 'Active', NOW(), NOW());

/* SQL text to insert entity field value with ID cefd10de-ac95-4ef1-8ada-524e6ef5c3b5 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('cefd10de-ac95-4ef1-8ada-524e6ef5c3b5', '6AD0DE01-90F6-4988-928F-00A1AA588691', 2, 'Building', 'Building', NOW(), NOW());

/* SQL text to insert entity field value with ID 73f603f9-3036-454c-9a9e-7116534bee7d */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('73f603f9-3036-454c-9a9e-7116534bee7d', '6AD0DE01-90F6-4988-928F-00A1AA588691', 3, 'Disabled', 'Disabled', NOW(), NOW());

/* SQL text to insert entity field value with ID e327b83b-24f4-4477-bea4-7dcb3d8e499b */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e327b83b-24f4-4477-bea4-7dcb3d8e499b', '6AD0DE01-90F6-4988-928F-00A1AA588691', 4, 'DriftHold', 'DriftHold', NOW(), NOW());

/* SQL text to insert entity field value with ID 994999a7-1ecc-494b-aca8-4f8befc66c34 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('994999a7-1ecc-494b-aca8-4f8befc66c34', '6AD0DE01-90F6-4988-928F-00A1AA588691', 5, 'Stale', 'Stale', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 6AD0DE01-90F6-4988-928F-00A1AA588691 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='6AD0DE01-90F6-4988-928F-00A1AA588691';


/* Create Entity Relationship: MJ: Materialized Results -> MJ: Materialized Result Queries (One To Many via MaterializedResultID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9036d2f9-0a1f-4a5a-9766-8185817046d5'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('9036d2f9-0a1f-4a5a-9766-8185817046d5', 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', 'MaterializedResultID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f3a33a4d-944e-40f7-a74b-bd384a6c909d'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f3a33a4d-944e-40f7-a74b-bd384a6c909d', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', 'SourceEntityID', 'One To Many', TRUE, TRUE, 74, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5c86af12-934b-4baf-9108-db2ca4658876'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('5c86af12-934b-4baf-9108-db2ca4658876', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', 'GeneratedEntityID', 'One To Many', TRUE, TRUE, 75, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'cd9f0517-320b-4b39-a576-849620510e97'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('cd9f0517-320b-4b39-a576-849620510e97', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', 'QueryID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '96918760-8cde-4e99-86fb-569cb3f59dc7' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'SourceEntity')
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
        '96918760-8cde-4e99-86fb-569cb3f59dc7',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 26,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '39040122-3182-4899-bed9-32749af785bb' OR ("EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND "Name" = 'GeneratedEntity')
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
        '39040122-3182-4899-bed9-32749af785bb',
        'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- "Entity": "MJ": "Materialized" "Results"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 27,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a994e214-1cb5-4e13-9f04-45eaefeedf1c' OR ("EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND "Name" = 'Query')
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
        'a994e214-1cb5-4e13-9f04-45eaefeedf1c',
        'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- "Entity": "MJ": "Materialized" "Result" "Queries"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 6,
        'Query',
        'Query',
        NULL,
        'TEXT',
        510,
        0,
        0,
        FALSE,
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

DO $$ BEGIN GRANT SELECT ON __mj."vwMaterializedResultQueries" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Materialized Result Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Result Queries
-- Item: Permissions for vwMaterializedResultQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwMaterializedResultQueries" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Materialized Result Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Result Queries
-- Item: spCreateMaterializedResultQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MaterializedResultQuery
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateMaterializedResultQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Materialized Result Queries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateMaterializedResultQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Materialized Result Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Result Queries
-- Item: spUpdateMaterializedResultQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MaterializedResultQuery
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateMaterializedResultQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateMaterializedResultQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Materialized Result Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Result Queries
-- Item: spDeleteMaterializedResultQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MaterializedResultQuery
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMaterializedResultQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Materialized Result Queries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMaterializedResultQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for MaterializedResult */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Results
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SourceEntityID in table MaterializedResult;

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


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."MaterializedResult"."SourceType" IS 'Which materialization door produced this row: ''Query'' (a materialized stored Query, surfaced as a new read-only Virtual Entity; the source query is linked via the MaterializedResultQuery join table) or ''EntityBaseView'' (a 1:1 materialized copy of an existing entity''s base view, which reuses the source entity).';

COMMENT ON COLUMN __mj."MaterializedResult"."SourceEntityID" IS 'For the EntityBaseView case, the existing entity whose base view is materialized (RLS applies unchanged). NULL for the Query case (whose source query is linked via the MaterializedResultQuery join table).';

COMMENT ON COLUMN __mj."MaterializedResult"."GeneratedEntityID" IS 'For the Query case, the new read-only Virtual Entity CodeGen mints for the materialized result shape. NULL for the EntityBaseView case (which reuses the source entity).';

COMMENT ON COLUMN __mj."MaterializedResult"."SchemaName" IS 'Schema of the physical materialized table and its wrapper view.';

COMMENT ON COLUMN __mj."MaterializedResult"."TableName" IS 'Physical materialized table (swappable storage, repointed on atomic refresh). Convention: materialized_<Name>.';

COMMENT ON COLUMN __mj."MaterializedResult"."ViewName" IS 'Wrapper view (the stable read contract; body is SELECT * FROM the physical table). Convention: materialized_vw<Name>. The atomic swap repoints this view, never truncates the table in place.';

COMMENT ON COLUMN __mj."MaterializedResult"."ParamMode" IS 'Parameterization classification: ''None'' (unparameterized), ''RowFilterBroad'' (materialize broad, filter at read), ''PerValueCache'' (bounded structural variant), or ''BoundFixed'' (params bound to fixed values). v1 supports ''None'' and ''RowFilterBroad''; ''PerValueCache'' and ''BoundFixed'' are reserved for later phases.';

COMMENT ON COLUMN __mj."MaterializedResult"."RefreshStrategy" IS 'Refresh strategy: ''FullRebuild'' (rebuild the whole result), ''Incremental'' (MERGE on the surrogate key), or ''DirtyGroupRecompute'' (recompute groups changed since Watermark). v1 ships all three: ''FullRebuild'' for unkeyed materializations, and ''Incremental''/''DirtyGroupRecompute'' auto-selected by CodeGen for eligible keyed aggregations.';

COMMENT ON COLUMN __mj."MaterializedResult"."RefreshSchedule" IS 'Cron expression for scheduled rehydration via the ScheduledJobEngine. NULL means manual refresh only. Stagger across materializations to avoid refresh-window contention.';

COMMENT ON COLUMN __mj."MaterializedResult"."LastRefreshedAt" IS 'Timestamp of the last successful refresh (freshness surfacing for the selection contract).';

COMMENT ON COLUMN __mj."MaterializedResult"."NextRefreshAt" IS 'Next scheduled refresh time, computed from RefreshSchedule; the scheduler reads this as its due-work signal.';

COMMENT ON COLUMN __mj."MaterializedResult"."Watermark" IS 'Last-seen MAX(__mj_UpdatedAt) of the source data; the staleness probe for incremental / dirty-group refresh. Reuses the existing query smart-cache fingerprint pattern.';

COMMENT ON COLUMN __mj."MaterializedResult"."Status" IS 'Lifecycle state: ''Building'' (materializing), ''Active'' (fresh, readable), ''Stale'' (past expected freshness), ''Disabled'' (turned off), ''DriftHold'' (upstream schema drift detected; held for review).';

COMMENT ON COLUMN __mj."MaterializedResult"."RowCount" IS 'Approximate row count of the last build — part of the cost/size profile an agent (Skip) uses to choose live vs. materialized.';

COMMENT ON COLUMN __mj."MaterializedResult"."ApproxBuildCostMs" IS 'Approximate build cost in milliseconds of the last refresh — part of the cost/size profile for the selection contract.';

COMMENT ON COLUMN __mj."MaterializedResult"."IntendedWorkload" IS 'Human/structured note describing what this materialization is good for; surfaced in the selection contract so callers pick the right variant.';

COMMENT ON COLUMN __mj."MaterializedResult"."RowFilterColumns" IS 'JSON array of the output column names that the row-filter parameters map to. Populated when ParamMode is RowFilterBroad. The materialization holds all rows broad and these columns are filtered at read time (plan section 6.4). NULL for non-row-filter materializations.';

COMMENT ON COLUMN __mj."MaterializedResult"."BroadSQL" IS 'For a RowFilterBroad materialization, the broad source SELECT that the refresh engine materializes: the source query with its row-filter WHERE predicates removed, so the materialized table holds every row the query could return for any parameter value. NULL for non-parameterized materializations, which use the source query SQL directly.';

COMMENT ON COLUMN __mj."MaterializedResult"."KeyColumns" IS 'Phase 3: JSON array of the key columns ({name, type}) for a keyed/aggregation materialization — the combined key hashed into the surrogate (the stable match key for incremental refresh / dirty-group recompute). NULL means not keyed, in which case a synthetic IDENTITY/ROW_NUMBER surrogate is used.';

COMMENT ON COLUMN __mj."MaterializedResult"."SourceRowCount" IS 'Phase 3 (DirtyGroupRecompute): the SOURCE table row count observed at the last successful refresh. Delete-detection guard — if the current source COUNT(*) is lower than this, rows were deleted and the refresh falls back to a full rebuild (dirty-group recompute cannot localize deletes from surviving rows). NULL means no baseline yet (first run does a full rebuild and sets it). Distinct from RowCount, which counts materialized rows (groups).';

COMMENT ON COLUMN __mj."MaterializedResult"."RefreshesSinceFullRebuild" IS 'Count of consecutive incremental (Incremental/DirtyGroupRecompute) refreshes since the last full rebuild. The refresher forces a full rebuild once this reaches its threshold, reconciling drift that a balanced delete+insert (net-zero source row-count change) leaves uncaught by the delete-detection guard. Reset to 0 on every full rebuild; incremented on every incremental refresh.';

COMMENT ON COLUMN __mj."MaterializedResult"."ReadFilterSpec" IS 'For a RowFilterBroad materialization, a JSON array of read-time filter predicates — each { column, operator, paramName, kind } — that the runtime provider injects against the broad materialized table when a caller runs the query with DataSource=Materialized. operator is one of the read-time-safe set (=, !=, <>, <, >, <=, >=, IN, NOT IN); kind is scalar or list. Values are always bound as SQL parameters, never interpolated. NULL for non-row-filter materializations.';

COMMENT ON COLUMN __mj."MaterializedResultQuery"."MaterializedResultID" IS 'The materialization (MJ: Materialized Results) side of the query<->materialization link.';

COMMENT ON COLUMN __mj."MaterializedResultQuery"."QueryID" IS 'The source Query (MJ: Queries) whose result this materialization was built from. The link lives here (not as a direct FK on either table) to avoid the MaterializedResult<->Query circular dependency.';

COMMENT ON COLUMN __mj."Query"."IsMaterialized" IS 'Author''s declared intent that this Query should be materialized. CodeGen scans for IsMaterialized = 1 and, if the query qualifies (§9/§10), materializes it. The authoritative state lives on the linked MJ: Materialized Results row (found via the MaterializedResultQuery join table).';


-- ===================== Other =====================

/* ============================================================================
   Query & Entity Materialization — consolidated migration
   v6.1.x

   Companion plans:
     /plans/query-entity-materialization.md         (Phase 1 design)
     /plans/query-entity-materialization-phase2.md  (Phase 2 read-time injection)

   Single migration for the whole feature (supersedes the reverted per-step set:
   Foundation + RowFilter + KeyColumns + SourceRowCount + CodeGen + ForceFull-
   RebuildCadence + ReadFilterSpec). Creates the "MJ: Materialized Results" entity
   with its FINAL column shape in ONE correct CREATE TABLE (no incremental
   create→alter→codegen churn), the "MJ: Materialized Result Queries" join table,
   and the author-intent flag on Query. The CodeGen output (entity/field metadata,
   wrapper view, CRUD procs, permissions) is a SINGLE pass generated against this
   final schema and appended below after the DDL.

   DB-design note (circular-FK elimination): the original design put FKs in BOTH
   directions — MaterializedResult.SourceQueryID → Query AND Query.MaterializedResultID
   → MaterializedResult — which is a mutual FK cycle CodeGen rejects. The relationship
   is instead carried as rows in the dedicated join table __mj.MaterializedResultQuery
   (both FKs point OUTWARD → no cycle). A query's materialization is found via
   MaterializedResultQuery.QueryID; author intent is Query.IsMaterialized. There is no
   SourceQueryID or MaterializedResultID column.

   Note (CodeGen handles automatically — intentionally omitted below):
     - __mj_CreatedAt / __mj_UpdatedAt columns + triggers
     - Foreign-key indexes (IDX_AUTO_MJ_FKEY_*)
     - Entity / EntityField metadata (generated from this schema; the __mj schema's
       'MJ: ' EntityNamePrefix yields "MJ: Materialized Results" and
       "MJ: Materialized Result Queries")
   ============================================================================ */

-- ─── MJ: Materialized Results ────────────────────────────────────────────────
-- One row per materialization. Unifies both "front doors" (a materialized stored
-- Query, or a materialized entity base view) at the metadata layer, and is the
-- work queue the refresh scheduler reads. Final column shape (all phases).

/**********************************************************************************************************************
 * CodeGen Run Output — appended per MemberJunction single-migration convention (do NOT ship a separate CodeGen_Run file)
 *
 * The statements below are emitted by `mj codegen` for the two new entities created by the DDL above
 * (MJ: Materialized Results, MJ: Materialized Result Queries) and the Query.IsMaterialized field:
 * entity/field metadata, base views, CRUD stored procedures, permissions, and entity relationships.
 **********************************************************************************************************************/

/* SQL generated to create new entity MJ: Materialized Results */

/* SQL text to insert 31 new entity field(s) */

/* spUpdate Permissions for MJ: Materialized Result Queries */

/* spUpdate Permissions for MJ: Materialized Results */

/* spUpdate Permissions for MJ: Queries */
