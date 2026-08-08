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

-- ════════════════════════════════════════════════════════════════════════════════════
-- COLUMN SHAPE (relocated to run FIRST)
--
-- The T-SQL original performs these ALTERs before the CodeGen objects that depend on
-- them. The PG converter hoists CodeGen output (indexes, base views, CRUD sprocs) to
-- the top of the file and sinks raw-DDL passthroughs to the bottom, which inverted that
-- order: the index/view/sprocs below reference "ScheduledJobID" and were failing with
-- 'column "ScheduledJobID" does not exist'. Running the column DDL here restores the
-- original dependency order.
-- ════════════════════════════════════════════════════════════════════════════════════

-- T-SQL guarded this with IF COL_LENGTH(...) IS NOT NULL; PG expresses the same
-- idempotency natively with DROP COLUMN IF EXISTS.
-- CASCADE: the pre-existing vwContentSources base view (and any dependent CodeGen objects)
-- reference this column. T-SQL dropped those objects first; the PG converter recreates them
-- further down in this same migration, so cascading the drop and letting the regeneration
-- below restore them preserves the original end state.
ALTER TABLE __mj."ContentSource" DROP COLUMN IF EXISTS "ScheduledActionID" CASCADE;

-- T-SQL guarded this with IF COL_LENGTH(...) IS NULL. PG has ADD COLUMN IF NOT EXISTS,
-- but no ADD CONSTRAINT IF NOT EXISTS, so the FK is added inside a guarded DO block.
ALTER TABLE __mj."ContentSource" ADD COLUMN IF NOT EXISTS "ScheduledJobID" UUID NULL;

DO $fk$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'FK_ContentSource_ScheduledJob'
          AND conrelid = '__mj."ContentSource"'::regclass
    ) THEN
        ALTER TABLE __mj."ContentSource"
            ADD CONSTRAINT "FK_ContentSource_ScheduledJob"
            FOREIGN KEY ("ScheduledJobID") REFERENCES __mj."ScheduledJob"("ID");
    END IF;
END
$fk$;


-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID" ON __mj."ContentSource" ("ContentTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID" ON __mj."ContentSource" ("ContentSourceTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID" ON __mj."ContentSource" ("ContentFileTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID" ON __mj."ContentSource" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID" ON __mj."ContentSource" ("VectorIndexID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_EntityID" ON __mj."ContentSource" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_EntityDocumentID" ON __mj."ContentSource" ("EntityDocumentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_ScheduledJobID" ON __mj."ContentSource" ("ScheduledJobID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwContentSources';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentSources"
AS SELECT
    c.*,
    "MJContentType_ContentTypeID"."Name" AS "ContentType",
    "MJContentSourceType_ContentSourceTypeID"."Name" AS "ContentSourceType",
    "MJContentFileType_ContentFileTypeID"."Name" AS "ContentFileType",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel",
    "MJVectorIndex_VectorIndexID"."Name" AS "VectorIndex",
    "MJEntity_EntityID"."Name" AS "Entity",
    "MJEntityDocument_EntityDocumentID"."Name" AS "EntityDocument",
    "MJScheduledJob_ScheduledJobID"."Name" AS "ScheduledJob"
FROM
    __mj."ContentSource" AS c
INNER JOIN
    __mj."ContentType" AS "MJContentType_ContentTypeID"
  ON
    c."ContentTypeID" = "MJContentType_ContentTypeID"."ID"
INNER JOIN
    __mj."ContentSourceType" AS "MJContentSourceType_ContentSourceTypeID"
  ON
    c."ContentSourceTypeID" = "MJContentSourceType_ContentSourceTypeID"."ID"
INNER JOIN
    __mj."ContentFileType" AS "MJContentFileType_ContentFileTypeID"
  ON
    c."ContentFileTypeID" = "MJContentFileType_ContentFileTypeID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    c."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS "MJVectorIndex_VectorIndexID"
  ON
    c."VectorIndexID" = "MJVectorIndex_VectorIndexID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    c."EntityID" = "MJEntity_EntityID"."ID"
LEFT OUTER JOIN
    __mj."EntityDocument" AS "MJEntityDocument_EntityDocumentID"
  ON
    c."EntityDocumentID" = "MJEntityDocument_EntityDocumentID"."ID"
LEFT OUTER JOIN
    __mj."ScheduledJob" AS "MJScheduledJob_ScheduledJobID"
  ON
    c."ScheduledJobID" = "MJScheduledJob_ScheduledJobID"."ID"$vsql$;
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

-- SKIPPED: procedure (auto-conversion not supported)
-- -- ════════════════════════════════════════════════════════════════════════════════════
-- -- Harden spDeleteEntityWithCoreDependencies before the generated block runs.
-- --
-- -- The generated block below de...

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateContentSource'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateContentSource"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name_Clear BOOLEAN DEFAULT FALSE,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_ContentTypeID UUID DEFAULT NULL,
    IN p_ContentSourceTypeID UUID DEFAULT NULL,
    IN p_ContentFileTypeID UUID DEFAULT NULL,
    IN p_URL VARCHAR(2000) DEFAULT NULL,
    IN p_EmbeddingModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_VectorIndexID_Clear BOOLEAN DEFAULT FALSE,
    IN p_VectorIndexID UUID DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_EntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_EntityDocumentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityDocumentID UUID DEFAULT NULL,
    IN p_SegmenterKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_SegmenterKey VARCHAR(100) DEFAULT NULL,
    IN p_CleanerKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_CleanerKey VARCHAR(100) DEFAULT NULL,
    IN p_ScheduledJobID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScheduledJobID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwContentSources" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentSource"
            (
                "ID",
                "Name",
                "ContentTypeID",
                "ContentSourceTypeID",
                "ContentFileTypeID",
                "URL",
                "EmbeddingModelID",
                "VectorIndexID",
                "Configuration",
                "EntityID",
                "EntityDocumentID",
                "SegmenterKey",
                "CleanerKey",
                "ScheduledJobID"
            )
        VALUES
            (
                p_ID,
                CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, NULL) END,
                p_ContentTypeID,
                p_ContentSourceTypeID,
                p_ContentFileTypeID,
                p_URL,
                CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, NULL) END,
                CASE WHEN p_VectorIndexID_Clear = TRUE THEN NULL ELSE COALESCE(p_VectorIndexID, NULL) END,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, NULL) END,
                CASE WHEN p_EntityDocumentID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityDocumentID, NULL) END,
                CASE WHEN p_SegmenterKey_Clear = TRUE THEN NULL ELSE COALESCE(p_SegmenterKey, NULL) END,
                CASE WHEN p_CleanerKey_Clear = TRUE THEN NULL ELSE COALESCE(p_CleanerKey, NULL) END,
                CASE WHEN p_ScheduledJobID_Clear = TRUE THEN NULL ELSE COALESCE(p_ScheduledJobID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentSource"
            (
                "Name",
                "ContentTypeID",
                "ContentSourceTypeID",
                "ContentFileTypeID",
                "URL",
                "EmbeddingModelID",
                "VectorIndexID",
                "Configuration",
                "EntityID",
                "EntityDocumentID",
                "SegmenterKey",
                "CleanerKey",
                "ScheduledJobID"
            )
        VALUES
            (
                CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, NULL) END,
                p_ContentTypeID,
                p_ContentSourceTypeID,
                p_ContentFileTypeID,
                p_URL,
                CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, NULL) END,
                CASE WHEN p_VectorIndexID_Clear = TRUE THEN NULL ELSE COALESCE(p_VectorIndexID, NULL) END,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, NULL) END,
                CASE WHEN p_EntityDocumentID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityDocumentID, NULL) END,
                CASE WHEN p_SegmenterKey_Clear = TRUE THEN NULL ELSE COALESCE(p_SegmenterKey, NULL) END,
                CASE WHEN p_CleanerKey_Clear = TRUE THEN NULL ELSE COALESCE(p_CleanerKey, NULL) END,
                CASE WHEN p_ScheduledJobID_Clear = TRUE THEN NULL ELSE COALESCE(p_ScheduledJobID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentSources" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateContentSource'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateContentSource"(
    IN p_ID UUID,
    IN p_Name_Clear BOOLEAN DEFAULT FALSE,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_ContentTypeID UUID DEFAULT NULL,
    IN p_ContentSourceTypeID UUID DEFAULT NULL,
    IN p_ContentFileTypeID UUID DEFAULT NULL,
    IN p_URL VARCHAR(2000) DEFAULT NULL,
    IN p_EmbeddingModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_VectorIndexID_Clear BOOLEAN DEFAULT FALSE,
    IN p_VectorIndexID UUID DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_EntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_EntityDocumentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityDocumentID UUID DEFAULT NULL,
    IN p_SegmenterKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_SegmenterKey VARCHAR(100) DEFAULT NULL,
    IN p_CleanerKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_CleanerKey VARCHAR(100) DEFAULT NULL,
    IN p_ScheduledJobID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScheduledJobID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwContentSources" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentSource"
    SET
        "Name" = CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE COALESCE(p_Name, "Name") END,
        "ContentTypeID" = COALESCE(p_ContentTypeID, "ContentTypeID"),
        "ContentSourceTypeID" = COALESCE(p_ContentSourceTypeID, "ContentSourceTypeID"),
        "ContentFileTypeID" = COALESCE(p_ContentFileTypeID, "ContentFileTypeID"),
        "URL" = COALESCE(p_URL, "URL"),
        "EmbeddingModelID" = CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, "EmbeddingModelID") END,
        "VectorIndexID" = CASE WHEN p_VectorIndexID_Clear = TRUE THEN NULL ELSE COALESCE(p_VectorIndexID, "VectorIndexID") END,
        "Configuration" = CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, "Configuration") END,
        "EntityID" = CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, "EntityID") END,
        "EntityDocumentID" = CASE WHEN p_EntityDocumentID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityDocumentID, "EntityDocumentID") END,
        "SegmenterKey" = CASE WHEN p_SegmenterKey_Clear = TRUE THEN NULL ELSE COALESCE(p_SegmenterKey, "SegmenterKey") END,
        "CleanerKey" = CASE WHEN p_CleanerKey_Clear = TRUE THEN NULL ELSE COALESCE(p_CleanerKey, "CleanerKey") END,
        "ScheduledJobID" = CASE WHEN p_ScheduledJobID_Clear = TRUE THEN NULL ELSE COALESCE(p_ScheduledJobID, "ScheduledJobID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentSources" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentSources" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentSource'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentSource"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentSource"
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
           WHERE proname = 'spDeleteEntityDocument'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocument"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJContentSources_EntityDocumentIDID UUID;
    p_MJContentSources_EntityDocumentID_Name VARCHAR(255);
    p_MJContentSources_EntityDocumentID_ContentTypeID UUID;
    p_MJContentSources_EntityDocumentID_ContentSourceTypeID UUID;
    p_MJContentSources_EntityDocumentID_ContentFileTypeID UUID;
    p_MJContentSources_EntityDocumentID_URL VARCHAR(2000);
    p_MJContentSources_EntityDocumentID_EmbeddingModelID UUID;
    p_MJContentSources_EntityDocumentID_VectorIndexID UUID;
    p_MJContentSources_EntityDocumentID_Configuration TEXT;
    p_MJContentSources_EntityDocumentID_EntityID UUID;
    p_MJContentSources_EntityDocumentID_EntityDocumentID UUID;
    p_MJContentSources_EntityDocumentID_SegmenterKey VARCHAR(100);
    p_MJContentSources_EntityDocumentID_CleanerKey VARCHAR(100);
    p_MJContentSources_EntityDocumentID_ScheduledJobID UUID;
    p_MJEntityDocumentRuns_EntityDocumentIDID UUID;
    p_MJEntityDocumentSettings_EntityDocumentIDID UUID;
    p_MJEntityRecordDocuments_EntityDocumentIDID UUID;
BEGIN
-- Cascade update on ContentSource using cursor to call spUpdateContentSource


    FOR _rec IN SELECT "ID", "Name", "ContentTypeID", "ContentSourceTypeID", "ContentFileTypeID", "URL", "EmbeddingModelID", "VectorIndexID", "Configuration", "EntityID", "EntityDocumentID", "SegmenterKey", "CleanerKey", "ScheduledJobID" FROM __mj."ContentSource" WHERE "EntityDocumentID" = p_ID
    LOOP
        p_MJContentSources_EntityDocumentIDID := _rec."ID";
        p_MJContentSources_EntityDocumentID_Name := _rec."Name";
        p_MJContentSources_EntityDocumentID_ContentTypeID := _rec."ContentTypeID";
        p_MJContentSources_EntityDocumentID_ContentSourceTypeID := _rec."ContentSourceTypeID";
        p_MJContentSources_EntityDocumentID_ContentFileTypeID := _rec."ContentFileTypeID";
        p_MJContentSources_EntityDocumentID_URL := _rec."URL";
        p_MJContentSources_EntityDocumentID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJContentSources_EntityDocumentID_VectorIndexID := _rec."VectorIndexID";
        p_MJContentSources_EntityDocumentID_Configuration := _rec."Configuration";
        p_MJContentSources_EntityDocumentID_EntityID := _rec."EntityID";
        p_MJContentSources_EntityDocumentID_EntityDocumentID := _rec."EntityDocumentID";
        p_MJContentSources_EntityDocumentID_SegmenterKey := _rec."SegmenterKey";
        p_MJContentSources_EntityDocumentID_CleanerKey := _rec."CleanerKey";
        p_MJContentSources_EntityDocumentID_ScheduledJobID := _rec."ScheduledJobID";
        -- Set the FK field to NULL
        p_MJContentSources_EntityDocumentID_EntityDocumentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateContentSource"(p_ID => p_MJContentSources_EntityDocumentIDID, p_Name => p_MJContentSources_EntityDocumentID_Name, p_ContentTypeID => p_MJContentSources_EntityDocumentID_ContentTypeID, p_ContentSourceTypeID => p_MJContentSources_EntityDocumentID_ContentSourceTypeID, p_ContentFileTypeID => p_MJContentSources_EntityDocumentID_ContentFileTypeID, p_URL => p_MJContentSources_EntityDocumentID_URL, p_EmbeddingModelID => p_MJContentSources_EntityDocumentID_EmbeddingModelID, p_VectorIndexID => p_MJContentSources_EntityDocumentID_VectorIndexID, p_Configuration => p_MJContentSources_EntityDocumentID_Configuration, p_EntityID => p_MJContentSources_EntityDocumentID_EntityID, p_EntityDocumentID_Clear => 1, p_EntityDocumentID => p_MJContentSources_EntityDocumentID_EntityDocumentID, p_SegmenterKey => p_MJContentSources_EntityDocumentID_SegmenterKey, p_CleanerKey => p_MJContentSources_EntityDocumentID_CleanerKey, p_ScheduledJobID => p_MJContentSources_EntityDocumentID_ScheduledJobID);

    END LOOP;

    
    -- Cascade delete from EntityDocumentRun using cursor to call spDeleteEntityDocumentRun

    FOR _rec IN SELECT "ID" FROM __mj."EntityDocumentRun" WHERE "EntityDocumentID" = p_ID
    LOOP
        p_MJEntityDocumentRuns_EntityDocumentIDID := _rec."ID";
        PERFORM __mj."spDeleteEntityDocumentRun"(p_ID => p_MJEntityDocumentRuns_EntityDocumentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from EntityDocumentSetting using cursor to call spDeleteEntityDocumentSetting

    FOR _rec IN SELECT "ID" FROM __mj."EntityDocumentSetting" WHERE "EntityDocumentID" = p_ID
    LOOP
        p_MJEntityDocumentSettings_EntityDocumentIDID := _rec."ID";
        PERFORM __mj."spDeleteEntityDocumentSetting"(p_ID => p_MJEntityDocumentSettings_EntityDocumentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from EntityRecordDocument using cursor to call spDeleteEntityRecordDocument

    FOR _rec IN SELECT "ID" FROM __mj."EntityRecordDocument" WHERE "EntityDocumentID" = p_ID
    LOOP
        p_MJEntityRecordDocuments_EntityDocumentIDID := _rec."ID";
        PERFORM __mj."spDeleteEntityRecordDocument"(p_ID => p_MJEntityRecordDocuments_EntityDocumentIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."EntityDocument"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentSource_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentSource" ON __mj."ContentSource";
CREATE TRIGGER "trgUpdateContentSource"
    BEFORE UPDATE ON __mj."ContentSource"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentSource_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $mj$
BEGIN
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- 2. Clear Record-Set-Processing run history pointing at the doomed entities
  --
  --    CodeGen prunes entity metadata via spDeleteEntityWithCoreDependencies, but that proc
  --    predates Record Set Processing and does not cascade ProcessRun / ProcessRunDetail. A
  --    left-behind run row makes the DELETE FROM Entity fail, and CodeGen then leaves a
  --    half-pruned entity (metadata row present, fields gone, no PK) that breaks every
  --    subsequent CodeGen run with "has no primary key field in metadata".
  --
  --    This runs BEFORE the tables drop, while the Entity rows are still resolvable by name.
  --    NOTE: the proc covers only ~18 of the ~73 FK references to Entity repo-wide — the
  --    general gap is tracked separately; this handles the references Phase 0 actually hits.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- T-SQL used a table variable (DECLARE @DoomedEntityIDs TABLE). PG has no table
  -- variables; an ON COMMIT DROP temp table is the direct equivalent and is scoped to
  -- this migration's transaction.
  CREATE TEMP TABLE v_DoomedEntityIDs ("ID" uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO v_DoomedEntityIDs ("ID")
  SELECT "ID" FROM __mj."Entity"
  WHERE "Name" IN (
  'MJ: Workflows', 'MJ: Workflow Runs', 'MJ: Workflow Engines',
  'MJ: Reports', 'MJ: Report Categories', 'MJ: Report Snapshots',
  'MJ: Report User States', 'MJ: Report Versions',
  'MJ: Scheduled Actions', 'MJ: Scheduled Action Params',
  'MJ: Output Trigger Types'
  );
  -- Details first (they reference ProcessRun), then the runs themselves.
  DELETE FROM __mj."ProcessRunDetail"
  WHERE "EntityID" IN (SELECT "ID" FROM v_DoomedEntityIDs)
  OR "ProcessRunID" IN (
  SELECT "ID" FROM __mj."ProcessRun"
  WHERE "EntityID" IN (SELECT "ID" FROM v_DoomedEntityIDs)
  );
  DELETE FROM __mj."ProcessRun"
  WHERE "EntityID" IN (SELECT "ID" FROM v_DoomedEntityIDs);
END $mj$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- spDeleteEntityWithCoreDependencies — hardened (see the SQL Server original for rationale).
--
-- The T-SQL source is an ALTER PROC with an @EntityID parameter. The converter emitted the
-- procedure BODY at top level and dropped the wrapper, leaving bare @"EntityID" references
-- that are not valid PG. Restored as a PL/pgSQL function with the parameter as p_EntityID.
-- CREATE OR REPLACE matches ALTER PROC semantics: the routine already exists from earlier
-- migrations and is being redefined here.
-- ════════════════════════════════════════════════════════════════════════════════════
-- RETURNS SETOF record matches the existing contract established by the v5.46 baseline.
-- CREATE OR REPLACE cannot change a function's return type, and callers may SELECT from it,
-- so the signature is preserved verbatim; the body returns no rows, exactly as before.
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityWithCoreDependencies"(p_EntityID uuid)
RETURNS SETOF record
LANGUAGE plpgsql
AS $spdel$
BEGIN
    DELETE FROM "__mj"."EntityFieldValue" WHERE "EntityFieldID" IN (SELECT "ID" FROM "__mj"."EntityField" WHERE "EntityID" = p_EntityID);

    DELETE FROM "__mj"."EntitySetting" WHERE "EntityID" = p_EntityID;

    DELETE FROM "__mj"."EntityField" WHERE "EntityID" = p_EntityID;

    DELETE FROM "__mj"."EntityPermission" WHERE "EntityID" = p_EntityID;

    DELETE FROM "__mj"."EntityRelationship" WHERE "EntityID" = p_EntityID OR "RelatedEntityID" = p_EntityID;

    DELETE FROM "__mj"."UserApplicationEntity" WHERE "EntityID" = p_EntityID;

    DELETE FROM "__mj"."ApplicationEntity" WHERE "EntityID" = p_EntityID;

    DELETE FROM "__mj"."RecordChange" WHERE "EntityID" = p_EntityID;

    DELETE FROM "__mj"."AuditLog" WHERE "EntityID"=p_EntityID;

    DELETE FROM __mj."Conversation" WHERE "LinkedEntityID"=p_EntityID;

    DELETE FROM "__mj"."ListDetail" WHERE "ListID" IN (SELECT "ID" FROM "__mj"."List" WHERE "EntityID"=p_EntityID);

    DELETE FROM "__mj"."List" WHERE "EntityID"=p_EntityID;

    DELETE FROM __mj."EntityDocument" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."CompanyIntegrationRecordMap" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."ResourceType" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."UserApplicationEntity" WHERE "EntityID" = p_EntityID;

    UPDATE "__mj"."Dataset" SET "__mj_UpdatedAt"=NOW() WHERE "ID" IN (SELECT "DatasetID" FROM "__mj"."DatasetItem" WHERE "EntityID"=p_EntityID);

    DELETE FROM __mj."DatasetItem" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."UserViewCategory" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."UserView" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."EntityAIAction" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."EntityCommunicationMessageType" WHERE "EntityID" = p_EntityID;

    DELETE FROM __mj."EntityAIAction" WHERE "OutputEntityID" = p_EntityID;

    -- Clear inbound metadata references from OTHER entities' fields that point AT this entity,
    -- so the Entity row can be deleted without tripping FK_EntityField_RelatedEntity.

    UPDATE "__mj"."EntityField" SET "RelatedEntityID" = NULL WHERE "RelatedEntityID" = p_EntityID;

    DELETE FROM "__mj"."Entity" WHERE "ID" = p_EntityID;
END
$spdel$;

GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityWithCoreDependencies"(uuid) TO "cdp_Developer", "cdp_Integration";

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '80731e62-5565-4cff-9d75-faecee04174c' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ScheduledJobID')
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
        '80731e62-5565-4cff-9d75-faecee04174c',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100032,
        'ScheduledJobID',
        'Scheduled Job ID',
        'Optional link to the Scheduled Job that runs this content source on a recurring basis. Replaces the retired ScheduledActionID link; the job is of type Action and carries its action + parameters in ScheduledJob.Configuration.',
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
        'F48D2E6C-61C8-46B8-A617-C8228601EB3C',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5d0d1c7b-ee57-4c57-882e-ee26eaa71d98' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ContentType')
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
        '5d0d1c7b-ee57-4c57-882e-ee26eaa71d98',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100033,
        'ContentType',
        'Content Type',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '945c4930-b4b0-4f5e-8dfb-5e32cfbc041a' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ContentSourceType')
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
        '945c4930-b4b0-4f5e-8dfb-5e32cfbc041a',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100034,
        'ContentSourceType',
        'Content Source Type',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d41567a-2390-45f1-8946-61dd1b0f0fc5' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ContentFileType')
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
        '4d41567a-2390-45f1-8946-61dd1b0f0fc5',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100035,
        'ContentFileType',
        'Content File Type',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '81ac4181-080e-4240-b179-1e6c614d5a6f' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EmbeddingModel')
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
        '81ac4181-080e-4240-b179-1e6c614d5a6f',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100036,
        'EmbeddingModel',
        'Embedding Model',
        NULL,
        'TEXT',
        100,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cbb79f88-3b83-4064-be73-18b36f2a5108' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'VectorIndex')
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
        'cbb79f88-3b83-4064-be73-18b36f2a5108',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100037,
        'VectorIndex',
        'Vector Index',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd4b0a56-254f-4cfe-9676-2a8f187ad570' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'Entity')
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
        'cd4b0a56-254f-4cfe-9676-2a8f187ad570',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100038,
        'Entity',
        'Entity',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '148af964-91bc-4047-a272-503becab69a7' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EntityDocument')
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
        '148af964-91bc-4047-a272-503becab69a7',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100039,
        'EntityDocument',
        'Entity Document',
        NULL,
        'TEXT',
        500,
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
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '17d9b2bb-b393-4cde-a455-5aa2e18bc36e'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('17d9b2bb-b393-4cde-a455-5aa2e18bc36e', 'F48D2E6C-61C8-46B8-A617-C8228601EB3C', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ScheduledJobID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a0ffaad7-8c9d-41f8-b2f4-d99a3c6b459d' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ScheduledJob')
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
        'a0ffaad7-8c9d-41f8-b2f4-d99a3c6b459d',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100047,
        'ScheduledJob',
        'Scheduled Job',
        NULL,
        'TEXT',
        400,
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

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5D0D1C7B-EE57-4C57-882E-EE26EAA71D98'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '945C4930-B4B0-4F5E-8DFB-5E32CFBC041A'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'BFB7433E-F36B-1410-867F-007B559E242F'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 24 fields */

-- UPDATE Entity Field Category Info MJ: Content Sources.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A1B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C5B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CBB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.Name

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A7B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceTypeID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B3B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.URL

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = 'BFB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceType

UPDATE __mj."EntityField"
SET 
   "Category" = 'Connection Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Source Type Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '945C4930-B4B0-4F5E-8DFB-5E32CFBC041A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentTypeID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ADB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentFileTypeID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B9B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentType

UPDATE __mj."EntityField"
SET 
   "Category" = 'Content Classification',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Type Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5D0D1C7B-EE57-4C57-882E-EE26EAA71D98' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentFileType

UPDATE __mj."EntityField"
SET 
   "Category" = 'Content Classification',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content File Type Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D41567A-2390-45F1-8946-61DD1B0F0FC5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModelID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '045043FD-61A9-477F-82A7-72A7FC615A3C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.VectorIndexID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '11091434-73BD-4006-8C65-8639EA9AF1F3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModel

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Indexing',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Embedding Model Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '81AC4181-080E-4240-B179-1E6C614D5A6F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.VectorIndex

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Indexing',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Vector Index Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CBB79F88-3B83-4064-BE73-18B36F2A5108' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.Configuration

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '3402501E-8128-40E0-BCF8-1BC2867C3931' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3F8AEC67-CBBB-47BE-96C8-70795F10849C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityDocumentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Document Template',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7BFD47B8-2B7B-4D5E-AF0F-510B6DA68FAA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.SegmenterKey

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '012C715A-4846-4910-9D64-35C7327FA213' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.CleanerKey

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '22F6A2EE-FE1A-4FE7-A946-9FE7743DE677' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.ScheduledJobID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing & Automation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Scheduled Job',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '80731E62-5565-4CFF-9D75-FAECEE04174C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.Entity

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing & Automation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CD4B0A56-254F-4CFE-9676-2A8F187AD570' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityDocument

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing & Automation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Document Template Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '148AF964-91BC-4047-A272-503BECAB69A7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Content Sources.ScheduledJob

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing & Automation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Scheduled Job Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A0FFAAD7-8C9D-41F8-B2F4-D99A3C6B459D' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwContentSources" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Permissions for vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentSources" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spCreateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Sources */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spUpdateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spDeleteContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Sources */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spDeleteEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityDocument
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Documents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert 1 new entity field(s) */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."ContentSource"."ScheduledJobID" IS 'Optional link to the Scheduled Job that runs this content source on a recurring basis. Replaces the retired ScheduledActionID link; the job is of type Action and carries its action + parameters in ScheduledJob.Configuration.';


-- ===================== Other =====================

-- NOTE: unrecognized batch type (UNKNOWN) — passed through as-is
-- PG has no "ON <table>" clause for DROP INDEX (that is T-SQL); the index is dropped by schema-qualified name.
DROP INDEX IF EXISTS __mj."IDX_AUTO_MJ_FKEY_ContentSource_ScheduledActionID";

-- [column DDL relocated to the top of this migration — see COLUMN SHAPE section]

-- [column DDL relocated to the top of this migration — see COLUMN SHAPE section]

-- ════════════════════════════════════════════════════════════════════════════════════
-- 3. Drop generated SQL objects belonging to the doomed entities
--    (views, CRUD procs). Their triggers and CHECK constraints drop with the tables.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════
-- 4. Drop the tables, children before parents
-- ════════════════════════════════════════════════════════════════════════════════════

-- Scheduled actions: ScheduledActionParam -> ScheduledAction

-- Reports: Snapshot/UserState/Version -> Report -> ReportCategory.
-- Report also carries the FKs to Workflow and OutputTriggerType, so it must precede both.

-- Skip v1-era workflow schema: WorkflowRun -> Workflow -> WorkflowEngine

/*
================================================================================================
================================================================================================
====                                                                                        ====
====                  GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL                          ====
====                          DO NOT EDIT BY HAND                                           ====
====                                                                                        ====
================================================================================================
================================================================================================

Everything below this block was produced by `mj codegen` against a CLEAN database built by
running every migration in ./migrations through and including the hand-written DDL above,
followed by `mj sync push --dir metadata`. It is the generated counterpart of that DDL.

WHAT IT CONTAINS
  * Removal of the 11 retired entities' metadata (spDeleteEntityWithCoreDependencies) and of
    their generated views and spCreate/spUpdate/spDelete procedures.
  * Two new EntityField rows for ContentSource — ScheduledJobID (the new FK) and ScheduledJob
    (its denormalized name) — plus the related-entity-name-field-map update for them.
  * The regenerated vwContentSources base view and ContentSource CRUD procedures, which the
    hand DDL above invalidated when it swapped ScheduledActionID for ScheduledJobID.

Verified on generation: every statement is attributable to the DDL above — there is no
unrelated fresh-install regeneration (no validator functions, no form-layout churn), and the
output references __mj throughout with no hardcoded schema name.

IF THE HAND-WRITTEN DDL ABOVE CHANGES, DO NOT PATCH THIS SECTION BY HAND.
Re-run CodeGen against a clean database and replace this entire generated section wholesale.
================================================================================================
*/

/* SQL text to remove entity MJ: Scheduled Actions */

/* spUpdate Permissions for MJ: Content Sources */
