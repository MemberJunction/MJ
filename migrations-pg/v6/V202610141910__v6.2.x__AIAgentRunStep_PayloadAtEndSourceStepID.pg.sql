-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610141910__v6.2.x__AIAgentRunStep_PayloadAtEndSourceStepID.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."AIAgentRunStep"
ADD COLUMN "PayloadAtEndSourceStepID" UUID NULL /* ============================================================================= */ /* AIAgentRunStep.PayloadAtEndSourceStepID (v6.2.x) */ /* ============================================================================= */ /* Read-only steps (and steps whose mutations are a no-op) end with the same payload that an */ /* earlier finished step in the run already wrote to PayloadAtEnd. Storing PayloadAtEnd again */ /* writes duplicate JSON. PayloadAtEndSourceStepID points at the earlier finished step in the */ /* same run that actually stores the matching PayloadAtEnd JSON (one-hop pointer invariant: */ /* source.PayloadAtEnd is non-null). When PayloadAtEndSourceStepID is set, PayloadAtEnd is NULL, */ /* and a reader resolves the ending payload with one lookup: */ /* PayloadAtEnd ?? source.PayloadAtEnd. */ /* DDL and extended properties only above the CodeGen banner. The FK index, base view, stored */ /* procedures, EntityRelationship, and EntityField metadata are appended below the CodeGen banner. */ /* ============================================================================= */;

ALTER TABLE __mj."AIAgentRunStep"
  ADD CONSTRAINT "FK_AIAgentRunStep_PayloadAtEndSourceStepID" FOREIGN KEY ("PayloadAtEndSourceStepID") REFERENCES __mj."AIAgentRunStep" (
    "ID"
  );

COMMENT ON COLUMN __mj."AIAgentRunStep"."PayloadAtEndSourceStepID" IS 'When set, PayloadAtEnd is not stored on this row because it equals the PayloadAtEnd of the referenced step in the same run. Read that step''s PayloadAtEnd to get this step''s ending payload.';

COMMENT ON COLUMN __mj."AIAgentRunStep"."PayloadAtEnd" IS 'JSON serialization of the Payload state at the end of this step. NULL when PayloadAtEndSourceStepID is set; the ending payload is then the PayloadAtEnd of that step.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6b4c84d5-7814-4c93-957f-8840f6b71130' OR ("EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND "Name" = 'PayloadAtEndSourceStepID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6b4c84d5-7814-4c93-957f-8840f6b71130', '99273DAD-560E-4ABC-8332-C97AB58B7463' /* Entity: MJ: AI Agent Run Steps */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463'), 'PayloadAtEndSourceStepID', 'Payload At End Source Step ID', 'When set, PayloadAtEnd is not stored on this row because it equals the PayloadAtEnd of the referenced step in the same run. Read that step''s PayloadAtEnd to get this step''s ending payload.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '99273DAD-560E-4ABC-8332-C97AB58B7463', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9a1e3c45-2b8d-4e71-a319-5c8b72e4102f') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9a1e3c45-2b8d-4e71-a319-5c8b72e4102f', '99273DAD-560E-4ABC-8332-C97AB58B7463', '99273DAD-560E-4ABC-8332-C97AB58B7463', 'PayloadAtEndSourceStepID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c3d827e1-590a-4782-a31c-7410f9d85241' OR ("EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND "Name" = 'PayloadAtEndSourceStep')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c3d827e1-590a-4782-a31c-7410f9d85241', '99273DAD-560E-4ABC-8332-C97AB58B7463' /* Entity: MJ: AI Agent Run Steps */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463'), 'PayloadAtEndSourceStep', 'Payload At End Source Step', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set categories for 2 fields */
/* UPDATE Entity Field Category Info MJ: AI Agent Run Steps.PayloadAtEndSourceStepID */
UPDATE __mj."EntityField" SET "Category" = 'Data & Payload', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6B4C84D5-7814-4C93-957F-8840F6B71130';
/* UPDATE Entity Field Category Info MJ: AI Agent Run Steps.PayloadAtEndSourceStep */
UPDATE __mj."EntityField" SET "Category" = 'Data & Payload', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C3D827E1-590A-4782-A31C-7410F9D85241';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_agent_run_id"
    ON "__mj"."AIAgentRunStep" ("AgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_parent_id"
    ON "__mj"."AIAgentRunStep" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_payload_at_start_source_step"
    ON "__mj"."AIAgentRunStep" ("PayloadAtStartSourceStepID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_payload_at_end_source_step_i"
    ON "__mj"."AIAgentRunStep" ("PayloadAtEndSourceStepID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_hierarchy_meta"(
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
            "__mj"."AIAgentRunStep"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRunStep" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_descendants"(
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
            "__mj"."AIAgentRunStep"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRunStep" c
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
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_ancestors"(
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
            "__mj"."AIAgentRunStep"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRunStep" p
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


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_root_id"(
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
            "__mj"."AIAgentRunStep"
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
            "__mj"."AIAgentRunStep" c
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


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: vwAIAgentRunSteps
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Run Steps
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRunStep
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentRunSteps"
AS
SELECT
    a.*,
    MJAIAgentRun_AgentRunID."RunName" AS "AgentRun",
    MJAIAgentRunStep_ParentID."StepName" AS "Parent",
    MJAIAgentRunStep_PayloadAtStartSourceStepID."StepName" AS "PayloadAtStartSourceStep",
    MJAIAgentRunStep_PayloadAtEndSourceStepID."StepName" AS "PayloadAtEndSourceStep",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."AIAgentRunStep" AS a
INNER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_AgentRunID
  ON
    "a"."AgentRunID" = MJAIAgentRun_AgentRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRunStep" AS MJAIAgentRunStep_ParentID
  ON
    "a"."ParentID" = MJAIAgentRunStep_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRunStep" AS MJAIAgentRunStep_PayloadAtStartSourceStepID
  ON
    "a"."PayloadAtStartSourceStepID" = MJAIAgentRunStep_PayloadAtStartSourceStepID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRunStep" AS MJAIAgentRunStep_PayloadAtEndSourceStepID
  ON
    "a"."PayloadAtEndSourceStepID" = MJAIAgentRunStep_PayloadAtEndSourceStepID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_agent_run_step_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
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
        AND tc.relname = 'vwAIAgentRunSteps'
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
                           AND tc.relname = 'vwAIAgentRunSteps'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentRunSteps" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIAgentRunSteps" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentRunSteps" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentRunSteps" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: spCreateAIAgentRunStep
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRunStep
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRunStep'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRunStep"(
    p_id UUID DEFAULT NULL,
    p_agentrunid UUID DEFAULT NULL,
    p_stepnumber int DEFAULT NULL,
    p_steptype varchar(50) DEFAULT NULL,
    p_stepname varchar(255) DEFAULT NULL,
    p_targetid_clear boolean DEFAULT false,
    p_targetid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_inputdata_clear boolean DEFAULT false,
    p_inputdata TEXT DEFAULT NULL,
    p_outputdata_clear boolean DEFAULT false,
    p_outputdata TEXT DEFAULT NULL,
    p_targetlogid_clear boolean DEFAULT false,
    p_targetlogid UUID DEFAULT NULL,
    p_payloadatstart_clear boolean DEFAULT false,
    p_payloadatstart TEXT DEFAULT NULL,
    p_payloadatend_clear boolean DEFAULT false,
    p_payloadatend TEXT DEFAULT NULL,
    p_finalpayloadvalidationresult_clear boolean DEFAULT false,
    p_finalpayloadvalidationresult varchar(25) DEFAULT NULL,
    p_finalpayloadvalidationmessages_clear boolean DEFAULT false,
    p_finalpayloadvalidationmessages TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_skills_clear boolean DEFAULT false,
    p_skills TEXT DEFAULT NULL,
    p_toolcallingmode_clear boolean DEFAULT false,
    p_toolcallingmode varchar(25) DEFAULT NULL,
    p_nativetoolcallcount_clear boolean DEFAULT false,
    p_nativetoolcallcount int DEFAULT NULL,
    p_nativedualchannel_clear boolean DEFAULT false,
    p_nativedualchannel BOOLEAN DEFAULT NULL,
    p_nativetoolresultssent_clear boolean DEFAULT false,
    p_nativetoolresultssent BOOLEAN DEFAULT NULL,
    p_payloadatstartsourcestepid_clear boolean DEFAULT false,
    p_payloadatstartsourcestepid UUID DEFAULT NULL,
    p_payloadatendsourcestepid_clear boolean DEFAULT false,
    p_payloadatendsourcestepid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRunSteps" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentRunStep"
        (
            "ID",
            "AgentRunID",
                "StepNumber",
                "StepType",
                "StepName",
                "TargetID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "Success",
                "ErrorMessage",
                "InputData",
                "OutputData",
                "TargetLogID",
                "PayloadAtStart",
                "PayloadAtEnd",
                "FinalPayloadValidationResult",
                "FinalPayloadValidationMessages",
                "ParentID",
                "Comments",
                "Skills",
                "ToolCallingMode",
                "NativeToolCallCount",
                "NativeDualChannel",
                "NativeToolResultsSent",
                "PayloadAtStartSourceStepID",
                "PayloadAtEndSourceStepID"
        )
    VALUES
        (
            v_new_id,
            p_agentrunid,
                p_stepnumber,
                COALESCE(p_steptype, 'Prompt'),
                p_stepname,
                CASE WHEN p_targetid_clear = true THEN NULL ELSE COALESCE(p_targetid, NULL) END,
                COALESCE(p_status, 'Running'),
                COALESCE(p_startedat, NOW()),
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_inputdata_clear = true THEN NULL ELSE COALESCE(p_inputdata, NULL) END,
                CASE WHEN p_outputdata_clear = true THEN NULL ELSE COALESCE(p_outputdata, NULL) END,
                CASE WHEN p_targetlogid_clear = true THEN NULL ELSE COALESCE(p_targetlogid, NULL) END,
                CASE WHEN p_payloadatstart_clear = true THEN NULL ELSE COALESCE(p_payloadatstart, NULL) END,
                CASE WHEN p_payloadatend_clear = true THEN NULL ELSE COALESCE(p_payloadatend, NULL) END,
                CASE WHEN p_finalpayloadvalidationresult_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationresult, NULL) END,
                CASE WHEN p_finalpayloadvalidationmessages_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationmessages, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_skills_clear = true THEN NULL ELSE COALESCE(p_skills, NULL) END,
                CASE WHEN p_toolcallingmode_clear = true THEN NULL ELSE COALESCE(p_toolcallingmode, NULL) END,
                CASE WHEN p_nativetoolcallcount_clear = true THEN NULL ELSE COALESCE(p_nativetoolcallcount, NULL) END,
                CASE WHEN p_nativedualchannel_clear = true THEN NULL ELSE COALESCE(p_nativedualchannel, NULL) END,
                CASE WHEN p_nativetoolresultssent_clear = true THEN NULL ELSE COALESCE(p_nativetoolresultssent, NULL) END,
                CASE WHEN p_payloadatstartsourcestepid_clear = true THEN NULL ELSE COALESCE(p_payloadatstartsourcestepid, NULL) END,
                CASE WHEN p_payloadatendsourcestepid_clear = true THEN NULL ELSE COALESCE(p_payloadatendsourcestepid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRunSteps"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunStep" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunStep" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: spUpdateAIAgentRunStep
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRunStep
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRunStep'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentRunStep"(
    p_id UUID,
    p_agentrunid UUID DEFAULT NULL,
    p_stepnumber int DEFAULT NULL,
    p_steptype varchar(50) DEFAULT NULL,
    p_stepname varchar(255) DEFAULT NULL,
    p_targetid_clear boolean DEFAULT false,
    p_targetid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_inputdata_clear boolean DEFAULT false,
    p_inputdata TEXT DEFAULT NULL,
    p_outputdata_clear boolean DEFAULT false,
    p_outputdata TEXT DEFAULT NULL,
    p_targetlogid_clear boolean DEFAULT false,
    p_targetlogid UUID DEFAULT NULL,
    p_payloadatstart_clear boolean DEFAULT false,
    p_payloadatstart TEXT DEFAULT NULL,
    p_payloadatend_clear boolean DEFAULT false,
    p_payloadatend TEXT DEFAULT NULL,
    p_finalpayloadvalidationresult_clear boolean DEFAULT false,
    p_finalpayloadvalidationresult varchar(25) DEFAULT NULL,
    p_finalpayloadvalidationmessages_clear boolean DEFAULT false,
    p_finalpayloadvalidationmessages TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_skills_clear boolean DEFAULT false,
    p_skills TEXT DEFAULT NULL,
    p_toolcallingmode_clear boolean DEFAULT false,
    p_toolcallingmode varchar(25) DEFAULT NULL,
    p_nativetoolcallcount_clear boolean DEFAULT false,
    p_nativetoolcallcount int DEFAULT NULL,
    p_nativedualchannel_clear boolean DEFAULT false,
    p_nativedualchannel BOOLEAN DEFAULT NULL,
    p_nativetoolresultssent_clear boolean DEFAULT false,
    p_nativetoolresultssent BOOLEAN DEFAULT NULL,
    p_payloadatstartsourcestepid_clear boolean DEFAULT false,
    p_payloadatstartsourcestepid UUID DEFAULT NULL,
    p_payloadatendsourcestepid_clear boolean DEFAULT false,
    p_payloadatendsourcestepid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRunSteps" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentRunStep"
    SET
        "AgentRunID" = COALESCE(p_agentrunid, "AgentRunID"),
        "StepNumber" = COALESCE(p_stepnumber, "StepNumber"),
        "StepType" = COALESCE(p_steptype, "StepType"),
        "StepName" = COALESCE(p_stepname, "StepName"),
        "TargetID" = CASE WHEN p_targetid_clear = true THEN NULL ELSE COALESCE(p_targetid, "TargetID") END,
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "Success" = CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, "Success") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "InputData" = CASE WHEN p_inputdata_clear = true THEN NULL ELSE COALESCE(p_inputdata, "InputData") END,
        "OutputData" = CASE WHEN p_outputdata_clear = true THEN NULL ELSE COALESCE(p_outputdata, "OutputData") END,
        "TargetLogID" = CASE WHEN p_targetlogid_clear = true THEN NULL ELSE COALESCE(p_targetlogid, "TargetLogID") END,
        "PayloadAtStart" = CASE WHEN p_payloadatstart_clear = true THEN NULL ELSE COALESCE(p_payloadatstart, "PayloadAtStart") END,
        "PayloadAtEnd" = CASE WHEN p_payloadatend_clear = true THEN NULL ELSE COALESCE(p_payloadatend, "PayloadAtEnd") END,
        "FinalPayloadValidationResult" = CASE WHEN p_finalpayloadvalidationresult_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationresult, "FinalPayloadValidationResult") END,
        "FinalPayloadValidationMessages" = CASE WHEN p_finalpayloadvalidationmessages_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationmessages, "FinalPayloadValidationMessages") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "Skills" = CASE WHEN p_skills_clear = true THEN NULL ELSE COALESCE(p_skills, "Skills") END,
        "ToolCallingMode" = CASE WHEN p_toolcallingmode_clear = true THEN NULL ELSE COALESCE(p_toolcallingmode, "ToolCallingMode") END,
        "NativeToolCallCount" = CASE WHEN p_nativetoolcallcount_clear = true THEN NULL ELSE COALESCE(p_nativetoolcallcount, "NativeToolCallCount") END,
        "NativeDualChannel" = CASE WHEN p_nativedualchannel_clear = true THEN NULL ELSE COALESCE(p_nativedualchannel, "NativeDualChannel") END,
        "NativeToolResultsSent" = CASE WHEN p_nativetoolresultssent_clear = true THEN NULL ELSE COALESCE(p_nativetoolresultssent, "NativeToolResultsSent") END,
        "PayloadAtStartSourceStepID" = CASE WHEN p_payloadatstartsourcestepid_clear = true THEN NULL ELSE COALESCE(p_payloadatstartsourcestepid, "PayloadAtStartSourceStepID") END,
        "PayloadAtEndSourceStepID" = CASE WHEN p_payloadatendsourcestepid_clear = true THEN NULL ELSE COALESCE(p_payloadatendsourcestepid, "PayloadAtEndSourceStepID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRunSteps"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunStep" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunStep" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunStep table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_run_step"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run_step" ON "__mj"."AIAgentRunStep";

CREATE TRIGGER "trg_update_ai_agent_run_step"
BEFORE UPDATE ON "__mj"."AIAgentRunStep"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_run_step"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: spDeleteAIAgentRunStep
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRunStep
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRunStep'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentRunStep"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunStepID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "OriginatingAgentRunStepID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "OriginatingAgentRunStepID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Run Steps.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRunStep"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Run Steps.PayloadAtStartSourceStepID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "PayloadAtStartSourceStepID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRunStep"
        SET "PayloadAtStartSourceStepID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Run Steps.PayloadAtEndSourceStepID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "PayloadAtEndSourceStepID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRunStep"
        SET "PayloadAtEndSourceStepID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIAgentRunStep"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRunStep" TO "cdp_Integration";
