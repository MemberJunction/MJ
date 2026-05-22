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

-- Phase 1 — Lists ↔ Views Bridge.
--
-- Adds lineage columns to __mj."List" so a List can remember
-- the User View (or filter snapshot) it was materialized from, support
-- additive vs sync refresh modes, and record who refreshed it last.
--
-- Single consolidated ALTER TABLE per CLAUDE.md (one statement, multiple ADDs).
-- No __mj timestamp columns (CodeGen handles those on every table). No FK
-- indexes here (CodeGen emits IDX_AUTO_MJ_FKEY_* automatically).

-- Columns + their defaults + the discriminator CHECK constraint inlined.
-- Inlining the CHECK is required because SQL Server validates constraints
-- referencing newly added columns against existing rows in the same batch,
-- and the column isn't yet visible to a separate ADD CONSTRAINT statement
-- in the same migration file.
ALTER TABLE __mj."List"
 ADD COLUMN IF NOT EXISTS "SourceViewID" UUID NULL,
 ADD COLUMN IF NOT EXISTS "SourceFilterSnapshot" TEXT NULL,
 ADD COLUMN IF NOT EXISTS "LastRefreshedAt" TIMESTAMPTZ NULL,
 ADD COLUMN IF NOT EXISTS "LastRefreshedByUserID" UUID NULL,
 ADD COLUMN IF NOT EXISTS "RefreshMode" VARCHAR(20) NOT NULL
        CONSTRAINT DF_List_RefreshMode DEFAULT ('Additive')
        CONSTRAINT CK_List_RefreshMode CHECK ("RefreshMode" IN ('Additive', 'Sync')),
 ADD COLUMN IF NOT EXISTS "UseSnapshot" BOOLEAN NOT NULL
        CONSTRAINT DF_List_UseSnapshot DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_List_EntityID" ON __mj."List" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_List_UserID" ON __mj."List" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_List_CategoryID" ON __mj."List" ("CategoryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_List_CompanyIntegrationID" ON __mj."List" ("CompanyIntegrationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_List_SourceViewID" ON __mj."List" ("SourceViewID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_List_LastRefreshedByUserID" ON __mj."List" ("LastRefreshedByUserID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwArtifactUses';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArtifactUses"
AS SELECT
    a.*,
    "MJArtifactVersion_ArtifactVersionID"."Name" AS "ArtifactVersion",
    "MJUser_UserID"."Name" AS "User"
FROM
    __mj."ArtifactUse" AS a
INNER JOIN
    __mj."ArtifactVersion" AS "MJArtifactVersion_ArtifactVersionID"
  ON
    a."ArtifactVersionID" = "MJArtifactVersion_ArtifactVersionID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    a."UserID" = "MJUser_UserID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwArtifactVersionAttributes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArtifactVersionAttributes"
AS SELECT
    a.*,
    "MJArtifactVersion_ArtifactVersionID"."Name" AS "ArtifactVersion"
FROM
    __mj."ArtifactVersionAttribute" AS a
INNER JOIN
    __mj."ArtifactVersion" AS "MJArtifactVersion_ArtifactVersionID"
  ON
    a."ArtifactVersionID" = "MJArtifactVersion_ArtifactVersionID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwCollectionArtifacts';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCollectionArtifacts"
AS SELECT
    c.*,
    "MJCollection_CollectionID"."Name" AS "Collection",
    "MJArtifactVersion_ArtifactVersionID"."Name" AS "ArtifactVersion"
FROM
    __mj."CollectionArtifact" AS c
INNER JOIN
    __mj."Collection" AS "MJCollection_CollectionID"
  ON
    c."CollectionID" = "MJCollection_CollectionID"."ID"
INNER JOIN
    __mj."ArtifactVersion" AS "MJArtifactVersion_ArtifactVersionID"
  ON
    c."ArtifactVersionID" = "MJArtifactVersion_ArtifactVersionID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwConversationDetailAttachments';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetailAttachments"
AS SELECT
    c.*,
    "MJConversationDetail_ConversationDetailID"."Message" AS "ConversationDetail",
    "MJAIModality_ModalityID"."Name" AS "Modality",
    "MJFile_FileID"."Name" AS "File",
    "MJArtifactVersion_ArtifactVersionID"."Name" AS "ArtifactVersion"
FROM
    __mj."ConversationDetailAttachment" AS c
INNER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_ConversationDetailID"
  ON
    c."ConversationDetailID" = "MJConversationDetail_ConversationDetailID"."ID"
INNER JOIN
    __mj."AIModality" AS "MJAIModality_ModalityID"
  ON
    c."ModalityID" = "MJAIModality_ModalityID"."ID"
LEFT OUTER JOIN
    __mj."File" AS "MJFile_FileID"
  ON
    c."FileID" = "MJFile_FileID"."ID"
LEFT OUTER JOIN
    __mj."ArtifactVersion" AS "MJArtifactVersion_ArtifactVersionID"
  ON
    c."ArtifactVersionID" = "MJArtifactVersion_ArtifactVersionID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwConversationDetailArtifacts';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetailArtifacts"
AS SELECT
    c.*,
    "MJConversationDetail_ConversationDetailID"."Message" AS "ConversationDetail",
    "MJArtifactVersion_ArtifactVersionID"."Name" AS "ArtifactVersion"
FROM
    __mj."ConversationDetailArtifact" AS c
INNER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_ConversationDetailID"
  ON
    c."ConversationDetailID" = "MJConversationDetail_ConversationDetailID"."ID"
INNER JOIN
    __mj."ArtifactVersion" AS "MJArtifactVersion_ArtifactVersionID"
  ON
    c."ArtifactVersionID" = "MJArtifactVersion_ArtifactVersionID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwLists';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwLists"
AS SELECT
    l.*,
    "MJEntity_EntityID"."Name" AS "Entity",
    "MJUser_UserID"."Name" AS "User",
    "MJListCategory_CategoryID"."Name" AS "Category",
    "MJCompanyIntegration_CompanyIntegrationID"."Name" AS "CompanyIntegration",
    "MJUserView_SourceViewID"."Name" AS "SourceView",
    "MJUser_LastRefreshedByUserID"."Name" AS "LastRefreshedByUser"
FROM
    __mj."List" AS l
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    l."EntityID" = "MJEntity_EntityID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    l."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."ListCategory" AS "MJListCategory_CategoryID"
  ON
    l."CategoryID" = "MJListCategory_CategoryID"."ID"
LEFT OUTER JOIN
    __mj."CompanyIntegration" AS "MJCompanyIntegration_CompanyIntegrationID"
  ON
    l."CompanyIntegrationID" = "MJCompanyIntegration_CompanyIntegrationID"."ID"
LEFT OUTER JOIN
    __mj."UserView" AS "MJUserView_SourceViewID"
  ON
    l."SourceViewID" = "MJUserView_SourceViewID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_LastRefreshedByUserID"
  ON
    l."LastRefreshedByUserID" = "MJUser_LastRefreshedByUserID"."ID"$vsql$;
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
           WHERE proname = 'spCreateArtifactUse'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateArtifactUse"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_UsageType VARCHAR(20) DEFAULT NULL,
    IN p_UsageContext_Clear BOOLEAN DEFAULT FALSE,
    IN p_UsageContext TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwArtifactUses" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ArtifactUse"
            (
                "ID",
                "ArtifactVersionID",
                "UserID",
                "UsageType",
                "UsageContext"
            )
        VALUES
            (
                p_ID,
                p_ArtifactVersionID,
                p_UserID,
                p_UsageType,
                CASE WHEN p_UsageContext_Clear = TRUE THEN NULL ELSE COALESCE(p_UsageContext, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ArtifactUse"
            (
                "ArtifactVersionID",
                "UserID",
                "UsageType",
                "UsageContext"
            )
        VALUES
            (
                p_ArtifactVersionID,
                p_UserID,
                p_UsageType,
                CASE WHEN p_UsageContext_Clear = TRUE THEN NULL ELSE COALESCE(p_UsageContext, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwArtifactUses" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateArtifactUse'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateArtifactUse"(
    IN p_ID UUID,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_UsageType VARCHAR(20) DEFAULT NULL,
    IN p_UsageContext_Clear BOOLEAN DEFAULT FALSE,
    IN p_UsageContext TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwArtifactUses" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ArtifactUse"
    SET
        "ArtifactVersionID" = COALESCE(p_ArtifactVersionID, "ArtifactVersionID"),
        "UserID" = COALESCE(p_UserID, "UserID"),
        "UsageType" = COALESCE(p_UsageType, "UsageType"),
        "UsageContext" = CASE WHEN p_UsageContext_Clear = TRUE THEN NULL ELSE COALESCE(p_UsageContext, "UsageContext") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwArtifactUses" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwArtifactUses" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArtifactUse'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactUse"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArtifactUse"
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
           WHERE proname = 'spCreateArtifactVersionAttribute'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateArtifactVersionAttribute"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Type VARCHAR(500) DEFAULT NULL,
    IN p_Value_Clear BOOLEAN DEFAULT FALSE,
    IN p_Value TEXT DEFAULT NULL,
    IN p_StandardProperty_Clear BOOLEAN DEFAULT FALSE,
    IN p_StandardProperty VARCHAR(50) DEFAULT NULL
)
RETURNS SETOF __mj."vwArtifactVersionAttributes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ArtifactVersionAttribute"
            (
                "ID",
                "ArtifactVersionID",
                "Name",
                "Type",
                "Value",
                "StandardProperty"
            )
        VALUES
            (
                p_ID,
                p_ArtifactVersionID,
                p_Name,
                p_Type,
                CASE WHEN p_Value_Clear = TRUE THEN NULL ELSE COALESCE(p_Value, NULL) END,
                CASE WHEN p_StandardProperty_Clear = TRUE THEN NULL ELSE COALESCE(p_StandardProperty, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ArtifactVersionAttribute"
            (
                "ArtifactVersionID",
                "Name",
                "Type",
                "Value",
                "StandardProperty"
            )
        VALUES
            (
                p_ArtifactVersionID,
                p_Name,
                p_Type,
                CASE WHEN p_Value_Clear = TRUE THEN NULL ELSE COALESCE(p_Value, NULL) END,
                CASE WHEN p_StandardProperty_Clear = TRUE THEN NULL ELSE COALESCE(p_StandardProperty, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwArtifactVersionAttributes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateArtifactVersionAttribute'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateArtifactVersionAttribute"(
    IN p_ID UUID,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Type VARCHAR(500) DEFAULT NULL,
    IN p_Value_Clear BOOLEAN DEFAULT FALSE,
    IN p_Value TEXT DEFAULT NULL,
    IN p_StandardProperty_Clear BOOLEAN DEFAULT FALSE,
    IN p_StandardProperty VARCHAR(50) DEFAULT NULL
)
RETURNS SETOF __mj."vwArtifactVersionAttributes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ArtifactVersionAttribute"
    SET
        "ArtifactVersionID" = COALESCE(p_ArtifactVersionID, "ArtifactVersionID"),
        "Name" = COALESCE(p_Name, "Name"),
        "Type" = COALESCE(p_Type, "Type"),
        "Value" = CASE WHEN p_Value_Clear = TRUE THEN NULL ELSE COALESCE(p_Value, "Value") END,
        "StandardProperty" = CASE WHEN p_StandardProperty_Clear = TRUE THEN NULL ELSE COALESCE(p_StandardProperty, "StandardProperty") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwArtifactVersionAttributes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwArtifactVersionAttributes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArtifactVersionAttribute'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactVersionAttribute"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArtifactVersionAttribute"
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
           WHERE proname = 'spCreateCollectionArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateCollectionArtifact"(
    IN p_ID UUID DEFAULT NULL,
    IN p_CollectionID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_ArtifactVersionID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwCollectionArtifacts" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CollectionArtifact"
            (
                "ID",
                "CollectionID",
                "Sequence",
                "ArtifactVersionID"
            )
        VALUES
            (
                p_ID,
                p_CollectionID,
                COALESCE(p_Sequence, 0),
                p_ArtifactVersionID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CollectionArtifact"
            (
                "CollectionID",
                "Sequence",
                "ArtifactVersionID"
            )
        VALUES
            (
                p_CollectionID,
                COALESCE(p_Sequence, 0),
                p_ArtifactVersionID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCollectionArtifacts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateCollectionArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateCollectionArtifact"(
    IN p_ID UUID,
    IN p_CollectionID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_ArtifactVersionID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwCollectionArtifacts" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CollectionArtifact"
    SET
        "CollectionID" = COALESCE(p_CollectionID, "CollectionID"),
        "Sequence" = COALESCE(p_Sequence, "Sequence"),
        "ArtifactVersionID" = COALESCE(p_ArtifactVersionID, "ArtifactVersionID")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCollectionArtifacts" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCollectionArtifacts" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCollectionArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCollectionArtifact"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CollectionArtifact"
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
           WHERE proname = 'spCreateConversationDetailAttachment'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailAttachment"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ModalityID UUID DEFAULT NULL,
    IN p_MimeType VARCHAR(100) DEFAULT NULL,
    IN p_FileName_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileName VARCHAR(4000) DEFAULT NULL,
    IN p_FileSizeBytes INTEGER DEFAULT NULL,
    IN p_Width_Clear BOOLEAN DEFAULT FALSE,
    IN p_Width INTEGER DEFAULT NULL,
    IN p_Height_Clear BOOLEAN DEFAULT FALSE,
    IN p_Height INTEGER DEFAULT NULL,
    IN p_DurationSeconds_Clear BOOLEAN DEFAULT FALSE,
    IN p_DurationSeconds INTEGER DEFAULT NULL,
    IN p_InlineData_Clear BOOLEAN DEFAULT FALSE,
    IN p_InlineData TEXT DEFAULT NULL,
    IN p_FileID_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileID UUID DEFAULT NULL,
    IN p_DisplayOrder INTEGER DEFAULT NULL,
    IN p_ThumbnailBase64_Clear BOOLEAN DEFAULT FALSE,
    IN p_ThumbnailBase64 TEXT DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_ArtifactVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactVersionID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetailAttachments" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ConversationDetailAttachment"
            (
                "ID",
                "ConversationDetailID",
                "ModalityID",
                "MimeType",
                "FileName",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "InlineData",
                "FileID",
                "DisplayOrder",
                "ThumbnailBase64",
                "Description",
                "ArtifactVersionID"
            )
        VALUES
            (
                p_ID,
                p_ConversationDetailID,
                p_ModalityID,
                p_MimeType,
                CASE WHEN p_FileName_Clear = TRUE THEN NULL ELSE COALESCE(p_FileName, NULL) END,
                p_FileSizeBytes,
                CASE WHEN p_Width_Clear = TRUE THEN NULL ELSE COALESCE(p_Width, NULL) END,
                CASE WHEN p_Height_Clear = TRUE THEN NULL ELSE COALESCE(p_Height, NULL) END,
                CASE WHEN p_DurationSeconds_Clear = TRUE THEN NULL ELSE COALESCE(p_DurationSeconds, NULL) END,
                CASE WHEN p_InlineData_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineData, NULL) END,
                CASE WHEN p_FileID_Clear = TRUE THEN NULL ELSE COALESCE(p_FileID, NULL) END,
                COALESCE(p_DisplayOrder, 0),
                CASE WHEN p_ThumbnailBase64_Clear = TRUE THEN NULL ELSE COALESCE(p_ThumbnailBase64, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ConversationDetailAttachment"
            (
                "ConversationDetailID",
                "ModalityID",
                "MimeType",
                "FileName",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "InlineData",
                "FileID",
                "DisplayOrder",
                "ThumbnailBase64",
                "Description",
                "ArtifactVersionID"
            )
        VALUES
            (
                p_ConversationDetailID,
                p_ModalityID,
                p_MimeType,
                CASE WHEN p_FileName_Clear = TRUE THEN NULL ELSE COALESCE(p_FileName, NULL) END,
                p_FileSizeBytes,
                CASE WHEN p_Width_Clear = TRUE THEN NULL ELSE COALESCE(p_Width, NULL) END,
                CASE WHEN p_Height_Clear = TRUE THEN NULL ELSE COALESCE(p_Height, NULL) END,
                CASE WHEN p_DurationSeconds_Clear = TRUE THEN NULL ELSE COALESCE(p_DurationSeconds, NULL) END,
                CASE WHEN p_InlineData_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineData, NULL) END,
                CASE WHEN p_FileID_Clear = TRUE THEN NULL ELSE COALESCE(p_FileID, NULL) END,
                COALESCE(p_DisplayOrder, 0),
                CASE WHEN p_ThumbnailBase64_Clear = TRUE THEN NULL ELSE COALESCE(p_ThumbnailBase64, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailAttachments" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateConversationDetailAttachment'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailAttachment"(
    IN p_ID UUID,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ModalityID UUID DEFAULT NULL,
    IN p_MimeType VARCHAR(100) DEFAULT NULL,
    IN p_FileName_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileName VARCHAR(4000) DEFAULT NULL,
    IN p_FileSizeBytes INTEGER DEFAULT NULL,
    IN p_Width_Clear BOOLEAN DEFAULT FALSE,
    IN p_Width INTEGER DEFAULT NULL,
    IN p_Height_Clear BOOLEAN DEFAULT FALSE,
    IN p_Height INTEGER DEFAULT NULL,
    IN p_DurationSeconds_Clear BOOLEAN DEFAULT FALSE,
    IN p_DurationSeconds INTEGER DEFAULT NULL,
    IN p_InlineData_Clear BOOLEAN DEFAULT FALSE,
    IN p_InlineData TEXT DEFAULT NULL,
    IN p_FileID_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileID UUID DEFAULT NULL,
    IN p_DisplayOrder INTEGER DEFAULT NULL,
    IN p_ThumbnailBase64_Clear BOOLEAN DEFAULT FALSE,
    IN p_ThumbnailBase64 TEXT DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_ArtifactVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactVersionID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetailAttachments" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ConversationDetailAttachment"
    SET
        "ConversationDetailID" = COALESCE(p_ConversationDetailID, "ConversationDetailID"),
        "ModalityID" = COALESCE(p_ModalityID, "ModalityID"),
        "MimeType" = COALESCE(p_MimeType, "MimeType"),
        "FileName" = CASE WHEN p_FileName_Clear = TRUE THEN NULL ELSE COALESCE(p_FileName, "FileName") END,
        "FileSizeBytes" = COALESCE(p_FileSizeBytes, "FileSizeBytes"),
        "Width" = CASE WHEN p_Width_Clear = TRUE THEN NULL ELSE COALESCE(p_Width, "Width") END,
        "Height" = CASE WHEN p_Height_Clear = TRUE THEN NULL ELSE COALESCE(p_Height, "Height") END,
        "DurationSeconds" = CASE WHEN p_DurationSeconds_Clear = TRUE THEN NULL ELSE COALESCE(p_DurationSeconds, "DurationSeconds") END,
        "InlineData" = CASE WHEN p_InlineData_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineData, "InlineData") END,
        "FileID" = CASE WHEN p_FileID_Clear = TRUE THEN NULL ELSE COALESCE(p_FileID, "FileID") END,
        "DisplayOrder" = COALESCE(p_DisplayOrder, "DisplayOrder"),
        "ThumbnailBase64" = CASE WHEN p_ThumbnailBase64_Clear = TRUE THEN NULL ELSE COALESCE(p_ThumbnailBase64, "ThumbnailBase64") END,
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "ArtifactVersionID" = CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, "ArtifactVersionID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwConversationDetailAttachments" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwConversationDetailAttachments" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationDetailAttachment'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailAttachment"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ConversationDetailAttachment"
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
           WHERE proname = 'spCreateConversationDetailArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailArtifact"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_Direction VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetailArtifacts" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ConversationDetailArtifact"
            (
                "ID",
                "ConversationDetailID",
                "ArtifactVersionID",
                "Direction"
            )
        VALUES
            (
                p_ID,
                p_ConversationDetailID,
                p_ArtifactVersionID,
                COALESCE(p_Direction, 'Output')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ConversationDetailArtifact"
            (
                "ConversationDetailID",
                "ArtifactVersionID",
                "Direction"
            )
        VALUES
            (
                p_ConversationDetailID,
                p_ArtifactVersionID,
                COALESCE(p_Direction, 'Output')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailArtifacts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateConversationDetailArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailArtifact"(
    IN p_ID UUID,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_Direction VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetailArtifacts" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ConversationDetailArtifact"
    SET
        "ConversationDetailID" = COALESCE(p_ConversationDetailID, "ConversationDetailID"),
        "ArtifactVersionID" = COALESCE(p_ArtifactVersionID, "ArtifactVersionID"),
        "Direction" = COALESCE(p_Direction, "Direction")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwConversationDetailArtifacts" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwConversationDetailArtifacts" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationDetailArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailArtifact"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ConversationDetailArtifact"
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
           WHERE proname = 'spCreateList'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateList"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_CategoryID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CategoryID UUID DEFAULT NULL,
    IN p_ExternalSystemRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalSystemRecordID VARCHAR(100) DEFAULT NULL,
    IN p_CompanyIntegrationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyIntegrationID UUID DEFAULT NULL,
    IN p_SourceViewID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceViewID UUID DEFAULT NULL,
    IN p_SourceFilterSnapshot_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceFilterSnapshot TEXT DEFAULT NULL,
    IN p_LastRefreshedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRefreshedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastRefreshedByUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRefreshedByUserID UUID DEFAULT NULL,
    IN p_RefreshMode VARCHAR(20) DEFAULT NULL,
    IN p_UseSnapshot BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwLists" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."List"
            (
                "ID",
                "Name",
                "Description",
                "EntityID",
                "UserID",
                "CategoryID",
                "ExternalSystemRecordID",
                "CompanyIntegrationID",
                "SourceViewID",
                "SourceFilterSnapshot",
                "LastRefreshedAt",
                "LastRefreshedByUserID",
                "RefreshMode",
                "UseSnapshot"
            )
        VALUES
            (
                p_ID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_EntityID,
                p_UserID,
                CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, NULL) END,
                CASE WHEN p_ExternalSystemRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalSystemRecordID, NULL) END,
                CASE WHEN p_CompanyIntegrationID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyIntegrationID, NULL) END,
                CASE WHEN p_SourceViewID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceViewID, NULL) END,
                CASE WHEN p_SourceFilterSnapshot_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceFilterSnapshot, NULL) END,
                CASE WHEN p_LastRefreshedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRefreshedAt, NULL) END,
                CASE WHEN p_LastRefreshedByUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRefreshedByUserID, NULL) END,
                COALESCE(p_RefreshMode, 'Additive'),
                COALESCE(p_UseSnapshot, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."List"
            (
                "Name",
                "Description",
                "EntityID",
                "UserID",
                "CategoryID",
                "ExternalSystemRecordID",
                "CompanyIntegrationID",
                "SourceViewID",
                "SourceFilterSnapshot",
                "LastRefreshedAt",
                "LastRefreshedByUserID",
                "RefreshMode",
                "UseSnapshot"
            )
        VALUES
            (
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_EntityID,
                p_UserID,
                CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, NULL) END,
                CASE WHEN p_ExternalSystemRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalSystemRecordID, NULL) END,
                CASE WHEN p_CompanyIntegrationID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyIntegrationID, NULL) END,
                CASE WHEN p_SourceViewID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceViewID, NULL) END,
                CASE WHEN p_SourceFilterSnapshot_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceFilterSnapshot, NULL) END,
                CASE WHEN p_LastRefreshedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRefreshedAt, NULL) END,
                CASE WHEN p_LastRefreshedByUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRefreshedByUserID, NULL) END,
                COALESCE(p_RefreshMode, 'Additive'),
                COALESCE(p_UseSnapshot, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwLists" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateList'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateList"(
    IN p_ID UUID,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_CategoryID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CategoryID UUID DEFAULT NULL,
    IN p_ExternalSystemRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalSystemRecordID VARCHAR(100) DEFAULT NULL,
    IN p_CompanyIntegrationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyIntegrationID UUID DEFAULT NULL,
    IN p_SourceViewID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceViewID UUID DEFAULT NULL,
    IN p_SourceFilterSnapshot_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceFilterSnapshot TEXT DEFAULT NULL,
    IN p_LastRefreshedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRefreshedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastRefreshedByUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRefreshedByUserID UUID DEFAULT NULL,
    IN p_RefreshMode VARCHAR(20) DEFAULT NULL,
    IN p_UseSnapshot BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwLists" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."List"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "EntityID" = COALESCE(p_EntityID, "EntityID"),
        "UserID" = COALESCE(p_UserID, "UserID"),
        "CategoryID" = CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, "CategoryID") END,
        "ExternalSystemRecordID" = CASE WHEN p_ExternalSystemRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalSystemRecordID, "ExternalSystemRecordID") END,
        "CompanyIntegrationID" = CASE WHEN p_CompanyIntegrationID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyIntegrationID, "CompanyIntegrationID") END,
        "SourceViewID" = CASE WHEN p_SourceViewID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceViewID, "SourceViewID") END,
        "SourceFilterSnapshot" = CASE WHEN p_SourceFilterSnapshot_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceFilterSnapshot, "SourceFilterSnapshot") END,
        "LastRefreshedAt" = CASE WHEN p_LastRefreshedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRefreshedAt, "LastRefreshedAt") END,
        "LastRefreshedByUserID" = CASE WHEN p_LastRefreshedByUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRefreshedByUserID, "LastRefreshedByUserID") END,
        "RefreshMode" = COALESCE(p_RefreshMode, "RefreshMode"),
        "UseSnapshot" = COALESCE(p_UseSnapshot, "UseSnapshot")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwLists" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwLists" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteList'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteList"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."List"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateArtifactUse_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateArtifactUse" ON __mj."ArtifactUse";
CREATE TRIGGER "trgUpdateArtifactUse"
    BEFORE UPDATE ON __mj."ArtifactUse"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateArtifactUse_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateArtifactVersionAttribute_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateArtifactVersionAttribute" ON __mj."ArtifactVersionAttribute";
CREATE TRIGGER "trgUpdateArtifactVersionAttribute"
    BEFORE UPDATE ON __mj."ArtifactVersionAttribute"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateArtifactVersionAttribute_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCollectionArtifact_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCollectionArtifact" ON __mj."CollectionArtifact";
CREATE TRIGGER "trgUpdateCollectionArtifact"
    BEFORE UPDATE ON __mj."CollectionArtifact"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCollectionArtifact_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateConversationDetailAttachment_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateConversationDetailAttachment" ON __mj."ConversationDetailAttachment";
CREATE TRIGGER "trgUpdateConversationDetailAttachment"
    BEFORE UPDATE ON __mj."ConversationDetailAttachment"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateConversationDetailAttachment_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateConversationDetailArtifact_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateConversationDetailArtifact" ON __mj."ConversationDetailArtifact";
CREATE TRIGGER "trgUpdateConversationDetailArtifact"
    BEFORE UPDATE ON __mj."ConversationDetailArtifact"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateConversationDetailArtifact_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateList_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateList" ON __mj."List";
CREATE TRIGGER "trgUpdateList"
    BEFORE UPDATE ON __mj."List"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateList_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9918d443-54bc-475f-9a96-3f89981bf8a1' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SourceViewID')
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
        '9918d443-54bc-475f-9a96-3f89981bf8a1',
        'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Lists"
        100031,
        'SourceViewID',
        'Source View ID',
        'Optional ID of the User View this list was materialized from. NULL for hand-built lists. When set, the list can be refreshed against this view via ListOperations."RefreshFromSource".',
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
        'E4238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ea6287aa-3aeb-4d8f-b280-014ec15f1f07' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SourceFilterSnapshot')
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
        'ea6287aa-3aeb-4d8f-b280-014ec15f1f07',
        'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Lists"
        100032,
        'SourceFilterSnapshot',
        'Source Filter Snapshot',
        'JSON snapshot of the source filter at materialization time. When UseSnapshot=1, refreshes re-apply this snapshot rather than re-reading the live source view. Null when no snapshot was captured.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ceee59e0-6039-409e-a54b-0d6d59ac84f2' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'LastRefreshedAt')
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
        'ceee59e0-6039-409e-a54b-0d6d59ac84f2',
        'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Lists"
        100033,
        'LastRefreshedAt',
        'Last Refreshed At',
        'Timestamp (UTC) of the most recent successful RefreshFromSource. Null when the list has never been refreshed.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bbe90a96-fd40-40d7-8ff0-69661b9a6872' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'LastRefreshedByUserID')
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
        'bbe90a96-fd40-40d7-8ff0-69661b9a6872',
        'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Lists"
        100034,
        'LastRefreshedByUserID',
        'Last Refreshed By User ID',
        'User who triggered the most recent successful RefreshFromSource. Null when the list has never been refreshed.',
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
        'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08bd4751-c950-46a2-b010-d3771d0c3525' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RefreshMode')
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
        '08bd4751-c950-46a2-b010-d3771d0c3525',
        'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Lists"
        100035,
        'RefreshMode',
        'Refresh Mode',
        'Default refresh mode for this list. Additive only adds new members; Sync reconciles in both directions (may remove members no longer in the source — requires explicit drop-confirmation).',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Additive',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1028ff74-1d87-4736-b9e0-ff8d23d866b8' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'UseSnapshot')
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
        '1028ff74-1d87-4736-b9e0-ff8d23d866b8',
        'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Lists"
        100036,
        'UseSnapshot',
        'Use Snapshot',
        'When 1, RefreshFromSource uses SourceFilterSnapshot as the source. When 0 (default), it re-reads the live SourceView.',
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
                                       ('860ab572-5364-4592-af69-2b2023be5045', '08BD4751-C950-46A2-B010-D3771D0C3525', 1, 'Additive', 'Additive', NOW(), NOW());

/* SQL text to insert entity field value with ID df91df32-5318-40ec-aa37-745818185534 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('df91df32-5318-40ec-aa37-745818185534', '08BD4751-C950-46A2-B010-D3771D0C3525', 2, 'Sync', 'Sync', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 08BD4751-C950-46A2-B010-D3771D0C3525 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='08BD4751-C950-46A2-B010-D3771D0C3525';


/* Create Entity Relationship: MJ: Users -> MJ: Lists (One To Many via LastRefreshedByUserID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ba9804ad-21a0-4e0e-8372-42f6737713d4'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('ba9804ad-21a0-4e0e-8372-42f6737713d4', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'LastRefreshedByUserID', 'One To Many', TRUE, TRUE, 97, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '645fceb3-840b-4fd6-b9e5-179484d51c6b'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('645fceb3-840b-4fd6-b9e5-179484d51c6b', 'E4238F34-2837-EF11-86D4-6045BDEE16E6', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'SourceViewID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3d8e1713-738a-48b3-9e44-bd95d83f8c19' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SourceView')
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
        '3d8e1713-738a-48b3-9e44-bd95d83f8c19',
        'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Lists"
        100041,
        'SourceView',
        'Source View',
        NULL,
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '78a54460-43bc-43f3-8ced-4aeb98d040b2' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'LastRefreshedByUser')
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
        '78a54460-43bc-43f3-8ced-4aeb98d040b2',
        'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Lists"
        100042,
        'LastRefreshedByUser',
        'Last Refreshed By User',
        NULL,
        'TEXT',
        200,
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
               WHERE "ID" = 'CEEE59E0-6039-409E-A54B-0D6D59AC84F2'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '08BD4751-C950-46A2-B010-D3771D0C3525'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '1C4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '154417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '154417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '1C4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Lists."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C94217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A14D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Description',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A24D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."ExternalSystemRecordID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1C4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."EntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."UserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."CategoryID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AE4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."CompanyIntegrationID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Company Integration',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1D4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."Entity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '154417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."User"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4C4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Category Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7CB4656E-44E7-450B-9E8E-97737DEDC32D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."CompanyIntegration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Company Integration Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CE34E0B1-EA4C-4BF2-8A9A-64A96F1DE8DD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."SourceViewID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Refresh Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source View',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9918D443-54BC-475F-9A96-3F89981BF8A1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."SourceView"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Refresh Settings',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source View Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3D8E1713-738A-48B3-9E44-BD95D83F8C19' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."SourceFilterSnapshot"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Refresh Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = NULL
WHERE 
   "ID" = 'EA6287AA-3AEB-4D8F-B280-014EC15F1F07' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."UseSnapshot"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Refresh Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1028FF74-1D87-4736-B9E0-FF8D23D866B8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."RefreshMode"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Refresh Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '08BD4751-C950-46A2-B010-D3771D0C3525' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."LastRefreshedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Refresh Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CEEE59E0-6039-409E-A54B-0D6D59AC84F2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."LastRefreshedByUserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Refresh Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BBE90A96-FD40-40D7-8FF0-69661B9A6872' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists."LastRefreshedByUser"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Refresh Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '78A54460-43BC-43F3-8CED-4AEB98D040B2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '535817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Lists.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '545817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('148b7955-5af0-48a2-b9c3-3a34403eb389', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Refresh Settings":{"icon":"fa fa-sync-alt","description":"Configuration for automated list refreshing and source synchronization"}}', NOW(), NOW());

/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Refresh Settings":"fa fa-sync-alt"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryIcons';


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

-- Foreign keys (separate batch so the FK can see the column).
ALTER TABLE __mj."List"
 ADD CONSTRAINT "FK_List_SourceView"
        FOREIGN KEY ("SourceViewID")
        REFERENCES __mj."UserView"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."List"
 ADD CONSTRAINT "FK_List_LastRefreshedBy"
        FOREIGN KEY ("LastRefreshedByUserID")
        REFERENCES __mj."User"("ID") DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwArtifactUses" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Artifact Uses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Uses
-- Item: Permissions for vwArtifactUses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArtifactUses" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Artifact Uses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Uses
-- Item: spCreateArtifactUse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactUse
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArtifactUse" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Artifact Uses */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArtifactUse" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Artifact Uses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Uses
-- Item: spUpdateArtifactUse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactUse
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArtifactUse" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArtifactUse" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Artifact Uses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Uses
-- Item: spDeleteArtifactUse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactUse
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactUse" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Artifact Uses */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactUse" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: vwArtifactVersionAttributes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Version Attributes
-----               SCHEMA:      __mj
-----               BASE TABLE:  ArtifactVersionAttribute
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArtifactVersionAttributes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: Permissions for vwArtifactVersionAttributes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArtifactVersionAttributes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: spCreateArtifactVersionAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactVersionAttribute
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArtifactVersionAttribute" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Artifact Version Attributes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArtifactVersionAttribute" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: spUpdateArtifactVersionAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactVersionAttribute
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArtifactVersionAttribute" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArtifactVersionAttribute" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: spDeleteArtifactVersionAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactVersionAttribute
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactVersionAttribute" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Artifact Version Attributes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactVersionAttribute" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: vwCollectionArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Collection Artifacts
-----               SCHEMA:      __mj
-----               BASE TABLE:  CollectionArtifact
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCollectionArtifacts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: Permissions for vwCollectionArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwCollectionArtifacts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: spCreateCollectionArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CollectionArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCollectionArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Collection Artifacts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCollectionArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: spUpdateCollectionArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CollectionArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCollectionArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCollectionArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: spDeleteCollectionArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CollectionArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCollectionArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Collection Artifacts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCollectionArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: vwConversationDetailAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Attachments
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationDetailAttachment
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetailAttachments" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: Permissions for vwConversationDetailAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetailAttachments" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spCreateConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailAttachment" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Conversation Detail Attachments */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailAttachment" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spUpdateConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailAttachment" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailAttachment" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spDeleteConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailAttachment" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Detail Attachments */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailAttachment" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: vwConversationDetailArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Artifacts
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationDetailArtifact
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetailArtifacts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: Permissions for vwConversationDetailArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetailArtifacts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: spCreateConversationDetailArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetailArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Conversation Detail Artifacts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: spUpdateConversationDetailArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetailArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: spDeleteConversationDetailArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailArtifact" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Detail Artifacts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailArtifact" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for List */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table List;

DO $$ BEGIN GRANT SELECT ON __mj."vwLists" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: Permissions for vwLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwLists" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spCreateList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR List
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateList" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Lists */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateList" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spUpdateList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR List
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateList" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateList" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spDeleteList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR List
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteList" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Lists */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteList" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."List"."SourceViewID" IS 'Optional ID of the User View this list was materialized from. NULL for hand-built lists. When set, the list can be refreshed against this view via ListOperations."RefreshFromSource".';

COMMENT ON COLUMN __mj."List"."SourceFilterSnapshot" IS 'JSON snapshot of the source filter at materialization time. When UseSnapshot=1, refreshes re-apply this snapshot rather than re-reading the live source view. Null when no snapshot was captured.';

COMMENT ON COLUMN __mj."List"."LastRefreshedAt" IS 'Timestamp (UTC) of the most recent successful RefreshFromSource. Null when the list has never been refreshed.';

COMMENT ON COLUMN __mj."List"."LastRefreshedByUserID" IS 'User who triggered the most recent successful RefreshFromSource. Null when the list has never been refreshed.';

COMMENT ON COLUMN __mj."List"."RefreshMode" IS 'Default refresh mode for this list. Additive only adds new members; Sync reconciles in both directions (may remove members no longer in the source — requires explicit drop-confirmation).';

COMMENT ON COLUMN __mj."List"."UseSnapshot" IS 'When 1, RefreshFromSource uses SourceFilterSnapshot as the source. When 0 (default), it re-reads the live SourceView.';


-- ===================== Other =====================

-- Column descriptions. CodeGen reads these into EntityField metadata on next run.

/* spUpdate Permissions for MJ: Artifact Uses */

/* spUpdate Permissions for MJ: Artifact Version Attributes */

/* spUpdate Permissions for MJ: Collection Artifacts */

/* spUpdate Permissions for MJ: Conversation Detail Attachments */

/* spUpdate Permissions for MJ: Conversation Detail Artifacts */

/* spUpdate Permissions for MJ: Lists */
