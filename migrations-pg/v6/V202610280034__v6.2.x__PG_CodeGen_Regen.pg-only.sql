-- ============================================================================
-- PG-ONLY: CodeGen object regeneration for the v6.2.0-edge.6 content
--
-- WHY THIS FILE EXISTS. Four of this release's SQL Server migrations carry regenerated CodeGen objects
-- inline, but their PostgreSQL counterparts could not be baked: each had a transpile gap that was
-- finished by hand, and `mj migrate convert --split --bake-codegen` halts at a gap before baking
-- (DEPLOYMENT.md Step 8, defect 1). Without this file:
--   * V202610210233 DuplicateRun_EntityDocumentID — vwDuplicateRuns lacks EntityDocumentID and its
--     Entity Document name, and spCreate/spUpdateDuplicateRun lack the parameter; the FK index is missing;
--   * V202610222240 Recording_Ledger_Columns_Not_Entity_Updatable — spCreate/spUpdateAIAgentSession still
--     take the seven recording-ledger columns the release makes AllowUpdateAPI = 0;
--   * V202610252000 Content_Pipeline_Framework — the five Content entities' views and CRUD routines lack
--     the columns and status values this release adds;
--   * V202610261530 CodeGen_EntityField_Drift_Repairs — the routines its SQL Server tail regenerates.
-- The Metadata_Sync migration that follows calls routine signatures these objects create.
--
-- STAMPED BEFORE Metadata_Sync ON PURPOSE (202610280034 vs 202610280035), and after the last DDL it
-- regenerates against (202610271915). Same shape as V202610202323 (edge.5) and V202609011600.
--
-- SCOPE IS BY ENTITY, NOT BY DIFF, taken from those four SQL Server migrations' CodeGen tails:
--   DuplicateRun                 base view, permissions, spCreate/spUpdate/spDelete, FK index (EntityDocumentID)
--   ContentFileType, ContentItemChunk, ContentItem, ContentSource, ContentType
--                                FK indexes, base views, permissions, spCreate/spUpdate/spDelete
--   AIAgentSession               spCreate/spUpdate (without the seven recording-ledger columns)
--   AIAgentUserPolicy, ExternalDataSource, ExternalDataSourceType   spCreate/spUpdate
--   EntityFormContribution, MagicLinkRedemption                     spCreate
--   EntityDocument, Conversation, AIPromptRun, RubricEvaluation     spDelete
--
-- SOURCES. Verbatim `mj codegen --skipfiles --no-ai` output from its CodeGen_Run SQL log, captured against
-- a PostgreSQL database holding this release's DDL (the ten counterparts applied) and nothing else, with
-- ${flyway:defaultSchema} written as __mj. AIAgentSession's routines were captured with the release's
-- AllowUpdateAPI = 0 on the seven recording-ledger fields applied first, as the SQL Server tail was. The
-- routines whose entities CodeGen did not see as changed were captured with forceRegeneration scoped to
-- those entities. The DuplicateRun.EntityDocumentID FK index is written by hand in the existing
-- IDX_AUTO_MJ_FKEY_<Table>_<Column> form; CodeGen did not emit it.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- DuplicateRun.EntityDocumentID (V202610210233): the FK index the SQL Server tail creates.
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRun_EntityDocumentID"
    ON __mj."DuplicateRun" ("EntityDocumentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content File Types
-- Item: vwContentFileTypes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content File Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentFileType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwContentFileTypes"
AS
SELECT
    c.*
FROM
    "__mj"."ContentFileType" AS c
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwContentFileTypes'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwContentFileTypes'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwContentFileTypes" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwContentFileTypes" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwContentFileTypes" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentFileTypes" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: Content File Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content File Types
-- Item: Permissions for vwContentFileTypes
-- ============================================================
GRANT SELECT ON "__mj"."vwContentFileTypes" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwContentFileTypes" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentFileTypes" TO "cdp_Integration";

/* spCreate SQL for MJ: Content File Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content File Types
-- Item: spCreateContentFileType
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentFileType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentFileType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateContentFileType"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_fileextension_clear boolean DEFAULT false,
    p_fileextension varchar(255) DEFAULT NULL,
    p_bytesignature_clear boolean DEFAULT false,
    p_bytesignature TEXT DEFAULT NULL,
    p_istext_clear boolean DEFAULT false,
    p_istext BOOLEAN DEFAULT NULL,
    p_extractorkey_clear boolean DEFAULT false,
    p_extractorkey varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentFileTypes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ContentFileType"
        (
            "ID",
            "Name",
                "FileExtension",
                "ByteSignature",
                "IsText",
                "ExtractorKey"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_fileextension_clear = true THEN NULL ELSE COALESCE(p_fileextension, NULL) END,
                CASE WHEN p_bytesignature_clear = true THEN NULL ELSE COALESCE(p_bytesignature, NULL) END,
                CASE WHEN p_istext_clear = true THEN NULL ELSE COALESCE(p_istext, NULL) END,
                CASE WHEN p_extractorkey_clear = true THEN NULL ELSE COALESCE(p_extractorkey, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwContentFileTypes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentFileType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentFileType" TO "cdp_Integration";

/* spCreate Permissions for MJ: Content File Types */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentFileType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentFileType" TO "cdp_Integration";

/* spUpdate SQL for MJ: Content File Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content File Types
-- Item: spUpdateContentFileType
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentFileType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentFileType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateContentFileType"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_fileextension_clear boolean DEFAULT false,
    p_fileextension varchar(255) DEFAULT NULL,
    p_bytesignature_clear boolean DEFAULT false,
    p_bytesignature TEXT DEFAULT NULL,
    p_istext_clear boolean DEFAULT false,
    p_istext BOOLEAN DEFAULT NULL,
    p_extractorkey_clear boolean DEFAULT false,
    p_extractorkey varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentFileTypes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ContentFileType"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "FileExtension" = CASE WHEN p_fileextension_clear = true THEN NULL ELSE COALESCE(p_fileextension, "FileExtension") END,
        "ByteSignature" = CASE WHEN p_bytesignature_clear = true THEN NULL ELSE COALESCE(p_bytesignature, "ByteSignature") END,
        "IsText" = CASE WHEN p_istext_clear = true THEN NULL ELSE COALESCE(p_istext, "IsText") END,
        "ExtractorKey" = CASE WHEN p_extractorkey_clear = true THEN NULL ELSE COALESCE(p_extractorkey, "ExtractorKey") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwContentFileTypes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentFileType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentFileType" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentFileType table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_content_file_type"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_file_type" ON "__mj"."ContentFileType";

CREATE TRIGGER "trg_update_content_file_type"
BEFORE UPDATE ON "__mj"."ContentFileType"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_content_file_type"();

/* spUpdate Permissions for MJ: Content File Types */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentFileType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentFileType" TO "cdp_Integration";

/* spDelete SQL for MJ: Content File Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content File Types
-- Item: spDeleteContentFileType
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentFileType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentFileType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteContentFileType"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ContentFileType"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentFileType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentFileType" TO "cdp_Integration";

/* spDelete Permissions for MJ: Content File Types */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentFileType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentFileType" TO "cdp_Integration";

/* Hierarchy Metadata Function SQL for MJ: Content Item Chunks.ParentChunkID */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: fn_content_item_chunk_parent_chunk_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: ContentItemChunk.ParentChunkID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_chunk_parent_chunk_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentChunkID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItemChunk"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentChunkID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."ContentItemChunk" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentChunkID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."ContentItemChunk" WHERE "ParentChunkID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."ContentItemChunk" WHERE "ParentChunkID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentChunkID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;

/* Descendants Traversal Function SQL for MJ: Content Item Chunks.ParentChunkID */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: fn_content_item_chunk_parent_chunk_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: ContentItemChunk.ParentChunkID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_chunk_parent_chunk_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentChunkID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItemChunk"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentChunkID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItemChunk" c
        INNER JOIN
            cte_descendants p ON c."ParentChunkID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."ContentItemChunk" WHERE "ParentChunkID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."ContentItemChunk" WHERE "ParentChunkID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;

/* Ancestors Traversal Function SQL for MJ: Content Item Chunks.ParentChunkID */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: fn_content_item_chunk_parent_chunk_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: ContentItemChunk.ParentChunkID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_chunk_parent_chunk_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentChunkID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItemChunk"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentChunkID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."ContentItemChunk" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentChunkID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;

/* Root ID Function SQL for MJ: Content Item Chunks.ParentChunkID */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: fn_content_item_chunk_parent_chunk_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ContentItemChunk.ParentChunkID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_chunk_parent_chunk_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentChunkID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."ContentItemChunk"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentChunkID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."ContentItemChunk" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentChunkID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentChunkID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;

/* Base View SQL for MJ: Content Item Chunks */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: vwContentItemChunks
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Chunks
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentItemChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwContentItemChunks"
AS
SELECT
    c.*,
    MJContentItem_ContentItemID."Name" AS "ContentItem",
    MJContentItemChunk_ParentChunkID."SegmentTitle" AS "ParentChunk",
    hier_ParentChunkID."RootID" AS "RootParentChunkID",
    hier_ParentChunkID."Depth" AS "ParentChunkIDDepth",
    hier_ParentChunkID."Path" AS "ParentChunkIDPath",
    hier_ParentChunkID."IsLeaf" AS "ParentChunkIDIsLeaf",
    hier_ParentChunkID."ChildCount" AS "ParentChunkIDChildCount"
FROM
    "__mj"."ContentItemChunk" AS c
INNER JOIN
    "__mj"."ContentItem" AS MJContentItem_ContentItemID
  ON
    "c"."ContentItemID" = MJContentItem_ContentItemID."ID"
LEFT OUTER JOIN
    "__mj"."ContentItemChunk" AS MJContentItemChunk_ParentChunkID
  ON
    "c"."ParentChunkID" = MJContentItemChunk_ParentChunkID."ID"

LEFT JOIN LATERAL "__mj"."fn_content_item_chunk_parent_chunk_id_get_hierarchy_meta"(c."ID", c."ParentChunkID") AS hier_ParentChunkID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwContentItemChunks'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwContentItemChunks'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwContentItemChunks" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwContentItemChunks" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentItemChunks" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwContentItemChunks" TO "cdp_UI";

/* Base View Permissions SQL for MJ: Content Item Chunks */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: Permissions for vwContentItemChunks
-- ============================================================
GRANT SELECT ON "__mj"."vwContentItemChunks" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentItemChunks" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwContentItemChunks" TO "cdp_UI";

/* spCreate SQL for MJ: Content Item Chunks */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spCreateContentItemChunk
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateContentItemChunk"(
    p_id UUID DEFAULT NULL,
    p_contentitemid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_lastdeletedat_clear boolean DEFAULT false,
    p_lastdeletedat TIMESTAMPTZ DEFAULT NULL,
    p_modality varchar(20) DEFAULT NULL,
    p_startoffset_clear boolean DEFAULT false,
    p_startoffset int DEFAULT NULL,
    p_endoffset_clear boolean DEFAULT false,
    p_endoffset int DEFAULT NULL,
    p_startms_clear boolean DEFAULT false,
    p_startms int DEFAULT NULL,
    p_endms_clear boolean DEFAULT false,
    p_endms int DEFAULT NULL,
    p_pagenumber_clear boolean DEFAULT false,
    p_pagenumber int DEFAULT NULL,
    p_segmenttitle_clear boolean DEFAULT false,
    p_segmenttitle varchar(500) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transcript_clear boolean DEFAULT false,
    p_transcript TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_parentchunkid_clear boolean DEFAULT false,
    p_parentchunkid UUID DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_decorator_clear boolean DEFAULT false,
    p_decorator TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentItemChunks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ContentItemChunk"
        (
            "ID",
            "ContentItemID",
                "Sequence",
                "Text",
                "VectorRecordID",
                "EmbeddingStatus",
                "TaggingStatus",
                "DeleteStatus",
                "LastEmbeddedAt",
                "LastTaggedAt",
                "LastDeletedAt",
                "Modality",
                "StartOffset",
                "EndOffset",
                "StartMs",
                "EndMs",
                "PageNumber",
                "SegmentTitle",
                "Description",
                "Transcript",
                "SegmenterKey",
                "ParentChunkID",
                "FieldConfidence",
                "Decorator"
        )
    VALUES
        (
            v_new_id,
            p_contentitemid,
                p_sequence,
                CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, NULL) END,
                CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, NULL) END,
                COALESCE(p_embeddingstatus, 'Pending'),
                COALESCE(p_taggingstatus, 'Pending'),
                CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, NULL) END,
                CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, NULL) END,
                CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, NULL) END,
                CASE WHEN p_lastdeletedat_clear = true THEN NULL ELSE COALESCE(p_lastdeletedat, NULL) END,
                COALESCE(p_modality, 'text'),
                CASE WHEN p_startoffset_clear = true THEN NULL ELSE COALESCE(p_startoffset, NULL) END,
                CASE WHEN p_endoffset_clear = true THEN NULL ELSE COALESCE(p_endoffset, NULL) END,
                CASE WHEN p_startms_clear = true THEN NULL ELSE COALESCE(p_startms, NULL) END,
                CASE WHEN p_endms_clear = true THEN NULL ELSE COALESCE(p_endms, NULL) END,
                CASE WHEN p_pagenumber_clear = true THEN NULL ELSE COALESCE(p_pagenumber, NULL) END,
                CASE WHEN p_segmenttitle_clear = true THEN NULL ELSE COALESCE(p_segmenttitle, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_transcript_clear = true THEN NULL ELSE COALESCE(p_transcript, NULL) END,
                CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, NULL) END,
                CASE WHEN p_parentchunkid_clear = true THEN NULL ELSE COALESCE(p_parentchunkid, NULL) END,
                CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, NULL) END,
                CASE WHEN p_decorator_clear = true THEN NULL ELSE COALESCE(p_decorator, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwContentItemChunks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItemChunk" TO "cdp_Integration";

/* spCreate Permissions for MJ: Content Item Chunks */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItemChunk" TO "cdp_Integration";

/* spUpdate SQL for MJ: Content Item Chunks */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spUpdateContentItemChunk
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateContentItemChunk"(
    p_id UUID,
    p_contentitemid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_lastdeletedat_clear boolean DEFAULT false,
    p_lastdeletedat TIMESTAMPTZ DEFAULT NULL,
    p_modality varchar(20) DEFAULT NULL,
    p_startoffset_clear boolean DEFAULT false,
    p_startoffset int DEFAULT NULL,
    p_endoffset_clear boolean DEFAULT false,
    p_endoffset int DEFAULT NULL,
    p_startms_clear boolean DEFAULT false,
    p_startms int DEFAULT NULL,
    p_endms_clear boolean DEFAULT false,
    p_endms int DEFAULT NULL,
    p_pagenumber_clear boolean DEFAULT false,
    p_pagenumber int DEFAULT NULL,
    p_segmenttitle_clear boolean DEFAULT false,
    p_segmenttitle varchar(500) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transcript_clear boolean DEFAULT false,
    p_transcript TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_parentchunkid_clear boolean DEFAULT false,
    p_parentchunkid UUID DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_decorator_clear boolean DEFAULT false,
    p_decorator TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentItemChunks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ContentItemChunk"
    SET
        "ContentItemID" = COALESCE(p_contentitemid, "ContentItemID"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Text" = CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, "Text") END,
        "VectorRecordID" = CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, "VectorRecordID") END,
        "EmbeddingStatus" = COALESCE(p_embeddingstatus, "EmbeddingStatus"),
        "TaggingStatus" = COALESCE(p_taggingstatus, "TaggingStatus"),
        "DeleteStatus" = CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, "DeleteStatus") END,
        "LastEmbeddedAt" = CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, "LastEmbeddedAt") END,
        "LastTaggedAt" = CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, "LastTaggedAt") END,
        "LastDeletedAt" = CASE WHEN p_lastdeletedat_clear = true THEN NULL ELSE COALESCE(p_lastdeletedat, "LastDeletedAt") END,
        "Modality" = COALESCE(p_modality, "Modality"),
        "StartOffset" = CASE WHEN p_startoffset_clear = true THEN NULL ELSE COALESCE(p_startoffset, "StartOffset") END,
        "EndOffset" = CASE WHEN p_endoffset_clear = true THEN NULL ELSE COALESCE(p_endoffset, "EndOffset") END,
        "StartMs" = CASE WHEN p_startms_clear = true THEN NULL ELSE COALESCE(p_startms, "StartMs") END,
        "EndMs" = CASE WHEN p_endms_clear = true THEN NULL ELSE COALESCE(p_endms, "EndMs") END,
        "PageNumber" = CASE WHEN p_pagenumber_clear = true THEN NULL ELSE COALESCE(p_pagenumber, "PageNumber") END,
        "SegmentTitle" = CASE WHEN p_segmenttitle_clear = true THEN NULL ELSE COALESCE(p_segmenttitle, "SegmentTitle") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Transcript" = CASE WHEN p_transcript_clear = true THEN NULL ELSE COALESCE(p_transcript, "Transcript") END,
        "SegmenterKey" = CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, "SegmenterKey") END,
        "ParentChunkID" = CASE WHEN p_parentchunkid_clear = true THEN NULL ELSE COALESCE(p_parentchunkid, "ParentChunkID") END,
        "FieldConfidence" = CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, "FieldConfidence") END,
        "Decorator" = CASE WHEN p_decorator_clear = true THEN NULL ELSE COALESCE(p_decorator, "Decorator") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwContentItemChunks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItemChunk" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemChunk table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_content_item_chunk"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_item_chunk" ON "__mj"."ContentItemChunk";

CREATE TRIGGER "trg_update_content_item_chunk"
BEFORE UPDATE ON "__mj"."ContentItemChunk"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_content_item_chunk"();

/* spUpdate Permissions for MJ: Content Item Chunks */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItemChunk" TO "cdp_Integration";

/* spDelete SQL for MJ: Content Item Chunks */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spDeleteContentItemChunk
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteContentItemChunk"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ContentItemChunk"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItemChunk" TO "cdp_Integration";

/* spDelete Permissions for MJ: Content Item Chunks */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItemChunk" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID 7bd55d1a-2f27-4cb8-8886-b80334a7a2d9 */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '7bd55d1a-2f27-4cb8-8886-b80334a7a2d9', p_RelatedEntityNameFieldMap => 'File');

/* Hierarchy Metadata Function SQL for MJ: Content Items.ParentID */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: fn_content_item_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: ContentItem.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItem"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."ContentItem" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."ContentItem" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."ContentItem" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;

/* Descendants Traversal Function SQL for MJ: Content Items.ParentID */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: fn_content_item_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: ContentItem.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItem"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItem" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."ContentItem" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."ContentItem" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;

/* Ancestors Traversal Function SQL for MJ: Content Items.ParentID */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: fn_content_item_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: ContentItem.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItem"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."ContentItem" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;

/* Root ID Function SQL for MJ: Content Items.ParentID */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: fn_content_item_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ContentItem.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."ContentItem"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."ContentItem" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;

/* Base View SQL for MJ: Content Items */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: vwContentItems
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Items
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwContentItems"
AS
SELECT
    c.*,
    MJContentSource_ContentSourceID."Name" AS "ContentSource",
    MJContentType_ContentTypeID."Name" AS "ContentType",
    MJContentSourceType_ContentSourceTypeID."Name" AS "ContentSourceType",
    MJContentFileType_ContentFileTypeID."Name" AS "ContentFileType",
    MJEntityRecordDocument_EntityRecordDocumentID."RecordID" AS "EntityRecordDocument",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJContentItem_ParentID."Name" AS "Parent",
    MJFile_FileID."Name" AS "File",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."ContentItem" AS c
INNER JOIN
    "__mj"."ContentSource" AS MJContentSource_ContentSourceID
  ON
    "c"."ContentSourceID" = MJContentSource_ContentSourceID."ID"
INNER JOIN
    "__mj"."ContentType" AS MJContentType_ContentTypeID
  ON
    "c"."ContentTypeID" = MJContentType_ContentTypeID."ID"
INNER JOIN
    "__mj"."ContentSourceType" AS MJContentSourceType_ContentSourceTypeID
  ON
    "c"."ContentSourceTypeID" = MJContentSourceType_ContentSourceTypeID."ID"
INNER JOIN
    "__mj"."ContentFileType" AS MJContentFileType_ContentFileTypeID
  ON
    "c"."ContentFileTypeID" = MJContentFileType_ContentFileTypeID."ID"
LEFT OUTER JOIN
    "__mj"."EntityRecordDocument" AS MJEntityRecordDocument_EntityRecordDocumentID
  ON
    "c"."EntityRecordDocumentID" = MJEntityRecordDocument_EntityRecordDocumentID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "c"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    "__mj"."ContentItem" AS MJContentItem_ParentID
  ON
    "c"."ParentID" = MJContentItem_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."File" AS MJFile_FileID
  ON
    "c"."FileID" = MJFile_FileID."ID"

LEFT JOIN LATERAL "__mj"."fn_content_item_parent_id_get_hierarchy_meta"(c."ID", c."ParentID") AS hier_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwContentItems'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwContentItems'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwContentItems" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwContentItems" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwContentItems" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentItems" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: Content Items */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: Permissions for vwContentItems
-- ============================================================
GRANT SELECT ON "__mj"."vwContentItems" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwContentItems" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentItems" TO "cdp_Integration";

/* spCreate SQL for MJ: Content Items */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: spCreateContentItem
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateContentItem"(
    p_id UUID DEFAULT NULL,
    p_contentsourceid UUID DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(250) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_checksum_clear boolean DEFAULT false,
    p_checksum varchar(100) DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_entityrecorddocumentid_clear boolean DEFAULT false,
    p_entityrecorddocumentid UUID DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_displaylink_clear boolean DEFAULT false,
    p_displaylink varchar(2000) DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_extractionstatus_clear boolean DEFAULT false,
    p_extractionstatus varchar(40) DEFAULT NULL,
    p_segmentationstatus_clear boolean DEFAULT false,
    p_segmentationstatus varchar(40) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_extractorkey_clear boolean DEFAULT false,
    p_extractorkey varchar(100) DEFAULT NULL,
    p_extractorkeyoverride_clear boolean DEFAULT false,
    p_extractorkeyoverride varchar(100) DEFAULT NULL,
    p_modality_clear boolean DEFAULT false,
    p_modality varchar(20) DEFAULT NULL,
    p_date_clear boolean DEFAULT false,
    p_date TIMESTAMPTZ DEFAULT NULL,
    p_decorator_clear boolean DEFAULT false,
    p_decorator TEXT DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentItems" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ContentItem"
        (
            "ID",
            "ContentSourceID",
                "Name",
                "Description",
                "ContentTypeID",
                "ContentSourceTypeID",
                "ContentFileTypeID",
                "Checksum",
                "URL",
                "Text",
                "EntityRecordDocumentID",
                "EmbeddingStatus",
                "LastEmbeddedAt",
                "EmbeddingModelID",
                "TaggingStatus",
                "LastTaggedAt",
                "VectorRecordID",
                "ParentID",
                "DisplayLink",
                "FieldConfidence",
                "ExtractionStatus",
                "SegmentationStatus",
                "DeleteStatus",
                "ExtractorKey",
                "ExtractorKeyOverride",
                "Modality",
                "Date",
                "Decorator",
                "FileID"
        )
    VALUES
        (
            v_new_id,
            p_contentsourceid,
                CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_contenttypeid,
                p_contentsourcetypeid,
                p_contentfiletypeid,
                CASE WHEN p_checksum_clear = true THEN NULL ELSE COALESCE(p_checksum, NULL) END,
                p_url,
                CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, NULL) END,
                CASE WHEN p_entityrecorddocumentid_clear = true THEN NULL ELSE COALESCE(p_entityrecorddocumentid, NULL) END,
                COALESCE(p_embeddingstatus, 'Pending'),
                CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                COALESCE(p_taggingstatus, 'Pending'),
                CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, NULL) END,
                CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                CASE WHEN p_displaylink_clear = true THEN NULL ELSE COALESCE(p_displaylink, NULL) END,
                CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, NULL) END,
                CASE WHEN p_extractionstatus_clear = true THEN NULL ELSE COALESCE(p_extractionstatus, NULL) END,
                CASE WHEN p_segmentationstatus_clear = true THEN NULL ELSE COALESCE(p_segmentationstatus, NULL) END,
                CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, NULL) END,
                CASE WHEN p_extractorkey_clear = true THEN NULL ELSE COALESCE(p_extractorkey, NULL) END,
                CASE WHEN p_extractorkeyoverride_clear = true THEN NULL ELSE COALESCE(p_extractorkeyoverride, NULL) END,
                CASE WHEN p_modality_clear = true THEN NULL ELSE COALESCE(p_modality, NULL) END,
                CASE WHEN p_date_clear = true THEN NULL ELSE COALESCE(p_date, NULL) END,
                CASE WHEN p_decorator_clear = true THEN NULL ELSE COALESCE(p_decorator, NULL) END,
                CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwContentItems"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItem" TO "cdp_Integration";

/* spCreate Permissions for MJ: Content Items */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItem" TO "cdp_Integration";

/* spUpdate SQL for MJ: Content Items */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: spUpdateContentItem
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateContentItem"(
    p_id UUID,
    p_contentsourceid UUID DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(250) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_checksum_clear boolean DEFAULT false,
    p_checksum varchar(100) DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_entityrecorddocumentid_clear boolean DEFAULT false,
    p_entityrecorddocumentid UUID DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_displaylink_clear boolean DEFAULT false,
    p_displaylink varchar(2000) DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_extractionstatus_clear boolean DEFAULT false,
    p_extractionstatus varchar(40) DEFAULT NULL,
    p_segmentationstatus_clear boolean DEFAULT false,
    p_segmentationstatus varchar(40) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_extractorkey_clear boolean DEFAULT false,
    p_extractorkey varchar(100) DEFAULT NULL,
    p_extractorkeyoverride_clear boolean DEFAULT false,
    p_extractorkeyoverride varchar(100) DEFAULT NULL,
    p_modality_clear boolean DEFAULT false,
    p_modality varchar(20) DEFAULT NULL,
    p_date_clear boolean DEFAULT false,
    p_date TIMESTAMPTZ DEFAULT NULL,
    p_decorator_clear boolean DEFAULT false,
    p_decorator TEXT DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentItems" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ContentItem"
    SET
        "ContentSourceID" = COALESCE(p_contentsourceid, "ContentSourceID"),
        "Name" = CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, "Name") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ContentTypeID" = COALESCE(p_contenttypeid, "ContentTypeID"),
        "ContentSourceTypeID" = COALESCE(p_contentsourcetypeid, "ContentSourceTypeID"),
        "ContentFileTypeID" = COALESCE(p_contentfiletypeid, "ContentFileTypeID"),
        "Checksum" = CASE WHEN p_checksum_clear = true THEN NULL ELSE COALESCE(p_checksum, "Checksum") END,
        "URL" = COALESCE(p_url, "URL"),
        "Text" = CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, "Text") END,
        "EntityRecordDocumentID" = CASE WHEN p_entityrecorddocumentid_clear = true THEN NULL ELSE COALESCE(p_entityrecorddocumentid, "EntityRecordDocumentID") END,
        "EmbeddingStatus" = COALESCE(p_embeddingstatus, "EmbeddingStatus"),
        "LastEmbeddedAt" = CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, "LastEmbeddedAt") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "TaggingStatus" = COALESCE(p_taggingstatus, "TaggingStatus"),
        "LastTaggedAt" = CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, "LastTaggedAt") END,
        "VectorRecordID" = CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, "VectorRecordID") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "DisplayLink" = CASE WHEN p_displaylink_clear = true THEN NULL ELSE COALESCE(p_displaylink, "DisplayLink") END,
        "FieldConfidence" = CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, "FieldConfidence") END,
        "ExtractionStatus" = CASE WHEN p_extractionstatus_clear = true THEN NULL ELSE COALESCE(p_extractionstatus, "ExtractionStatus") END,
        "SegmentationStatus" = CASE WHEN p_segmentationstatus_clear = true THEN NULL ELSE COALESCE(p_segmentationstatus, "SegmentationStatus") END,
        "DeleteStatus" = CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, "DeleteStatus") END,
        "ExtractorKey" = CASE WHEN p_extractorkey_clear = true THEN NULL ELSE COALESCE(p_extractorkey, "ExtractorKey") END,
        "ExtractorKeyOverride" = CASE WHEN p_extractorkeyoverride_clear = true THEN NULL ELSE COALESCE(p_extractorkeyoverride, "ExtractorKeyOverride") END,
        "Modality" = CASE WHEN p_modality_clear = true THEN NULL ELSE COALESCE(p_modality, "Modality") END,
        "Date" = CASE WHEN p_date_clear = true THEN NULL ELSE COALESCE(p_date, "Date") END,
        "Decorator" = CASE WHEN p_decorator_clear = true THEN NULL ELSE COALESCE(p_decorator, "Decorator") END,
        "FileID" = CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, "FileID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwContentItems"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItem" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItem table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_content_item"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_item" ON "__mj"."ContentItem";

CREATE TRIGGER "trg_update_content_item"
BEFORE UPDATE ON "__mj"."ContentItem"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_content_item"();

/* spUpdate Permissions for MJ: Content Items */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItem" TO "cdp_Integration";

/* spDelete SQL for MJ: Content Items */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: spDeleteContentItem
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteContentItem"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ContentItem"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItem" TO "cdp_Integration";

/* spDelete Permissions for MJ: Content Items */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItem" TO "cdp_Integration";

/* Base View SQL for MJ: Content Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: vwContentSources
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Sources
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwContentSources"
AS
SELECT
    c.*,
    MJContentType_ContentTypeID."Name" AS "ContentType",
    MJContentSourceType_ContentSourceTypeID."Name" AS "ContentSourceType",
    MJContentFileType_ContentFileTypeID."Name" AS "ContentFileType",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJVectorIndex_VectorIndexID."Name" AS "VectorIndex",
    MJEntity_EntityID."Name" AS "Entity",
    MJEntityDocument_EntityDocumentID."Name" AS "EntityDocument",
    MJScheduledJob_ScheduledJobID."Name" AS "ScheduledJob"
FROM
    "__mj"."ContentSource" AS c
INNER JOIN
    "__mj"."ContentType" AS MJContentType_ContentTypeID
  ON
    "c"."ContentTypeID" = MJContentType_ContentTypeID."ID"
INNER JOIN
    "__mj"."ContentSourceType" AS MJContentSourceType_ContentSourceTypeID
  ON
    "c"."ContentSourceTypeID" = MJContentSourceType_ContentSourceTypeID."ID"
INNER JOIN
    "__mj"."ContentFileType" AS MJContentFileType_ContentFileTypeID
  ON
    "c"."ContentFileTypeID" = MJContentFileType_ContentFileTypeID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "c"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    "__mj"."VectorIndex" AS MJVectorIndex_VectorIndexID
  ON
    "c"."VectorIndexID" = MJVectorIndex_VectorIndexID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "c"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "__mj"."EntityDocument" AS MJEntityDocument_EntityDocumentID
  ON
    "c"."EntityDocumentID" = MJEntityDocument_EntityDocumentID."ID"
LEFT OUTER JOIN
    "__mj"."ScheduledJob" AS MJScheduledJob_ScheduledJobID
  ON
    "c"."ScheduledJobID" = MJScheduledJob_ScheduledJobID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwContentSources'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwContentSources'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwContentSources" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwContentSources" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwContentSources" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentSources" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: Content Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: Permissions for vwContentSources
-- ============================================================
GRANT SELECT ON "__mj"."vwContentSources" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwContentSources" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentSources" TO "cdp_Integration";

/* spCreate SQL for MJ: Content Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spCreateContentSource
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateContentSource"(
    p_id UUID DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_entitydocumentid_clear boolean DEFAULT false,
    p_entitydocumentid UUID DEFAULT NULL,
    p_scheduledjobid_clear boolean DEFAULT false,
    p_scheduledjobid uuid DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_forcediscovery BOOLEAN DEFAULT NULL,
    p_lastdiscoveredat_clear boolean DEFAULT false,
    p_lastdiscoveredat TIMESTAMPTZ DEFAULT NULL,
    p_lastsyncedat_clear boolean DEFAULT false,
    p_lastsyncedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentSources" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ContentSource"
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
                "ScheduledJobID",
                "SegmenterKey",
                "CleanerKey",
                "FieldConfidence",
                "ForceDiscovery",
                "LastDiscoveredAt",
                "LastSyncedAt"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, NULL) END,
                p_contenttypeid,
                p_contentsourcetypeid,
                p_contentfiletypeid,
                p_url,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, NULL) END,
                CASE WHEN p_entitydocumentid_clear = true THEN NULL ELSE COALESCE(p_entitydocumentid, NULL) END,
                CASE WHEN p_scheduledjobid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobid, NULL) END,
                CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, NULL) END,
                CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, NULL) END,
                CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, NULL) END,
                COALESCE(p_forcediscovery, FALSE),
                CASE WHEN p_lastdiscoveredat_clear = true THEN NULL ELSE COALESCE(p_lastdiscoveredat, NULL) END,
                CASE WHEN p_lastsyncedat_clear = true THEN NULL ELSE COALESCE(p_lastsyncedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwContentSources"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentSource" TO "cdp_Integration";

/* spCreate Permissions for MJ: Content Sources */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentSource" TO "cdp_Integration";

/* spUpdate SQL for MJ: Content Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spUpdateContentSource
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateContentSource"(
    p_id UUID,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_entitydocumentid_clear boolean DEFAULT false,
    p_entitydocumentid UUID DEFAULT NULL,
    p_scheduledjobid_clear boolean DEFAULT false,
    p_scheduledjobid uuid DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_forcediscovery BOOLEAN DEFAULT NULL,
    p_lastdiscoveredat_clear boolean DEFAULT false,
    p_lastdiscoveredat TIMESTAMPTZ DEFAULT NULL,
    p_lastsyncedat_clear boolean DEFAULT false,
    p_lastsyncedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentSources" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ContentSource"
    SET
        "Name" = CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, "Name") END,
        "ContentTypeID" = COALESCE(p_contenttypeid, "ContentTypeID"),
        "ContentSourceTypeID" = COALESCE(p_contentsourcetypeid, "ContentSourceTypeID"),
        "ContentFileTypeID" = COALESCE(p_contentfiletypeid, "ContentFileTypeID"),
        "URL" = COALESCE(p_url, "URL"),
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "VectorIndexID" = CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, "VectorIndexID") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "EntityID" = CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, "EntityID") END,
        "EntityDocumentID" = CASE WHEN p_entitydocumentid_clear = true THEN NULL ELSE COALESCE(p_entitydocumentid, "EntityDocumentID") END,
        "ScheduledJobID" = CASE WHEN p_scheduledjobid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobid, "ScheduledJobID") END,
        "SegmenterKey" = CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, "SegmenterKey") END,
        "CleanerKey" = CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, "CleanerKey") END,
        "FieldConfidence" = CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, "FieldConfidence") END,
        "ForceDiscovery" = COALESCE(p_forcediscovery, "ForceDiscovery"),
        "LastDiscoveredAt" = CASE WHEN p_lastdiscoveredat_clear = true THEN NULL ELSE COALESCE(p_lastdiscoveredat, "LastDiscoveredAt") END,
        "LastSyncedAt" = CASE WHEN p_lastsyncedat_clear = true THEN NULL ELSE COALESCE(p_lastsyncedat, "LastSyncedAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwContentSources"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentSource" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSource table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_content_source"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_source" ON "__mj"."ContentSource";

CREATE TRIGGER "trg_update_content_source"
BEFORE UPDATE ON "__mj"."ContentSource"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_content_source"();

/* spUpdate Permissions for MJ: Content Sources */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentSource" TO "cdp_Integration";

/* spDelete SQL for MJ: Content Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spDeleteContentSource
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteContentSource"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ContentSource"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentSource" TO "cdp_Integration";

/* spDelete Permissions for MJ: Content Sources */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentSource" TO "cdp_Integration";

/* Base View SQL for MJ: Content Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Types
-- Item: vwContentTypes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwContentTypes"
AS
SELECT
    c.*,
    MJAIModel_AIModelID."Name" AS "AIModel",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJVectorIndex_VectorIndexID."Name" AS "VectorIndex"
FROM
    "__mj"."ContentType" AS c
INNER JOIN
    "__mj"."AIModel" AS MJAIModel_AIModelID
  ON
    "c"."AIModelID" = MJAIModel_AIModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "c"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    "__mj"."VectorIndex" AS MJVectorIndex_VectorIndexID
  ON
    "c"."VectorIndexID" = MJVectorIndex_VectorIndexID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwContentTypes'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwContentTypes'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwContentTypes" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwContentTypes" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwContentTypes" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentTypes" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: Content Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Types
-- Item: Permissions for vwContentTypes
-- ============================================================
GRANT SELECT ON "__mj"."vwContentTypes" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwContentTypes" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentTypes" TO "cdp_Integration";

/* spCreate SQL for MJ: Content Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Types
-- Item: spCreateContentType
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateContentType"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_aimodelid UUID DEFAULT NULL,
    p_mintags int DEFAULT NULL,
    p_maxtags int DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL,
    p_extractorkey_clear boolean DEFAULT false,
    p_extractorkey varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentTypes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ContentType"
        (
            "ID",
            "Name",
                "Description",
                "AIModelID",
                "MinTags",
                "MaxTags",
                "EmbeddingModelID",
                "VectorIndexID",
                "Configuration",
                "SegmenterKey",
                "CleanerKey",
                "ExtractorKey"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_aimodelid,
                p_mintags,
                p_maxtags,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, NULL) END,
                CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, NULL) END,
                CASE WHEN p_extractorkey_clear = true THEN NULL ELSE COALESCE(p_extractorkey, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwContentTypes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentType" TO "cdp_Integration";

/* spCreate Permissions for MJ: Content Types */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentType" TO "cdp_Integration";

/* spUpdate SQL for MJ: Content Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Types
-- Item: spUpdateContentType
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateContentType"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_aimodelid UUID DEFAULT NULL,
    p_mintags int DEFAULT NULL,
    p_maxtags int DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL,
    p_extractorkey_clear boolean DEFAULT false,
    p_extractorkey varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentTypes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ContentType"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "AIModelID" = COALESCE(p_aimodelid, "AIModelID"),
        "MinTags" = COALESCE(p_mintags, "MinTags"),
        "MaxTags" = COALESCE(p_maxtags, "MaxTags"),
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "VectorIndexID" = CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, "VectorIndexID") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "SegmenterKey" = CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, "SegmenterKey") END,
        "CleanerKey" = CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, "CleanerKey") END,
        "ExtractorKey" = CASE WHEN p_extractorkey_clear = true THEN NULL ELSE COALESCE(p_extractorkey, "ExtractorKey") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwContentTypes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentType" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentType table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_content_type"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_type" ON "__mj"."ContentType";

CREATE TRIGGER "trg_update_content_type"
BEFORE UPDATE ON "__mj"."ContentType"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_content_type"();

/* spUpdate Permissions for MJ: Content Types */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentType" TO "cdp_Integration";

/* spDelete SQL for MJ: Content Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Types
-- Item: spDeleteContentType
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteContentType"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ContentType"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentType" TO "cdp_Integration";

/* spDelete Permissions for MJ: Content Types */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentType" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID 19586230-545f-4177-8b82-e1840440cd58 */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '19586230-545f-4177-8b82-e1840440cd58', p_RelatedEntityNameFieldMap => 'EntityDocument');

/* Base View SQL for MJ: Duplicate Runs */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Duplicate Runs
-- Item: vwDuplicateRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Duplicate Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  DuplicateRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwDuplicateRuns"
AS
SELECT
    d.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJUser_StartedByUserID."Name" AS "StartedByUser",
    MJList_SourceListID."Name" AS "SourceList",
    MJUser_ApprovedByUserID."Name" AS "ApprovedByUser",
    MJEntityDocument_EntityDocumentID."Name" AS "EntityDocument"
FROM
    "__mj"."DuplicateRun" AS d
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "d"."EntityID" = MJEntity_EntityID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_StartedByUserID
  ON
    "d"."StartedByUserID" = MJUser_StartedByUserID."ID"
LEFT OUTER JOIN
    "__mj"."List" AS MJList_SourceListID
  ON
    "d"."SourceListID" = MJList_SourceListID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_ApprovedByUserID
  ON
    "d"."ApprovedByUserID" = MJUser_ApprovedByUserID."ID"
INNER JOIN
    "__mj"."EntityDocument" AS MJEntityDocument_EntityDocumentID
  ON
    "d"."EntityDocumentID" = MJEntityDocument_EntityDocumentID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwDuplicateRuns'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwDuplicateRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwDuplicateRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwDuplicateRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwDuplicateRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwDuplicateRuns" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: Duplicate Runs */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Duplicate Runs
-- Item: Permissions for vwDuplicateRuns
-- ============================================================
GRANT SELECT ON "__mj"."vwDuplicateRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwDuplicateRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwDuplicateRuns" TO "cdp_Integration";

/* spCreate SQL for MJ: Duplicate Runs */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Duplicate Runs
-- Item: spCreateDuplicateRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR DuplicateRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateDuplicateRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateDuplicateRun"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_startedbyuserid UUID DEFAULT NULL,
    p_sourcelistid_clear boolean DEFAULT false,
    p_sourcelistid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_approvalstatus varchar(20) DEFAULT NULL,
    p_approvalcomments_clear boolean DEFAULT false,
    p_approvalcomments TEXT DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_processingstatus varchar(20) DEFAULT NULL,
    p_processingerrormessage_clear boolean DEFAULT false,
    p_processingerrormessage TEXT DEFAULT NULL,
    p_totalitemcount_clear boolean DEFAULT false,
    p_totalitemcount int DEFAULT NULL,
    p_processeditemcount_clear boolean DEFAULT false,
    p_processeditemcount int DEFAULT NULL,
    p_lastprocessedoffset_clear boolean DEFAULT false,
    p_lastprocessedoffset int DEFAULT NULL,
    p_batchsize_clear boolean DEFAULT false,
    p_batchsize int DEFAULT NULL,
    p_cancellationrequested BOOLEAN DEFAULT NULL,
    p_entitydocumentid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwDuplicateRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."DuplicateRun"
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
                "ProcessingErrorMessage",
                "TotalItemCount",
                "ProcessedItemCount",
                "LastProcessedOffset",
                "BatchSize",
                "CancellationRequested",
                "EntityDocumentID"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_startedbyuserid,
                CASE WHEN p_sourcelistid_clear = true THEN NULL ELSE COALESCE(p_sourcelistid, NULL) END,
                COALESCE(p_startedat, NOW()),
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END,
                COALESCE(p_approvalstatus, 'Pending'),
                CASE WHEN p_approvalcomments_clear = true THEN NULL ELSE COALESCE(p_approvalcomments, NULL) END,
                CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, NULL) END,
                COALESCE(p_processingstatus, 'Pending'),
                CASE WHEN p_processingerrormessage_clear = true THEN NULL ELSE COALESCE(p_processingerrormessage, NULL) END,
                CASE WHEN p_totalitemcount_clear = true THEN NULL ELSE COALESCE(p_totalitemcount, NULL) END,
                CASE WHEN p_processeditemcount_clear = true THEN NULL ELSE COALESCE(p_processeditemcount, 0) END,
                CASE WHEN p_lastprocessedoffset_clear = true THEN NULL ELSE COALESCE(p_lastprocessedoffset, 0) END,
                CASE WHEN p_batchsize_clear = true THEN NULL ELSE COALESCE(p_batchsize, 100) END,
                COALESCE(p_cancellationrequested, FALSE),
                p_entitydocumentid
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwDuplicateRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDuplicateRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDuplicateRun" TO "cdp_Integration";

/* spCreate Permissions for MJ: Duplicate Runs */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDuplicateRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDuplicateRun" TO "cdp_Integration";

/* spUpdate SQL for MJ: Duplicate Runs */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Duplicate Runs
-- Item: spUpdateDuplicateRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR DuplicateRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateDuplicateRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateDuplicateRun"(
    p_id UUID,
    p_entityid UUID DEFAULT NULL,
    p_startedbyuserid UUID DEFAULT NULL,
    p_sourcelistid_clear boolean DEFAULT false,
    p_sourcelistid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_approvalstatus varchar(20) DEFAULT NULL,
    p_approvalcomments_clear boolean DEFAULT false,
    p_approvalcomments TEXT DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_processingstatus varchar(20) DEFAULT NULL,
    p_processingerrormessage_clear boolean DEFAULT false,
    p_processingerrormessage TEXT DEFAULT NULL,
    p_totalitemcount_clear boolean DEFAULT false,
    p_totalitemcount int DEFAULT NULL,
    p_processeditemcount_clear boolean DEFAULT false,
    p_processeditemcount int DEFAULT NULL,
    p_lastprocessedoffset_clear boolean DEFAULT false,
    p_lastprocessedoffset int DEFAULT NULL,
    p_batchsize_clear boolean DEFAULT false,
    p_batchsize int DEFAULT NULL,
    p_cancellationrequested BOOLEAN DEFAULT NULL,
    p_entitydocumentid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwDuplicateRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."DuplicateRun"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "StartedByUserID" = COALESCE(p_startedbyuserid, "StartedByUserID"),
        "SourceListID" = CASE WHEN p_sourcelistid_clear = true THEN NULL ELSE COALESCE(p_sourcelistid, "SourceListID") END,
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "ApprovalStatus" = COALESCE(p_approvalstatus, "ApprovalStatus"),
        "ApprovalComments" = CASE WHEN p_approvalcomments_clear = true THEN NULL ELSE COALESCE(p_approvalcomments, "ApprovalComments") END,
        "ApprovedByUserID" = CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, "ApprovedByUserID") END,
        "ProcessingStatus" = COALESCE(p_processingstatus, "ProcessingStatus"),
        "ProcessingErrorMessage" = CASE WHEN p_processingerrormessage_clear = true THEN NULL ELSE COALESCE(p_processingerrormessage, "ProcessingErrorMessage") END,
        "TotalItemCount" = CASE WHEN p_totalitemcount_clear = true THEN NULL ELSE COALESCE(p_totalitemcount, "TotalItemCount") END,
        "ProcessedItemCount" = CASE WHEN p_processeditemcount_clear = true THEN NULL ELSE COALESCE(p_processeditemcount, "ProcessedItemCount") END,
        "LastProcessedOffset" = CASE WHEN p_lastprocessedoffset_clear = true THEN NULL ELSE COALESCE(p_lastprocessedoffset, "LastProcessedOffset") END,
        "BatchSize" = CASE WHEN p_batchsize_clear = true THEN NULL ELSE COALESCE(p_batchsize, "BatchSize") END,
        "CancellationRequested" = COALESCE(p_cancellationrequested, "CancellationRequested"),
        "EntityDocumentID" = COALESCE(p_entitydocumentid, "EntityDocumentID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwDuplicateRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDuplicateRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDuplicateRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_duplicate_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_duplicate_run" ON "__mj"."DuplicateRun";

CREATE TRIGGER "trg_update_duplicate_run"
BEFORE UPDATE ON "__mj"."DuplicateRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_duplicate_run"();

/* spUpdate Permissions for MJ: Duplicate Runs */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDuplicateRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDuplicateRun" TO "cdp_Integration";

/* spDelete SQL for MJ: Duplicate Runs */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Duplicate Runs
-- Item: spDeleteDuplicateRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR DuplicateRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteDuplicateRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteDuplicateRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."DuplicateRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDuplicateRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDuplicateRun" TO "cdp_Integration";

/* spDelete Permissions for MJ: Duplicate Runs */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDuplicateRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDuplicateRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Rubric Evaluations
-- Item: spDeleteRubricEvaluation
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RubricEvaluation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRubricEvaluation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRubricEvaluation"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: Rubric Evaluation Scores records via EvaluationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RubricEvaluationScore"
        WHERE "EvaluationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteRubricEvaluationScore"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Rubric Evaluations.SupersedesEvaluationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RubricEvaluation"
        WHERE "SupersedesEvaluationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RubricEvaluation"
        SET "SupersedesEvaluationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."RubricEvaluation"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricEvaluation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricEvaluation" TO "cdp_Integration";

/* spDelete Permissions for MJ: Rubric Evaluations */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricEvaluation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRubricEvaluation" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID 7048894c-7e69-4e62-8f1b-9bd167bd1254 */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '7048894c-7e69-4e62-8f1b-9bd167bd1254', p_RelatedEntityNameFieldMap => 'Scale');

/* SQL text to update entity field related entity name field map for entity field ID 72db33e1-26a4-4a67-bf60-036f309e223a */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '72db33e1-26a4-4a67-bf60-036f309e223a', p_RelatedEntityNameFieldMap => 'Rubric');

/* SQL text to update entity field related entity name field map for entity field ID 4aaa86aa-8db7-40f1-944c-0bd79548cbdd */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '4aaa86aa-8db7-40f1-944c-0bd79548cbdd', p_RelatedEntityNameFieldMap => 'PublishedByUser');

/* SQL text to update entity field related entity name field map for entity field ID 57dd9c6c-9b1d-4a4b-9401-20eef659d124 */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '57dd9c6c-9b1d-4a4b-9401-20eef659d124', p_RelatedEntityNameFieldMap => 'Category');

/* SQL text to update entity field related entity name field map for entity field ID bd692a9f-45c1-45c1-8a24-1a0786a2341e */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'bd692a9f-45c1-45c1-8a24-1a0786a2341e', p_RelatedEntityNameFieldMap => 'NotificationType');

/* SQL text to update entity field related entity name field map for entity field ID 08d78f6e-ce9c-4b72-8944-849c8d7ec97b */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '08d78f6e-ce9c-4b72-8944-849c8d7ec97b', p_RelatedEntityNameFieldMap => 'PrimaryScopeEntity');

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPromptRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIPromptRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: AI Prompt Run Medias records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRunMedia"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.RerunFromPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "RerunFromPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "RerunFromPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIResultCache"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Content Item Tags.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentItemTag"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ContentItemTag"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Content Process Run Prompt Runs records via AIPromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentProcessRunPromptRun"
        WHERE "AIPromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteContentProcessRunPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Compaction Runs records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationCompactionRun"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationCompactionRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DuplicateRunDetailMatch"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DuplicateRunDetailMatch"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Rubric Evaluations.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RubricEvaluation"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RubricEvaluation"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutineRun"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutineRun"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIPromptRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Integration";

/* spDelete Permissions for MJ: AI Prompt Runs */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Integration";

/* spDelete SQL for MJ: AI Prompts */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: spCreateAIAgentSession
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentSession"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid UUID DEFAULT NULL,
    p_lastsessionid_clear boolean DEFAULT false,
    p_lastsessionid UUID DEFAULT NULL,
    p_hostinstanceid_clear boolean DEFAULT false,
    p_hostinstanceid varchar(200) DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config TEXT DEFAULT NULL,
    p_lastactiveat TIMESTAMPTZ DEFAULT NULL,
    p_closedat_clear boolean DEFAULT false,
    p_closedat TIMESTAMPTZ DEFAULT NULL,
    p_closereason_clear boolean DEFAULT false,
    p_closereason varchar(20) DEFAULT NULL,
    p_recordingstartedat_clear boolean DEFAULT false,
    p_recordingstartedat TIMESTAMPTZ DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid UUID DEFAULT NULL,
    p_linkedrecordid_clear boolean DEFAULT false,
    p_linkedrecordid varchar(500) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentSessions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentSession"
        (
            "ID",
            "AgentID",
                "UserID",
                "Status",
                "ConversationID",
                "LastSessionID",
                "HostInstanceID",
                "Config",
                "LastActiveAt",
                "ClosedAt",
                "CloseReason",
                "RecordingStartedAt",
                "LinkedEntityID",
                "LinkedRecordID"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_userid,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, NULL) END,
                CASE WHEN p_lastsessionid_clear = true THEN NULL ELSE COALESCE(p_lastsessionid, NULL) END,
                CASE WHEN p_hostinstanceid_clear = true THEN NULL ELSE COALESCE(p_hostinstanceid, NULL) END,
                CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, NULL) END,
                COALESCE(p_lastactiveat, NOW()),
                CASE WHEN p_closedat_clear = true THEN NULL ELSE COALESCE(p_closedat, NULL) END,
                CASE WHEN p_closereason_clear = true THEN NULL ELSE COALESCE(p_closereason, NULL) END,
                CASE WHEN p_recordingstartedat_clear = true THEN NULL ELSE COALESCE(p_recordingstartedat, NULL) END,
                CASE WHEN p_linkedentityid_clear = true THEN NULL ELSE COALESCE(p_linkedentityid, NULL) END,
                CASE WHEN p_linkedrecordid_clear = true THEN NULL ELSE COALESCE(p_linkedrecordid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentSessions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_UI";

/* spCreate Permissions for MJ: AI Agent Sessions */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_UI";

/* spUpdate SQL for MJ: AI Agent Sessions */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: spUpdateAIAgentSession
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentSession"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid UUID DEFAULT NULL,
    p_lastsessionid_clear boolean DEFAULT false,
    p_lastsessionid UUID DEFAULT NULL,
    p_hostinstanceid_clear boolean DEFAULT false,
    p_hostinstanceid varchar(200) DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config TEXT DEFAULT NULL,
    p_lastactiveat TIMESTAMPTZ DEFAULT NULL,
    p_closedat_clear boolean DEFAULT false,
    p_closedat TIMESTAMPTZ DEFAULT NULL,
    p_closereason_clear boolean DEFAULT false,
    p_closereason varchar(20) DEFAULT NULL,
    p_recordingstartedat_clear boolean DEFAULT false,
    p_recordingstartedat TIMESTAMPTZ DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid UUID DEFAULT NULL,
    p_linkedrecordid_clear boolean DEFAULT false,
    p_linkedrecordid varchar(500) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentSessions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentSession"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "Status" = COALESCE(p_status, "Status"),
        "ConversationID" = CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, "ConversationID") END,
        "LastSessionID" = CASE WHEN p_lastsessionid_clear = true THEN NULL ELSE COALESCE(p_lastsessionid, "LastSessionID") END,
        "HostInstanceID" = CASE WHEN p_hostinstanceid_clear = true THEN NULL ELSE COALESCE(p_hostinstanceid, "HostInstanceID") END,
        "Config" = CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, "Config") END,
        "LastActiveAt" = COALESCE(p_lastactiveat, "LastActiveAt"),
        "ClosedAt" = CASE WHEN p_closedat_clear = true THEN NULL ELSE COALESCE(p_closedat, "ClosedAt") END,
        "CloseReason" = CASE WHEN p_closereason_clear = true THEN NULL ELSE COALESCE(p_closereason, "CloseReason") END,
        "RecordingStartedAt" = CASE WHEN p_recordingstartedat_clear = true THEN NULL ELSE COALESCE(p_recordingstartedat, "RecordingStartedAt") END,
        "LinkedEntityID" = CASE WHEN p_linkedentityid_clear = true THEN NULL ELSE COALESCE(p_linkedentityid, "LinkedEntityID") END,
        "LinkedRecordID" = CASE WHEN p_linkedrecordid_clear = true THEN NULL ELSE COALESCE(p_linkedrecordid, "LinkedRecordID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentSessions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_UI";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSession table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_session"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_session" ON "__mj"."AIAgentSession";

CREATE TRIGGER "trg_update_ai_agent_session"
BEFORE UPDATE ON "__mj"."AIAgentSession"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_session"();

/* spUpdate Permissions for MJ: AI Agent Sessions */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_UI";

/* spDelete SQL for MJ: AI Agent Sessions */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent User Policies
-- Item: spCreateAIAgentUserPolicy
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentUserPolicy
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentUserPolicy'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentUserPolicy"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_displaynameoverride_clear boolean DEFAULT false,
    p_displaynameoverride varchar(100) DEFAULT NULL,
    p_preferredpersonaid_clear boolean DEFAULT false,
    p_preferredpersonaid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_onboardingstatus varchar(20) DEFAULT NULL,
    p_onboardedat_clear boolean DEFAULT false,
    p_onboardedat TIMESTAMPTZ DEFAULT NULL,
    p_coordinationmode varchar(20) DEFAULT NULL,
    p_defaultdataaccessmode varchar(20) DEFAULT NULL,
    p_emailchannelmode varchar(20) DEFAULT NULL,
    p_phonechannelmode varchar(20) DEFAULT NULL,
    p_messagingchannelmode varchar(20) DEFAULT NULL,
    p_allowinteragentcoordination BOOLEAN DEFAULT NULL,
    p_requireapprovalforexternalcomms BOOLEAN DEFAULT NULL,
    p_requireapprovalforfinancials BOOLEAN DEFAULT NULL,
    p_requireapprovalfordestructiveactions BOOLEAN DEFAULT NULL,
    p_autoapproveamountthreshold_clear boolean DEFAULT false,
    p_autoapproveamountthreshold decimal(18, 2) DEFAULT NULL,
    p_entityaccessrules_clear boolean DEFAULT false,
    p_entityaccessrules TEXT DEFAULT NULL,
    p_actionpolicyrules_clear boolean DEFAULT false,
    p_actionpolicyrules TEXT DEFAULT NULL,
    p_instructionsoverride_clear boolean DEFAULT false,
    p_instructionsoverride TEXT DEFAULT NULL,
    p_calendarchannelmode varchar(30) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentUserPolicies" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentUserPolicy"
        (
            "ID",
            "AgentID",
                "UserID",
                "DisplayNameOverride",
                "PreferredPersonaID",
                "Status",
                "OnboardingStatus",
                "OnboardedAt",
                "CoordinationMode",
                "DefaultDataAccessMode",
                "EmailChannelMode",
                "PhoneChannelMode",
                "MessagingChannelMode",
                "AllowInterAgentCoordination",
                "RequireApprovalForExternalComms",
                "RequireApprovalForFinancials",
                "RequireApprovalForDestructiveActions",
                "AutoApproveAmountThreshold",
                "EntityAccessRules",
                "ActionPolicyRules",
                "InstructionsOverride",
                "CalendarChannelMode"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_userid,
                CASE WHEN p_displaynameoverride_clear = true THEN NULL ELSE COALESCE(p_displaynameoverride, NULL) END,
                CASE WHEN p_preferredpersonaid_clear = true THEN NULL ELSE COALESCE(p_preferredpersonaid, NULL) END,
                COALESCE(p_status, 'Active'),
                COALESCE(p_onboardingstatus, 'NotStarted'),
                CASE WHEN p_onboardedat_clear = true THEN NULL ELSE COALESCE(p_onboardedat, NULL) END,
                COALESCE(p_coordinationmode, 'Observer'),
                COALESCE(p_defaultdataaccessmode, 'UserCeiling'),
                COALESCE(p_emailchannelmode, 'DraftOnly'),
                COALESCE(p_phonechannelmode, 'InboundOnly'),
                COALESCE(p_messagingchannelmode, 'Enabled'),
                COALESCE(p_allowinteragentcoordination, TRUE),
                COALESCE(p_requireapprovalforexternalcomms, TRUE),
                COALESCE(p_requireapprovalforfinancials, TRUE),
                COALESCE(p_requireapprovalfordestructiveactions, TRUE),
                CASE WHEN p_autoapproveamountthreshold_clear = true THEN NULL ELSE COALESCE(p_autoapproveamountthreshold, NULL) END,
                CASE WHEN p_entityaccessrules_clear = true THEN NULL ELSE COALESCE(p_entityaccessrules, NULL) END,
                CASE WHEN p_actionpolicyrules_clear = true THEN NULL ELSE COALESCE(p_actionpolicyrules, NULL) END,
                CASE WHEN p_instructionsoverride_clear = true THEN NULL ELSE COALESCE(p_instructionsoverride, NULL) END,
                COALESCE(p_calendarchannelmode, 'ReadOnly')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentUserPolicies"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentUserPolicy" TO "cdp_Integration";

/* spCreate Permissions for MJ: AI Agent User Policies */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentUserPolicy" TO "cdp_Integration";

/* spUpdate SQL for MJ: AI Agent User Policies */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent User Policies
-- Item: spUpdateAIAgentUserPolicy
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentUserPolicy
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentUserPolicy'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentUserPolicy"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_displaynameoverride_clear boolean DEFAULT false,
    p_displaynameoverride varchar(100) DEFAULT NULL,
    p_preferredpersonaid_clear boolean DEFAULT false,
    p_preferredpersonaid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_onboardingstatus varchar(20) DEFAULT NULL,
    p_onboardedat_clear boolean DEFAULT false,
    p_onboardedat TIMESTAMPTZ DEFAULT NULL,
    p_coordinationmode varchar(20) DEFAULT NULL,
    p_defaultdataaccessmode varchar(20) DEFAULT NULL,
    p_emailchannelmode varchar(20) DEFAULT NULL,
    p_phonechannelmode varchar(20) DEFAULT NULL,
    p_messagingchannelmode varchar(20) DEFAULT NULL,
    p_allowinteragentcoordination BOOLEAN DEFAULT NULL,
    p_requireapprovalforexternalcomms BOOLEAN DEFAULT NULL,
    p_requireapprovalforfinancials BOOLEAN DEFAULT NULL,
    p_requireapprovalfordestructiveactions BOOLEAN DEFAULT NULL,
    p_autoapproveamountthreshold_clear boolean DEFAULT false,
    p_autoapproveamountthreshold decimal(18, 2) DEFAULT NULL,
    p_entityaccessrules_clear boolean DEFAULT false,
    p_entityaccessrules TEXT DEFAULT NULL,
    p_actionpolicyrules_clear boolean DEFAULT false,
    p_actionpolicyrules TEXT DEFAULT NULL,
    p_instructionsoverride_clear boolean DEFAULT false,
    p_instructionsoverride TEXT DEFAULT NULL,
    p_calendarchannelmode varchar(30) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentUserPolicies" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentUserPolicy"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "DisplayNameOverride" = CASE WHEN p_displaynameoverride_clear = true THEN NULL ELSE COALESCE(p_displaynameoverride, "DisplayNameOverride") END,
        "PreferredPersonaID" = CASE WHEN p_preferredpersonaid_clear = true THEN NULL ELSE COALESCE(p_preferredpersonaid, "PreferredPersonaID") END,
        "Status" = COALESCE(p_status, "Status"),
        "OnboardingStatus" = COALESCE(p_onboardingstatus, "OnboardingStatus"),
        "OnboardedAt" = CASE WHEN p_onboardedat_clear = true THEN NULL ELSE COALESCE(p_onboardedat, "OnboardedAt") END,
        "CoordinationMode" = COALESCE(p_coordinationmode, "CoordinationMode"),
        "DefaultDataAccessMode" = COALESCE(p_defaultdataaccessmode, "DefaultDataAccessMode"),
        "EmailChannelMode" = COALESCE(p_emailchannelmode, "EmailChannelMode"),
        "PhoneChannelMode" = COALESCE(p_phonechannelmode, "PhoneChannelMode"),
        "MessagingChannelMode" = COALESCE(p_messagingchannelmode, "MessagingChannelMode"),
        "AllowInterAgentCoordination" = COALESCE(p_allowinteragentcoordination, "AllowInterAgentCoordination"),
        "RequireApprovalForExternalComms" = COALESCE(p_requireapprovalforexternalcomms, "RequireApprovalForExternalComms"),
        "RequireApprovalForFinancials" = COALESCE(p_requireapprovalforfinancials, "RequireApprovalForFinancials"),
        "RequireApprovalForDestructiveActions" = COALESCE(p_requireapprovalfordestructiveactions, "RequireApprovalForDestructiveActions"),
        "AutoApproveAmountThreshold" = CASE WHEN p_autoapproveamountthreshold_clear = true THEN NULL ELSE COALESCE(p_autoapproveamountthreshold, "AutoApproveAmountThreshold") END,
        "EntityAccessRules" = CASE WHEN p_entityaccessrules_clear = true THEN NULL ELSE COALESCE(p_entityaccessrules, "EntityAccessRules") END,
        "ActionPolicyRules" = CASE WHEN p_actionpolicyrules_clear = true THEN NULL ELSE COALESCE(p_actionpolicyrules, "ActionPolicyRules") END,
        "InstructionsOverride" = CASE WHEN p_instructionsoverride_clear = true THEN NULL ELSE COALESCE(p_instructionsoverride, "InstructionsOverride") END,
        "CalendarChannelMode" = COALESCE(p_calendarchannelmode, "CalendarChannelMode")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentUserPolicies"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentUserPolicy" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentUserPolicy table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_user_policy"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_user_policy" ON "__mj"."AIAgentUserPolicy";

CREATE TRIGGER "trg_update_ai_agent_user_policy"
BEFORE UPDATE ON "__mj"."AIAgentUserPolicy"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_user_policy"();

/* spUpdate Permissions for MJ: AI Agent User Policies */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentUserPolicy" TO "cdp_Integration";

/* spDelete SQL for MJ: AI Agent User Policies */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversations
-- Item: spDeleteConversation
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Conversation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteConversation"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentExample"
        WHERE "SourceConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentExample"
        SET "SourceConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentNote"
        WHERE "SourceConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentNote"
        SET "SourceConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Sessions.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentSession"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentSession"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Artifacts records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationArtifact"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationArtifact"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Branches records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationBranch"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationBranch"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Details records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationDetail"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationDetail"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Skills records via ConversationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationSkill"
        WHERE "ConversationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationSkill"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversations.LastConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Conversation"
        WHERE "LastConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Conversation"
        SET "LastConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Meetings.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Meeting"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Meeting"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routines.ConversationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutine"
        WHERE "ConversationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutine"
        SET "ConversationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."Conversation"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversation" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversation" TO "cdp_Integration";

/* spDelete Permissions for MJ: Conversations */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversation" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteConversation" TO "cdp_Integration";

/* spCreate SQL for MJ: Entity Documents */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: spDeleteEntityDocument
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityDocument"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Content Sources.EntityDocumentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentSource"
        WHERE "EntityDocumentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ContentSource"
        SET "EntityDocumentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Duplicate Runs records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DuplicateRun"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteDuplicateRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Entity Document Runs records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityDocumentRun"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteEntityDocumentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Entity Document Settings records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityDocumentSetting"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteEntityDocumentSetting"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Entity Record Documents records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityRecordDocument"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteEntityRecordDocument"(v_rec."ID");
    END LOOP;

    
    DELETE FROM "__mj"."EntityDocument"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityDocument" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityDocument" TO "cdp_Developer";

/* spDelete Permissions for MJ: Entity Documents */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityDocument" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityDocument" TO "cdp_Developer";

/* spCreate SQL for MJ: Entity Form Contributions */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Form Contributions
-- Item: spCreateEntityFormContribution
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityFormContribution
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityFormContribution'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityFormContribution"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_componentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_slot varchar(30) DEFAULT NULL,
    p_sortkey int DEFAULT NULL,
    p_contributionkey_clear boolean DEFAULT false,
    p_contributionkey varchar(256) DEFAULT NULL,
    p_relatedentityid_clear boolean DEFAULT false,
    p_relatedentityid UUID DEFAULT NULL,
    p_relatedjoinfield_clear boolean DEFAULT false,
    p_relatedjoinfield varchar(255) DEFAULT NULL,
    p_replacessectionkey_clear boolean DEFAULT false,
    p_replacessectionkey varchar(255) DEFAULT NULL,
    p_replacessectionkeys_clear boolean DEFAULT false,
    p_replacessectionkeys TEXT DEFAULT NULL,
    p_replacesfieldnames_clear boolean DEFAULT false,
    p_replacesfieldnames TEXT DEFAULT NULL,
    p_insectionkey_clear boolean DEFAULT false,
    p_insectionkey varchar(255) DEFAULT NULL,
    p_sectionposition_clear boolean DEFAULT false,
    p_sectionposition varchar(10) DEFAULT NULL,
    p_inclusion_clear boolean DEFAULT false,
    p_inclusion varchar(10) DEFAULT NULL,
    p_chromegroup_clear boolean DEFAULT false,
    p_chromegroup varchar(10) DEFAULT NULL,
    p_presentation varchar(10) DEFAULT NULL,
    p_title_clear boolean DEFAULT false,
    p_title varchar(255) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(100) DEFAULT NULL,
    p_scope varchar(20) DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_roleid_clear boolean DEFAULT false,
    p_roleid UUID DEFAULT NULL,
    p_precedence int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_notes_clear boolean DEFAULT false,
    p_notes TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityFormContributions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityFormContribution"
        (
            "ID",
            "EntityID",
                "ComponentID",
                "Name",
                "Description",
                "Slot",
                "SortKey",
                "ContributionKey",
                "RelatedEntityID",
                "RelatedJoinField",
                "ReplacesSectionKey",
                "ReplacesSectionKeys",
                "ReplacesFieldNames",
                "InSectionKey",
                "SectionPosition",
                "Inclusion",
                "ChromeGroup",
                "Presentation",
                "Title",
                "Icon",
                "Scope",
                "UserID",
                "RoleID",
                "Precedence",
                "Status",
                "Configuration",
                "Notes"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_componentid,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_slot, 'after-fields'),
                COALESCE(p_sortkey, 0),
                CASE WHEN p_contributionkey_clear = true THEN NULL ELSE COALESCE(p_contributionkey, NULL) END,
                CASE WHEN p_relatedentityid_clear = true THEN NULL ELSE COALESCE(p_relatedentityid, NULL) END,
                CASE WHEN p_relatedjoinfield_clear = true THEN NULL ELSE COALESCE(p_relatedjoinfield, NULL) END,
                CASE WHEN p_replacessectionkey_clear = true THEN NULL ELSE COALESCE(p_replacessectionkey, NULL) END,
                CASE WHEN p_replacessectionkeys_clear = true THEN NULL ELSE COALESCE(p_replacessectionkeys, NULL) END,
                CASE WHEN p_replacesfieldnames_clear = true THEN NULL ELSE COALESCE(p_replacesfieldnames, NULL) END,
                CASE WHEN p_insectionkey_clear = true THEN NULL ELSE COALESCE(p_insectionkey, NULL) END,
                CASE WHEN p_sectionposition_clear = true THEN NULL ELSE COALESCE(p_sectionposition, NULL) END,
                CASE WHEN p_inclusion_clear = true THEN NULL ELSE COALESCE(p_inclusion, NULL) END,
                CASE WHEN p_chromegroup_clear = true THEN NULL ELSE COALESCE(p_chromegroup, NULL) END,
                COALESCE(p_presentation, 'panel'),
                CASE WHEN p_title_clear = true THEN NULL ELSE COALESCE(p_title, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                COALESCE(p_scope, 'User'),
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_roleid_clear = true THEN NULL ELSE COALESCE(p_roleid, NULL) END,
                COALESCE(p_precedence, 0),
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_notes_clear = true THEN NULL ELSE COALESCE(p_notes, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityFormContributions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityFormContribution" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityFormContribution" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityFormContribution" TO "cdp_UI";

/* spCreate Permissions for MJ: Entity Form Contributions */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityFormContribution" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityFormContribution" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityFormContribution" TO "cdp_UI";

/* spUpdate SQL for MJ: Entity Form Contributions */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Source Types
-- Item: spCreateExternalDataSourceType
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ExternalDataSourceType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateExternalDataSourceType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateExternalDataSourceType"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_driverclass varchar(255) DEFAULT NULL,
    p_requiredcredentialtypeid_clear boolean DEFAULT false,
    p_requiredcredentialtypeid UUID DEFAULT NULL,
    p_metadataintrospectionstrategy varchar(17) DEFAULT NULL,
    p_filterdialect varchar(9) DEFAULT NULL,
    p_pagingstrategy varchar(11) DEFAULT NULL,
    p_supportsschemaintrospection BOOLEAN DEFAULT NULL,
    p_supportsnativequeries BOOLEAN DEFAULT NULL,
    p_supportsreadwrite BOOLEAN DEFAULT NULL,
    p_status varchar(10) DEFAULT NULL
) RETURNS SETOF "__mj"."vwExternalDataSourceTypes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ExternalDataSourceType"
        (
            "ID",
            "Name",
                "Description",
                "DriverClass",
                "RequiredCredentialTypeID",
                "MetadataIntrospectionStrategy",
                "FilterDialect",
                "PagingStrategy",
                "SupportsSchemaIntrospection",
                "SupportsNativeQueries",
                "SupportsReadWrite",
                "Status"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_driverclass,
                CASE WHEN p_requiredcredentialtypeid_clear = true THEN NULL ELSE COALESCE(p_requiredcredentialtypeid, NULL) END,
                COALESCE(p_metadataintrospectionstrategy, 'Manual'),
                COALESCE(p_filterdialect, 'ansi'),
                COALESCE(p_pagingstrategy, 'LimitOffset'),
                COALESCE(p_supportsschemaintrospection, TRUE),
                COALESCE(p_supportsnativequeries, TRUE),
                COALESCE(p_supportsreadwrite, FALSE),
                COALESCE(p_status, 'Active')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwExternalDataSourceTypes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateExternalDataSourceType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateExternalDataSourceType" TO "cdp_Integration";

/* spCreate Permissions for MJ: External Data Source Types */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateExternalDataSourceType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateExternalDataSourceType" TO "cdp_Integration";

/* spUpdate SQL for MJ: External Data Source Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Source Types
-- Item: spUpdateExternalDataSourceType
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ExternalDataSourceType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateExternalDataSourceType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateExternalDataSourceType"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_driverclass varchar(255) DEFAULT NULL,
    p_requiredcredentialtypeid_clear boolean DEFAULT false,
    p_requiredcredentialtypeid UUID DEFAULT NULL,
    p_metadataintrospectionstrategy varchar(17) DEFAULT NULL,
    p_filterdialect varchar(9) DEFAULT NULL,
    p_pagingstrategy varchar(11) DEFAULT NULL,
    p_supportsschemaintrospection BOOLEAN DEFAULT NULL,
    p_supportsnativequeries BOOLEAN DEFAULT NULL,
    p_supportsreadwrite BOOLEAN DEFAULT NULL,
    p_status varchar(10) DEFAULT NULL
) RETURNS SETOF "__mj"."vwExternalDataSourceTypes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ExternalDataSourceType"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "DriverClass" = COALESCE(p_driverclass, "DriverClass"),
        "RequiredCredentialTypeID" = CASE WHEN p_requiredcredentialtypeid_clear = true THEN NULL ELSE COALESCE(p_requiredcredentialtypeid, "RequiredCredentialTypeID") END,
        "MetadataIntrospectionStrategy" = COALESCE(p_metadataintrospectionstrategy, "MetadataIntrospectionStrategy"),
        "FilterDialect" = COALESCE(p_filterdialect, "FilterDialect"),
        "PagingStrategy" = COALESCE(p_pagingstrategy, "PagingStrategy"),
        "SupportsSchemaIntrospection" = COALESCE(p_supportsschemaintrospection, "SupportsSchemaIntrospection"),
        "SupportsNativeQueries" = COALESCE(p_supportsnativequeries, "SupportsNativeQueries"),
        "SupportsReadWrite" = COALESCE(p_supportsreadwrite, "SupportsReadWrite"),
        "Status" = COALESCE(p_status, "Status")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwExternalDataSourceTypes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateExternalDataSourceType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateExternalDataSourceType" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalDataSourceType table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_external_data_source_type"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_external_data_source_type" ON "__mj"."ExternalDataSourceType";

CREATE TRIGGER "trg_update_external_data_source_type"
BEFORE UPDATE ON "__mj"."ExternalDataSourceType"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_external_data_source_type"();

/* spUpdate Permissions for MJ: External Data Source Types */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateExternalDataSourceType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateExternalDataSourceType" TO "cdp_Integration";

/* spDelete SQL for MJ: External Data Source Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Sources
-- Item: spCreateExternalDataSource
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ExternalDataSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateExternalDataSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateExternalDataSource"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_credentialid_clear boolean DEFAULT false,
    p_credentialid UUID DEFAULT NULL,
    p_defaultschema_clear boolean DEFAULT false,
    p_defaultschema varchar(255) DEFAULT NULL,
    p_defaultdatabase_clear boolean DEFAULT false,
    p_defaultdatabase varchar(255) DEFAULT NULL,
    p_connectionconfig_clear boolean DEFAULT false,
    p_connectionconfig TEXT DEFAULT NULL,
    p_defaultcachettlseconds int DEFAULT NULL,
    p_status varchar(10) DEFAULT NULL,
    p_lastconnectiontestat_clear boolean DEFAULT false,
    p_lastconnectiontestat TIMESTAMPTZ DEFAULT NULL,
    p_lastconnectiontestresult_clear boolean DEFAULT false,
    p_lastconnectiontestresult TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwExternalDataSources" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ExternalDataSource"
        (
            "ID",
            "Name",
                "Description",
                "TypeID",
                "CredentialID",
                "DefaultSchema",
                "DefaultDatabase",
                "ConnectionConfig",
                "DefaultCacheTTLSeconds",
                "Status",
                "LastConnectionTestAt",
                "LastConnectionTestResult"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_typeid,
                CASE WHEN p_credentialid_clear = true THEN NULL ELSE COALESCE(p_credentialid, NULL) END,
                CASE WHEN p_defaultschema_clear = true THEN NULL ELSE COALESCE(p_defaultschema, NULL) END,
                CASE WHEN p_defaultdatabase_clear = true THEN NULL ELSE COALESCE(p_defaultdatabase, NULL) END,
                CASE WHEN p_connectionconfig_clear = true THEN NULL ELSE COALESCE(p_connectionconfig, NULL) END,
                COALESCE(p_defaultcachettlseconds, 300),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_lastconnectiontestat_clear = true THEN NULL ELSE COALESCE(p_lastconnectiontestat, NULL) END,
                CASE WHEN p_lastconnectiontestresult_clear = true THEN NULL ELSE COALESCE(p_lastconnectiontestresult, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwExternalDataSources"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateExternalDataSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateExternalDataSource" TO "cdp_Integration";

/* spCreate Permissions for MJ: External Data Sources */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateExternalDataSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateExternalDataSource" TO "cdp_Integration";

/* spUpdate SQL for MJ: External Data Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: External Data Sources
-- Item: spUpdateExternalDataSource
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ExternalDataSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateExternalDataSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateExternalDataSource"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_credentialid_clear boolean DEFAULT false,
    p_credentialid UUID DEFAULT NULL,
    p_defaultschema_clear boolean DEFAULT false,
    p_defaultschema varchar(255) DEFAULT NULL,
    p_defaultdatabase_clear boolean DEFAULT false,
    p_defaultdatabase varchar(255) DEFAULT NULL,
    p_connectionconfig_clear boolean DEFAULT false,
    p_connectionconfig TEXT DEFAULT NULL,
    p_defaultcachettlseconds int DEFAULT NULL,
    p_status varchar(10) DEFAULT NULL,
    p_lastconnectiontestat_clear boolean DEFAULT false,
    p_lastconnectiontestat TIMESTAMPTZ DEFAULT NULL,
    p_lastconnectiontestresult_clear boolean DEFAULT false,
    p_lastconnectiontestresult TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwExternalDataSources" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ExternalDataSource"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "CredentialID" = CASE WHEN p_credentialid_clear = true THEN NULL ELSE COALESCE(p_credentialid, "CredentialID") END,
        "DefaultSchema" = CASE WHEN p_defaultschema_clear = true THEN NULL ELSE COALESCE(p_defaultschema, "DefaultSchema") END,
        "DefaultDatabase" = CASE WHEN p_defaultdatabase_clear = true THEN NULL ELSE COALESCE(p_defaultdatabase, "DefaultDatabase") END,
        "ConnectionConfig" = CASE WHEN p_connectionconfig_clear = true THEN NULL ELSE COALESCE(p_connectionconfig, "ConnectionConfig") END,
        "DefaultCacheTTLSeconds" = COALESCE(p_defaultcachettlseconds, "DefaultCacheTTLSeconds"),
        "Status" = COALESCE(p_status, "Status"),
        "LastConnectionTestAt" = CASE WHEN p_lastconnectiontestat_clear = true THEN NULL ELSE COALESCE(p_lastconnectiontestat, "LastConnectionTestAt") END,
        "LastConnectionTestResult" = CASE WHEN p_lastconnectiontestresult_clear = true THEN NULL ELSE COALESCE(p_lastconnectiontestresult, "LastConnectionTestResult") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwExternalDataSources"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateExternalDataSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateExternalDataSource" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalDataSource table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_external_data_source"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_external_data_source" ON "__mj"."ExternalDataSource";

CREATE TRIGGER "trg_update_external_data_source"
BEFORE UPDATE ON "__mj"."ExternalDataSource"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_external_data_source"();

/* spUpdate Permissions for MJ: External Data Sources */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateExternalDataSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateExternalDataSource" TO "cdp_Integration";

/* spDelete SQL for MJ: External Data Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Redemptions
-- Item: spCreateMagicLinkRedemption
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MagicLinkRedemption
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMagicLinkRedemption'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMagicLinkRedemption"(
    p_id UUID DEFAULT NULL,
    p_inviteid_clear boolean DEFAULT false,
    p_inviteid UUID DEFAULT NULL,
    p_attemptedat TIMESTAMPTZ DEFAULT NULL,
    p_outcome varchar(30) DEFAULT NULL,
    p_ipaddress_clear boolean DEFAULT false,
    p_ipaddress varchar(64) DEFAULT NULL,
    p_useragent_clear boolean DEFAULT false,
    p_useragent varchar(512) DEFAULT NULL,
    p_origin_clear boolean DEFAULT false,
    p_origin varchar(512) DEFAULT NULL,
    p_provisioneduserid_clear boolean DEFAULT false,
    p_provisioneduserid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwMagicLinkRedemptions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MagicLinkRedemption"
        (
            "ID",
            "InviteID",
                "AttemptedAt",
                "Outcome",
                "IPAddress",
                "UserAgent",
                "Origin",
                "ProvisionedUserID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_inviteid_clear = true THEN NULL ELSE COALESCE(p_inviteid, NULL) END,
                COALESCE(p_attemptedat, NOW()),
                p_outcome,
                CASE WHEN p_ipaddress_clear = true THEN NULL ELSE COALESCE(p_ipaddress, NULL) END,
                CASE WHEN p_useragent_clear = true THEN NULL ELSE COALESCE(p_useragent, NULL) END,
                CASE WHEN p_origin_clear = true THEN NULL ELSE COALESCE(p_origin, NULL) END,
                CASE WHEN p_provisioneduserid_clear = true THEN NULL ELSE COALESCE(p_provisioneduserid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMagicLinkRedemptions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMagicLinkRedemption" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMagicLinkRedemption" TO "cdp_Integration";

/* spCreate Permissions for MJ: Magic Link Redemptions */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMagicLinkRedemption" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMagicLinkRedemption" TO "cdp_Integration";

/* spUpdate SQL for MJ: Magic Link Redemptions */
