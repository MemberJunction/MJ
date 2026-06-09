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

ALTER TABLE __mj."APIKey"
 ADD COLUMN IF NOT EXISTS "KeyPrefix" VARCHAR(20) NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_APIKey_UserID" ON __mj."APIKey" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_APIKey_CreatedByUserID" ON __mj."APIKey" ("CreatedByUserID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwAPIKeys';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAPIKeys"
AS SELECT
    a.*,
    "MJUser_UserID"."Name" AS "User",
    "MJUser_CreatedByUserID"."Name" AS "CreatedByUser"
FROM
    __mj."APIKey" AS a
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    a."UserID" = "MJUser_UserID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_CreatedByUserID"
  ON
    a."CreatedByUserID" = "MJUser_CreatedByUserID"."ID"$vsql$;
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
           WHERE proname = 'spCreateAPIKey'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAPIKey"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Hash VARCHAR(64) DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Label VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description VARCHAR(1000) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastUsedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastUsedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CreatedByUserID UUID DEFAULT NULL,
    IN p_KeyPrefix_Clear BOOLEAN DEFAULT FALSE,
    IN p_KeyPrefix VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwAPIKeys" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."APIKey"
            (
                "ID",
                "Hash",
                "UserID",
                "Label",
                "Description",
                "Status",
                "ExpiresAt",
                "LastUsedAt",
                "CreatedByUserID",
                "KeyPrefix"
            )
        VALUES
            (
                p_ID,
                p_Hash,
                p_UserID,
                p_Label,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, NULL) END,
                CASE WHEN p_LastUsedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastUsedAt, NULL) END,
                p_CreatedByUserID,
                CASE WHEN p_KeyPrefix_Clear = TRUE THEN NULL ELSE COALESCE(p_KeyPrefix, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."APIKey"
            (
                "Hash",
                "UserID",
                "Label",
                "Description",
                "Status",
                "ExpiresAt",
                "LastUsedAt",
                "CreatedByUserID",
                "KeyPrefix"
            )
        VALUES
            (
                p_Hash,
                p_UserID,
                p_Label,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, NULL) END,
                CASE WHEN p_LastUsedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastUsedAt, NULL) END,
                p_CreatedByUserID,
                CASE WHEN p_KeyPrefix_Clear = TRUE THEN NULL ELSE COALESCE(p_KeyPrefix, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAPIKeys" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAPIKey'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAPIKey"(
    IN p_ID UUID,
    IN p_Hash VARCHAR(64) DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Label VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description VARCHAR(1000) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastUsedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastUsedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CreatedByUserID UUID DEFAULT NULL,
    IN p_KeyPrefix_Clear BOOLEAN DEFAULT FALSE,
    IN p_KeyPrefix VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwAPIKeys" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."APIKey"
    SET
        "Hash" = COALESCE(p_Hash, "Hash"),
        "UserID" = COALESCE(p_UserID, "UserID"),
        "Label" = COALESCE(p_Label, "Label"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "Status" = COALESCE(p_Status, "Status"),
        "ExpiresAt" = CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, "ExpiresAt") END,
        "LastUsedAt" = CASE WHEN p_LastUsedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastUsedAt, "LastUsedAt") END,
        "CreatedByUserID" = COALESCE(p_CreatedByUserID, "CreatedByUserID"),
        "KeyPrefix" = CASE WHEN p_KeyPrefix_Clear = TRUE THEN NULL ELSE COALESCE(p_KeyPrefix, "KeyPrefix") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAPIKeys" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAPIKeys" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAPIKey'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAPIKey"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."APIKey"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateAPIKey_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAPIKey" ON __mj."APIKey";
CREATE TRIGGER "trgUpdateAPIKey"
    BEFORE UPDATE ON __mj."APIKey"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAPIKey_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08336b23-33f3-49c1-8739-58528d8156ca' OR ("EntityID" = 'B56DB373-2982-4E91-AACB-075CB8BECBBB' AND "Name" = 'KeyPrefix')
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
        '08336b23-33f3-49c1-8739-58528d8156ca',
        'B56DB373-2982-4E91-AACB-075CB8BECBBB', -- "Entity": "MJ": "API" "Keys"
        100026,
        'KeyPrefix',
        'Key Prefix',
        'A short preview of the key shown at creation time (e.g. mj_sk_a1b2). Stores the configured prefix plus the first 4 characters of the random body for visual identification. NULL for keys created before this column was added.',
        'TEXT',
        40,
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


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwAPIKeys" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: API Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Keys
-- Item: Permissions for vwAPIKeys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAPIKeys" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: API Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Keys
-- Item: spCreateAPIKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKey
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAPIKey" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: API Keys */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAPIKey" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: API Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Keys
-- Item: spUpdateAPIKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKey
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAPIKey" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAPIKey" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: API Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Keys
-- Item: spDeleteAPIKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKey
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKey" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: API Keys */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKey" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Comments =====================

COMMENT ON COLUMN __mj."APIKey"."KeyPrefix" IS 'A short preview of the key shown at creation time (e.g. mj_sk_a1b2). Stores the configured prefix plus the first 4 characters of the random body for visual identification. NULL for keys created before this column was added.';


-- ===================== Other =====================

-- Add KeyPrefix column to APIKey table
-- Stores the configured prefix + first 4 characters of the random body
-- (e.g., "mj_sk_a1b2") so administrators can visually identify keys
-- without exposing the full key. NULL for keys created before this migration
-- since the raw key was never stored.

/* spUpdate Permissions for MJ: API Keys */
