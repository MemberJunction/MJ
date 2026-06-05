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

/* ============================================================================
   Integration Framework Expansion — Phase 0 / PR 1 Schema Changes
   v5.39.x

   This migration is the schema substrate for the integration framework redesign.
   Companion plan: /plans/integration-phase-0-pr1.md

   Adds (no destructive changes; existing data preserved):

   IntegrationObject:
     * Explicit per-operation write columns (replaces conflated Write* pair):
         - CreateAPIPath / CreateMethod / CreateBodyShape / CreateBodyKey / CreateIDLocation
         - UpdateAPIPath / UpdateMethod / UpdateBodyShape / UpdateBodyKey / UpdateIDLocation
         - DeleteAPIPath / DeleteIDLocation  (DeleteMethod already exists)
       BodyShape enum: { flat | wrapped | literal }
       IDLocation enum: { path | body | header | n/a }
     * IncrementalWatermarkField — vendor cursor/timestamp field name for incremental sync.
     * MetadataSource enum { Declared | Discovered | Custom } — provenance of each row.
                              (See companion plan §A.B2 for rollout strategy.)

   IntegrationObjectField:
     * MetadataSource enum { Declared | Discovered | Custom }.

   Existing columns retained:
     * WriteAPIPath / WriteMethod on IntegrationObject — DEPRECATED, kept one release as
       transient alias. Generic CRUD in BaseRESTIntegrationConnector reads only the new
       per-operation columns; the deprecated columns become dormant.
     * IsCustom on IntegrationObject and IntegrationObjectField — kept; populated from
       MetadataSource via engine logic in this release. Future migration retires it.

   No CodeGen-managed columns inserted manually (__mj_CreatedAt/__mj_UpdatedAt or
   FK indexes). Single ALTER TABLE per table with multiple ADD clauses per
   CLAUDE.md convention. sp_addextendedproperty for every new column so CodeGen
   surfaces descriptions on regen.

   ============================================================================ */


-- ============================================================================
-- IntegrationObject — new operation columns + MetadataSource + IncrementalWatermarkField
-- ============================================================================
ALTER TABLE __mj."IntegrationObject"
 ADD COLUMN IF NOT EXISTS "CreateAPIPath"           TEXT   NULL,
 ADD COLUMN IF NOT EXISTS "CreateMethod"            VARCHAR(20)    NULL,
 ADD COLUMN IF NOT EXISTS "CreateBodyShape"         VARCHAR(50)    NULL,
 ADD COLUMN IF NOT EXISTS "CreateBodyKey"           VARCHAR(100)   NULL,
 ADD COLUMN IF NOT EXISTS "CreateIDLocation"        VARCHAR(20)    NULL,
 ADD COLUMN IF NOT EXISTS "UpdateAPIPath"           TEXT   NULL,
 ADD COLUMN IF NOT EXISTS "UpdateMethod"            VARCHAR(20)    NULL,
 ADD COLUMN IF NOT EXISTS "UpdateBodyShape"         VARCHAR(50)    NULL,
 ADD COLUMN IF NOT EXISTS "UpdateBodyKey"           VARCHAR(100)   NULL,
 ADD COLUMN IF NOT EXISTS "UpdateIDLocation"        VARCHAR(20)    NULL,
 ADD COLUMN IF NOT EXISTS "DeleteAPIPath"           TEXT   NULL,
 ADD COLUMN IF NOT EXISTS "DeleteIDLocation"        VARCHAR(20)    NULL,
 ADD COLUMN IF NOT EXISTS "IncrementalWatermarkField" VARCHAR(255) NULL,
 ADD COLUMN IF NOT EXISTS "MetadataSource"          VARCHAR(20)    NOT NULL CONSTRAINT DF_IntegrationObject_MetadataSource DEFAULT ('Declared');

ALTER TABLE __mj."IntegrationObjectField"
 ADD COLUMN IF NOT EXISTS "MetadataSource"          VARCHAR(20)    NOT NULL CONSTRAINT DF_IntegrationObjectField_MetadataSource DEFAULT ('Declared');

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_IntegrationObjectField_IntegrationObjectID" ON __mj."IntegrationObjectField" ("IntegrationObjectID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_IntegrationObjectField_RelatedIntegra_b9a3197b" ON __mj."IntegrationObjectField" ("RelatedIntegrationObjectID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_IntegrationObject_IntegrationID" ON __mj."IntegrationObject" ("IntegrationID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwIntegrationObjectFields';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwIntegrationObjectFields"
AS SELECT
    i.*,
    "MJIntegrationObject_IntegrationObjectID"."Name" AS "IntegrationObject",
    "MJIntegrationObject_RelatedIntegrationObjectID"."Name" AS "RelatedIntegrationObject"
FROM
    __mj."IntegrationObjectField" AS i
INNER JOIN
    __mj."IntegrationObject" AS "MJIntegrationObject_IntegrationObjectID"
  ON
    i."IntegrationObjectID" = "MJIntegrationObject_IntegrationObjectID"."ID"
LEFT OUTER JOIN
    __mj."IntegrationObject" AS "MJIntegrationObject_RelatedIntegrationObjectID"
  ON
    i."RelatedIntegrationObjectID" = "MJIntegrationObject_RelatedIntegrationObjectID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwIntegrationObjects';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwIntegrationObjects"
AS SELECT
    i.*,
    "MJIntegration_IntegrationID"."Name" AS "Integration"
FROM
    __mj."IntegrationObject" AS i
INNER JOIN
    __mj."Integration" AS "MJIntegration_IntegrationID"
  ON
    i."IntegrationID" = "MJIntegration_IntegrationID"."ID"$vsql$;
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
           WHERE proname = 'spCreateIntegrationObjectField'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateIntegrationObjectField"(
    IN p_ID UUID DEFAULT NULL,
    IN p_IntegrationObjectID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_DisplayName_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Category_Clear BOOLEAN DEFAULT FALSE,
    IN p_Category VARCHAR(100) DEFAULT NULL,
    IN p_Type VARCHAR(100) DEFAULT NULL,
    IN p_Length_Clear BOOLEAN DEFAULT FALSE,
    IN p_Length INTEGER DEFAULT NULL,
    IN p_Precision_Clear BOOLEAN DEFAULT FALSE,
    IN p_Precision INTEGER DEFAULT NULL,
    IN p_Scale_Clear BOOLEAN DEFAULT FALSE,
    IN p_Scale INTEGER DEFAULT NULL,
    IN p_AllowsNull BOOLEAN DEFAULT NULL,
    IN p_DefaultValue_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultValue VARCHAR(255) DEFAULT NULL,
    IN p_IsPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsUniqueKey BOOLEAN DEFAULT NULL,
    IN p_IsReadOnly BOOLEAN DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_RelatedIntegrationObjectID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedIntegrationObjectID UUID DEFAULT NULL,
    IN p_RelatedIntegrationObjectFieldName_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedIntegrationObjectFieldName VARCHAR(255) DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_IsCustom BOOLEAN DEFAULT NULL,
    IN p_MetadataSource VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwIntegrationObjectFields" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."IntegrationObjectField"
            (
                "ID",
                "IntegrationObjectID",
                "Name",
                "DisplayName",
                "Description",
                "Category",
                "Type",
                "Length",
                "Precision",
                "Scale",
                "AllowsNull",
                "DefaultValue",
                "IsPrimaryKey",
                "IsUniqueKey",
                "IsReadOnly",
                "IsRequired",
                "RelatedIntegrationObjectID",
                "RelatedIntegrationObjectFieldName",
                "Sequence",
                "Configuration",
                "Status",
                "IsCustom",
                "MetadataSource"
            )
        VALUES
            (
                p_ID,
                p_IntegrationObjectID,
                p_Name,
                CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_Category_Clear = TRUE THEN NULL ELSE COALESCE(p_Category, NULL) END,
                p_Type,
                CASE WHEN p_Length_Clear = TRUE THEN NULL ELSE COALESCE(p_Length, NULL) END,
                CASE WHEN p_Precision_Clear = TRUE THEN NULL ELSE COALESCE(p_Precision, NULL) END,
                CASE WHEN p_Scale_Clear = TRUE THEN NULL ELSE COALESCE(p_Scale, NULL) END,
                COALESCE(p_AllowsNull, TRUE),
                CASE WHEN p_DefaultValue_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultValue, NULL) END,
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUniqueKey, FALSE),
                COALESCE(p_IsReadOnly, FALSE),
                COALESCE(p_IsRequired, FALSE),
                CASE WHEN p_RelatedIntegrationObjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedIntegrationObjectID, NULL) END,
                CASE WHEN p_RelatedIntegrationObjectFieldName_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedIntegrationObjectFieldName, NULL) END,
                COALESCE(p_Sequence, 0),
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                COALESCE(p_Status, 'Active'),
                COALESCE(p_IsCustom, FALSE),
                COALESCE(p_MetadataSource, 'Declared')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."IntegrationObjectField"
            (
                "IntegrationObjectID",
                "Name",
                "DisplayName",
                "Description",
                "Category",
                "Type",
                "Length",
                "Precision",
                "Scale",
                "AllowsNull",
                "DefaultValue",
                "IsPrimaryKey",
                "IsUniqueKey",
                "IsReadOnly",
                "IsRequired",
                "RelatedIntegrationObjectID",
                "RelatedIntegrationObjectFieldName",
                "Sequence",
                "Configuration",
                "Status",
                "IsCustom",
                "MetadataSource"
            )
        VALUES
            (
                p_IntegrationObjectID,
                p_Name,
                CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_Category_Clear = TRUE THEN NULL ELSE COALESCE(p_Category, NULL) END,
                p_Type,
                CASE WHEN p_Length_Clear = TRUE THEN NULL ELSE COALESCE(p_Length, NULL) END,
                CASE WHEN p_Precision_Clear = TRUE THEN NULL ELSE COALESCE(p_Precision, NULL) END,
                CASE WHEN p_Scale_Clear = TRUE THEN NULL ELSE COALESCE(p_Scale, NULL) END,
                COALESCE(p_AllowsNull, TRUE),
                CASE WHEN p_DefaultValue_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultValue, NULL) END,
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUniqueKey, FALSE),
                COALESCE(p_IsReadOnly, FALSE),
                COALESCE(p_IsRequired, FALSE),
                CASE WHEN p_RelatedIntegrationObjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedIntegrationObjectID, NULL) END,
                CASE WHEN p_RelatedIntegrationObjectFieldName_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedIntegrationObjectFieldName, NULL) END,
                COALESCE(p_Sequence, 0),
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                COALESCE(p_Status, 'Active'),
                COALESCE(p_IsCustom, FALSE),
                COALESCE(p_MetadataSource, 'Declared')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwIntegrationObjectFields" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateIntegrationObjectField'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateIntegrationObjectField"(
    IN p_ID UUID,
    IN p_IntegrationObjectID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_DisplayName_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Category_Clear BOOLEAN DEFAULT FALSE,
    IN p_Category VARCHAR(100) DEFAULT NULL,
    IN p_Type VARCHAR(100) DEFAULT NULL,
    IN p_Length_Clear BOOLEAN DEFAULT FALSE,
    IN p_Length INTEGER DEFAULT NULL,
    IN p_Precision_Clear BOOLEAN DEFAULT FALSE,
    IN p_Precision INTEGER DEFAULT NULL,
    IN p_Scale_Clear BOOLEAN DEFAULT FALSE,
    IN p_Scale INTEGER DEFAULT NULL,
    IN p_AllowsNull BOOLEAN DEFAULT NULL,
    IN p_DefaultValue_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultValue VARCHAR(255) DEFAULT NULL,
    IN p_IsPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsUniqueKey BOOLEAN DEFAULT NULL,
    IN p_IsReadOnly BOOLEAN DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_RelatedIntegrationObjectID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedIntegrationObjectID UUID DEFAULT NULL,
    IN p_RelatedIntegrationObjectFieldName_Clear BOOLEAN DEFAULT FALSE,
    IN p_RelatedIntegrationObjectFieldName VARCHAR(255) DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_IsCustom BOOLEAN DEFAULT NULL,
    IN p_MetadataSource VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwIntegrationObjectFields" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."IntegrationObjectField"
    SET
        "IntegrationObjectID" = COALESCE(p_IntegrationObjectID, "IntegrationObjectID"),
        "Name" = COALESCE(p_Name, "Name"),
        "DisplayName" = CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, "DisplayName") END,
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "Category" = CASE WHEN p_Category_Clear = TRUE THEN NULL ELSE COALESCE(p_Category, "Category") END,
        "Type" = COALESCE(p_Type, "Type"),
        "Length" = CASE WHEN p_Length_Clear = TRUE THEN NULL ELSE COALESCE(p_Length, "Length") END,
        "Precision" = CASE WHEN p_Precision_Clear = TRUE THEN NULL ELSE COALESCE(p_Precision, "Precision") END,
        "Scale" = CASE WHEN p_Scale_Clear = TRUE THEN NULL ELSE COALESCE(p_Scale, "Scale") END,
        "AllowsNull" = COALESCE(p_AllowsNull, "AllowsNull"),
        "DefaultValue" = CASE WHEN p_DefaultValue_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultValue, "DefaultValue") END,
        "IsPrimaryKey" = COALESCE(p_IsPrimaryKey, "IsPrimaryKey"),
        "IsUniqueKey" = COALESCE(p_IsUniqueKey, "IsUniqueKey"),
        "IsReadOnly" = COALESCE(p_IsReadOnly, "IsReadOnly"),
        "IsRequired" = COALESCE(p_IsRequired, "IsRequired"),
        "RelatedIntegrationObjectID" = CASE WHEN p_RelatedIntegrationObjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedIntegrationObjectID, "RelatedIntegrationObjectID") END,
        "RelatedIntegrationObjectFieldName" = CASE WHEN p_RelatedIntegrationObjectFieldName_Clear = TRUE THEN NULL ELSE COALESCE(p_RelatedIntegrationObjectFieldName, "RelatedIntegrationObjectFieldName") END,
        "Sequence" = COALESCE(p_Sequence, "Sequence"),
        "Configuration" = CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, "Configuration") END,
        "Status" = COALESCE(p_Status, "Status"),
        "IsCustom" = COALESCE(p_IsCustom, "IsCustom"),
        "MetadataSource" = COALESCE(p_MetadataSource, "MetadataSource")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwIntegrationObjectFields" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwIntegrationObjectFields" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateIntegrationObject'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateIntegrationObject"(
    IN p_ID UUID DEFAULT NULL,
    IN p_IntegrationID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_DisplayName_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Category_Clear BOOLEAN DEFAULT FALSE,
    IN p_Category VARCHAR(100) DEFAULT NULL,
    IN p_APIPath VARCHAR(500) DEFAULT NULL,
    IN p_ResponseDataKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseDataKey VARCHAR(255) DEFAULT NULL,
    IN p_DefaultPageSize INTEGER DEFAULT NULL,
    IN p_SupportsPagination BOOLEAN DEFAULT NULL,
    IN p_PaginationType VARCHAR(20) DEFAULT NULL,
    IN p_SupportsIncrementalSync BOOLEAN DEFAULT NULL,
    IN p_SupportsWrite BOOLEAN DEFAULT NULL,
    IN p_DefaultQueryParams_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultQueryParams TEXT DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_WriteAPIPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_WriteAPIPath VARCHAR(500) DEFAULT NULL,
    IN p_WriteMethod_Clear BOOLEAN DEFAULT FALSE,
    IN p_WriteMethod VARCHAR(10) DEFAULT NULL,
    IN p_DeleteMethod_Clear BOOLEAN DEFAULT FALSE,
    IN p_DeleteMethod VARCHAR(10) DEFAULT NULL,
    IN p_IsCustom BOOLEAN DEFAULT NULL,
    IN p_CreateAPIPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_CreateAPIPath TEXT DEFAULT NULL,
    IN p_CreateMethod_Clear BOOLEAN DEFAULT FALSE,
    IN p_CreateMethod VARCHAR(20) DEFAULT NULL,
    IN p_CreateBodyShape_Clear BOOLEAN DEFAULT FALSE,
    IN p_CreateBodyShape VARCHAR(50) DEFAULT NULL,
    IN p_CreateBodyKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_CreateBodyKey VARCHAR(100) DEFAULT NULL,
    IN p_CreateIDLocation_Clear BOOLEAN DEFAULT FALSE,
    IN p_CreateIDLocation VARCHAR(20) DEFAULT NULL,
    IN p_UpdateAPIPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_UpdateAPIPath TEXT DEFAULT NULL,
    IN p_UpdateMethod_Clear BOOLEAN DEFAULT FALSE,
    IN p_UpdateMethod VARCHAR(20) DEFAULT NULL,
    IN p_UpdateBodyShape_Clear BOOLEAN DEFAULT FALSE,
    IN p_UpdateBodyShape VARCHAR(50) DEFAULT NULL,
    IN p_UpdateBodyKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_UpdateBodyKey VARCHAR(100) DEFAULT NULL,
    IN p_UpdateIDLocation_Clear BOOLEAN DEFAULT FALSE,
    IN p_UpdateIDLocation VARCHAR(20) DEFAULT NULL,
    IN p_DeleteAPIPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_DeleteAPIPath TEXT DEFAULT NULL,
    IN p_DeleteIDLocation_Clear BOOLEAN DEFAULT FALSE,
    IN p_DeleteIDLocation VARCHAR(20) DEFAULT NULL,
    IN p_IncrementalWatermarkField_Clear BOOLEAN DEFAULT FALSE,
    IN p_IncrementalWatermarkField VARCHAR(255) DEFAULT NULL,
    IN p_MetadataSource VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwIntegrationObjects" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."IntegrationObject"
            (
                "ID",
                "IntegrationID",
                "Name",
                "DisplayName",
                "Description",
                "Category",
                "APIPath",
                "ResponseDataKey",
                "DefaultPageSize",
                "SupportsPagination",
                "PaginationType",
                "SupportsIncrementalSync",
                "SupportsWrite",
                "DefaultQueryParams",
                "Configuration",
                "Sequence",
                "Status",
                "WriteAPIPath",
                "WriteMethod",
                "DeleteMethod",
                "IsCustom",
                "CreateAPIPath",
                "CreateMethod",
                "CreateBodyShape",
                "CreateBodyKey",
                "CreateIDLocation",
                "UpdateAPIPath",
                "UpdateMethod",
                "UpdateBodyShape",
                "UpdateBodyKey",
                "UpdateIDLocation",
                "DeleteAPIPath",
                "DeleteIDLocation",
                "IncrementalWatermarkField",
                "MetadataSource"
            )
        VALUES
            (
                p_ID,
                p_IntegrationID,
                p_Name,
                CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_Category_Clear = TRUE THEN NULL ELSE COALESCE(p_Category, NULL) END,
                p_APIPath,
                CASE WHEN p_ResponseDataKey_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseDataKey, NULL) END,
                COALESCE(p_DefaultPageSize, 100),
                COALESCE(p_SupportsPagination, TRUE),
                COALESCE(p_PaginationType, 'PageNumber'),
                COALESCE(p_SupportsIncrementalSync, FALSE),
                COALESCE(p_SupportsWrite, FALSE),
                CASE WHEN p_DefaultQueryParams_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultQueryParams, NULL) END,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                COALESCE(p_Sequence, 0),
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_WriteAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_WriteAPIPath, NULL) END,
                CASE WHEN p_WriteMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_WriteMethod, 'POST') END,
                CASE WHEN p_DeleteMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteMethod, 'DELETE') END,
                COALESCE(p_IsCustom, FALSE),
                CASE WHEN p_CreateAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateAPIPath, NULL) END,
                CASE WHEN p_CreateMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateMethod, NULL) END,
                CASE WHEN p_CreateBodyShape_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateBodyShape, NULL) END,
                CASE WHEN p_CreateBodyKey_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateBodyKey, NULL) END,
                CASE WHEN p_CreateIDLocation_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateIDLocation, NULL) END,
                CASE WHEN p_UpdateAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateAPIPath, NULL) END,
                CASE WHEN p_UpdateMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateMethod, NULL) END,
                CASE WHEN p_UpdateBodyShape_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateBodyShape, NULL) END,
                CASE WHEN p_UpdateBodyKey_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateBodyKey, NULL) END,
                CASE WHEN p_UpdateIDLocation_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateIDLocation, NULL) END,
                CASE WHEN p_DeleteAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteAPIPath, NULL) END,
                CASE WHEN p_DeleteIDLocation_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteIDLocation, NULL) END,
                CASE WHEN p_IncrementalWatermarkField_Clear = TRUE THEN NULL ELSE COALESCE(p_IncrementalWatermarkField, NULL) END,
                COALESCE(p_MetadataSource, 'Declared')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."IntegrationObject"
            (
                "IntegrationID",
                "Name",
                "DisplayName",
                "Description",
                "Category",
                "APIPath",
                "ResponseDataKey",
                "DefaultPageSize",
                "SupportsPagination",
                "PaginationType",
                "SupportsIncrementalSync",
                "SupportsWrite",
                "DefaultQueryParams",
                "Configuration",
                "Sequence",
                "Status",
                "WriteAPIPath",
                "WriteMethod",
                "DeleteMethod",
                "IsCustom",
                "CreateAPIPath",
                "CreateMethod",
                "CreateBodyShape",
                "CreateBodyKey",
                "CreateIDLocation",
                "UpdateAPIPath",
                "UpdateMethod",
                "UpdateBodyShape",
                "UpdateBodyKey",
                "UpdateIDLocation",
                "DeleteAPIPath",
                "DeleteIDLocation",
                "IncrementalWatermarkField",
                "MetadataSource"
            )
        VALUES
            (
                p_IntegrationID,
                p_Name,
                CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_Category_Clear = TRUE THEN NULL ELSE COALESCE(p_Category, NULL) END,
                p_APIPath,
                CASE WHEN p_ResponseDataKey_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseDataKey, NULL) END,
                COALESCE(p_DefaultPageSize, 100),
                COALESCE(p_SupportsPagination, TRUE),
                COALESCE(p_PaginationType, 'PageNumber'),
                COALESCE(p_SupportsIncrementalSync, FALSE),
                COALESCE(p_SupportsWrite, FALSE),
                CASE WHEN p_DefaultQueryParams_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultQueryParams, NULL) END,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                COALESCE(p_Sequence, 0),
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_WriteAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_WriteAPIPath, NULL) END,
                CASE WHEN p_WriteMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_WriteMethod, 'POST') END,
                CASE WHEN p_DeleteMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteMethod, 'DELETE') END,
                COALESCE(p_IsCustom, FALSE),
                CASE WHEN p_CreateAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateAPIPath, NULL) END,
                CASE WHEN p_CreateMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateMethod, NULL) END,
                CASE WHEN p_CreateBodyShape_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateBodyShape, NULL) END,
                CASE WHEN p_CreateBodyKey_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateBodyKey, NULL) END,
                CASE WHEN p_CreateIDLocation_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateIDLocation, NULL) END,
                CASE WHEN p_UpdateAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateAPIPath, NULL) END,
                CASE WHEN p_UpdateMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateMethod, NULL) END,
                CASE WHEN p_UpdateBodyShape_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateBodyShape, NULL) END,
                CASE WHEN p_UpdateBodyKey_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateBodyKey, NULL) END,
                CASE WHEN p_UpdateIDLocation_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateIDLocation, NULL) END,
                CASE WHEN p_DeleteAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteAPIPath, NULL) END,
                CASE WHEN p_DeleteIDLocation_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteIDLocation, NULL) END,
                CASE WHEN p_IncrementalWatermarkField_Clear = TRUE THEN NULL ELSE COALESCE(p_IncrementalWatermarkField, NULL) END,
                COALESCE(p_MetadataSource, 'Declared')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwIntegrationObjects" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateIntegrationObject'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateIntegrationObject"(
    IN p_ID UUID,
    IN p_IntegrationID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_DisplayName_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Category_Clear BOOLEAN DEFAULT FALSE,
    IN p_Category VARCHAR(100) DEFAULT NULL,
    IN p_APIPath VARCHAR(500) DEFAULT NULL,
    IN p_ResponseDataKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseDataKey VARCHAR(255) DEFAULT NULL,
    IN p_DefaultPageSize INTEGER DEFAULT NULL,
    IN p_SupportsPagination BOOLEAN DEFAULT NULL,
    IN p_PaginationType VARCHAR(20) DEFAULT NULL,
    IN p_SupportsIncrementalSync BOOLEAN DEFAULT NULL,
    IN p_SupportsWrite BOOLEAN DEFAULT NULL,
    IN p_DefaultQueryParams_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultQueryParams TEXT DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_WriteAPIPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_WriteAPIPath VARCHAR(500) DEFAULT NULL,
    IN p_WriteMethod_Clear BOOLEAN DEFAULT FALSE,
    IN p_WriteMethod VARCHAR(10) DEFAULT NULL,
    IN p_DeleteMethod_Clear BOOLEAN DEFAULT FALSE,
    IN p_DeleteMethod VARCHAR(10) DEFAULT NULL,
    IN p_IsCustom BOOLEAN DEFAULT NULL,
    IN p_CreateAPIPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_CreateAPIPath TEXT DEFAULT NULL,
    IN p_CreateMethod_Clear BOOLEAN DEFAULT FALSE,
    IN p_CreateMethod VARCHAR(20) DEFAULT NULL,
    IN p_CreateBodyShape_Clear BOOLEAN DEFAULT FALSE,
    IN p_CreateBodyShape VARCHAR(50) DEFAULT NULL,
    IN p_CreateBodyKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_CreateBodyKey VARCHAR(100) DEFAULT NULL,
    IN p_CreateIDLocation_Clear BOOLEAN DEFAULT FALSE,
    IN p_CreateIDLocation VARCHAR(20) DEFAULT NULL,
    IN p_UpdateAPIPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_UpdateAPIPath TEXT DEFAULT NULL,
    IN p_UpdateMethod_Clear BOOLEAN DEFAULT FALSE,
    IN p_UpdateMethod VARCHAR(20) DEFAULT NULL,
    IN p_UpdateBodyShape_Clear BOOLEAN DEFAULT FALSE,
    IN p_UpdateBodyShape VARCHAR(50) DEFAULT NULL,
    IN p_UpdateBodyKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_UpdateBodyKey VARCHAR(100) DEFAULT NULL,
    IN p_UpdateIDLocation_Clear BOOLEAN DEFAULT FALSE,
    IN p_UpdateIDLocation VARCHAR(20) DEFAULT NULL,
    IN p_DeleteAPIPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_DeleteAPIPath TEXT DEFAULT NULL,
    IN p_DeleteIDLocation_Clear BOOLEAN DEFAULT FALSE,
    IN p_DeleteIDLocation VARCHAR(20) DEFAULT NULL,
    IN p_IncrementalWatermarkField_Clear BOOLEAN DEFAULT FALSE,
    IN p_IncrementalWatermarkField VARCHAR(255) DEFAULT NULL,
    IN p_MetadataSource VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwIntegrationObjects" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."IntegrationObject"
    SET
        "IntegrationID" = COALESCE(p_IntegrationID, "IntegrationID"),
        "Name" = COALESCE(p_Name, "Name"),
        "DisplayName" = CASE WHEN p_DisplayName_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayName, "DisplayName") END,
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "Category" = CASE WHEN p_Category_Clear = TRUE THEN NULL ELSE COALESCE(p_Category, "Category") END,
        "APIPath" = COALESCE(p_APIPath, "APIPath"),
        "ResponseDataKey" = CASE WHEN p_ResponseDataKey_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseDataKey, "ResponseDataKey") END,
        "DefaultPageSize" = COALESCE(p_DefaultPageSize, "DefaultPageSize"),
        "SupportsPagination" = COALESCE(p_SupportsPagination, "SupportsPagination"),
        "PaginationType" = COALESCE(p_PaginationType, "PaginationType"),
        "SupportsIncrementalSync" = COALESCE(p_SupportsIncrementalSync, "SupportsIncrementalSync"),
        "SupportsWrite" = COALESCE(p_SupportsWrite, "SupportsWrite"),
        "DefaultQueryParams" = CASE WHEN p_DefaultQueryParams_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultQueryParams, "DefaultQueryParams") END,
        "Configuration" = CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, "Configuration") END,
        "Sequence" = COALESCE(p_Sequence, "Sequence"),
        "Status" = COALESCE(p_Status, "Status"),
        "WriteAPIPath" = CASE WHEN p_WriteAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_WriteAPIPath, "WriteAPIPath") END,
        "WriteMethod" = CASE WHEN p_WriteMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_WriteMethod, "WriteMethod") END,
        "DeleteMethod" = CASE WHEN p_DeleteMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteMethod, "DeleteMethod") END,
        "IsCustom" = COALESCE(p_IsCustom, "IsCustom"),
        "CreateAPIPath" = CASE WHEN p_CreateAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateAPIPath, "CreateAPIPath") END,
        "CreateMethod" = CASE WHEN p_CreateMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateMethod, "CreateMethod") END,
        "CreateBodyShape" = CASE WHEN p_CreateBodyShape_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateBodyShape, "CreateBodyShape") END,
        "CreateBodyKey" = CASE WHEN p_CreateBodyKey_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateBodyKey, "CreateBodyKey") END,
        "CreateIDLocation" = CASE WHEN p_CreateIDLocation_Clear = TRUE THEN NULL ELSE COALESCE(p_CreateIDLocation, "CreateIDLocation") END,
        "UpdateAPIPath" = CASE WHEN p_UpdateAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateAPIPath, "UpdateAPIPath") END,
        "UpdateMethod" = CASE WHEN p_UpdateMethod_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateMethod, "UpdateMethod") END,
        "UpdateBodyShape" = CASE WHEN p_UpdateBodyShape_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateBodyShape, "UpdateBodyShape") END,
        "UpdateBodyKey" = CASE WHEN p_UpdateBodyKey_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateBodyKey, "UpdateBodyKey") END,
        "UpdateIDLocation" = CASE WHEN p_UpdateIDLocation_Clear = TRUE THEN NULL ELSE COALESCE(p_UpdateIDLocation, "UpdateIDLocation") END,
        "DeleteAPIPath" = CASE WHEN p_DeleteAPIPath_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteAPIPath, "DeleteAPIPath") END,
        "DeleteIDLocation" = CASE WHEN p_DeleteIDLocation_Clear = TRUE THEN NULL ELSE COALESCE(p_DeleteIDLocation, "DeleteIDLocation") END,
        "IncrementalWatermarkField" = CASE WHEN p_IncrementalWatermarkField_Clear = TRUE THEN NULL ELSE COALESCE(p_IncrementalWatermarkField, "IncrementalWatermarkField") END,
        "MetadataSource" = COALESCE(p_MetadataSource, "MetadataSource")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwIntegrationObjects" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwIntegrationObjects" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteIntegrationObjectField'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteIntegrationObjectField"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."IntegrationObjectField"
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
           WHERE proname = 'spDeleteIntegrationObject'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteIntegrationObject"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."IntegrationObject"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateIntegrationObjectField_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateIntegrationObjectField" ON __mj."IntegrationObjectField";
CREATE TRIGGER "trgUpdateIntegrationObjectField"
    BEFORE UPDATE ON __mj."IntegrationObjectField"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateIntegrationObjectField_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateIntegrationObject_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateIntegrationObject" ON __mj."IntegrationObject";
CREATE TRIGGER "trgUpdateIntegrationObject"
    BEFORE UPDATE ON __mj."IntegrationObject"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateIntegrationObject_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b6965e9c-9434-43c8-85d2-2b554c1589dd' OR ("EntityID" = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND "Name" = 'MetadataSource')
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
        'b6965e9c-9434-43c8-85d2-2b554c1589dd',
        '3630CBFD-4C85-4B24-8A51-88D67389373E', -- "Entity": "MJ": "Integration" "Object" "Fields"
        100052,
        'MetadataSource',
        'Metadata Source',
        'Provenance of this IntegrationObjectField row: Declared (from static research/docs), Discovered (from runtime API introspection), Custom (customer-defined custom field, e.g., HubSpot custom property on standard object). Drives merge precedence — discovered/runtime wins for type/constraints; declared wins for description/label/sequence/category.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Declared',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f6c8ab31-990b-465f-9ddb-2100bcdfe9fc' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'CreateAPIPath')
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
        'f6c8ab31-990b-465f-9ddb-2100bcdfe9fc',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100062,
        'CreateAPIPath',
        'Create API Path',
        'HTTP path template for create operations. Generic CRUD in BaseRESTIntegrationConnector substitutes parent IDs into {var} placeholders. NULL means create not supported via metadata-driven path.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '982985b8-fa52-4aaa-8e0d-d13d02f3043f' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'CreateMethod')
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
        '982985b8-fa52-4aaa-8e0d-d13d02f3043f',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100063,
        'CreateMethod',
        'Create Method',
        'HTTP method for create (typically POST). NULL means create not supported via metadata-driven path.',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e74d8690-07e5-4678-beef-fad65e453941' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'CreateBodyShape')
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
        'e74d8690-07e5-4678-beef-fad65e453941',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100064,
        'CreateBodyShape',
        'Create Body Shape',
        'Request body shape for create: flat (top-level fields), wrapped (under CreateBodyKey), or literal (connector overrides CreateRecord and supplies own body).',
        'TEXT',
        100,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3081b789-fa40-41ba-836a-afa9bae50cbc' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'CreateBodyKey')
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
        '3081b789-fa40-41ba-836a-afa9bae50cbc',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100065,
        'CreateBodyKey',
        'Create Body Key',
        'Wrapper key for create body when CreateBodyShape=wrapped. Example: ''member'' for YourMembership which wraps body as {member:{...}}.',
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '71fe9bad-9bef-4078-a376-54784f72149c' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'CreateIDLocation')
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
        '71fe9bad-9bef-4078-a376-54784f72149c',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100066,
        'CreateIDLocation',
        'Create ID Location',
        'Where the created record ID is found in the create response: path (URL of returned Location header), body (parsed from JSON response), header (specific named header).',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '56708f15-2cba-4e41-ae0d-e8e7fb09ea0c' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'UpdateAPIPath')
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
        '56708f15-2cba-4e41-ae0d-e8e7fb09ea0c',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100067,
        'UpdateAPIPath',
        'Update API Path',
        'HTTP path template for update operations. Typically contains {ID} placeholder substituted with the record ExternalID at runtime.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd48250b7-4106-4978-8aa3-0cd4cd3081d9' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'UpdateMethod')
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
        'd48250b7-4106-4978-8aa3-0cd4cd3081d9',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100068,
        'UpdateMethod',
        'Update Method',
        'HTTP method for update (typically PATCH or PUT).',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b07f5316-77fe-4e2a-a92c-896bb5f1bbac' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'UpdateBodyShape')
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
        'b07f5316-77fe-4e2a-a92c-896bb5f1bbac',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100069,
        'UpdateBodyShape',
        'Update Body Shape',
        'Request body shape for update: flat | wrapped | literal. See CreateBodyShape.',
        'TEXT',
        100,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1ac0557-8d3e-4234-b61a-24a306ca38ee' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'UpdateBodyKey')
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
        'f1ac0557-8d3e-4234-b61a-24a306ca38ee',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100070,
        'UpdateBodyKey',
        'Update Body Key',
        'Wrapper key for update body when UpdateBodyShape=wrapped.',
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9a958c8d-688c-48ce-affe-5b7c8213d801' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'UpdateIDLocation')
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
        '9a958c8d-688c-48ce-affe-5b7c8213d801',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100071,
        'UpdateIDLocation',
        'Update ID Location',
        'For update: where the target record ID is located in the request — typically ''path'' (substituted into UpdateAPIPath URL template).',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '328ca7cd-8257-4583-9e5e-07e597ca7927' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'DeleteAPIPath')
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
        '328ca7cd-8257-4583-9e5e-07e597ca7927',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100072,
        'DeleteAPIPath',
        'Delete API Path',
        'HTTP path template for delete operations. Typically contains {ID} placeholder. NULL means delete not supported via metadata-driven path. (Existing DeleteMethod column carries the verb.)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e76a6a30-2540-402a-84cc-7b68c629f8f4' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'DeleteIDLocation')
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
        'e76a6a30-2540-402a-84cc-7b68c629f8f4',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100073,
        'DeleteIDLocation',
        'Delete ID Location',
        'For delete: where the target record ID is located — typically ''path''.',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0af8ba65-0d29-4b03-8720-ad7aef6adb1c' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'IncrementalWatermarkField')
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
        '0af8ba65-0d29-4b03-8720-ad7aef6adb1c',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100074,
        'IncrementalWatermarkField',
        'Incremental Watermark Field',
        'Vendor field name marking "last changed" — drives incremental sync filter when SupportsIncrementalSync=1. The exact filter syntax (e.g., $filter=Modified gt {value} or modified_since={value}) lives in Configuration.incrementalFilterFormat. Provable-only: leave NULL if docs do not name a watermark field.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0e920e25-6359-47dd-8a31-c0196742e2bc' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'MetadataSource')
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
        '0e920e25-6359-47dd-8a31-c0196742e2bc',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100075,
        'MetadataSource',
        'Metadata Source',
        'Provenance of this IntegrationObject row: Declared (from static research/docs), Discovered (from runtime API introspection like Salesforce /describe), Custom (genuinely customer-created, e.g., HubSpot custom objects). Drives merge precedence in IntegrationSchemaSync.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Declared',
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
                                       ('76966eaa-9af0-4241-a789-9d3ddb48ccbf', 'E76A6A30-2540-402A-84CC-7B68C629F8F4', 1, 'body', 'body', NOW(), NOW());

/* SQL text to insert entity field value with ID 4efe44f5-1252-4496-81b5-a84b217167df */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('4efe44f5-1252-4496-81b5-a84b217167df', 'E76A6A30-2540-402A-84CC-7B68C629F8F4', 2, 'header', 'header', NOW(), NOW());

/* SQL text to insert entity field value with ID fd0f4840-95d8-46f8-a942-f39dec6aae45 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('fd0f4840-95d8-46f8-a942-f39dec6aae45', 'E76A6A30-2540-402A-84CC-7B68C629F8F4', 3, 'n/a', 'n/a', NOW(), NOW());

/* SQL text to insert entity field value with ID 57ccbfb6-0861-4e34-9a35-19a2d1fdf203 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('57ccbfb6-0861-4e34-9a35-19a2d1fdf203', 'E76A6A30-2540-402A-84CC-7B68C629F8F4', 4, 'path', 'path', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID E76A6A30-2540-402A-84CC-7B68C629F8F4 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='E76A6A30-2540-402A-84CC-7B68C629F8F4';

/* SQL text to insert entity field value with ID 72e1b1f6-959c-489a-ab49-f3a1796ac0d7 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('72e1b1f6-959c-489a-ab49-f3a1796ac0d7', '0E920E25-6359-47DD-8A31-C0196742E2BC', 1, 'Custom', 'Custom', NOW(), NOW());

/* SQL text to insert entity field value with ID e4acd71c-5c79-4f00-9c3d-b602eba58175 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e4acd71c-5c79-4f00-9c3d-b602eba58175', '0E920E25-6359-47DD-8A31-C0196742E2BC', 2, 'Declared', 'Declared', NOW(), NOW());

/* SQL text to insert entity field value with ID f3e9e70f-1ae4-46e4-a833-6fb941ccf3e4 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('f3e9e70f-1ae4-46e4-a833-6fb941ccf3e4', '0E920E25-6359-47DD-8A31-C0196742E2BC', 3, 'Discovered', 'Discovered', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 0E920E25-6359-47DD-8A31-C0196742E2BC */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='0E920E25-6359-47DD-8A31-C0196742E2BC';

/* SQL text to insert entity field value with ID fa4f3ec0-9927-42cb-9ab5-bd5967f1ed45 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('fa4f3ec0-9927-42cb-9ab5-bd5967f1ed45', 'B6965E9C-9434-43C8-85D2-2B554C1589DD', 1, 'Custom', 'Custom', NOW(), NOW());

/* SQL text to insert entity field value with ID 41d0ab16-480e-4386-a9b7-be233ab35437 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('41d0ab16-480e-4386-a9b7-be233ab35437', 'B6965E9C-9434-43C8-85D2-2B554C1589DD', 2, 'Declared', 'Declared', NOW(), NOW());

/* SQL text to insert entity field value with ID ff03d1c5-73fe-4a77-9ed8-c907f519bd0f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ff03d1c5-73fe-4a77-9ed8-c907f519bd0f', 'B6965E9C-9434-43C8-85D2-2B554C1589DD', 3, 'Discovered', 'Discovered', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID B6965E9C-9434-43C8-85D2-2B554C1589DD */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='B6965E9C-9434-43C8-85D2-2B554C1589DD';

/* SQL text to insert entity field value with ID 0a00c04d-b64c-4d75-868d-2244db4a69a5 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('0a00c04d-b64c-4d75-868d-2244db4a69a5', 'E74D8690-07E5-4678-BEEF-FAD65E453941', 1, 'flat', 'flat', NOW(), NOW());

/* SQL text to insert entity field value with ID 27d9938e-7545-4918-8526-df01a4f0ba22 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('27d9938e-7545-4918-8526-df01a4f0ba22', 'E74D8690-07E5-4678-BEEF-FAD65E453941', 2, 'literal', 'literal', NOW(), NOW());

/* SQL text to insert entity field value with ID 14fcbd80-cc94-4f26-9d4a-0084762f01f0 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('14fcbd80-cc94-4f26-9d4a-0084762f01f0', 'E74D8690-07E5-4678-BEEF-FAD65E453941', 3, 'wrapped', 'wrapped', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID E74D8690-07E5-4678-BEEF-FAD65E453941 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='E74D8690-07E5-4678-BEEF-FAD65E453941';

/* SQL text to insert entity field value with ID 832e1e0b-3dd6-405a-a5d0-8e26591708bd */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('832e1e0b-3dd6-405a-a5d0-8e26591708bd', 'B07F5316-77FE-4E2A-A92C-896BB5F1BBAC', 1, 'flat', 'flat', NOW(), NOW());

/* SQL text to insert entity field value with ID 80a7e03d-5038-4b64-996d-8ad2aa2ef51c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('80a7e03d-5038-4b64-996d-8ad2aa2ef51c', 'B07F5316-77FE-4E2A-A92C-896BB5F1BBAC', 2, 'literal', 'literal', NOW(), NOW());

/* SQL text to insert entity field value with ID 485c50a4-2d72-4593-b76f-eba28a6e62f5 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('485c50a4-2d72-4593-b76f-eba28a6e62f5', 'B07F5316-77FE-4E2A-A92C-896BB5F1BBAC', 3, 'wrapped', 'wrapped', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID B07F5316-77FE-4E2A-A92C-896BB5F1BBAC */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='B07F5316-77FE-4E2A-A92C-896BB5F1BBAC';

/* SQL text to insert entity field value with ID ef840efa-372e-4269-aa07-d4c966182afc */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ef840efa-372e-4269-aa07-d4c966182afc', '71FE9BAD-9BEF-4078-A376-54784F72149C', 1, 'body', 'body', NOW(), NOW());

/* SQL text to insert entity field value with ID 678818f1-c490-4262-8338-f2e1c65122ad */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('678818f1-c490-4262-8338-f2e1c65122ad', '71FE9BAD-9BEF-4078-A376-54784F72149C', 2, 'header', 'header', NOW(), NOW());

/* SQL text to insert entity field value with ID 6db23c85-ceb8-46be-83b0-08acf579d05b */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('6db23c85-ceb8-46be-83b0-08acf579d05b', '71FE9BAD-9BEF-4078-A376-54784F72149C', 3, 'n/a', 'n/a', NOW(), NOW());

/* SQL text to insert entity field value with ID 69c0dffd-c036-4469-a1db-4810418e2966 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('69c0dffd-c036-4469-a1db-4810418e2966', '71FE9BAD-9BEF-4078-A376-54784F72149C', 4, 'path', 'path', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 71FE9BAD-9BEF-4078-A376-54784F72149C */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='71FE9BAD-9BEF-4078-A376-54784F72149C';

/* SQL text to insert entity field value with ID 3fdd344e-8565-4891-bd8a-492aae1358e3 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('3fdd344e-8565-4891-bd8a-492aae1358e3', '9A958C8D-688C-48CE-AFFE-5B7C8213D801', 1, 'body', 'body', NOW(), NOW());

/* SQL text to insert entity field value with ID c4696534-630b-4e96-98c2-bd767e7ca1c0 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('c4696534-630b-4e96-98c2-bd767e7ca1c0', '9A958C8D-688C-48CE-AFFE-5B7C8213D801', 2, 'header', 'header', NOW(), NOW());

/* SQL text to insert entity field value with ID c9699c6a-b226-4794-8c0a-f2edb6bbf779 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('c9699c6a-b226-4794-8c0a-f2edb6bbf779', '9A958C8D-688C-48CE-AFFE-5B7C8213D801', 3, 'n/a', 'n/a', NOW(), NOW());

/* SQL text to insert entity field value with ID 5933eb75-4636-47c9-b9b7-aa54d89f1166 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('5933eb75-4636-47c9-b9b7-aa54d89f1166', '9A958C8D-688C-48CE-AFFE-5B7C8213D801', 4, 'path', 'path', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 9A958C8D-688C-48CE-AFFE-5B7C8213D801 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='9A958C8D-688C-48CE-AFFE-5B7C8213D801';

/* Index for Foreign Keys for IntegrationObjectField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key IntegrationObjectID in table IntegrationObjectField

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'DA3BC5CE-671C-48AC-9CD5-497CA602D0E5'
               AND "AutoUpdateDefaultInView" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '0E920E25-6359-47DD-8A31-C0196742E2BC'
               AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 27 fields */

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C29BAC47-FD92-4209-B600-998618C2A052' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A40B0908-76CC-4D93-B7FF-659D450CDF19' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1E19F566-6FFB-4B64-96C9-8EA44B3DAE08' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IntegrationObjectID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Integration Object ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8EA456AD-785F-4E37-B397-8FF6F2040810' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."RelatedIntegrationObjectID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '22A62BF2-861B-4B29-A7E1-B69B476E706E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."RelatedIntegrationObjectFieldName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EFD4B858-690A-4AD6-9BCE-DACBE0F0BDF3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Configuration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '2EFA2D36-459B-4433-BFBC-4E76E8A5A461' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IntegrationObject"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Integration Object',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0DCDA729-DB83-421E-B5EC-1B1636C7BC1E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."RelatedIntegrationObject"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Integration Object Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E1ED4D02-2463-457C-9C8D-761D24CC5288' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F087BB9D-A16E-4778-A711-026B5CDB5ECB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."DisplayName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C0279D61-5DD7-4636-ACAF-3C07B4EBF599' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EB935245-A13B-46BA-B54C-BEDE08FAFEC0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CC99E8BA-DDB8-4CFB-8F0A-A4A68769A942' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Sequence"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5BC346A1-8015-4F20-9247-CB0039EE14E4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '82D4929E-1BBF-4EB5-AFC4-40D1DA3D01D4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IsCustom"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EA459761-25B4-4820-B056-E10E04F8EC28' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."MetadataSource"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Field Identity',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B6965E9C-9434-43C8-85D2-2B554C1589DD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FE592595-E4FD-458A-A892-918DB3ABC0B8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Length"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A184FA33-D1E3-4341-854A-63BA62571622' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Precision"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FC62F3D1-514C-4850-A884-098ACCEA440C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Scale"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A27F5839-CA61-42FC-B724-C4F885FB5FA0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."AllowsNull"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4F48E0A4-576C-4746-AF78-0CED62880881' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."DefaultValue"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1E996E3E-68A6-468D-92B5-B1E7D905AB64' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IsPrimaryKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A41406EF-D751-4E1D-8B03-537EC3F5ED26' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IsUniqueKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Unique',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DB6D509C-4DDC-4F2B-A2ED-6ABDEFD210A5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IsReadOnly"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6B8579C3-5351-4263-AEF4-BB44E30D4B4D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IsRequired"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DA3BC5CE-671C-48AC-9CD5-497CA602D0E5' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 38 fields */

-- UPDATE Entity Field Category Info MJ: Integration Objects."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F5F7651F-56E2-4E92-A9FE-CFCD61B58B25' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4C7B2511-B32A-4E05-AD8F-71A8D7438E96' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '17416191-6BA9-4D7D-B38D-5D32220C994E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."IntegrationID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Integration',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A0EAB738-4BB1-499F-80FC-AA8A0B46B389' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."Integration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Integration Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8DEFCEAD-C227-45E0-AF79-6B3318C563C7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7F19F87B-4609-4738-97D6-8627DE23AF4B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."DisplayName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8B3F3DFF-3E46-4DB2-9FC6-D5B764D80B7E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DBFED2A5-355D-4617-B4F8-237B4D3B2365' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0F0F0147-386F-45C8-AA9F-021C26B634A5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."Sequence"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9057E47C-7633-4B86-8ADF-F09044FE4470' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '027BC6FB-AC73-41C5-8856-981FB0031897' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."IsCustom"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4A4675F9-36F6-4EDF-83C0-29DFFEE0B61E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."MetadataSource"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0E920E25-6359-47DD-8A31-C0196742E2BC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."APIPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1CFA6C37-9057-4662-8C40-F835AA972EDF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."ResponseDataKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ADE52A5E-ADBA-4414-AAE2-12B535F85AC3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."DefaultQueryParams"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '38708EAC-BEC9-4BD1-AFA5-AF93A00F0FEA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."Configuration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'ED9326F4-6377-4FB3-84FA-EBCC9859FC07' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."WriteAPIPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D0BEDA5A-9F7B-4611-867D-59AA8EF8B849' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."WriteMethod"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F0FC7DA1-9649-427C-AEE2-DF31700F7512' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."DeleteMethod"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3006B046-676A-4DF8-B861-2A9A8EFE059D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."CreateAPIPath"

UPDATE __mj."EntityField"
SET 
   "Category" = 'API Endpoint Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F6C8AB31-990B-465F-9DDB-2100BCDFE9FC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."CreateMethod"

UPDATE __mj."EntityField"
SET 
   "Category" = 'API Endpoint Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '982985B8-FA52-4AAA-8E0D-D13D02F3043F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."UpdateAPIPath"

UPDATE __mj."EntityField"
SET 
   "Category" = 'API Endpoint Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '56708F15-2CBA-4E41-AE0D-E8E7FB09EA0C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."UpdateMethod"

UPDATE __mj."EntityField"
SET 
   "Category" = 'API Endpoint Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D48250B7-4106-4978-8AA3-0CD4CD3081D9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."DeleteAPIPath"

UPDATE __mj."EntityField"
SET 
   "Category" = 'API Endpoint Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '328CA7CD-8257-4583-9E5E-07E597CA7927' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."DefaultPageSize"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '85D95D3F-DAD6-492D-90AF-5207D16780EE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."SupportsPagination"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '27719863-6129-44D5-A77C-7827DB58BD91' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."PaginationType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '248DBCEF-E551-4913-8579-200B33459E16' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."SupportsIncrementalSync"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C73A053E-44E2-40A8-9A0A-899E6E28AF4D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."SupportsWrite"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E48963CB-3027-4554-BF48-52ECA282D983' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."IncrementalWatermarkField"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync and Pagination',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0AF8BA65-0D29-4B03-8720-AD7AEF6ADB1C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."CreateBodyShape"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Payload Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E74D8690-07E5-4678-BEEF-FAD65E453941' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."CreateBodyKey"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Payload Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3081B789-FA40-41BA-836A-AFA9BAE50CBC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."CreateIDLocation"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Payload Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '71FE9BAD-9BEF-4078-A376-54784F72149C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."UpdateBodyShape"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Payload Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B07F5316-77FE-4E2A-A92C-896BB5F1BBAC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."UpdateBodyKey"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Payload Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F1AC0557-8D3E-4234-B61A-24A306CA38EE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."UpdateIDLocation"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Payload Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9A958C8D-688C-48CE-AFFE-5B7C8213D801' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Integration Objects."DeleteIDLocation"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Payload Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E76A6A30-2540-402A-84CC-7B68C629F8F4' AND "AutoUpdateCategory" = TRUE;

/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Request Payload Configuration":{"icon":"fa fa-code","description":"Configuration for request body structure and ID mapping for CRUD operations"}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Request Payload Configuration":"fa fa-code"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'FieldCategoryIcons';


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."IntegrationObject"
 ADD CONSTRAINT "CK_IntegrationObject_CreateBodyShape"
    CHECK ("CreateBodyShape" IS NULL OR "CreateBodyShape" IN ('flat', 'wrapped', 'literal')) NOT VALID;

ALTER TABLE __mj."IntegrationObject"
 ADD CONSTRAINT "CK_IntegrationObject_UpdateBodyShape"
    CHECK ("UpdateBodyShape" IS NULL OR "UpdateBodyShape" IN ('flat', 'wrapped', 'literal')) NOT VALID;

ALTER TABLE __mj."IntegrationObject"
 ADD CONSTRAINT "CK_IntegrationObject_CreateIDLocation"
    CHECK ("CreateIDLocation" IS NULL OR "CreateIDLocation" IN ('path', 'body', 'header', 'n/a')) NOT VALID;

ALTER TABLE __mj."IntegrationObject"
 ADD CONSTRAINT "CK_IntegrationObject_UpdateIDLocation"
    CHECK ("UpdateIDLocation" IS NULL OR "UpdateIDLocation" IN ('path', 'body', 'header', 'n/a')) NOT VALID;

ALTER TABLE __mj."IntegrationObject"
 ADD CONSTRAINT "CK_IntegrationObject_DeleteIDLocation"
    CHECK ("DeleteIDLocation" IS NULL OR "DeleteIDLocation" IN ('path', 'body', 'header', 'n/a')) NOT VALID;

ALTER TABLE __mj."IntegrationObject"
 ADD CONSTRAINT "CK_IntegrationObject_MetadataSource"
    CHECK ("MetadataSource" IN ('Declared', 'Discovered', 'Custom')) NOT VALID;


-- Extended properties (CodeGen surfaces these as field descriptions);

ALTER TABLE __mj."IntegrationObjectField"
 ADD CONSTRAINT "CK_IntegrationObjectField_MetadataSource"
    CHECK ("MetadataSource" IN ('Declared', 'Discovered', 'Custom')) NOT VALID;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwIntegrationObjectFields" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: Permissions for vwIntegrationObjectFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwIntegrationObjectFields" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spCreateIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationObjectField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Integration Object Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationObjectField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spUpdateIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationObjectField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationObjectField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: vwIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Objects
-----               SCHEMA:      __mj
-----               BASE TABLE:  IntegrationObject
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwIntegrationObjects" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: Permissions for vwIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwIntegrationObjects" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spCreateIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationObject
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationObject" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Integration Objects */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationObject" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spUpdateIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationObject
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationObject" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationObject" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spDeleteIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationObjectField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Integration Object Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationObjectField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spDeleteIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationObject
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationObject" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Integration Objects */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationObject" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."IntegrationObject"."CreateAPIPath" IS 'HTTP path template for create operations. Generic CRUD in BaseRESTIntegrationConnector substitutes parent IDs into {var} placeholders. NULL means create not supported via metadata-driven path.';

COMMENT ON COLUMN __mj."IntegrationObject"."CreateMethod" IS 'HTTP method for create (typically POST). NULL means create not supported via metadata-driven path.';

COMMENT ON COLUMN __mj."IntegrationObject"."CreateBodyShape" IS 'Request body shape for create: flat (top-level fields), wrapped (under CreateBodyKey), or literal (connector overrides CreateRecord and supplies own body).';

COMMENT ON COLUMN __mj."IntegrationObject"."CreateBodyKey" IS 'Wrapper key for create body when CreateBodyShape=wrapped. Example: ';

COMMENT ON COLUMN __mj."IntegrationObject"."CreateIDLocation" IS 'Where the created record ID is found in the create response: path (URL of returned Location header), body (parsed from JSON response), header (specific named header).';

COMMENT ON COLUMN __mj."IntegrationObject"."UpdateAPIPath" IS 'HTTP path template for update operations. Typically contains {ID} placeholder substituted with the record ExternalID at runtime.';

COMMENT ON COLUMN __mj."IntegrationObject"."UpdateMethod" IS 'HTTP method for update (typically PATCH or PUT).';

COMMENT ON COLUMN __mj."IntegrationObject"."UpdateBodyShape" IS 'Request body shape for update: flat | wrapped | literal. See CreateBodyShape.';

COMMENT ON COLUMN __mj."IntegrationObject"."UpdateBodyKey" IS 'Wrapper key for update body when UpdateBodyShape=wrapped.';

COMMENT ON COLUMN __mj."IntegrationObject"."UpdateIDLocation" IS 'For update: where the target record ID is located in the request — typically ';

COMMENT ON COLUMN __mj."IntegrationObject"."DeleteAPIPath" IS 'HTTP path template for delete operations. Typically contains {ID} placeholder. NULL means delete not supported via metadata-driven path. (Existing DeleteMethod column carries the verb.)';

COMMENT ON COLUMN __mj."IntegrationObject"."DeleteIDLocation" IS 'For delete: where the target record ID is located — typically ';

COMMENT ON COLUMN __mj."IntegrationObject"."IncrementalWatermarkField" IS 'Vendor field name marking "last changed" — drives incremental sync filter when SupportsIncrementalSync=1. The exact filter syntax (e.g., $filter=Modified gt {value} or modified_since={value}) lives in Configuration.incrementalFilterFormat. Provable-only: leave NULL if docs do not name a watermark field.';

COMMENT ON COLUMN __mj."IntegrationObject"."MetadataSource" IS 'Provenance of this IntegrationObject row: Declared (from static research/docs), Discovered (from runtime API introspection like Salesforce /describe), Custom (genuinely customer-created, e.g., HubSpot custom objects). Drives merge precedence in IntegrationSchemaSync.';

COMMENT ON COLUMN __mj."IntegrationObject"."WriteAPIPath" IS 'DEPRECATED v5.39.x — superseded by CreateAPIPath/UpdateAPIPath. Will be removed in a future release. Generic CRUD in BaseRESTIntegrationConnector reads only the per-operation columns.';

COMMENT ON COLUMN __mj."IntegrationObject"."WriteMethod" IS 'DEPRECATED v5.39.x — superseded by CreateMethod/UpdateMethod. Will be removed in a future release.';

COMMENT ON COLUMN __mj."IntegrationObjectField"."MetadataSource" IS 'Provenance of this IntegrationObjectField row: Declared (from static research/docs), Discovered (from runtime API introspection), Custom (customer-defined custom field, e.g., HubSpot custom property on standard object). Drives merge precedence — discovered/runtime wins for type/constraints; declared wins for description/label/sequence/category.';


-- ===================== Other =====================

-- CHECK constraints (separate ALTERs for constraint-add per SQL Server semantics)

/* spUpdate Permissions for MJ: Integration Object Fields */

/* spUpdate Permissions for MJ: Integration Objects */
