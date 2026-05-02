
-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_TypeID" ON __mj."EntityDocument" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_EntityID" ON __mj."EntityDocument" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_VectorDatabaseID" ON __mj."EntityDocument" ("VectorDatabaseID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_TemplateID" ON __mj."EntityDocument" ("TemplateID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_AIModelID" ON __mj."EntityDocument" ("AIModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_VectorIndexID" ON __mj."EntityDocument" ("VectorIndexID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwEntityDocuments';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityDocuments"
AS SELECT
    e.*,
    "MJEntityDocumentType_TypeID"."Name" AS "Type",
    "MJEntity_EntityID"."Name" AS "Entity",
    "MJVectorDatabase_VectorDatabaseID"."Name" AS "VectorDatabase",
    "MJTemplate_TemplateID"."Name" AS "Template",
    "MJAIModel_AIModelID"."Name" AS "AIModel",
    "MJVectorIndex_VectorIndexID"."Name" AS "VectorIndex"
FROM
    __mj."EntityDocument" AS e
INNER JOIN
    __mj."EntityDocumentType" AS "MJEntityDocumentType_TypeID"
  ON
    e."TypeID" = "MJEntityDocumentType_TypeID"."ID"
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    e."EntityID" = "MJEntity_EntityID"."ID"
INNER JOIN
    __mj."VectorDatabase" AS "MJVectorDatabase_VectorDatabaseID"
  ON
    e."VectorDatabaseID" = "MJVectorDatabase_VectorDatabaseID"."ID"
INNER JOIN
    __mj."Template" AS "MJTemplate_TemplateID"
  ON
    e."TemplateID" = "MJTemplate_TemplateID"."ID"
INNER JOIN
    __mj."AIModel" AS "MJAIModel_AIModelID"
  ON
    e."AIModelID" = "MJAIModel_AIModelID"."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS "MJVectorIndex_VectorIndexID"
  ON
    e."VectorIndexID" = "MJVectorIndex_VectorIndexID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateEntityDocument"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(250) DEFAULT NULL,
    IN p_TypeID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_VectorDatabaseID UUID DEFAULT NULL,
    IN p_Status VARCHAR(15) DEFAULT NULL,
    IN p_TemplateID UUID DEFAULT NULL,
    IN p_AIModelID UUID DEFAULT NULL,
    IN p_PotentialMatchThreshold NUMERIC(12,11) DEFAULT NULL,
    IN p_AbsoluteMatchThreshold NUMERIC(12,11) DEFAULT NULL,
    IN p_VectorIndexID UUID DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityDocuments" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityDocument"
            (
                "ID",
                "Name",
                "TypeID",
                "EntityID",
                "VectorDatabaseID",
                "Status",
                "TemplateID",
                "AIModelID",
                "PotentialMatchThreshold",
                "AbsoluteMatchThreshold",
                "VectorIndexID",
                "Configuration"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_TypeID,
                p_EntityID,
                p_VectorDatabaseID,
                COALESCE(p_Status, 'Active'),
                p_TemplateID,
                p_AIModelID,
                COALESCE(p_PotentialMatchThreshold, 0.7),
                COALESCE(p_AbsoluteMatchThreshold, 0.95),
                p_VectorIndexID,
                p_Configuration
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityDocument"
            (
                "Name",
                "TypeID",
                "EntityID",
                "VectorDatabaseID",
                "Status",
                "TemplateID",
                "AIModelID",
                "PotentialMatchThreshold",
                "AbsoluteMatchThreshold",
                "VectorIndexID",
                "Configuration"
            )
        VALUES
            (
                p_Name,
                p_TypeID,
                p_EntityID,
                p_VectorDatabaseID,
                COALESCE(p_Status, 'Active'),
                p_TemplateID,
                p_AIModelID,
                COALESCE(p_PotentialMatchThreshold, 0.7),
                COALESCE(p_AbsoluteMatchThreshold, 0.95),
                p_VectorIndexID,
                p_Configuration
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityDocuments" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityDocument"(
    IN p_ID UUID,
    IN p_Name VARCHAR(250),
    IN p_TypeID UUID,
    IN p_EntityID UUID,
    IN p_VectorDatabaseID UUID,
    IN p_Status VARCHAR(15),
    IN p_TemplateID UUID,
    IN p_AIModelID UUID,
    IN p_PotentialMatchThreshold NUMERIC(12,11),
    IN p_AbsoluteMatchThreshold NUMERIC(12,11),
    IN p_VectorIndexID UUID,
    IN p_Configuration TEXT
)
RETURNS SETOF __mj."vwEntityDocuments" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityDocument"
    SET
        "Name" = p_Name,
        "TypeID" = p_TypeID,
        "EntityID" = p_EntityID,
        "VectorDatabaseID" = p_VectorDatabaseID,
        "Status" = p_Status,
        "TemplateID" = p_TemplateID,
        "AIModelID" = p_AIModelID,
        "PotentialMatchThreshold" = p_PotentialMatchThreshold,
        "AbsoluteMatchThreshold" = p_AbsoluteMatchThreshold,
        "VectorIndexID" = p_VectorIndexID,
        "Configuration" = p_Configuration
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityDocuments" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityDocuments" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocument"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityDocument_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityDocument" ON __mj."EntityDocument";
CREATE TRIGGER "trgUpdateEntityDocument"
    BEFORE UPDATE ON __mj."EntityDocument"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityDocument_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

ALTER TABLE __mj."EntityDocument" ALTER COLUMN "PotentialMatchThreshold" SET DEFAULT 0.7;

ALTER TABLE __mj."EntityDocument" ALTER COLUMN "AbsoluteMatchThreshold" SET DEFAULT 0.95;

UPDATE __mj."EntityDocument"
SET "PotentialMatchThreshold" = 0.7
WHERE "PotentialMatchThreshold" = 1.0;

UPDATE __mj."EntityDocument"
SET "AbsoluteMatchThreshold" = 0.95
WHERE "AbsoluteMatchThreshold" = 1.0;


-- CODE GEN RUN
/* Index for Foreign Keys for EntityDocument */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TypeID in table EntityDocument


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityDocuments" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: Permissions for vwEntityDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityDocuments" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spCreateEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityDocument
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityDocument" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Documents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityDocument" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spUpdateEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityDocument
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityDocument" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityDocument" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
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

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Documents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Other =====================

-- Update existing rows that still have the old 1.0 defaults (never explicitly configured)

/* spUpdate Permissions for MJ: Entity Documents */
