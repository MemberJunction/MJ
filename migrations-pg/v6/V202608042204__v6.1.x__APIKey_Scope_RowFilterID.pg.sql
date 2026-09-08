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

-- =============================================================================
-- API-Key-Scoped Row Filters (6.1)
-- =============================================================================
-- Design: plans/api-key-row-filters.md
--
-- MJ's row filtering binds to ROLES (EntityPermission.*RLSFilterID) and to
-- SESSIONS (UserInfo.MagicLinkScope), but never to an API KEY. Two keys issued
-- to the same user therefore have identical row visibility, and there is no way
-- to narrow one below the other — an API key cannot be *less* than its owner,
-- which is what would make key rotation and revocation meaningful as a
-- blast-radius control.
--
-- This migration adds the storage for that third dimension: an optional row
-- filter on each scope-rule row.
--
--   * APIKeyScope.RowFilterID          — row restriction this key's grant carries
--   * APIApplicationScope.RowFilterID  — ceiling every key in the application
--                                        inherits and cannot widen
--
-- Both reference the EXISTING [RowLevelSecurityFilter] table already used by
-- role-based RLS (four existing FKs, all from EntityPermission). Reusing it
-- means the key filter flows through the same MarkupFilterText substitution
-- engine and the same enforcement points, rather than introducing a second
-- filter language with its own composition and audit semantics.
--
-- The FK is deliberate beyond convenience: with NO ACTION (the default), a
-- filter record cannot be deleted while a live API key references it. You
-- cannot silently un-filter a key by deleting its filter.
--
-- BOTH COLUMNS ARE NULLABLE. NULL = current behavior, unchanged. This migration
-- is additive and changes no existing behavior on its own; enforcement lands
-- with the WS3 code (see the plan's §5.5 — the filter must be evaluated OUTSIDE
-- the role-RLS exemption, or it is silently absent for exactly the privileged
-- principals that hold API keys).
--
-- Deliberately NOT in this migration:
--   * FK indexes — CodeGen creates IDX_AUTO_MJ_FKEY_<table>_<column>
--   * EntityField / entity metadata rows — CodeGen owns these
--   * Views and stored procedures — CodeGen owns these
-- =============================================================================

-- ---------------------------------------------------------------------------
-- APIKeyScope: per-key row filter
-- ---------------------------------------------------------------------------
ALTER TABLE __mj."APIKeyScope"
 ADD COLUMN IF NOT EXISTS "RowFilterID" UUID NULL;

-- ---------------------------------------------------------------------------
-- APIApplicationScope: application ceiling row filter
-- ---------------------------------------------------------------------------
ALTER TABLE __mj."APIApplicationScope"
 ADD COLUMN IF NOT EXISTS "RowFilterID" UUID NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_APIApplicationScope_ApplicationID" ON __mj."APIApplicationScope" ("ApplicationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_APIApplicationScope_ScopeID" ON __mj."APIApplicationScope" ("ScopeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_APIApplicationScope_RowFilterID" ON __mj."APIApplicationScope" ("RowFilterID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_APIKeyScope_APIKeyID" ON __mj."APIKeyScope" ("APIKeyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_APIKeyScope_ScopeID" ON __mj."APIKeyScope" ("ScopeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_APIKeyScope_RowFilterID" ON __mj."APIKeyScope" ("RowFilterID");


-- ===================== Helper Functions (fn*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'fnContentItemChunkParentChunkID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnContentItemChunkParentChunkID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "ParentChunkID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."ContentItemChunk"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentChunkID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."ContentItemChunk" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentChunkID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentChunkID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwAPIApplicationScopes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAPIApplicationScopes"
AS SELECT
    a.*,
    "MJAPIApplication_ApplicationID"."Name" AS "Application",
    "MJAPIScope_ScopeID"."Name" AS "Scope",
    "MJRowLevelSecurityFilter_RowFilterID"."Name" AS "RowFilter"
FROM
    __mj."APIApplicationScope" AS a
INNER JOIN
    __mj."APIApplication" AS "MJAPIApplication_ApplicationID"
  ON
    a."ApplicationID" = "MJAPIApplication_ApplicationID"."ID"
INNER JOIN
    __mj."APIScope" AS "MJAPIScope_ScopeID"
  ON
    a."ScopeID" = "MJAPIScope_ScopeID"."ID"
LEFT OUTER JOIN
    __mj."RowLevelSecurityFilter" AS "MJRowLevelSecurityFilter_RowFilterID"
  ON
    a."RowFilterID" = "MJRowLevelSecurityFilter_RowFilterID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAPIKeyScopes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAPIKeyScopes"
AS SELECT
    a.*,
    "MJAPIKey_APIKeyID"."Label" AS "APIKey",
    "MJAPIScope_ScopeID"."Name" AS "Scope",
    "MJRowLevelSecurityFilter_RowFilterID"."Name" AS "RowFilter"
FROM
    __mj."APIKeyScope" AS a
INNER JOIN
    __mj."APIKey" AS "MJAPIKey_APIKeyID"
  ON
    a."APIKeyID" = "MJAPIKey_APIKeyID"."ID"
INNER JOIN
    __mj."APIScope" AS "MJAPIScope_ScopeID"
  ON
    a."ScopeID" = "MJAPIScope_ScopeID"."ID"
LEFT OUTER JOIN
    __mj."RowLevelSecurityFilter" AS "MJRowLevelSecurityFilter_RowFilterID"
  ON
    a."RowFilterID" = "MJRowLevelSecurityFilter_RowFilterID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwContentItemChunks';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentItemChunks"
AS SELECT
    c.*,
    "MJContentItem_ContentItemID"."Name" AS "ContentItem",
    "MJContentItemChunk_ParentChunkID"."SegmentTitle" AS "ParentChunk",
    "root_ParentChunkID"."RootID" AS "RootParentChunkID"
FROM
    __mj."ContentItemChunk" AS c
INNER JOIN
    __mj."ContentItem" AS "MJContentItem_ContentItemID"
  ON
    c."ContentItemID" = "MJContentItem_ContentItemID"."ID"
LEFT OUTER JOIN
    __mj."ContentItemChunk" AS "MJContentItemChunk_ParentChunkID"
  ON
    c."ParentChunkID" = "MJContentItemChunk_ParentChunkID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnContentItemChunkParentChunkID_GetRootID"(c."ID", c."ParentChunkID")) AS "root_ParentChunkID"
    ON TRUE$vsql$;
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
           WHERE proname = 'spCreateAPIApplicationScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAPIApplicationScope"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ApplicationID UUID DEFAULT NULL,
    IN p_ScopeID UUID DEFAULT NULL,
    IN p_ResourcePattern_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResourcePattern VARCHAR(750) DEFAULT NULL,
    IN p_PatternType VARCHAR(20) DEFAULT NULL,
    IN p_IsDeny BOOLEAN DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_RowFilterID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RowFilterID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwAPIApplicationScopes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."APIApplicationScope"
            (
                "ID",
                "ApplicationID",
                "ScopeID",
                "ResourcePattern",
                "PatternType",
                "IsDeny",
                "Priority",
                "RowFilterID"
            )
        VALUES
            (
                p_ID,
                p_ApplicationID,
                p_ScopeID,
                CASE WHEN p_ResourcePattern_Clear = TRUE THEN NULL ELSE COALESCE(p_ResourcePattern, NULL) END,
                COALESCE(p_PatternType, 'Include'),
                COALESCE(p_IsDeny, FALSE),
                COALESCE(p_Priority, 0),
                CASE WHEN p_RowFilterID_Clear = TRUE THEN NULL ELSE COALESCE(p_RowFilterID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."APIApplicationScope"
            (
                "ApplicationID",
                "ScopeID",
                "ResourcePattern",
                "PatternType",
                "IsDeny",
                "Priority",
                "RowFilterID"
            )
        VALUES
            (
                p_ApplicationID,
                p_ScopeID,
                CASE WHEN p_ResourcePattern_Clear = TRUE THEN NULL ELSE COALESCE(p_ResourcePattern, NULL) END,
                COALESCE(p_PatternType, 'Include'),
                COALESCE(p_IsDeny, FALSE),
                COALESCE(p_Priority, 0),
                CASE WHEN p_RowFilterID_Clear = TRUE THEN NULL ELSE COALESCE(p_RowFilterID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAPIApplicationScopes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAPIApplicationScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAPIApplicationScope"(
    IN p_ID UUID,
    IN p_ApplicationID UUID DEFAULT NULL,
    IN p_ScopeID UUID DEFAULT NULL,
    IN p_ResourcePattern_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResourcePattern VARCHAR(750) DEFAULT NULL,
    IN p_PatternType VARCHAR(20) DEFAULT NULL,
    IN p_IsDeny BOOLEAN DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_RowFilterID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RowFilterID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwAPIApplicationScopes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."APIApplicationScope"
    SET
        "ApplicationID" = COALESCE(p_ApplicationID, "ApplicationID"),
        "ScopeID" = COALESCE(p_ScopeID, "ScopeID"),
        "ResourcePattern" = CASE WHEN p_ResourcePattern_Clear = TRUE THEN NULL ELSE COALESCE(p_ResourcePattern, "ResourcePattern") END,
        "PatternType" = COALESCE(p_PatternType, "PatternType"),
        "IsDeny" = COALESCE(p_IsDeny, "IsDeny"),
        "Priority" = COALESCE(p_Priority, "Priority"),
        "RowFilterID" = CASE WHEN p_RowFilterID_Clear = TRUE THEN NULL ELSE COALESCE(p_RowFilterID, "RowFilterID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAPIApplicationScopes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAPIApplicationScopes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAPIApplicationScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAPIApplicationScope"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."APIApplicationScope"
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
           WHERE proname = 'spCreateAPIKeyScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAPIKeyScope"(
    IN p_ID UUID DEFAULT NULL,
    IN p_APIKeyID UUID DEFAULT NULL,
    IN p_ScopeID UUID DEFAULT NULL,
    IN p_ResourcePattern_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResourcePattern VARCHAR(750) DEFAULT NULL,
    IN p_PatternType VARCHAR(20) DEFAULT NULL,
    IN p_IsDeny BOOLEAN DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_RowFilterID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RowFilterID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwAPIKeyScopes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."APIKeyScope"
            (
                "ID",
                "APIKeyID",
                "ScopeID",
                "ResourcePattern",
                "PatternType",
                "IsDeny",
                "Priority",
                "RowFilterID"
            )
        VALUES
            (
                p_ID,
                p_APIKeyID,
                p_ScopeID,
                CASE WHEN p_ResourcePattern_Clear = TRUE THEN NULL ELSE COALESCE(p_ResourcePattern, NULL) END,
                COALESCE(p_PatternType, 'Include'),
                COALESCE(p_IsDeny, FALSE),
                COALESCE(p_Priority, 0),
                CASE WHEN p_RowFilterID_Clear = TRUE THEN NULL ELSE COALESCE(p_RowFilterID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."APIKeyScope"
            (
                "APIKeyID",
                "ScopeID",
                "ResourcePattern",
                "PatternType",
                "IsDeny",
                "Priority",
                "RowFilterID"
            )
        VALUES
            (
                p_APIKeyID,
                p_ScopeID,
                CASE WHEN p_ResourcePattern_Clear = TRUE THEN NULL ELSE COALESCE(p_ResourcePattern, NULL) END,
                COALESCE(p_PatternType, 'Include'),
                COALESCE(p_IsDeny, FALSE),
                COALESCE(p_Priority, 0),
                CASE WHEN p_RowFilterID_Clear = TRUE THEN NULL ELSE COALESCE(p_RowFilterID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAPIKeyScopes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAPIKeyScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAPIKeyScope"(
    IN p_ID UUID,
    IN p_APIKeyID UUID DEFAULT NULL,
    IN p_ScopeID UUID DEFAULT NULL,
    IN p_ResourcePattern_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResourcePattern VARCHAR(750) DEFAULT NULL,
    IN p_PatternType VARCHAR(20) DEFAULT NULL,
    IN p_IsDeny BOOLEAN DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_RowFilterID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RowFilterID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwAPIKeyScopes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."APIKeyScope"
    SET
        "APIKeyID" = COALESCE(p_APIKeyID, "APIKeyID"),
        "ScopeID" = COALESCE(p_ScopeID, "ScopeID"),
        "ResourcePattern" = CASE WHEN p_ResourcePattern_Clear = TRUE THEN NULL ELSE COALESCE(p_ResourcePattern, "ResourcePattern") END,
        "PatternType" = COALESCE(p_PatternType, "PatternType"),
        "IsDeny" = COALESCE(p_IsDeny, "IsDeny"),
        "Priority" = COALESCE(p_Priority, "Priority"),
        "RowFilterID" = CASE WHEN p_RowFilterID_Clear = TRUE THEN NULL ELSE COALESCE(p_RowFilterID, "RowFilterID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAPIKeyScopes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAPIKeyScopes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAPIKeyScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAPIKeyScope"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."APIKeyScope"
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
           WHERE proname = 'spCreateContentItemChunk'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateContentItemChunk"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ContentItemID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Text_Clear BOOLEAN DEFAULT FALSE,
    IN p_Text TEXT DEFAULT NULL,
    IN p_VectorRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_VectorRecordID VARCHAR(100) DEFAULT NULL,
    IN p_EmbeddingStatus VARCHAR(20) DEFAULT NULL,
    IN p_TaggingStatus VARCHAR(20) DEFAULT NULL,
    IN p_DeleteStatus_Clear BOOLEAN DEFAULT FALSE,
    IN p_DeleteStatus VARCHAR(20) DEFAULT NULL,
    IN p_LastEmbeddedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastEmbeddedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastTaggedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastTaggedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastDeletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastDeletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Modality VARCHAR(20) DEFAULT NULL,
    IN p_StartOffset_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartOffset INTEGER DEFAULT NULL,
    IN p_EndOffset_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndOffset INTEGER DEFAULT NULL,
    IN p_StartMs_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartMs INTEGER DEFAULT NULL,
    IN p_EndMs_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndMs INTEGER DEFAULT NULL,
    IN p_PageNumber_Clear BOOLEAN DEFAULT FALSE,
    IN p_PageNumber INTEGER DEFAULT NULL,
    IN p_SegmentTitle_Clear BOOLEAN DEFAULT FALSE,
    IN p_SegmentTitle VARCHAR(500) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Transcript_Clear BOOLEAN DEFAULT FALSE,
    IN p_Transcript TEXT DEFAULT NULL,
    IN p_SegmenterKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_SegmenterKey VARCHAR(100) DEFAULT NULL,
    IN p_ParentChunkID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentChunkID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwContentItemChunks" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentItemChunk"
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
                "ParentChunkID"
            )
        VALUES
            (
                p_ID,
                p_ContentItemID,
                p_Sequence,
                CASE WHEN p_Text_Clear = TRUE THEN NULL ELSE COALESCE(p_Text, NULL) END,
                CASE WHEN p_VectorRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_VectorRecordID, NULL) END,
                COALESCE(p_EmbeddingStatus, 'Pending'),
                COALESCE(p_TaggingStatus, 'Pending'),
                CASE WHEN p_DeleteStatus_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteStatus, NULL) END,
                CASE WHEN p_LastEmbeddedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastEmbeddedAt, NULL) END,
                CASE WHEN p_LastTaggedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastTaggedAt, NULL) END,
                CASE WHEN p_LastDeletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastDeletedAt, NULL) END,
                COALESCE(p_Modality, 'text'),
                CASE WHEN p_StartOffset_Clear = TRUE THEN NULL ELSE COALESCE(p_StartOffset, NULL) END,
                CASE WHEN p_EndOffset_Clear = TRUE THEN NULL ELSE COALESCE(p_EndOffset, NULL) END,
                CASE WHEN p_StartMs_Clear = TRUE THEN NULL ELSE COALESCE(p_StartMs, NULL) END,
                CASE WHEN p_EndMs_Clear = TRUE THEN NULL ELSE COALESCE(p_EndMs, NULL) END,
                CASE WHEN p_PageNumber_Clear = TRUE THEN NULL ELSE COALESCE(p_PageNumber, NULL) END,
                CASE WHEN p_SegmentTitle_Clear = TRUE THEN NULL ELSE COALESCE(p_SegmentTitle, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_Transcript_Clear = TRUE THEN NULL ELSE COALESCE(p_Transcript, NULL) END,
                CASE WHEN p_SegmenterKey_Clear = TRUE THEN NULL ELSE COALESCE(p_SegmenterKey, NULL) END,
                CASE WHEN p_ParentChunkID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentChunkID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentItemChunk"
            (
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
                "ParentChunkID"
            )
        VALUES
            (
                p_ContentItemID,
                p_Sequence,
                CASE WHEN p_Text_Clear = TRUE THEN NULL ELSE COALESCE(p_Text, NULL) END,
                CASE WHEN p_VectorRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_VectorRecordID, NULL) END,
                COALESCE(p_EmbeddingStatus, 'Pending'),
                COALESCE(p_TaggingStatus, 'Pending'),
                CASE WHEN p_DeleteStatus_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteStatus, NULL) END,
                CASE WHEN p_LastEmbeddedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastEmbeddedAt, NULL) END,
                CASE WHEN p_LastTaggedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastTaggedAt, NULL) END,
                CASE WHEN p_LastDeletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastDeletedAt, NULL) END,
                COALESCE(p_Modality, 'text'),
                CASE WHEN p_StartOffset_Clear = TRUE THEN NULL ELSE COALESCE(p_StartOffset, NULL) END,
                CASE WHEN p_EndOffset_Clear = TRUE THEN NULL ELSE COALESCE(p_EndOffset, NULL) END,
                CASE WHEN p_StartMs_Clear = TRUE THEN NULL ELSE COALESCE(p_StartMs, NULL) END,
                CASE WHEN p_EndMs_Clear = TRUE THEN NULL ELSE COALESCE(p_EndMs, NULL) END,
                CASE WHEN p_PageNumber_Clear = TRUE THEN NULL ELSE COALESCE(p_PageNumber, NULL) END,
                CASE WHEN p_SegmentTitle_Clear = TRUE THEN NULL ELSE COALESCE(p_SegmentTitle, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_Transcript_Clear = TRUE THEN NULL ELSE COALESCE(p_Transcript, NULL) END,
                CASE WHEN p_SegmenterKey_Clear = TRUE THEN NULL ELSE COALESCE(p_SegmenterKey, NULL) END,
                CASE WHEN p_ParentChunkID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentChunkID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentItemChunks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateContentItemChunk'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateContentItemChunk"(
    IN p_ID UUID,
    IN p_ContentItemID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Text_Clear BOOLEAN DEFAULT FALSE,
    IN p_Text TEXT DEFAULT NULL,
    IN p_VectorRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_VectorRecordID VARCHAR(100) DEFAULT NULL,
    IN p_EmbeddingStatus VARCHAR(20) DEFAULT NULL,
    IN p_TaggingStatus VARCHAR(20) DEFAULT NULL,
    IN p_DeleteStatus_Clear BOOLEAN DEFAULT FALSE,
    IN p_DeleteStatus VARCHAR(20) DEFAULT NULL,
    IN p_LastEmbeddedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastEmbeddedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastTaggedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastTaggedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastDeletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastDeletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Modality VARCHAR(20) DEFAULT NULL,
    IN p_StartOffset_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartOffset INTEGER DEFAULT NULL,
    IN p_EndOffset_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndOffset INTEGER DEFAULT NULL,
    IN p_StartMs_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartMs INTEGER DEFAULT NULL,
    IN p_EndMs_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndMs INTEGER DEFAULT NULL,
    IN p_PageNumber_Clear BOOLEAN DEFAULT FALSE,
    IN p_PageNumber INTEGER DEFAULT NULL,
    IN p_SegmentTitle_Clear BOOLEAN DEFAULT FALSE,
    IN p_SegmentTitle VARCHAR(500) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Transcript_Clear BOOLEAN DEFAULT FALSE,
    IN p_Transcript TEXT DEFAULT NULL,
    IN p_SegmenterKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_SegmenterKey VARCHAR(100) DEFAULT NULL,
    IN p_ParentChunkID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentChunkID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwContentItemChunks" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentItemChunk"
    SET
        "ContentItemID" = COALESCE(p_ContentItemID, "ContentItemID"),
        "Sequence" = COALESCE(p_Sequence, "Sequence"),
        "Text" = CASE WHEN p_Text_Clear = TRUE THEN NULL ELSE COALESCE(p_Text, "Text") END,
        "VectorRecordID" = CASE WHEN p_VectorRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_VectorRecordID, "VectorRecordID") END,
        "EmbeddingStatus" = COALESCE(p_EmbeddingStatus, "EmbeddingStatus"),
        "TaggingStatus" = COALESCE(p_TaggingStatus, "TaggingStatus"),
        "DeleteStatus" = CASE WHEN p_DeleteStatus_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteStatus, "DeleteStatus") END,
        "LastEmbeddedAt" = CASE WHEN p_LastEmbeddedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastEmbeddedAt, "LastEmbeddedAt") END,
        "LastTaggedAt" = CASE WHEN p_LastTaggedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastTaggedAt, "LastTaggedAt") END,
        "LastDeletedAt" = CASE WHEN p_LastDeletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastDeletedAt, "LastDeletedAt") END,
        "Modality" = COALESCE(p_Modality, "Modality"),
        "StartOffset" = CASE WHEN p_StartOffset_Clear = TRUE THEN NULL ELSE COALESCE(p_StartOffset, "StartOffset") END,
        "EndOffset" = CASE WHEN p_EndOffset_Clear = TRUE THEN NULL ELSE COALESCE(p_EndOffset, "EndOffset") END,
        "StartMs" = CASE WHEN p_StartMs_Clear = TRUE THEN NULL ELSE COALESCE(p_StartMs, "StartMs") END,
        "EndMs" = CASE WHEN p_EndMs_Clear = TRUE THEN NULL ELSE COALESCE(p_EndMs, "EndMs") END,
        "PageNumber" = CASE WHEN p_PageNumber_Clear = TRUE THEN NULL ELSE COALESCE(p_PageNumber, "PageNumber") END,
        "SegmentTitle" = CASE WHEN p_SegmentTitle_Clear = TRUE THEN NULL ELSE COALESCE(p_SegmentTitle, "SegmentTitle") END,
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "Transcript" = CASE WHEN p_Transcript_Clear = TRUE THEN NULL ELSE COALESCE(p_Transcript, "Transcript") END,
        "SegmenterKey" = CASE WHEN p_SegmenterKey_Clear = TRUE THEN NULL ELSE COALESCE(p_SegmenterKey, "SegmenterKey") END,
        "ParentChunkID" = CASE WHEN p_ParentChunkID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentChunkID, "ParentChunkID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentItemChunks" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentItemChunks" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentItemChunk'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentItemChunk"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentItemChunk"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateAPIApplicationScope_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAPIApplicationScope" ON __mj."APIApplicationScope";
CREATE TRIGGER "trgUpdateAPIApplicationScope"
    BEFORE UPDATE ON __mj."APIApplicationScope"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAPIApplicationScope_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAPIKeyScope_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAPIKeyScope" ON __mj."APIKeyScope";
CREATE TRIGGER "trgUpdateAPIKeyScope"
    BEFORE UPDATE ON __mj."APIKeyScope"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAPIKeyScope_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentItemChunk_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentItemChunk" ON __mj."ContentItemChunk";
CREATE TRIGGER "trgUpdateContentItemChunk"
    BEFORE UPDATE ON __mj."ContentItemChunk"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentItemChunk_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7c0fd852-97ab-4d57-86fc-52813e049e1e' OR ("EntityID" = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND "Name" = 'RowFilterID')
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
        '7c0fd852-97ab-4d57-86fc-52813e049e1e',
        'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- "Entity": "MJ": "API" Key "Scopes"
        100022,
        'RowFilterID',
        'Row Filter ID',
        'Optional row-level filter narrowing WHICH RECORDS this scope grant applies to, in addition to the resource pattern that governs which entities. References the same RowLevelSecurityFilter catalog used by role-based RLS, so the filter text flows through the standard {{Token}} substitution engine and every existing RLS enforcement point (RunView, Load by primary key, save, delete, search). NULL (the default) means no row restriction — behavior identical to before this column existed. When set, the rule''s ResourcePattern must name a single exact entity (no wildcards, no comma-separated lists), every column the filter references must resolve to a real non-virtual field on that entity, and every other referrer of the same filter record must resolve to that same entity. Critically, this filter is evaluated INDEPENDENTLY of the role-RLS exemption: a user exempt from role RLS is still bound by their key''s filter, because narrowing a principal below what their roles allow is the entire purpose of a key ceiling.',
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
        'F7238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '16b21ba4-eeb6-400d-9d7e-6799482be897' OR ("EntityID" = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND "Name" = 'RowFilterID')
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
        '16b21ba4-eeb6-400d-9d7e-6799482be897',
        'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- "Entity": "MJ": "API" "Application" "Scopes"
        100022,
        'RowFilterID',
        'Row Filter ID',
        'Optional row-level filter acting as a CEILING for every API key operating under this application — a restriction keys inherit and cannot widen. Composes with the per-key filter (APIKeyScope.RowFilterID) and with role-based RLS using AND, never OR, so no layer can broaden another. References the same RowLevelSecurityFilter catalog used by role-based RLS. NULL (the default) means the application imposes no row ceiling. The same authoring constraints as APIKeyScope.RowFilterID apply: exact single-entity resource pattern, all referenced columns must exist on that entity, and all referrers of the filter record must resolve to the same entity.',
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
        'F7238F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5362464c-a454-4408-a95d-be0f69839a77'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('5362464c-a454-4408-a95d-be0f69839a77', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'F1741CE5-EACA-492D-9869-9B55D33D9C29', 'RowFilterID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'da3507bf-5489-43e2-987c-d786c4496c82'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('da3507bf-5489-43e2-987c-d786c4496c82', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', 'RowFilterID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f4d15efb-00b7-4c78-ad2e-f7a3ecfa6a64' OR ("EntityID" = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND "Name" = 'RowFilter')
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
        'f4d15efb-00b7-4c78-ad2e-f7a3ecfa6a64',
        'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- "Entity": "MJ": "API" Key "Scopes"
        100025,
        'RowFilter',
        'Row Filter',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7368ae64-62e7-4380-b0b4-5615064f2a52' OR ("EntityID" = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND "Name" = 'RowFilter')
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
        '7368ae64-62e7-4380-b0b4-5615064f2a52',
        'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- "Entity": "MJ": "API" "Application" "Scopes"
        100025,
        'RowFilter',
        'Row Filter',
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


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."APIKeyScope"
 ADD CONSTRAINT "FK_APIKeyScope_RowFilter"
    FOREIGN KEY ("RowFilterID") REFERENCES __mj."RowLevelSecurityFilter"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."APIApplicationScope"
 ADD CONSTRAINT "FK_APIApplicationScope_RowFilter"
    FOREIGN KEY ("RowFilterID") REFERENCES __mj."RowLevelSecurityFilter"("ID") DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwAPIApplicationScopes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: Permissions for vwAPIApplicationScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAPIApplicationScopes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: spCreateAPIApplicationScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIApplicationScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAPIApplicationScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: API Application Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAPIApplicationScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: spUpdateAPIApplicationScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIApplicationScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAPIApplicationScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAPIApplicationScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: spDeleteAPIApplicationScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIApplicationScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIApplicationScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: API Application Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIApplicationScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for APIKeyScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key APIKeyID in table APIKeyScope;

DO $$ BEGIN GRANT SELECT ON __mj."vwAPIKeyScopes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Permissions for vwAPIKeyScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAPIKeyScopes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spCreateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAPIKeyScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: API Key Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAPIKeyScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spUpdateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAPIKeyScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAPIKeyScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spDeleteAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKeyScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: API Key Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKeyScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 96841354-26BF-4919-91A3-B3170EA58F68 */

DO $$ BEGIN GRANT SELECT ON __mj."vwContentItemChunks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: Permissions for vwContentItemChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentItemChunks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spCreateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemChunk" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Item Chunks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemChunk" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spUpdateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemChunk" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemChunk" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spDeleteContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemChunk" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Item Chunks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemChunk" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert 2 new entity field(s) */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."APIKeyScope"."RowFilterID" IS 'Optional row-level filter narrowing WHICH RECORDS this scope grant applies to, in addition to the resource pattern that governs which entities. References the same RowLevelSecurityFilter catalog used by role-based RLS, so the filter text flows through the standard {{Token}} substitution engine and every existing RLS enforcement point (RunView, Load by primary key, save, delete, search). NULL (the default) means no row restriction — behavior identical to before this column existed. When set, the rule''s ResourcePattern must name a single exact entity (no wildcards, no comma-separated lists), every column the filter references must resolve to a real non-virtual field on that entity, and every other referrer of the same filter record must resolve to that same entity. Critically, this filter is evaluated INDEPENDENTLY of the role-RLS exemption: a user exempt from role RLS is still bound by their key''s filter, because narrowing a principal below what their roles allow is the entire purpose of a key ceiling.';

COMMENT ON COLUMN __mj."APIApplicationScope"."RowFilterID" IS 'Optional row-level filter acting as a CEILING for every API key operating under this application — a restriction keys inherit and cannot widen. Composes with the per-key filter (APIKeyScope.RowFilterID) and with role-based RLS using AND, never OR, so no layer can broaden another. References the same RowLevelSecurityFilter catalog used by role-based RLS. NULL (the default) means the application imposes no row ceiling. The same authoring constraints as APIKeyScope.RowFilterID apply: exact single-entity resource pattern, all referenced columns must exist on that entity, and all referrers of the filter record must resolve to the same entity.';


-- ===================== Other =====================

-- =====================================================================================
-- =====================================================================================
-- ==  EVERYTHING BELOW THIS BANNER WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL  ==
-- ==  (mj codegen, run 2026-08-04 against a fresh SQL Server with all committed      ==
-- ==  migrations and metadata applied — see PR #3409 / codegen-once workflow).       ==
-- ==                                                                                 ==
-- ==  Contents: EntityField inserts for the new RowFilterID columns, regenerated     ==
-- ==  vwAPIKeyScopes / vwAPIApplicationScopes views, spCreate/spUpdate/spDelete      ==
-- ==  procs, FK indexes (IDX_AUTO_MJ_FKEY_*), permission grants, and extended        ==
-- ==  properties.                                                                    ==
-- ==                                                                                 ==
-- ==  DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen     ==
-- ==  and replace this entire generated section.                                     ==
-- =====================================================================================
-- =====================================================================================

/* SQL text to insert 2 new entity field(s) */

/* spUpdate Permissions for MJ: API Application Scopes */

/* spUpdate Permissions for MJ: API Key Scopes */

/* spUpdate Permissions for MJ: Content Item Chunks */
