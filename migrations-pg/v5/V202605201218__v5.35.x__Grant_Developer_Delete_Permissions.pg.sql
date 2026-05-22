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


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwArtifactUses';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArtifactUses"
AS SELECT
    a.*,
    "MJArtifactVersion_ArtifactVersionID"."VersionNumber" AS "ArtifactVersion",
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
    "MJArtifactVersion_ArtifactVersionID"."VersionNumber" AS "ArtifactVersion"
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
    "MJArtifactVersion_ArtifactVersionID"."VersionNumber" AS "ArtifactVersion"
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
  v_target_name CONSTANT TEXT := 'vwConversationDetailArtifacts';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetailArtifacts"
AS SELECT
    c.*,
    "MJConversationDetail_ConversationDetailID"."Message" AS "ConversationDetail",
    "MJArtifactVersion_ArtifactVersionID"."VersionNumber" AS "ArtifactVersion"
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
  v_target_name CONSTANT TEXT := 'vwConversationDetailAttachments';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetailAttachments"
AS SELECT
    c.*,
    "MJConversationDetail_ConversationDetailID"."Message" AS "ConversationDetail",
    "MJAIModality_ModalityID"."Name" AS "Modality",
    "MJFile_FileID"."Name" AS "File",
    "MJArtifactVersion_ArtifactVersionID"."VersionNumber" AS "ArtifactVersion"
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


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

UPDATE __mj."EntityPermission" AS ep
SET "CanDelete" = TRUE
FROM
	__mj."Entity" e
WHERE
	ep."EntityID" = e."ID"
	AND ep."RoleID" = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'
  AND ep."CanDelete" = FALSE
  AND e."AllowDeleteAPI" = TRUE
  AND e."SchemaName" = '__mj'
  AND e."Name" NOT IN (
      -- Audit / log entities
      'MJ: Action Execution Logs',
      'MJ: API Key Usage Logs',
      'MJ: Communication Logs',
      'MJ: MCP Tool Execution Logs',
      'MJ: Record Changes',
      'MJ: Record Change Replay Runs',
      'MJ: Search Execution Logs',
      'MJ: Tag Audit Logs',
      -- System cache / runtime state
      'MJ: AI Result Cache',
      -- OAuth security-sensitive runtime
      'MJ: O Auth Tokens',
      'MJ: O Auth Authorization States',
      'MJ: O Auth Client Registrations',
      'MJ: O Auth Auth Server Metadata Caches',
      -- Global system configuration
      'MJ: Environments',
      'MJ: Instance Configurations',
      -- End-user-owned content
      'MJ: User Notifications',
      'MJ: User Notification Preferences',
      'MJ: User Settings',
      'MJ: Knowledge Hub Saved Searches'
  );


/* Base View SQL for MJ: Artifact Uses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Uses
-- Item: vwArtifactUses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Uses
-----               SCHEMA:      __mj
-----               BASE TABLE:  ArtifactUse
-----               PRIMARY KEY: ID
------------------------------------------------------------


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
-- ===================== Other =====================

-- Grant CanDelete to the Developer role on entities where it currently lacks it.
--
-- Context: CodeGen's default EntityPermission for the Developer role is
-- {Read:1, Create:1, Update:1, Delete:0}. The original "core" wave of entities
-- had Delete turned on manually long ago, but every entity added since has been
-- stuck on the default. As of this migration, Developer has Create+Update on
-- 311 entities but Delete on only 77 of them.
--
-- This migration grants Delete on every entity Developer can already create and
-- update, EXCEPT the categories below, which should remain locked:
--   - Audit / log entities (immutable history)
--   - System cache / runtime state
--   - OAuth security-sensitive runtime tables
--   - Global system configuration
--   - End-user-owned content (notifications, settings, saved searches)
--
-- Developer Role ID: DEAFCCEC-6A37-EF11-86D4-000D3A4E707E

/* spUpdate Permissions for MJ: Artifact Uses */

/* spUpdate Permissions for MJ: Artifact Version Attributes */

/* spUpdate Permissions for MJ: Collection Artifacts */

/* spUpdate Permissions for MJ: Conversation Detail Artifacts */

/* spUpdate Permissions for MJ: Conversation Detail Attachments */
