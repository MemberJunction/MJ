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
    Phase 4 of the unified workflow DAG engine program (plan: PR #3456) — convergence.

    Design-time flows have always had conditional edges: `AIAgentStepPath.Condition` holds a boolean
    expression, and an edge is followed only when it evaluates true. Runtime task graphs have not.
    A `TaskDependency` could say *that* one task waits for another, never *under what circumstances*
    it should then run.

    That asymmetry is the last thing keeping the two graph models from being the same model. Phase 4
    puts both behind one `GraphTraversalEngine`, and the engine's edge-selection rules are meaningless
    for durable graphs without somewhere to store the condition. This adds it.

    Why the same shape as `AIAgentStepPath` rather than something task-specific: the whole point of
    convergence is that a graph authored in the flow editor and a graph emitted by an agent are
    interchangeable. If their edge conditions had different grammars or different storage, "Save as
    Workflow" (D17) would need a translation layer, and the two executors would drift again — which
    is precisely the failure this program exists to end.

    NULL means unconditional, matching `AIAgentStepPath.Condition`. That is deliberate rather than
    incidental: every dependency that exists today becomes an unconditional edge, so the meaning of
    every stored graph is unchanged by this migration.
*/

-- =====================================================================================
-- TaskDependency: conditional edges
-- =====================================================================================
ALTER TABLE __mj."TaskDependency"
 ADD COLUMN IF NOT EXISTS "Condition" TEXT NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TaskDependency_TaskID" ON __mj."TaskDependency" ("TaskID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TaskDependency_DependsOnTaskID" ON __mj."TaskDependency" ("DependsOnTaskID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwTaskDependencies';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwTaskDependencies"
AS SELECT
    t.*,
    "MJTask_TaskID"."Name" AS "Task",
    "MJTask_DependsOnTaskID"."Name" AS "DependsOnTask"
FROM
    __mj."TaskDependency" AS t
INNER JOIN
    __mj."Task" AS "MJTask_TaskID"
  ON
    t."TaskID" = "MJTask_TaskID"."ID"
INNER JOIN
    __mj."Task" AS "MJTask_DependsOnTaskID"
  ON
    t."DependsOnTaskID" = "MJTask_DependsOnTaskID"."ID"$vsql$;
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
           WHERE proname = 'spCreateTaskDependency'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateTaskDependency"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TaskID UUID DEFAULT NULL,
    IN p_DependsOnTaskID UUID DEFAULT NULL,
    IN p_DependencyType VARCHAR(50) DEFAULT NULL,
    IN p_Condition_Clear BOOLEAN DEFAULT FALSE,
    IN p_Condition TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwTaskDependencies" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TaskDependency"
            (
                "ID",
                "TaskID",
                "DependsOnTaskID",
                "DependencyType",
                "Condition"
            )
        VALUES
            (
                p_ID,
                p_TaskID,
                p_DependsOnTaskID,
                COALESCE(p_DependencyType, 'Prerequisite'),
                CASE WHEN p_Condition_Clear = TRUE THEN NULL ELSE COALESCE(p_Condition, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TaskDependency"
            (
                "TaskID",
                "DependsOnTaskID",
                "DependencyType",
                "Condition"
            )
        VALUES
            (
                p_TaskID,
                p_DependsOnTaskID,
                COALESCE(p_DependencyType, 'Prerequisite'),
                CASE WHEN p_Condition_Clear = TRUE THEN NULL ELSE COALESCE(p_Condition, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTaskDependencies" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateTaskDependency'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateTaskDependency"(
    IN p_ID UUID,
    IN p_TaskID UUID DEFAULT NULL,
    IN p_DependsOnTaskID UUID DEFAULT NULL,
    IN p_DependencyType VARCHAR(50) DEFAULT NULL,
    IN p_Condition_Clear BOOLEAN DEFAULT FALSE,
    IN p_Condition TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwTaskDependencies" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TaskDependency"
    SET
        "TaskID" = COALESCE(p_TaskID, "TaskID"),
        "DependsOnTaskID" = COALESCE(p_DependsOnTaskID, "DependsOnTaskID"),
        "DependencyType" = COALESCE(p_DependencyType, "DependencyType"),
        "Condition" = CASE WHEN p_Condition_Clear = TRUE THEN NULL ELSE COALESCE(p_Condition, "Condition") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTaskDependencies" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTaskDependencies" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTaskDependency'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTaskDependency"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TaskDependency"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateTaskDependency_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTaskDependency" ON __mj."TaskDependency";
CREATE TRIGGER "trgUpdateTaskDependency"
    BEFORE UPDATE ON __mj."TaskDependency"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTaskDependency_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e48355ed-e858-4621-9e40-989891ec68f9' OR ("EntityID" = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND "Name" = 'Condition')
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
        'e48355ed-e858-4621-9e40-989891ec68f9',
        'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- "Entity": "MJ": "Task" "Dependencies"
        100016,
        'Condition',
        'Condition',
        'Optional boolean expression gating this dependency edge. NULL (the default, and the value every pre-existing row carries) means the edge is unconditional, so adding this column changes the meaning of no existing graph. When present it is evaluated by the shared GraphTraversalEngine against the same context a design-time AIAgentStepPath.Condition sees, which is what lets a runtime task graph and a flow-editor graph be the same graph. A condition that evaluates false skips the edge; one that fails to evaluate ALSO skips it, but is reported distinctly so a graph stalled by a malformed expression cannot be mistaken for one that finished normally.',
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
               SET "IsNameField" = FALSE
               WHERE "ID" = '1EBFF46F-9F99-4E18-AEF0-C00D03FCD0B9'
               AND "AutoUpdateIsNameField" = TRUE;

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Task Dependencies.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '36FFBC49-1613-4DDF-BB5C-651AF6FF195F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.TaskID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Task',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB9353EF-735C-4D86-9C5B-110CE8580BF9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.Task

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Task Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1EBFF46F-9F99-4E18-AEF0-C00D03FCD0B9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.DependsOnTaskID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Depends On Task',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9233F1DA-6E87-4662-80B2-4227F37CE3DC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.DependsOnTask

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Depends On Task Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '28044698-7E43-4AFA-9676-195B01FB5C54' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.DependencyType

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9AEC13B1-8C8B-4AF0-BA96-DD5E70BAA4E8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.Condition

UPDATE __mj."EntityField"
SET 
   "Category" = 'Dependency Link',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'E48355ED-E858-4621-9E40-989891EC68F9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8793880-61E7-465E-86F7-5521BDCD4FD9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E70F4C17-C4C4-4A89-AFDC-7C0C992360B4' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwTaskDependencies" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: Permissions for vwTaskDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwTaskDependencies" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spCreateTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TaskDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Task Dependencies */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spUpdateTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TaskDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spDeleteTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaskDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Task Dependencies */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."TaskDependency"."Condition" IS 'Optional boolean expression gating this dependency edge. NULL (the default, and the value every pre-existing row carries) means the edge is unconditional, so adding this column changes the meaning of no existing graph. When present it is evaluated by the shared GraphTraversalEngine against the same context a design-time AIAgentStepPath.Condition sees, which is what lets a runtime task graph and a flow-editor graph be the same graph. A condition that evaluates false skips the edge; one that fails to evaluate ALSO skips it, but is reported distinctly so a graph stalled by a malformed expression cannot be mistaken for one that finished normally.';


-- ===================== Other =====================

/* ============================================================================================
   ==== CODEGEN OUTPUT — DO NOT EDIT BELOW THIS LINE ====
   Everything below was generated by `mj codegen` after the schema change above was applied.
   It registers the new column with the metadata layer (EntityField rows, base view, CRUD procs
   and permissions). Hand-editing it guarantees drift from what CodeGen will produce next run.
   ============================================================================================ */

/* SQL text to insert 1 new entity field(s) */

/* spUpdate Permissions for MJ: Task Dependencies */
