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

/*
    ModelConfiguration — the per-modality model-catalog configuration cascade

    Plan: plans/model-configuration.md.

    Adds ONE nullable JSON column, `ModelConfiguration`, at THREE levels of the AI model
    catalog, forming an inherit-with-override cascade resolved base-first:

        AIModelType.ModelConfiguration          (type-wide default — e.g. every Realtime model)
          <  AIModel.ModelConfiguration         (per-model)
            <  AIModelVendor.ModelConfiguration (per model-on-this-provider — the winner)

    This is the structured generalization of the scalar cascade these same three tables
    already carry (`SupportsPrefill` / `PrefillFallbackText`: NOT NULL at the type, nullable =
    inherit at model and model-vendor). Instead of adding a capability column per knob, new
    session/call-time configuration lands as typed properties inside this one bag.

    The column is a JSONType field: `metadata/entities/JSONType-interfaces/IAIModelConfiguration.ts`
    is pushed into `EntityField.JSONTypeDefinition` (see the bridge records in
    `metadata/entities/.entity-field-jsontype-model-configuration.json`), and CodeGen then emits a
    strongly-typed `ModelConfigurationObject` accessor on all three generated entities. First
    consumer: the realtime session builders read `Realtime.TurnDetection` through
    `AIEngine.GetEffectiveModelConfiguration` to pick each model's turn-detection mode.

    Boundary rule (documented on the interface): anything the engine filters/sorts/joins on stays
    a COLUMN (PowerRank, IsActive, Priority, Status); anything a driver consumes at session/call
    time belongs in this bag.

    Purely additive — no drops, no data changes, no CHECK constraints.
*/

-- ════════════════════════════════════════════════════════════════════════════════════
-- 1. The three catalog levels gain the same nullable JSON column
-- ════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE __mj."AIModelType"
 ADD COLUMN IF NOT EXISTS "ModelConfiguration" TEXT NULL;

ALTER TABLE __mj."AIModel"
 ADD COLUMN IF NOT EXISTS "ModelConfiguration" TEXT NULL;

ALTER TABLE __mj."AIModelVendor"
 ADD COLUMN IF NOT EXISTS "ModelConfiguration" TEXT NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModelType_DefaultInputModalityID" ON __mj."AIModelType" ("DefaultInputModalityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModelType_DefaultOutputModalityID" ON __mj."AIModelType" ("DefaultOutputModalityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModelVendor_ModelID" ON __mj."AIModelVendor" ("ModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModelVendor_VendorID" ON __mj."AIModelVendor" ("VendorID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModelVendor_TypeID" ON __mj."AIModelVendor" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModel_AIModelTypeID" ON __mj."AIModel" ("AIModelTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModel_PriorVersionID" ON __mj."AIModel" ("PriorVersionID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwAIModelTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIModelTypes"
AS SELECT
    a.*,
    "MJAIModality_DefaultInputModalityID"."Name" AS "DefaultInputModality",
    "MJAIModality_DefaultOutputModalityID"."Name" AS "DefaultOutputModality"
FROM
    __mj."AIModelType" AS a
INNER JOIN
    __mj."AIModality" AS "MJAIModality_DefaultInputModalityID"
  ON
    a."DefaultInputModalityID" = "MJAIModality_DefaultInputModalityID"."ID"
INNER JOIN
    __mj."AIModality" AS "MJAIModality_DefaultOutputModalityID"
  ON
    a."DefaultOutputModalityID" = "MJAIModality_DefaultOutputModalityID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIModelVendors';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIModelVendors"
AS SELECT
    a.*,
    "MJAIModel_ModelID"."Name" AS "Model",
    "MJAIVendor_VendorID"."Name" AS "Vendor",
    "MJAIVendorTypeDefinition_TypeID"."Name" AS "Type"
FROM
    __mj."AIModelVendor" AS a
INNER JOIN
    __mj."AIModel" AS "MJAIModel_ModelID"
  ON
    a."ModelID" = "MJAIModel_ModelID"."ID"
INNER JOIN
    __mj."AIVendor" AS "MJAIVendor_VendorID"
  ON
    a."VendorID" = "MJAIVendor_VendorID"."ID"
INNER JOIN
    __mj."AIVendorTypeDefinition" AS "MJAIVendorTypeDefinition_TypeID"
  ON
    a."TypeID" = "MJAIVendorTypeDefinition_TypeID"."ID"$vsql$;
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
           WHERE proname = 'spCreateAIModel'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIModel"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(50) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AIModelTypeID UUID DEFAULT NULL,
    IN p_PowerRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_PowerRank INTEGER DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_SpeedRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_SpeedRank INTEGER DEFAULT NULL,
    IN p_CostRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_CostRank INTEGER DEFAULT NULL,
    IN p_ModelSelectionInsights_Clear BOOLEAN DEFAULT FALSE,
    IN p_ModelSelectionInsights TEXT DEFAULT NULL,
    IN p_InheritTypeModalities BOOLEAN DEFAULT NULL,
    IN p_PriorVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PriorVersionID UUID DEFAULT NULL,
    IN p_SupportsPrefill_Clear BOOLEAN DEFAULT FALSE,
    IN p_SupportsPrefill BOOLEAN DEFAULT NULL,
    IN p_PrefillFallbackText_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrefillFallbackText TEXT DEFAULT NULL,
    IN p_ModelConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_ModelConfiguration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIModels" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIModel"
            (
                "ID",
                "Name",
                "Description",
                "AIModelTypeID",
                "PowerRank",
                "IsActive",
                "SpeedRank",
                "CostRank",
                "ModelSelectionInsights",
                "InheritTypeModalities",
                "PriorVersionID",
                "SupportsPrefill",
                "PrefillFallbackText",
                "ModelConfiguration"
            )
        VALUES
            (
                p_ID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_AIModelTypeID,
                CASE WHEN p_PowerRank_Clear = TRUE THEN NULL ELSE COALESCE(p_PowerRank, 0) END,
                COALESCE(p_IsActive, TRUE),
                CASE WHEN p_SpeedRank_Clear = TRUE THEN NULL ELSE COALESCE(p_SpeedRank, 0) END,
                CASE WHEN p_CostRank_Clear = TRUE THEN NULL ELSE COALESCE(p_CostRank, 0) END,
                CASE WHEN p_ModelSelectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelSelectionInsights, NULL) END,
                COALESCE(p_InheritTypeModalities, TRUE),
                CASE WHEN p_PriorVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_PriorVersionID, NULL) END,
                CASE WHEN p_SupportsPrefill_Clear = TRUE THEN NULL ELSE COALESCE(p_SupportsPrefill, NULL) END,
                CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, NULL) END,
                CASE WHEN p_ModelConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelConfiguration, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIModel"
            (
                "Name",
                "Description",
                "AIModelTypeID",
                "PowerRank",
                "IsActive",
                "SpeedRank",
                "CostRank",
                "ModelSelectionInsights",
                "InheritTypeModalities",
                "PriorVersionID",
                "SupportsPrefill",
                "PrefillFallbackText",
                "ModelConfiguration"
            )
        VALUES
            (
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_AIModelTypeID,
                CASE WHEN p_PowerRank_Clear = TRUE THEN NULL ELSE COALESCE(p_PowerRank, 0) END,
                COALESCE(p_IsActive, TRUE),
                CASE WHEN p_SpeedRank_Clear = TRUE THEN NULL ELSE COALESCE(p_SpeedRank, 0) END,
                CASE WHEN p_CostRank_Clear = TRUE THEN NULL ELSE COALESCE(p_CostRank, 0) END,
                CASE WHEN p_ModelSelectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelSelectionInsights, NULL) END,
                COALESCE(p_InheritTypeModalities, TRUE),
                CASE WHEN p_PriorVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_PriorVersionID, NULL) END,
                CASE WHEN p_SupportsPrefill_Clear = TRUE THEN NULL ELSE COALESCE(p_SupportsPrefill, NULL) END,
                CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, NULL) END,
                CASE WHEN p_ModelConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelConfiguration, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIModels" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIModel'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIModel"(
    IN p_ID UUID,
    IN p_Name VARCHAR(50) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AIModelTypeID UUID DEFAULT NULL,
    IN p_PowerRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_PowerRank INTEGER DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_SpeedRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_SpeedRank INTEGER DEFAULT NULL,
    IN p_CostRank_Clear BOOLEAN DEFAULT FALSE,
    IN p_CostRank INTEGER DEFAULT NULL,
    IN p_ModelSelectionInsights_Clear BOOLEAN DEFAULT FALSE,
    IN p_ModelSelectionInsights TEXT DEFAULT NULL,
    IN p_InheritTypeModalities BOOLEAN DEFAULT NULL,
    IN p_PriorVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PriorVersionID UUID DEFAULT NULL,
    IN p_SupportsPrefill_Clear BOOLEAN DEFAULT FALSE,
    IN p_SupportsPrefill BOOLEAN DEFAULT NULL,
    IN p_PrefillFallbackText_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrefillFallbackText TEXT DEFAULT NULL,
    IN p_ModelConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_ModelConfiguration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIModels" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIModel"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "AIModelTypeID" = COALESCE(p_AIModelTypeID, "AIModelTypeID"),
        "PowerRank" = CASE WHEN p_PowerRank_Clear = TRUE THEN NULL ELSE COALESCE(p_PowerRank, "PowerRank") END,
        "IsActive" = COALESCE(p_IsActive, "IsActive"),
        "SpeedRank" = CASE WHEN p_SpeedRank_Clear = TRUE THEN NULL ELSE COALESCE(p_SpeedRank, "SpeedRank") END,
        "CostRank" = CASE WHEN p_CostRank_Clear = TRUE THEN NULL ELSE COALESCE(p_CostRank, "CostRank") END,
        "ModelSelectionInsights" = CASE WHEN p_ModelSelectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelSelectionInsights, "ModelSelectionInsights") END,
        "InheritTypeModalities" = COALESCE(p_InheritTypeModalities, "InheritTypeModalities"),
        "PriorVersionID" = CASE WHEN p_PriorVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_PriorVersionID, "PriorVersionID") END,
        "SupportsPrefill" = CASE WHEN p_SupportsPrefill_Clear = TRUE THEN NULL ELSE COALESCE(p_SupportsPrefill, "SupportsPrefill") END,
        "PrefillFallbackText" = CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, "PrefillFallbackText") END,
        "ModelConfiguration" = CASE WHEN p_ModelConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelConfiguration, "ModelConfiguration") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIModels" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIModels" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModel'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIModel"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModel"
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
           WHERE proname = 'spCreateAIModelType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIModelType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(50) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DefaultInputModalityID UUID DEFAULT NULL,
    IN p_DefaultOutputModalityID UUID DEFAULT NULL,
    IN p_SupportsPrefill BOOLEAN DEFAULT NULL,
    IN p_PrefillFallbackText_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrefillFallbackText TEXT DEFAULT NULL,
    IN p_ModelConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_ModelConfiguration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIModelTypes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIModelType"
            (
                "ID",
                "Name",
                "Description",
                "DefaultInputModalityID",
                "DefaultOutputModalityID",
                "SupportsPrefill",
                "PrefillFallbackText",
                "ModelConfiguration"
            )
        VALUES
            (
                p_ID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_DefaultInputModalityID,
                p_DefaultOutputModalityID,
                COALESCE(p_SupportsPrefill, FALSE),
                CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, NULL) END,
                CASE WHEN p_ModelConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelConfiguration, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIModelType"
            (
                "Name",
                "Description",
                "DefaultInputModalityID",
                "DefaultOutputModalityID",
                "SupportsPrefill",
                "PrefillFallbackText",
                "ModelConfiguration"
            )
        VALUES
            (
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_DefaultInputModalityID,
                p_DefaultOutputModalityID,
                COALESCE(p_SupportsPrefill, FALSE),
                CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, NULL) END,
                CASE WHEN p_ModelConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelConfiguration, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIModelTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIModelType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(50) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DefaultInputModalityID UUID DEFAULT NULL,
    IN p_DefaultOutputModalityID UUID DEFAULT NULL,
    IN p_SupportsPrefill BOOLEAN DEFAULT NULL,
    IN p_PrefillFallbackText_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrefillFallbackText TEXT DEFAULT NULL,
    IN p_ModelConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_ModelConfiguration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIModelTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIModelType"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "DefaultInputModalityID" = COALESCE(p_DefaultInputModalityID, "DefaultInputModalityID"),
        "DefaultOutputModalityID" = COALESCE(p_DefaultOutputModalityID, "DefaultOutputModalityID"),
        "SupportsPrefill" = COALESCE(p_SupportsPrefill, "SupportsPrefill"),
        "PrefillFallbackText" = CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, "PrefillFallbackText") END,
        "ModelConfiguration" = CASE WHEN p_ModelConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelConfiguration, "ModelConfiguration") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIModelTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIModelTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateAIModelVendor'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIModelVendor"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ModelID UUID DEFAULT NULL,
    IN p_VendorID UUID DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_DriverClass_Clear BOOLEAN DEFAULT FALSE,
    IN p_DriverClass VARCHAR(100) DEFAULT NULL,
    IN p_DriverImportPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_DriverImportPath VARCHAR(255) DEFAULT NULL,
    IN p_APIName_Clear BOOLEAN DEFAULT FALSE,
    IN p_APIName VARCHAR(100) DEFAULT NULL,
    IN p_MaxInputTokens_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxInputTokens INTEGER DEFAULT NULL,
    IN p_MaxOutputTokens_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxOutputTokens INTEGER DEFAULT NULL,
    IN p_SupportedResponseFormats VARCHAR(100) DEFAULT NULL,
    IN p_SupportsEffortLevel BOOLEAN DEFAULT NULL,
    IN p_SupportsStreaming BOOLEAN DEFAULT NULL,
    IN p_TypeID UUID DEFAULT NULL,
    IN p_SupportsPrefill_Clear BOOLEAN DEFAULT FALSE,
    IN p_SupportsPrefill BOOLEAN DEFAULT NULL,
    IN p_PrefillFallbackText_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrefillFallbackText TEXT DEFAULT NULL,
    IN p_ModelConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_ModelConfiguration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIModelVendors" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIModelVendor"
            (
                "ID",
                "ModelID",
                "VendorID",
                "Priority",
                "Status",
                "DriverClass",
                "DriverImportPath",
                "APIName",
                "MaxInputTokens",
                "MaxOutputTokens",
                "SupportedResponseFormats",
                "SupportsEffortLevel",
                "SupportsStreaming",
                "TypeID",
                "SupportsPrefill",
                "PrefillFallbackText",
                "ModelConfiguration"
            )
        VALUES
            (
                p_ID,
                p_ModelID,
                p_VendorID,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_DriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverClass, NULL) END,
                CASE WHEN p_DriverImportPath_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverImportPath, NULL) END,
                CASE WHEN p_APIName_Clear = TRUE THEN NULL ELSE COALESCE(p_APIName, NULL) END,
                CASE WHEN p_MaxInputTokens_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxInputTokens, NULL) END,
                CASE WHEN p_MaxOutputTokens_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxOutputTokens, NULL) END,
                COALESCE(p_SupportedResponseFormats, 'Any'),
                COALESCE(p_SupportsEffortLevel, FALSE),
                COALESCE(p_SupportsStreaming, FALSE),
                p_TypeID,
                CASE WHEN p_SupportsPrefill_Clear = TRUE THEN NULL ELSE COALESCE(p_SupportsPrefill, NULL) END,
                CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, NULL) END,
                CASE WHEN p_ModelConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelConfiguration, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIModelVendor"
            (
                "ModelID",
                "VendorID",
                "Priority",
                "Status",
                "DriverClass",
                "DriverImportPath",
                "APIName",
                "MaxInputTokens",
                "MaxOutputTokens",
                "SupportedResponseFormats",
                "SupportsEffortLevel",
                "SupportsStreaming",
                "TypeID",
                "SupportsPrefill",
                "PrefillFallbackText",
                "ModelConfiguration"
            )
        VALUES
            (
                p_ModelID,
                p_VendorID,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_DriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverClass, NULL) END,
                CASE WHEN p_DriverImportPath_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverImportPath, NULL) END,
                CASE WHEN p_APIName_Clear = TRUE THEN NULL ELSE COALESCE(p_APIName, NULL) END,
                CASE WHEN p_MaxInputTokens_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxInputTokens, NULL) END,
                CASE WHEN p_MaxOutputTokens_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxOutputTokens, NULL) END,
                COALESCE(p_SupportedResponseFormats, 'Any'),
                COALESCE(p_SupportsEffortLevel, FALSE),
                COALESCE(p_SupportsStreaming, FALSE),
                p_TypeID,
                CASE WHEN p_SupportsPrefill_Clear = TRUE THEN NULL ELSE COALESCE(p_SupportsPrefill, NULL) END,
                CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, NULL) END,
                CASE WHEN p_ModelConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelConfiguration, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIModelVendors" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIModelVendor'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelVendor"(
    IN p_ID UUID,
    IN p_ModelID UUID DEFAULT NULL,
    IN p_VendorID UUID DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_DriverClass_Clear BOOLEAN DEFAULT FALSE,
    IN p_DriverClass VARCHAR(100) DEFAULT NULL,
    IN p_DriverImportPath_Clear BOOLEAN DEFAULT FALSE,
    IN p_DriverImportPath VARCHAR(255) DEFAULT NULL,
    IN p_APIName_Clear BOOLEAN DEFAULT FALSE,
    IN p_APIName VARCHAR(100) DEFAULT NULL,
    IN p_MaxInputTokens_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxInputTokens INTEGER DEFAULT NULL,
    IN p_MaxOutputTokens_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxOutputTokens INTEGER DEFAULT NULL,
    IN p_SupportedResponseFormats VARCHAR(100) DEFAULT NULL,
    IN p_SupportsEffortLevel BOOLEAN DEFAULT NULL,
    IN p_SupportsStreaming BOOLEAN DEFAULT NULL,
    IN p_TypeID UUID DEFAULT NULL,
    IN p_SupportsPrefill_Clear BOOLEAN DEFAULT FALSE,
    IN p_SupportsPrefill BOOLEAN DEFAULT NULL,
    IN p_PrefillFallbackText_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrefillFallbackText TEXT DEFAULT NULL,
    IN p_ModelConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_ModelConfiguration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIModelVendors" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIModelVendor"
    SET
        "ModelID" = COALESCE(p_ModelID, "ModelID"),
        "VendorID" = COALESCE(p_VendorID, "VendorID"),
        "Priority" = COALESCE(p_Priority, "Priority"),
        "Status" = COALESCE(p_Status, "Status"),
        "DriverClass" = CASE WHEN p_DriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverClass, "DriverClass") END,
        "DriverImportPath" = CASE WHEN p_DriverImportPath_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverImportPath, "DriverImportPath") END,
        "APIName" = CASE WHEN p_APIName_Clear = TRUE THEN NULL ELSE COALESCE(p_APIName, "APIName") END,
        "MaxInputTokens" = CASE WHEN p_MaxInputTokens_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxInputTokens, "MaxInputTokens") END,
        "MaxOutputTokens" = CASE WHEN p_MaxOutputTokens_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxOutputTokens, "MaxOutputTokens") END,
        "SupportedResponseFormats" = COALESCE(p_SupportedResponseFormats, "SupportedResponseFormats"),
        "SupportsEffortLevel" = COALESCE(p_SupportsEffortLevel, "SupportsEffortLevel"),
        "SupportsStreaming" = COALESCE(p_SupportsStreaming, "SupportsStreaming"),
        "TypeID" = COALESCE(p_TypeID, "TypeID"),
        "SupportsPrefill" = CASE WHEN p_SupportsPrefill_Clear = TRUE THEN NULL ELSE COALESCE(p_SupportsPrefill, "SupportsPrefill") END,
        "PrefillFallbackText" = CASE WHEN p_PrefillFallbackText_Clear = TRUE THEN NULL ELSE COALESCE(p_PrefillFallbackText, "PrefillFallbackText") END,
        "ModelConfiguration" = CASE WHEN p_ModelConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_ModelConfiguration, "ModelConfiguration") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIModelVendors" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIModelVendors" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModelType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModelType"
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
           WHERE proname = 'spDeleteAIModelVendor'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelVendor"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModelVendor"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIModel_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIModel" ON __mj."AIModel";
CREATE TRIGGER "trgUpdateAIModel"
    BEFORE UPDATE ON __mj."AIModel"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIModel_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIModelType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIModelType" ON __mj."AIModelType";
CREATE TRIGGER "trgUpdateAIModelType"
    BEFORE UPDATE ON __mj."AIModelType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIModelType_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIModelVendor_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIModelVendor" ON __mj."AIModelVendor";
CREATE TRIGGER "trgUpdateAIModelVendor"
    BEFORE UPDATE ON __mj."AIModelVendor"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIModelVendor_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6dacb7b5-a878-4c04-94c4-3cd3c9f24177' OR ("EntityID" = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ModelConfiguration')
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
        '6dacb7b5-a878-4c04-94c4-3cd3c9f24177',
        'FD238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "AI" "Models"
        100040,
        'ModelConfiguration',
        'Model Configuration',
        'Per-model layer of the per-modality model-configuration bag (JSON, IAIModelConfiguration shape). Deep-merges per key over the AIModelType default; AIModelVendor rows may override per key on top. NULL = inherit the type default unchanged.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8ac7b8f1-9814-4bd4-90db-6c2fc5e9fe20' OR ("EntityID" = '01248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ModelConfiguration')
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
        '8ac7b8f1-9814-4bd4-90db-6c2fc5e9fe20',
        '01248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "AI" "Model" "Types"
        100022,
        'ModelConfiguration',
        'Model Configuration',
        'Type-wide default of the per-modality model-configuration bag (JSON, IAIModelConfiguration shape: LLM / Realtime / Vision / Audio sections). Base layer of the ModelConfiguration cascade — AIModel and AIModelVendor rows inherit from it per key and may override. NULL = contributes nothing.',
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
        'Dropdown',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3eeb74ea-6b56-487e-b102-edb0e1cc5613' OR ("EntityID" = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND "Name" = 'ModelConfiguration')
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
        '3eeb74ea-6b56-487e-b102-edb0e1cc5613',
        'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- "Entity": "MJ": "AI" "Model" "Vendors"
        100041,
        'ModelConfiguration',
        'Model Configuration',
        'Most-specific layer of the per-modality model-configuration bag (JSON, IAIModelConfiguration shape) — configuration for THIS model on THIS provider. Deep-merges per key over the model and type layers. NULL = inherit the merged model/type configuration unchanged.',
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

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5B8E8CA9-7728-455A-A528-0F13782242C0'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '2ED7BE95-4E39-439B-8152-D0A6516C1398'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'FA4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '274F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = 'FD238F34-2837-EF11-86D4-6045BDEE16E6'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = FALSE
               WHERE "ID" = 'EA94D7B8-080D-4525-B0E9-6E620B3E901E'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = FALSE
               WHERE "ID" = 'FBD754C7-2336-494C-9E4F-F3A6EADDB575'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'EA94D7B8-080D-4525-B0E9-6E620B3E901E'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'FBD754C7-2336-494C-9E4F-F3A6EADDB575'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'FBEE7EC7-7AD6-45D1-874B-CAAE97C51B22'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = 'F386546E-EC07-46E6-B780-6B1FEA5892E6'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: AI Model Types.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '034317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Types.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '585817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Types.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '595817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Types.Name

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '044317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Types.Description

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '054317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Types.ModelConfiguration

UPDATE __mj."EntityField"
SET 
   "Category" = 'Model Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '8AC7B8F1-9814-4BD4-90DB-6C2FC5E9FE20' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Types.DefaultInputModalityID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C0BAE356-2818-4B55-9737-5BFA97225462' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Types.DefaultOutputModalityID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5E5F9F7F-708F-4595-9F32-5F0574F25F01' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Types.DefaultInputModality

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B35C64CB-7EC6-4396-BDA1-59F9F28EED58' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Types.DefaultOutputModality

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6D6D28B3-C88C-40BD-ABE8-A30D2A81420A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Types.SupportsPrefill

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E98DA083-3098-48C8-80E2-A6D0BF54D56E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Types.PrefillFallbackText

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E902ACEB-B25A-4A67-916C-BDF4A75D9517' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 24 fields */

-- UPDATE Entity Field Category Info MJ: AI Models.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F94217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.Name

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.Description

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.AIModelTypeID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'AI Model Type ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '024317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.IsActive

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Active',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '064317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.ModelSelectionInsights

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '309321B0-2443-47A1-85E6-A134664B4AAB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.InheritTypeModalities

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A6755DF4-8B80-4E06-9D3F-B02188DB8A12' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.PriorVersionID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9C2DD641-F764-4C55-8527-FD5E37BD1895' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.AIModelType

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'AI Model Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AF5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.Vendor

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '014317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.PowerRank

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '284F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.SpeedRank

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5B8E8CA9-7728-455A-A528-0F13782242C0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.CostRank

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2ED7BE95-4E39-439B-8152-D0A6516C1398' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.ModelConfiguration

UPDATE __mj."EntityField"
SET 
   "Category" = 'Technical Specifications',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '6DACB7B5-A878-4C04-94C4-3CD3C9F24177' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.SupportsPrefill

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5CEB95A4-E2B8-43DF-A3F0-10C996BE0F2F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.PrefillFallbackText

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E8CB6D77-91C1-449F-951C-FDFD423DBEC6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.DriverClass

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FC4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.DriverImportPath

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '094317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.APIName

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '274F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.InputTokenLimit

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5EC9D425-B9DA-4FED-ACC9-596859658679' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.SupportedResponseFormats

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8B0575EC-3B6E-4F64-B9AC-052B44127021' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.SupportsEffortLevel

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A7850674-D31F-4669-8F25-30D9F581E873' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AD5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Models.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AE5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4536A71E-5AD6-4F8C-A663-21F3CEF4831A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.ModelID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C7583B81-0BC4-4302-98ED-BE6E5DD22D50' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.VendorID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B30005CE-FA92-4DEE-8F56-BEFC7D5E2AAE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.Priority

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '37BFE134-5935-4863-8B22-29EFE58B2150' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.Status

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.TypeID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Vendor Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1A83EAF3-4F88-48BA-8B4B-BA7E0A4AB513' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.Model

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EA94D7B8-080D-4525-B0E9-6E620B3E901E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.Vendor

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FBD754C7-2336-494C-9E4F-F3A6EADDB575' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.Type

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0A17D759-76BD-4954-8851-86F14EAEB203' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.DriverClass

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BF1B7891-03FE-4B11-ABE7-4BDF4C832A56' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.DriverImportPath

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D57079F0-0DE2-45D8-8ECB-4DC006888664' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.APIName

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FBEE7EC7-7AD6-45D1-874B-CAAE97C51B22' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.MaxInputTokens

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '20E5AFFE-1F52-478D-AD83-C5A0A90A2C4E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.MaxOutputTokens

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C5799595-5330-4762-BD3C-12F9CD02E933' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.SupportedResponseFormats

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1099A0DE-EEE4-4D04-B0F6-AC9ED896690D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.SupportsEffortLevel

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B36B3620-899F-4851-AD2A-ED14F2D22A4C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.SupportsStreaming

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2E9DA543-3A02-4695-A96C-3017025842CE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.SupportsPrefill

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '339BDDF1-0070-409B-9F57-EE8780E05DA9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.PrefillFallbackText

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8EEF536D-4AE4-4AB8-9C11-4E47E69F2214' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.ModelConfiguration

UPDATE __mj."EntityField"
SET 
   "Category" = 'Implementation Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '3EEB74EA-6B56-487E-B102-EDB0E1CC5613' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C8EA3975-296E-4432-A2CF-78BA773F7CD0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Model Vendors.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0199799B-8D89-4306-AA33-67D7A326165A' AND "AutoUpdateCategory" = TRUE;

/* Refresh custom base views for modified entities so schema changes are picked up */


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwAIModels" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Models
-- Item: spCreateAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModel
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Models */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Models
-- Item: spUpdateAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModel
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Models
-- Item: spDeleteAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModel
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModel" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Models */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModel" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Types
-- Item: vwAIModelTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIModelType
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIModelTypes" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Types
-- Item: Permissions for vwAIModelTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIModelTypes" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Types
-- Item: spCreateAIModelType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModelType" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Model Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModelType" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Types
-- Item: spUpdateAIModelType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModelType" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModelType" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Vendors
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIModelVendor
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIModelVendors" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: Permissions for vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIModelVendors" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spCreateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModelVendor" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Model Vendors */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModelVendor" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spUpdateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModelVendor" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModelVendor" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Types
-- Item: spDeleteAIModelType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelType" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Model Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelType" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spDeleteAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelVendor
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelVendor" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Model Vendors */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelVendor" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."AIModelType"."ModelConfiguration" IS 'Type-wide default of the per-modality model-configuration bag (JSON, IAIModelConfiguration shape: LLM / Realtime / Vision / Audio sections). Base layer of the ModelConfiguration cascade — AIModel and AIModelVendor rows inherit from it per key and may override. NULL = contributes nothing.';

COMMENT ON COLUMN __mj."AIModel"."ModelConfiguration" IS 'Per-model layer of the per-modality model-configuration bag (JSON, IAIModelConfiguration shape). Deep-merges per key over the AIModelType default; AIModelVendor rows may override per key on top. NULL = inherit the type default unchanged.';

COMMENT ON COLUMN __mj."AIModelVendor"."ModelConfiguration" IS 'Most-specific layer of the per-modality model-configuration bag (JSON, IAIModelConfiguration shape) — configuration for THIS model on THIS provider. Deep-merges per key over the model and type layers. NULL = inherit the merged model/type configuration unchanged.';

-- Extended property (could not parse)
-- -- =============================================================================
-- -- =============================================================================
-- -- =============================================================================
-- --
-- --                    ⚙️  CODEGEN OUTPUT BELOW THIS LINE  ⚙️
-- --
-- -- Everything below this block was generated by the MemberJunction CodeGen tool
-- -- after the hand-written DDL above was applied to the development database.
-- -- It contains the framework plumbing for the three new ModelConfiguration
-- -- columns: EntityField metadata inserts, regenerated base views, stored
-- -- procedures (spCreate/spUpdate/spDelete), permission grants, and related
-- -- sp_addextendedproperty calls.
-- --
-- -- HEADS-UP: this section also renames five `EntityField.DisplayName` values on
-- -- PRE-EXISTING columns of these three entities — AIModel.AIModelTypeID
-- -- ('AI Model Type' -> 'AI Model Type ID'), AIModel.IsActive ('Active' ->
-- -- 'Is Active'), AIModel.AIModelType ('Model Type Name' -> 'AI Model Type'),
-- -- AIModelVendor.TypeID ('Type' -> 'Vendor Type') and AIModelVendor.Type
-- -- ('Type Name' -> 'Type'). These are NOT driven by this feature: CodeGen's
-- -- current naming computation asserting itself over values stored since the
-- -- baseline, on rows it owns (AutoUpdateCategory = 1). They are included rather
-- -- than stripped because CodeGen re-emits them on every run over these entities,
-- -- so removing them here only defers the same diff to the next PR that touches
-- -- them. The underlying instability is a CodeGen defect tracked separately.
-- --
-- -- DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen
-- -- and replace this entire section with the fresh output.
-- --
-- -- =============================================================================
-- -- =============================================================================
-- -- =============================================================================
-- 
-- /* SQL text to insert 3 new entity field(s) */


-- ===================== Other =====================

/* spUpdate Permissions for MJ: AI Models */

/* spUpdate Permissions for MJ: AI Model Types */

/* spUpdate Permissions for MJ: AI Model Vendors */
