-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
--
-- The schema name is emitted UNQUOTED, so PostgreSQL folds it to lowercase. That is deliberate and
-- self-consistent: everything downstream in a converted migration refers to it unquoted too, so
-- both definition and lookup land on the same folded name.
--
-- DOWNSTREAM NOTE for the build engineer: a PostgreSQL database that was populated by an EARLIER
-- converter — one that emitted a quoted, case-preserved name — already holds that mixed-case
-- schema: for a target named MySchema_Name, the quoted "MySchema_Name". Re-converting against
-- that database creates a SECOND, empty schema myschema_name rather than reusing the existing
-- one, because IF NOT EXISTS compares the folded name and finds no match. The repo's own committed
-- migrations-pg files are unaffected (the only quoted CREATE SCHEMAs there are the four pg_dump
-- baselines, which this path does not produce), so this is an open-app / downstream concern, not
-- one for this repo's Flyway history.
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
-- Identity Claims Infrastructure
-- =====================================================================================
-- Introduces IdentityClaimType and IdentityClaim tables to provide a generic,
-- polymorphic identity claiming and account linking primitive in MemberJunction core.
--
-- Supported workflows:
-- 1. Anonymous / Guest Purchases: A guest purchases with an email address. A pending
-- IdentityClaim is created pointing at the entitlement grant, order, or record.
-- 2. Automatic Claim on Login: When a user logs in with a verified email matching
-- NormalizedEmail, IdentityClaimEngine discovers and auto-redeems active claims.
-- 3. Explicit Claim Link: When a purchase email differs from the login account email,
-- a single-use magic link invite verification token confirms email ownership and
-- redeems the claim into the target User / Person account.
-- 4. Extensibility via Plugins: IdentityClaimType specifies DriverClass, which is
-- resolved dynamically at runtime via ClassFactory as a BaseIdentityClaimDriver.
-- =====================================================================================

CREATE TABLE __mj."IdentityClaimType" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "Description" TEXT NULL,
 "DriverClass" VARCHAR(255) NOT NULL,
 "Configuration" TEXT NULL,
 "DefaultExpirationDays" INTEGER NOT NULL DEFAULT 30,
 "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

 CONSTRAINT "PK_IdentityClaimType" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_IdentityClaimType_Name" UNIQUE ("Name")
);

CREATE TABLE __mj."IdentityClaim" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ClaimTypeID" UUID NOT NULL,
 "NormalizedEmail" VARCHAR(255) NOT NULL,
 "EntityID" UUID NULL,
 "RecordID" VARCHAR(255) NULL,
 "PayloadJSON" TEXT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
 "ExpiresAt" TIMESTAMPTZ NOT NULL,
 "ClaimedAt" TIMESTAMPTZ NULL,
 "ClaimedByUserID" UUID NULL,
 "MagicLinkInviteID" UUID NULL,
 "MetadataJSON" TEXT NULL,
 "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

 CONSTRAINT "PK_IdentityClaim" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_IdentityClaim_ClaimType" FOREIGN KEY ("ClaimTypeID")
 REFERENCES __mj."IdentityClaimType"("ID"),
 CONSTRAINT "FK_IdentityClaim_Entity" FOREIGN KEY ("EntityID")
 REFERENCES __mj."Entity"("ID"),
 CONSTRAINT "FK_IdentityClaim_User" FOREIGN KEY ("ClaimedByUserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT "FK_IdentityClaim_MagicLinkInvite" FOREIGN KEY ("MagicLinkInviteID")
 REFERENCES __mj."MagicLinkInvite"("ID"),
 CONSTRAINT "CK_IdentityClaim_Status" CHECK ("Status" IN ('Pending', 'Claimed', 'Expired', 'Revoked'))
);

CREATE INDEX IF NOT EXISTS "IX_IdentityClaim_NormalizedEmail_Status"
    ON __mj."IdentityClaim"("NormalizedEmail", "Status");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwIdentityClaimTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwIdentityClaimTypes"
AS SELECT
    i.*
FROM
    __mj."IdentityClaimType" AS i$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwIdentityClaims';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwIdentityClaims"
AS SELECT
    i.*,
    "MJIdentityClaimType_ClaimTypeID"."Name" AS "ClaimType",
    "MJEntity_EntityID"."Name" AS "Entity",
    "MJUser_ClaimedByUserID"."Name" AS "ClaimedByUser"
FROM
    __mj."IdentityClaim" AS i
INNER JOIN
    __mj."IdentityClaimType" AS "MJIdentityClaimType_ClaimTypeID"
  ON
    i."ClaimTypeID" = "MJIdentityClaimType_ClaimTypeID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    i."EntityID" = "MJEntity_EntityID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_ClaimedByUserID"
  ON
    i."ClaimedByUserID" = "MJUser_ClaimedByUserID"."ID"$vsql$;
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
           WHERE proname = 'spCreateIdentityClaimType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateIdentityClaimType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DriverClass VARCHAR(255) DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_DefaultExpirationDays INTEGER DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwIdentityClaimTypes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."IdentityClaimType"
            (
                "ID",
                "Name",
                "Description",
                "DriverClass",
                "Configuration",
                "DefaultExpirationDays",
                "IsActive"
            )
        VALUES
            (
                p_ID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_DriverClass,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                COALESCE(p_DefaultExpirationDays, 30),
                COALESCE(p_IsActive, TRUE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."IdentityClaimType"
            (
                "Name",
                "Description",
                "DriverClass",
                "Configuration",
                "DefaultExpirationDays",
                "IsActive"
            )
        VALUES
            (
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_DriverClass,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                COALESCE(p_DefaultExpirationDays, 30),
                COALESCE(p_IsActive, TRUE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwIdentityClaimTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateIdentityClaimType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateIdentityClaimType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DriverClass VARCHAR(255) DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_DefaultExpirationDays INTEGER DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwIdentityClaimTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."IdentityClaimType"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "DriverClass" = COALESCE(p_DriverClass, "DriverClass"),
        "Configuration" = CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, "Configuration") END,
        "DefaultExpirationDays" = COALESCE(p_DefaultExpirationDays, "DefaultExpirationDays"),
        "IsActive" = COALESCE(p_IsActive, "IsActive")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwIdentityClaimTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwIdentityClaimTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteIdentityClaimType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteIdentityClaimType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."IdentityClaimType"
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
           WHERE proname = 'spCreateIdentityClaim'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateIdentityClaim"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ClaimTypeID UUID DEFAULT NULL,
    IN p_NormalizedEmail VARCHAR(255) DEFAULT NULL,
    IN p_EntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordID VARCHAR(255) DEFAULT NULL,
    IN p_PayloadJSON_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadJSON TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ClaimedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ClaimedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ClaimedByUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ClaimedByUserID UUID DEFAULT NULL,
    IN p_MagicLinkInviteID_Clear BOOLEAN DEFAULT FALSE,
    IN p_MagicLinkInviteID UUID DEFAULT NULL,
    IN p_MetadataJSON_Clear BOOLEAN DEFAULT FALSE,
    IN p_MetadataJSON TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwIdentityClaims" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."IdentityClaim"
            (
                "ID",
                "ClaimTypeID",
                "NormalizedEmail",
                "EntityID",
                "RecordID",
                "PayloadJSON",
                "Status",
                "ExpiresAt",
                "ClaimedAt",
                "ClaimedByUserID",
                "MagicLinkInviteID",
                "MetadataJSON"
            )
        VALUES
            (
                p_ID,
                p_ClaimTypeID,
                p_NormalizedEmail,
                CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, NULL) END,
                CASE WHEN p_RecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordID, NULL) END,
                CASE WHEN p_PayloadJSON_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadJSON, NULL) END,
                COALESCE(p_Status, 'Pending'),
                p_ExpiresAt,
                CASE WHEN p_ClaimedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimedAt, NULL) END,
                CASE WHEN p_ClaimedByUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimedByUserID, NULL) END,
                CASE WHEN p_MagicLinkInviteID_Clear = TRUE THEN NULL ELSE COALESCE(p_MagicLinkInviteID, NULL) END,
                CASE WHEN p_MetadataJSON_Clear = TRUE THEN NULL ELSE COALESCE(p_MetadataJSON, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."IdentityClaim"
            (
                "ClaimTypeID",
                "NormalizedEmail",
                "EntityID",
                "RecordID",
                "PayloadJSON",
                "Status",
                "ExpiresAt",
                "ClaimedAt",
                "ClaimedByUserID",
                "MagicLinkInviteID",
                "MetadataJSON"
            )
        VALUES
            (
                p_ClaimTypeID,
                p_NormalizedEmail,
                CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, NULL) END,
                CASE WHEN p_RecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordID, NULL) END,
                CASE WHEN p_PayloadJSON_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadJSON, NULL) END,
                COALESCE(p_Status, 'Pending'),
                p_ExpiresAt,
                CASE WHEN p_ClaimedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimedAt, NULL) END,
                CASE WHEN p_ClaimedByUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimedByUserID, NULL) END,
                CASE WHEN p_MagicLinkInviteID_Clear = TRUE THEN NULL ELSE COALESCE(p_MagicLinkInviteID, NULL) END,
                CASE WHEN p_MetadataJSON_Clear = TRUE THEN NULL ELSE COALESCE(p_MetadataJSON, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwIdentityClaims" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateIdentityClaim'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateIdentityClaim"(
    IN p_ID UUID,
    IN p_ClaimTypeID UUID DEFAULT NULL,
    IN p_NormalizedEmail VARCHAR(255) DEFAULT NULL,
    IN p_EntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RecordID VARCHAR(255) DEFAULT NULL,
    IN p_PayloadJSON_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadJSON TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ClaimedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ClaimedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ClaimedByUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ClaimedByUserID UUID DEFAULT NULL,
    IN p_MagicLinkInviteID_Clear BOOLEAN DEFAULT FALSE,
    IN p_MagicLinkInviteID UUID DEFAULT NULL,
    IN p_MetadataJSON_Clear BOOLEAN DEFAULT FALSE,
    IN p_MetadataJSON TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwIdentityClaims" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."IdentityClaim"
    SET
        "ClaimTypeID" = COALESCE(p_ClaimTypeID, "ClaimTypeID"),
        "NormalizedEmail" = COALESCE(p_NormalizedEmail, "NormalizedEmail"),
        "EntityID" = CASE WHEN p_EntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityID, "EntityID") END,
        "RecordID" = CASE WHEN p_RecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_RecordID, "RecordID") END,
        "PayloadJSON" = CASE WHEN p_PayloadJSON_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadJSON, "PayloadJSON") END,
        "Status" = COALESCE(p_Status, "Status"),
        "ExpiresAt" = COALESCE(p_ExpiresAt, "ExpiresAt"),
        "ClaimedAt" = CASE WHEN p_ClaimedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimedAt, "ClaimedAt") END,
        "ClaimedByUserID" = CASE WHEN p_ClaimedByUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimedByUserID, "ClaimedByUserID") END,
        "MagicLinkInviteID" = CASE WHEN p_MagicLinkInviteID_Clear = TRUE THEN NULL ELSE COALESCE(p_MagicLinkInviteID, "MagicLinkInviteID") END,
        "MetadataJSON" = CASE WHEN p_MetadataJSON_Clear = TRUE THEN NULL ELSE COALESCE(p_MetadataJSON, "MetadataJSON") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwIdentityClaims" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwIdentityClaims" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteIdentityClaim'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteIdentityClaim"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."IdentityClaim"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateIdentityClaimType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateIdentityClaimType" ON __mj."IdentityClaimType";
CREATE TRIGGER "trgUpdateIdentityClaimType"
    BEFORE UPDATE ON __mj."IdentityClaimType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateIdentityClaimType_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateIdentityClaim_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateIdentityClaim" ON __mj."IdentityClaim";
CREATE TRIGGER "trgUpdateIdentityClaim"
    BEFORE UPDATE ON __mj."IdentityClaim"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateIdentityClaim_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."IdentityClaimType" WHERE "Name" = 'EntitlementGrant'
    ) THEN
        INSERT INTO __mj."IdentityClaimType" ("ID", "Name", "Description", "DriverClass", "DefaultExpirationDays", "IsActive")
        VALUES ('A138A77E-81C5-45C7-B91F-C1198A6F0110', 'EntitlementGrant', 'Entitlement grant claim for purchased or allocated passes, tickets, and subscriptions.', 'EntitlementGrantClaimDriver', 30, TRUE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."IdentityClaimType" WHERE "Name" = 'MagicLink'
    ) THEN
        INSERT INTO __mj."IdentityClaimType" ("ID", "Name", "Description", "DriverClass", "DefaultExpirationDays", "IsActive")
        VALUES ('B249B88F-92D6-46D8-CA20-D22A9B701221', 'MagicLink', 'Single-use magic link email claim for account linking and verification.', 'MagicLinkClaimDriver', 7, FALSE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."IdentityClaimType" WHERE "Name" = 'PersonAccountLink'
    ) THEN
        INSERT INTO __mj."IdentityClaimType" ("ID", "Name", "Description", "DriverClass", "DefaultExpirationDays", "IsActive")
        VALUES ('C35AC990-A3E7-47E9-DB31-E33BA0812332', 'PersonAccountLink', 'Associates guest purchase Person and entity records with authenticated User account.', 'PersonAccountLinkClaimDriver', 30, FALSE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."IdentityClaimType" WHERE "Name" = 'GuestOrder'
    ) THEN
        INSERT INTO __mj."IdentityClaimType" ("ID", "Name", "Description", "DriverClass", "DefaultExpirationDays", "IsActive")
        VALUES ('D46BD001-B4F8-48FA-EC42-F44CB1923443', 'GuestOrder', 'General guest order claim for linking order records upon login or email verification.', 'GuestOrderClaimDriver', 30, FALSE);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."Entity" WHERE "ID" = '38D9DE43-C0C2-45DA-81BB-A815B30F86FB'
    ) THEN
        INSERT INTO __mj."Entity" ("ID", "Name", "DisplayName", "Description", "BaseTable", "BaseView", "SchemaName", "IncludeInAPI", "AllowUserSearchAPI", "AllowCaching", "TrackRecordChanges", "AuditRecordAccess", "AuditViewRuns", "AllowAllRowsAPI", "AllowCreateAPI", "AllowUpdateAPI", "AllowDeleteAPI", "UserViewMaxRows", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 'MJ: Identity Claim Types', 'Identity Claim Types', 'Metadata catalog of identity claim types. Each row defines a claim kind whose lifecycle (create, claim, revoke, expire) is executed by a BaseIdentityClaimDriver plugin resolved at runtime from DriverClass via ClassFactory.', 'IdentityClaimType', 'vwIdentityClaimTypes', '__mj', TRUE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, 1000, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."Entity" WHERE "ID" = '58C8C895-E3AA-48C2-BA68-808337235873'
    ) THEN
        INSERT INTO __mj."Entity" ("ID", "Name", "DisplayName", "Description", "BaseTable", "BaseView", "SchemaName", "IncludeInAPI", "AllowUserSearchAPI", "AllowCaching", "TrackRecordChanges", "AuditRecordAccess", "AuditViewRuns", "AllowAllRowsAPI", "AllowCreateAPI", "AllowUpdateAPI", "AllowDeleteAPI", "UserViewMaxRows", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58C8C895-E3AA-48C2-BA68-808337235873', 'MJ: Identity Claims', 'Identity Claims', 'Records of pending, claimed, or expired identity claims addressed to an email address. Facilitates cross-system entitlement claiming, account linking, and invite verification.', 'IdentityClaim', 'vwIdentityClaims', '__mj', TRUE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, 1000, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '30BBD5D1-7CB6-497F-AEF0-D09D877A77BE'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('30BBD5D1-7CB6-497F-AEF0-D09D877A77BE', '58C8C895-E3AA-48C2-BA68-808337235873', 1, 'ID', 'ID', NULL, 'UUID', 16, 0, 0, FALSE, FALSE, TRUE, '(gen_random_uuid())', FALSE, FALSE, FALSE, TRUE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '505DF1FB-2C77-40CD-80D6-6AFDAF64840F'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('505DF1FB-2C77-40CD-80D6-6AFDAF64840F', '58C8C895-E3AA-48C2-BA68-808337235873', 2, 'ClaimTypeID', 'Claim Type ID', 'Foreign key linking this claim to its IdentityClaimType definition.', 'UUID', 16, 0, 0, FALSE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '58A944F6-B04C-4779-A18B-3BC1F69B0DE5'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58A944F6-B04C-4779-A18B-3BC1F69B0DE5', '58C8C895-E3AA-48C2-BA68-808337235873', 3, 'NormalizedEmail', 'Email Address', 'Normalized lowercase email address of the intended claimant.', 'TEXT', 510, 0, 0, FALSE, FALSE, FALSE, NULL, FALSE, TRUE, TRUE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '23CE09B7-480A-4A7B-8167-C6883F5657C3'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('23CE09B7-480A-4A7B-8167-C6883F5657C3', '58C8C895-E3AA-48C2-BA68-808337235873', 4, 'EntityID', 'Entity ID', 'Optional polymorphic foreign key to the Entity representing the resource being claimed.', 'UUID', 16, 0, 0, TRUE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4A3B8B1C-CF1D-4E4C-B121-3867182AE9CA'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4A3B8B1C-CF1D-4E4C-B121-3867182AE9CA', '58C8C895-E3AA-48C2-BA68-808337235873', 5, 'RecordID', 'Record ID', 'Optional primary key / record ID of the specific entity record being claimed.', 'TEXT', 510, 0, 0, TRUE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'FFF9A882-5BC1-4173-96EF-29750C1F6044'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('FFF9A882-5BC1-4173-96EF-29750C1F6044', '58C8C895-E3AA-48C2-BA68-808337235873', 6, 'PayloadJSON', 'Payload', 'Optional payload JSON containing custom data or parameters consumed by the claim type driver during redemption.', 'TEXT', -1, 0, 0, TRUE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('F925BD99-4B5A-48A4-878A-385E8F2D87E7', '58C8C895-E3AA-48C2-BA68-808337235873', 7, 'Status', 'Status', 'Current lifecycle state of the claim: Pending, Claimed, Expired, or Revoked.', 'TEXT', 40, 0, 0, FALSE, FALSE, FALSE, '(''Pending'')', FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '92AFA877-0447-4DC3-996B-092937CA4588'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('92AFA877-0447-4DC3-996B-092937CA4588', '58C8C895-E3AA-48C2-BA68-808337235873', 8, 'ExpiresAt', 'Expires At', 'Timestamp after which this claim can no longer be redeemed.', 'TIMESTAMPTZ', 10, 34, 7, FALSE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'E56874D9-11BB-46AC-A9DA-9E4CD8E063E9'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('E56874D9-11BB-46AC-A9DA-9E4CD8E063E9', '58C8C895-E3AA-48C2-BA68-808337235873', 9, 'ClaimedAt', 'Claimed At', 'Timestamp when the claim was successfully redeemed.', 'TIMESTAMPTZ', 10, 34, 7, TRUE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'FF9B7A6A-B843-4738-BD9C-4A4375C419D5'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('FF9B7A6A-B843-4738-BD9C-4A4375C419D5', '58C8C895-E3AA-48C2-BA68-808337235873', 10, 'ClaimedByUserID', 'Claimed By User ID', 'User ID of the authenticated user who successfully claimed this record.', 'UUID', 16, 0, 0, TRUE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'BC1D99CC-1017-4E62-A6F0-E3F51F09FD61'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('BC1D99CC-1017-4E62-A6F0-E3F51F09FD61', '58C8C895-E3AA-48C2-BA68-808337235873', 11, 'MagicLinkInviteID', 'Magic Link Invite ID', 'Optional link to a MagicLinkInvite record for email ownership verification links.', 'UUID', 16, 0, 0, TRUE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'E10A6C7E-4E18-4CE0-98B8-C7E8E71A8793'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('E10A6C7E-4E18-4CE0-98B8-C7E8E71A8793', '58C8C895-E3AA-48C2-BA68-808337235873', 12, 'MetadataJSON', 'Metadata', 'Optional metadata JSON for auditing or tracking client provenance.', 'TEXT', -1, 0, 0, TRUE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0812F91A-485A-4034-B5F2-6A899EC31092'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0812F91A-485A-4034-B5F2-6A899EC31092', '58C8C895-E3AA-48C2-BA68-808337235873', 13, '__mj_CreatedAt', 'Created At', NULL, 'TIMESTAMPTZ', 10, 34, 7, FALSE, FALSE, FALSE, '(NOW())', FALSE, FALSE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08A875E4-26CF-497D-852C-51C80A0366BA'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('08A875E4-26CF-497D-852C-51C80A0366BA', '58C8C895-E3AA-48C2-BA68-808337235873', 14, '__mj_UpdatedAt', 'Updated At', NULL, 'TIMESTAMPTZ', 10, 34, 7, FALSE, FALSE, FALSE, '(NOW())', FALSE, FALSE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'F422E0D8-C434-426A-86F3-36855CD0B19B'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('F422E0D8-C434-426A-86F3-36855CD0B19B', '58C8C895-E3AA-48C2-BA68-808337235873', 15, 'ClaimType', 'Claim Type', NULL, 'TEXT', 200, 0, 0, FALSE, TRUE, FALSE, NULL, FALSE, FALSE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5EAE7159-786D-437F-9C15-15F95636D671'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5EAE7159-786D-437F-9C15-15F95636D671', '58C8C895-E3AA-48C2-BA68-808337235873', 16, 'Entity', 'Entity', NULL, 'TEXT', 510, 0, 0, TRUE, TRUE, FALSE, NULL, FALSE, FALSE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'CB5FD7B8-DE25-4DC2-831F-E56D84B6A342'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('CB5FD7B8-DE25-4DC2-831F-E56D84B6A342', '58C8C895-E3AA-48C2-BA68-808337235873', 17, 'ClaimedByUser', 'Claimed By User', NULL, 'TEXT', 200, 0, 0, TRUE, TRUE, FALSE, NULL, FALSE, FALSE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '949B9775-418F-4BAB-B327-05173CFC8E2E'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('949B9775-418F-4BAB-B327-05173CFC8E2E', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 1, 'ID', 'ID', NULL, 'UUID', 16, 0, 0, FALSE, FALSE, TRUE, '(gen_random_uuid())', FALSE, FALSE, FALSE, TRUE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'DA33F399-95BD-4567-A075-F2AA566FE171'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('DA33F399-95BD-4567-A075-F2AA566FE171', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 2, 'Name', 'Name', 'Unique name identifying this claim type (e.g., "EntitlementGrant", "PersonAccountLink", "OrgInvite").', 'TEXT', 200, 0, 0, FALSE, FALSE, FALSE, NULL, FALSE, TRUE, TRUE, TRUE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9F45D75B-134A-47D9-B658-818665B77CCE'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9F45D75B-134A-47D9-B658-818665B77CCE', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 3, 'Description', 'Description', 'Optional description explaining the intent and behavior of this claim type.', 'TEXT', -1, 0, 0, TRUE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9980B013-AD4C-4F3B-845E-C5F85BB84BF2'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9980B013-AD4C-4F3B-845E-C5F85BB84BF2', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 4, 'DriverClass', 'Driver Class', 'Plugin class name implementing BaseIdentityClaimDriver, registered via @RegisterClass(BaseIdentityClaimDriver, DriverClass) and resolved at runtime.', 'TEXT', 510, 0, 0, FALSE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '741E180B-317E-49DC-BAC6-8E926B333DA3'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('741E180B-317E-49DC-BAC6-8E926B333DA3', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 5, 'Configuration', 'Configuration', 'JSON configuration specific to this claim type driver.', 'TEXT', -1, 0, 0, TRUE, FALSE, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9DF9130E-2F49-4FE4-88EA-E3553132008B'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9DF9130E-2F49-4FE4-88EA-E3553132008B', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 6, 'DefaultExpirationDays', 'Default Expiration Days', 'Default lifespan in days for claims of this type before they expire automatically.', 'INTEGER', 4, 10, 0, FALSE, FALSE, FALSE, '((30))', FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'B1E4E5D4-99DA-4F84-84F4-4ADEA963CBA5'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('B1E4E5D4-99DA-4F84-84F4-4ADEA963CBA5', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 7, 'IsActive', 'Is Active', 'Whether this claim type is active and available for issuing new claims.', 'BOOLEAN', 1, 1, 0, FALSE, FALSE, FALSE, '((1))', FALSE, TRUE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '86ABE3CF-1DDD-47A8-82AD-D372708BE687'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86ABE3CF-1DDD-47A8-82AD-D372708BE687', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 8, '__mj_CreatedAt', 'Created At', NULL, 'TIMESTAMPTZ', 10, 34, 7, FALSE, FALSE, FALSE, '(NOW())', FALSE, FALSE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '45DEA1D2-7DB0-40F9-A8A0-E740C322F3AF'
    ) THEN
        INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "IsVirtual", "IsPrimaryKey", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsNameField", "IncludeInUserSearchAPI", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('45DEA1D2-7DB0-40F9-A8A0-E740C322F3AF', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 9, '__mj_UpdatedAt', 'Updated At', NULL, 'TIMESTAMPTZ', 10, 34, 7, FALSE, FALSE, FALSE, '(NOW())', FALSE, FALSE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityPermission" WHERE "EntityID" = '58C8C895-E3AA-48C2-BA68-808337235873' AND "RoleID" = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
    ) THEN
        INSERT INTO __mj."EntityPermission" ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58C8C895-E3AA-48C2-BA68-808337235873', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityPermission" WHERE "EntityID" = '58C8C895-E3AA-48C2-BA68-808337235873' AND "RoleID" = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'
    ) THEN
        INSERT INTO __mj."EntityPermission" ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58C8C895-E3AA-48C2-BA68-808337235873', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityPermission" WHERE "EntityID" = '58C8C895-E3AA-48C2-BA68-808337235873' AND "RoleID" = 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E'
    ) THEN
        INSERT INTO __mj."EntityPermission" ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58C8C895-E3AA-48C2-BA68-808337235873', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityPermission" WHERE "EntityID" = '38D9DE43-C0C2-45DA-81BB-A815B30F86FB' AND "RoleID" = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
    ) THEN
        INSERT INTO __mj."EntityPermission" ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityPermission" WHERE "EntityID" = '38D9DE43-C0C2-45DA-81BB-A815B30F86FB' AND "RoleID" = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'
    ) THEN
        INSERT INTO __mj."EntityPermission" ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityPermission" WHERE "EntityID" = '38D9DE43-C0C2-45DA-81BB-A815B30F86FB' AND "RoleID" = 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E'
    ) THEN
        INSERT INTO __mj."EntityPermission" ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
    END IF;
END $$;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwIdentityClaimTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* vwIdentityClaimTypes.view.permissions.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: Permissions for vwIdentityClaimTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

DO $$ BEGIN GRANT SELECT ON __mj."vwIdentityClaimTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj."vwIdentityClaims" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* vwIdentityClaims.view.permissions.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: Permissions for vwIdentityClaims
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

DO $$ BEGIN GRANT SELECT ON __mj."vwIdentityClaims" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIdentityClaimType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreateIdentityClaimType.sp.permissions.generated.sql */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIdentityClaimType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIdentityClaimType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdateIdentityClaimType.sp.permissions.generated.sql */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIdentityClaimType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIdentityClaimType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDeleteIdentityClaimType.sp.permissions.generated.sql */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIdentityClaimType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIdentityClaim" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreateIdentityClaim.sp.permissions.generated.sql */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIdentityClaim" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIdentityClaim" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdateIdentityClaim.sp.permissions.generated.sql */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIdentityClaim" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIdentityClaim" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDeleteIdentityClaim.sp.permissions.generated.sql */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIdentityClaim" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Comments =====================

COMMENT ON TABLE __mj."IdentityClaimType" IS 'Metadata catalog of identity claim types. Each row defines a claim kind whose lifecycle (create, claim, revoke, expire) is executed by a BaseIdentityClaimDriver plugin resolved at runtime from DriverClass via ClassFactory.';

COMMENT ON COLUMN __mj."IdentityClaimType"."Name" IS 'Unique name identifying this claim type (e.g., "EntitlementGrant", "PersonAccountLink", "OrgInvite").';

COMMENT ON COLUMN __mj."IdentityClaimType"."Description" IS 'Optional description explaining the intent and behavior of this claim type.';

COMMENT ON COLUMN __mj."IdentityClaimType"."DriverClass" IS 'Plugin class name implementing BaseIdentityClaimDriver, registered via @RegisterClass(BaseIdentityClaimDriver, DriverClass) and resolved at runtime.';

COMMENT ON COLUMN __mj."IdentityClaimType"."Configuration" IS 'JSON configuration specific to this claim type driver.';

COMMENT ON COLUMN __mj."IdentityClaimType"."DefaultExpirationDays" IS 'Default lifespan in days for claims of this type before they expire automatically.';

COMMENT ON COLUMN __mj."IdentityClaimType"."IsActive" IS 'Whether this claim type is active and available for issuing new claims.';

COMMENT ON TABLE __mj."IdentityClaim" IS 'Records of pending, claimed, or expired identity claims addressed to an email address. Facilitates cross-system entitlement claiming, account linking, and invite verification.';

COMMENT ON COLUMN __mj."IdentityClaim"."ClaimTypeID" IS 'Foreign key linking this claim to its IdentityClaimType definition.';

COMMENT ON COLUMN __mj."IdentityClaim"."NormalizedEmail" IS 'Normalized lowercase email address of the intended claimant.';

COMMENT ON COLUMN __mj."IdentityClaim"."EntityID" IS 'Optional polymorphic foreign key to the Entity representing the resource being claimed.';

COMMENT ON COLUMN __mj."IdentityClaim"."RecordID" IS 'Optional primary key / record ID of the specific entity record being claimed.';

COMMENT ON COLUMN __mj."IdentityClaim"."PayloadJSON" IS 'Optional payload JSON containing custom data or parameters consumed by the claim type driver during redemption.';

COMMENT ON COLUMN __mj."IdentityClaim"."Status" IS 'Current lifecycle state of the claim: Pending, Claimed, Expired, or Revoked.';

COMMENT ON COLUMN __mj."IdentityClaim"."ExpiresAt" IS 'Timestamp after which this claim can no longer be redeemed.';

COMMENT ON COLUMN __mj."IdentityClaim"."ClaimedAt" IS 'Timestamp when the claim was successfully redeemed.';

COMMENT ON COLUMN __mj."IdentityClaim"."ClaimedByUserID" IS 'User ID of the authenticated user who successfully claimed this record.';

COMMENT ON COLUMN __mj."IdentityClaim"."MagicLinkInviteID" IS 'Optional link to a MagicLinkInvite record for email ownership verification links.';

COMMENT ON COLUMN __mj."IdentityClaim"."MetadataJSON" IS 'Optional metadata JSON for auditing or tracking client provenance.';


-- ===================== Other =====================

-- -------------------------------------------------------------------------------------
-- Extended Properties / Descriptions (IdentityClaimType)
-- -------------------------------------------------------------------------------------
