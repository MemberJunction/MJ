-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611220625__v6.3.x__Rhythm_Model_Tiers.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."AIAgentRhythmTemplate"
  ADD COLUMN "DefaultAgentConfigurationID" UUID NULL,
  ADD CONSTRAINT "FK_AIAgentRhythmTemplate_AIConfiguration" FOREIGN KEY ("DefaultAgentConfigurationID") REFERENCES __mj."AIConfiguration" (
    "ID"
  );

ALTER TABLE __mj."UserRoutine"
  ADD COLUMN "AgentConfigurationID" UUID NULL,
  ADD CONSTRAINT "FK_UserRoutine_AIConfiguration" FOREIGN KEY ("AgentConfigurationID") REFERENCES __mj."AIConfiguration" (
    "ID"
  );

ALTER TABLE __mj."AIAgentUserPolicy"
DROP CONSTRAINT IF EXISTS "DF_AIAgentUserPolicy_CoordinationMode";

ALTER TABLE __mj."AIAgentUserPolicy" ALTER COLUMN "CoordinationMode" SET DEFAULT 'Autonomous';

ALTER TABLE __mj."AIAgentUserPolicy"
DROP CONSTRAINT IF EXISTS "DF_AIAgentUserPolicy_CalendarChannelMode";

ALTER TABLE __mj."AIAgentUserPolicy" ALTER COLUMN "CalendarChannelMode" SET DEFAULT 'ProposeWithApproval';

ALTER TABLE __mj."AIAgentUserPolicy"
DROP CONSTRAINT IF EXISTS "DF_AIAgentUserPolicy_PhoneChannelMode";

ALTER TABLE __mj."AIAgentUserPolicy" ALTER COLUMN "PhoneChannelMode" SET DEFAULT 'Disabled';

COMMENT ON COLUMN __mj."AIAgentRhythmTemplate"."DefaultAgentConfigurationID" IS 'Optional default AI Configuration (model tier such as Fast, Standard, or High Power) seeded onto UserRoutine.AgentConfigurationID when this rhythm template is enabled and used as a fallback on wake.';

COMMENT ON COLUMN __mj."UserRoutine"."AgentConfigurationID" IS 'Optional AI Configuration (model tier such as Fast, Standard, or High Power) used when executing this routine''s Agent target. Seeded from the originating rhythm template''s DefaultAgentConfigurationID on creation and changeable by the user or agent.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd0276af-4431-47c1-85e6-a827367ab848' OR ("EntityID" = '9C0E4D6F-8F07-48F8-8372-3631DBC1B317' AND "Name" = 'DefaultAgentConfigurationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cd0276af-4431-47c1-85e6-a827367ab848', '9C0E4D6F-8F07-48F8-8372-3631DBC1B317' /* Entity: MJ: AI Agent Rhythm Templates */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '9C0E4D6F-8F07-48F8-8372-3631DBC1B317'), 'DefaultAgentConfigurationID', 'Default Agent Configuration ID', 'Optional default AI Configuration (model tier such as Fast, Standard, or High Power) seeded onto UserRoutine.AgentConfigurationID when this rhythm template is enabled and used as a fallback on wake.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '6AE1BBF0-2085-4D2F-B724-219DC4212026', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0c17773e-a295-41b5-8404-b90ed739c5fd' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'AgentConfigurationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0c17773e-a295-41b5-8404-b90ed739c5fd', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B'), 'AgentConfigurationID', 'Agent Configuration ID', 'Optional AI Configuration (model tier such as Fast, Standard, or High Power) used when executing this routine''s Agent target. Seeded from the originating rhythm template''s DefaultAgentConfigurationID on creation and changeable by the user or agent.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '6AE1BBF0-2085-4D2F-B724-219DC4212026', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8c37e394-c2f5-451d-b805-b79d9e012ce9' OR ("EntityID" = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND "RelatedEntityID" = '9C0E4D6F-8F07-48F8-8372-3631DBC1B317' AND "RelatedEntityJoinField" = 'DefaultAgentConfigurationID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8c37e394-c2f5-451d-b805-b79d9e012ce9', '6AE1BBF0-2085-4D2F-B724-219DC4212026', '9C0E4D6F-8F07-48F8-8372-3631DBC1B317', 'DefaultAgentConfigurationID', 'One To Many', TRUE, TRUE, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityRelationship" WHERE "EntityID" = '6AE1BBF0-2085-4D2F-B724-219DC4212026'), NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '89d462e5-e342-4ae3-babd-0247fd458624' OR ("EntityID" = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND "RelatedEntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "RelatedEntityJoinField" = 'AgentConfigurationID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('89d462e5-e342-4ae3-babd-0247fd458624', '6AE1BBF0-2085-4D2F-B724-219DC4212026', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'AgentConfigurationID', 'One To Many', TRUE, TRUE, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityRelationship" WHERE "EntityID" = '6AE1BBF0-2085-4D2F-B724-219DC4212026'), NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '38e6b428-3af6-42eb-b34e-8c005c03f2bf' OR ("EntityID" = '9C0E4D6F-8F07-48F8-8372-3631DBC1B317' AND "Name" = 'DefaultAgentConfiguration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('38e6b428-3af6-42eb-b34e-8c005c03f2bf', '9C0E4D6F-8F07-48F8-8372-3631DBC1B317' /* Entity: MJ: AI Agent Rhythm Templates */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '9C0E4D6F-8F07-48F8-8372-3631DBC1B317'), 'DefaultAgentConfiguration', 'Default Agent Configuration', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd866ae68-4f3d-4d41-8235-93bb57e70049' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'AgentConfiguration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d866ae68-4f3d-4d41-8235-93bb57e70049', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B'), 'AgentConfiguration', 'Agent Configuration', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- EntityField DefaultValue changes from the PostgreSQL field sync (a fresh install does not run it)
-- MJ: AI Agent User Policies.CoordinationMode
UPDATE __mj."EntityField" SET "DefaultValue" = '(N''Autonomous'')' WHERE "ID" = '2588bd34-b6ec-4daa-a21a-c06207a09e2b';
-- MJ: AI Agent User Policies.PhoneChannelMode
UPDATE __mj."EntityField" SET "DefaultValue" = '(N''Disabled'')' WHERE "ID" = '150bacbb-fe44-4e80-a70b-61c1f426f584';
-- MJ: AI Agent User Policies.CalendarChannelMode
UPDATE __mj."EntityField" SET "DefaultValue" = '(N''ProposeWithApproval'')' WHERE "ID" = 'ae8babc0-f436-4374-a0d9-c69b1819cfcb';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Rhythm Templates
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'AIAgentRhythmTemplate'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'AgentID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_rhythm_template_agent_id"
            ON "__mj"."AIAgentRhythmTemplate" ("AgentID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'AIAgentRhythmTemplate'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'SkillID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_rhythm_template_skill_id"
            ON "__mj"."AIAgentRhythmTemplate" ("SkillID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'AIAgentRhythmTemplate'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'DefaultAgentConfigurationID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_rhythm_template_default_agent_configu"
            ON "__mj"."AIAgentRhythmTemplate" ("DefaultAgentConfigurationID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Rhythm Templates
-- Item: vwAIAgentRhythmTemplates
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Rhythm Templates
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRhythmTemplate
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentRhythmTemplates"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAISkill_SkillID."Name" AS "Skill",
    MJAIConfiguration_DefaultAgentConfigurationID."Name" AS "DefaultAgentConfiguration"
FROM
    "__mj"."AIAgentRhythmTemplate" AS a
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AISkill" AS MJAISkill_SkillID
  ON
    "a"."SkillID" = MJAISkill_SkillID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_DefaultAgentConfigurationID
  ON
    "a"."DefaultAgentConfigurationID" = MJAIConfiguration_DefaultAgentConfigurationID."ID"
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
        AND tc.relname = 'vwAIAgentRhythmTemplates'
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
                           AND tc.relname = 'vwAIAgentRhythmTemplates'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentRhythmTemplates" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIAgentRhythmTemplates" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentRhythmTemplates" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentRhythmTemplates" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Rhythm Templates
-- Item: spCreateAIAgentRhythmTemplate
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRhythmTemplate
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRhythmTemplate'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRhythmTemplate"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_skillid_clear boolean DEFAULT false,
    p_skillid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_workstreamkey varchar(150) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_defaultcronexpression varchar(100) DEFAULT NULL,
    p_defaultwakegate_clear boolean DEFAULT false,
    p_defaultwakegate TEXT DEFAULT NULL,
    p_wakereason varchar(500) DEFAULT NULL,
    p_offerat varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_defaultagentconfigurationid_clear boolean DEFAULT false,
    p_defaultagentconfigurationid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRhythmTemplates" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentRhythmTemplate"
        (
            "ID",
            "AgentID",
                "SkillID",
                "Name",
                "WorkstreamKey",
                "Description",
                "DefaultCronExpression",
                "DefaultWakeGate",
                "WakeReason",
                "OfferAt",
                "Status",
                "DefaultAgentConfigurationID"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                CASE WHEN p_skillid_clear = true THEN NULL ELSE COALESCE(p_skillid, NULL) END,
                p_name,
                p_workstreamkey,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_defaultcronexpression,
                CASE WHEN p_defaultwakegate_clear = true THEN NULL ELSE COALESCE(p_defaultwakegate, NULL) END,
                p_wakereason,
                COALESCE(p_offerat, 'Onboarding'),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_defaultagentconfigurationid_clear = true THEN NULL ELSE COALESCE(p_defaultagentconfigurationid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRhythmTemplates"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRhythmTemplate" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRhythmTemplate" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Rhythm Templates
-- Item: spUpdateAIAgentRhythmTemplate
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRhythmTemplate
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRhythmTemplate'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentRhythmTemplate"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_skillid_clear boolean DEFAULT false,
    p_skillid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_workstreamkey varchar(150) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_defaultcronexpression varchar(100) DEFAULT NULL,
    p_defaultwakegate_clear boolean DEFAULT false,
    p_defaultwakegate TEXT DEFAULT NULL,
    p_wakereason varchar(500) DEFAULT NULL,
    p_offerat varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_defaultagentconfigurationid_clear boolean DEFAULT false,
    p_defaultagentconfigurationid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRhythmTemplates" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentRhythmTemplate"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "SkillID" = CASE WHEN p_skillid_clear = true THEN NULL ELSE COALESCE(p_skillid, "SkillID") END,
        "Name" = COALESCE(p_name, "Name"),
        "WorkstreamKey" = COALESCE(p_workstreamkey, "WorkstreamKey"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "DefaultCronExpression" = COALESCE(p_defaultcronexpression, "DefaultCronExpression"),
        "DefaultWakeGate" = CASE WHEN p_defaultwakegate_clear = true THEN NULL ELSE COALESCE(p_defaultwakegate, "DefaultWakeGate") END,
        "WakeReason" = COALESCE(p_wakereason, "WakeReason"),
        "OfferAt" = COALESCE(p_offerat, "OfferAt"),
        "Status" = COALESCE(p_status, "Status"),
        "DefaultAgentConfigurationID" = CASE WHEN p_defaultagentconfigurationid_clear = true THEN NULL ELSE COALESCE(p_defaultagentconfigurationid, "DefaultAgentConfigurationID") END,
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRhythmTemplates"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRhythmTemplate" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRhythmTemplate" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRhythmTemplate table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_rhythm_template"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_rhythm_template" ON "__mj"."AIAgentRhythmTemplate";

CREATE TRIGGER "trg_update_ai_agent_rhythm_template"
BEFORE UPDATE ON "__mj"."AIAgentRhythmTemplate"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_rhythm_template"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Rhythm Templates
-- Item: spDeleteAIAgentRhythmTemplate
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRhythmTemplate
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRhythmTemplate'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentRhythmTemplate"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIAgentRhythmTemplate"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRhythmTemplate" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRhythmTemplate" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'UserRoutine'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'UserID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_user_id"
            ON "__mj"."UserRoutine" ("UserID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'UserRoutine'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EnvironmentID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_environment_id"
            ON "__mj"."UserRoutine" ("EnvironmentID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'UserRoutine'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'NotificationTemplateID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_notification_template_id"
            ON "__mj"."UserRoutine" ("NotificationTemplateID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'UserRoutine'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ConversationID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_conversation_id"
            ON "__mj"."UserRoutine" ("ConversationID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'UserRoutine'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'AgentConfigurationID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_agent_configuration_id"
            ON "__mj"."UserRoutine" ("AgentConfigurationID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: vwUserRoutines
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Routines
-----               SCHEMA:      __mj
-----               BASE TABLE:  UserRoutine
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwUserRoutines"
AS
SELECT
    u.*,
    MJUser_UserID."Name" AS "User",
    MJEnvironment_EnvironmentID."Name" AS "Environment",
    MJTemplate_NotificationTemplateID."Name" AS "NotificationTemplate",
    MJConversation_ConversationID."Name" AS "Conversation",
    MJAIConfiguration_AgentConfigurationID."Name" AS "AgentConfiguration"
FROM
    "__mj"."UserRoutine" AS u
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "u"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."Environment" AS MJEnvironment_EnvironmentID
  ON
    "u"."EnvironmentID" = MJEnvironment_EnvironmentID."ID"
LEFT OUTER JOIN
    "__mj"."Template" AS MJTemplate_NotificationTemplateID
  ON
    "u"."NotificationTemplateID" = MJTemplate_NotificationTemplateID."ID"
LEFT OUTER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "u"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_AgentConfigurationID
  ON
    "u"."AgentConfigurationID" = MJAIConfiguration_AgentConfigurationID."ID"
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
        AND tc.relname = 'vwUserRoutines'
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
                           AND tc.relname = 'vwUserRoutines'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwUserRoutines" CASCADE;
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
GRANT SELECT ON "__mj"."vwUserRoutines" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwUserRoutines" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwUserRoutines" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: spCreateUserRoutine
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR UserRoutine
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateUserRoutine'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateUserRoutine"(
    p_id UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_environmentid_clear boolean DEFAULT false,
    p_environmentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_routinetype varchar(20) DEFAULT NULL,
    p_targettype varchar(20) DEFAULT NULL,
    p_targetid UUID DEFAULT NULL,
    p_initialmessage_clear boolean DEFAULT false,
    p_initialmessage TEXT DEFAULT NULL,
    p_startingpayload_clear boolean DEFAULT false,
    p_startingpayload TEXT DEFAULT NULL,
    p_requestedskillids_clear boolean DEFAULT false,
    p_requestedskillids TEXT DEFAULT NULL,
    p_cronexpression_clear boolean DEFAULT false,
    p_cronexpression varchar(100) DEFAULT NULL,
    p_startat_clear boolean DEFAULT false,
    p_startat TIMESTAMPTZ DEFAULT NULL,
    p_endat_clear boolean DEFAULT false,
    p_endat TIMESTAMPTZ DEFAULT NULL,
    p_notificationtemplateid_clear boolean DEFAULT false,
    p_notificationtemplateid UUID DEFAULT NULL,
    p_timezone varchar(100) DEFAULT NULL,
    p_nextrunat_clear boolean DEFAULT false,
    p_nextrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunat_clear boolean DEFAULT false,
    p_lastrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunstatus_clear boolean DEFAULT false,
    p_lastrunstatus varchar(20) DEFAULT NULL,
    p_lastresulthash_clear boolean DEFAULT false,
    p_lastresulthash varchar(100) DEFAULT NULL,
    p_notifycondition varchar(20) DEFAULT NULL,
    p_notifyviainapp BOOLEAN DEFAULT NULL,
    p_notifyviaemail BOOLEAN DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid UUID DEFAULT NULL,
    p_schedulemode varchar(20) DEFAULT NULL,
    p_wakeconfiguration_clear boolean DEFAULT false,
    p_wakeconfiguration TEXT DEFAULT NULL,
    p_lastcheckedat_clear boolean DEFAULT false,
    p_lastcheckedat TIMESTAMPTZ DEFAULT NULL,
    p_agentconfigurationid_clear boolean DEFAULT false,
    p_agentconfigurationid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwUserRoutines" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."UserRoutine"
        (
            "ID",
            "UserID",
                "EnvironmentID",
                "Name",
                "Description",
                "Status",
                "RoutineType",
                "TargetType",
                "TargetID",
                "InitialMessage",
                "StartingPayload",
                "RequestedSkillIDs",
                "CronExpression",
                "StartAt",
                "EndAt",
                "NotificationTemplateID",
                "Timezone",
                "NextRunAt",
                "LastRunAt",
                "LastRunStatus",
                "LastResultHash",
                "NotifyCondition",
                "NotifyViaInApp",
                "NotifyViaEmail",
                "ConversationID",
                "ScheduleMode",
                "WakeConfiguration",
                "LastCheckedAt",
                "AgentConfigurationID"
        )
    VALUES
        (
            v_new_id,
            p_userid,
                CASE WHEN p_environmentid_clear = true THEN NULL ELSE COALESCE(p_environmentid, NULL) END,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_status, 'Active'),
                COALESCE(p_routinetype, 'Scheduled'),
                p_targettype,
                p_targetid,
                CASE WHEN p_initialmessage_clear = true THEN NULL ELSE COALESCE(p_initialmessage, NULL) END,
                CASE WHEN p_startingpayload_clear = true THEN NULL ELSE COALESCE(p_startingpayload, NULL) END,
                CASE WHEN p_requestedskillids_clear = true THEN NULL ELSE COALESCE(p_requestedskillids, NULL) END,
                CASE WHEN p_cronexpression_clear = true THEN NULL ELSE COALESCE(p_cronexpression, NULL) END,
                CASE WHEN p_startat_clear = true THEN NULL ELSE COALESCE(p_startat, NULL) END,
                CASE WHEN p_endat_clear = true THEN NULL ELSE COALESCE(p_endat, NULL) END,
                CASE WHEN p_notificationtemplateid_clear = true THEN NULL ELSE COALESCE(p_notificationtemplateid, NULL) END,
                COALESCE(p_timezone, 'UTC'),
                CASE WHEN p_nextrunat_clear = true THEN NULL ELSE COALESCE(p_nextrunat, NULL) END,
                CASE WHEN p_lastrunat_clear = true THEN NULL ELSE COALESCE(p_lastrunat, NULL) END,
                CASE WHEN p_lastrunstatus_clear = true THEN NULL ELSE COALESCE(p_lastrunstatus, NULL) END,
                CASE WHEN p_lastresulthash_clear = true THEN NULL ELSE COALESCE(p_lastresulthash, NULL) END,
                COALESCE(p_notifycondition, 'Always'),
                COALESCE(p_notifyviainapp, TRUE),
                COALESCE(p_notifyviaemail, FALSE),
                CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, NULL) END,
                COALESCE(p_schedulemode, 'Recurring'),
                CASE WHEN p_wakeconfiguration_clear = true THEN NULL ELSE COALESCE(p_wakeconfiguration, NULL) END,
                CASE WHEN p_lastcheckedat_clear = true THEN NULL ELSE COALESCE(p_lastcheckedat, NULL) END,
                CASE WHEN p_agentconfigurationid_clear = true THEN NULL ELSE COALESCE(p_agentconfigurationid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwUserRoutines"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserRoutine" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserRoutine" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserRoutine" TO "cdp_UI";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: spUpdateUserRoutine
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR UserRoutine
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateUserRoutine'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateUserRoutine"(
    p_id UUID,
    p_userid UUID DEFAULT NULL,
    p_environmentid_clear boolean DEFAULT false,
    p_environmentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_routinetype varchar(20) DEFAULT NULL,
    p_targettype varchar(20) DEFAULT NULL,
    p_targetid UUID DEFAULT NULL,
    p_initialmessage_clear boolean DEFAULT false,
    p_initialmessage TEXT DEFAULT NULL,
    p_startingpayload_clear boolean DEFAULT false,
    p_startingpayload TEXT DEFAULT NULL,
    p_requestedskillids_clear boolean DEFAULT false,
    p_requestedskillids TEXT DEFAULT NULL,
    p_cronexpression_clear boolean DEFAULT false,
    p_cronexpression varchar(100) DEFAULT NULL,
    p_startat_clear boolean DEFAULT false,
    p_startat TIMESTAMPTZ DEFAULT NULL,
    p_endat_clear boolean DEFAULT false,
    p_endat TIMESTAMPTZ DEFAULT NULL,
    p_notificationtemplateid_clear boolean DEFAULT false,
    p_notificationtemplateid UUID DEFAULT NULL,
    p_timezone varchar(100) DEFAULT NULL,
    p_nextrunat_clear boolean DEFAULT false,
    p_nextrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunat_clear boolean DEFAULT false,
    p_lastrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunstatus_clear boolean DEFAULT false,
    p_lastrunstatus varchar(20) DEFAULT NULL,
    p_lastresulthash_clear boolean DEFAULT false,
    p_lastresulthash varchar(100) DEFAULT NULL,
    p_notifycondition varchar(20) DEFAULT NULL,
    p_notifyviainapp BOOLEAN DEFAULT NULL,
    p_notifyviaemail BOOLEAN DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid UUID DEFAULT NULL,
    p_schedulemode varchar(20) DEFAULT NULL,
    p_wakeconfiguration_clear boolean DEFAULT false,
    p_wakeconfiguration TEXT DEFAULT NULL,
    p_lastcheckedat_clear boolean DEFAULT false,
    p_lastcheckedat TIMESTAMPTZ DEFAULT NULL,
    p_agentconfigurationid_clear boolean DEFAULT false,
    p_agentconfigurationid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwUserRoutines" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."UserRoutine"
    SET
        "UserID" = COALESCE(p_userid, "UserID"),
        "EnvironmentID" = CASE WHEN p_environmentid_clear = true THEN NULL ELSE COALESCE(p_environmentid, "EnvironmentID") END,
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Status" = COALESCE(p_status, "Status"),
        "RoutineType" = COALESCE(p_routinetype, "RoutineType"),
        "TargetType" = COALESCE(p_targettype, "TargetType"),
        "TargetID" = COALESCE(p_targetid, "TargetID"),
        "InitialMessage" = CASE WHEN p_initialmessage_clear = true THEN NULL ELSE COALESCE(p_initialmessage, "InitialMessage") END,
        "StartingPayload" = CASE WHEN p_startingpayload_clear = true THEN NULL ELSE COALESCE(p_startingpayload, "StartingPayload") END,
        "RequestedSkillIDs" = CASE WHEN p_requestedskillids_clear = true THEN NULL ELSE COALESCE(p_requestedskillids, "RequestedSkillIDs") END,
        "CronExpression" = CASE WHEN p_cronexpression_clear = true THEN NULL ELSE COALESCE(p_cronexpression, "CronExpression") END,
        "StartAt" = CASE WHEN p_startat_clear = true THEN NULL ELSE COALESCE(p_startat, "StartAt") END,
        "EndAt" = CASE WHEN p_endat_clear = true THEN NULL ELSE COALESCE(p_endat, "EndAt") END,
        "NotificationTemplateID" = CASE WHEN p_notificationtemplateid_clear = true THEN NULL ELSE COALESCE(p_notificationtemplateid, "NotificationTemplateID") END,
        "Timezone" = COALESCE(p_timezone, "Timezone"),
        "NextRunAt" = CASE WHEN p_nextrunat_clear = true THEN NULL ELSE COALESCE(p_nextrunat, "NextRunAt") END,
        "LastRunAt" = CASE WHEN p_lastrunat_clear = true THEN NULL ELSE COALESCE(p_lastrunat, "LastRunAt") END,
        "LastRunStatus" = CASE WHEN p_lastrunstatus_clear = true THEN NULL ELSE COALESCE(p_lastrunstatus, "LastRunStatus") END,
        "LastResultHash" = CASE WHEN p_lastresulthash_clear = true THEN NULL ELSE COALESCE(p_lastresulthash, "LastResultHash") END,
        "NotifyCondition" = COALESCE(p_notifycondition, "NotifyCondition"),
        "NotifyViaInApp" = COALESCE(p_notifyviainapp, "NotifyViaInApp"),
        "NotifyViaEmail" = COALESCE(p_notifyviaemail, "NotifyViaEmail"),
        "ConversationID" = CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, "ConversationID") END,
        "ScheduleMode" = COALESCE(p_schedulemode, "ScheduleMode"),
        "WakeConfiguration" = CASE WHEN p_wakeconfiguration_clear = true THEN NULL ELSE COALESCE(p_wakeconfiguration, "WakeConfiguration") END,
        "LastCheckedAt" = CASE WHEN p_lastcheckedat_clear = true THEN NULL ELSE COALESCE(p_lastcheckedat, "LastCheckedAt") END,
        "AgentConfigurationID" = CASE WHEN p_agentconfigurationid_clear = true THEN NULL ELSE COALESCE(p_agentconfigurationid, "AgentConfigurationID") END,
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwUserRoutines"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserRoutine" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserRoutine" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserRoutine" TO "cdp_UI";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRoutine table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_user_routine"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_user_routine" ON "__mj"."UserRoutine";

CREATE TRIGGER "trg_update_user_routine"
BEFORE UPDATE ON "__mj"."UserRoutine"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_user_routine"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: spDeleteUserRoutine
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR UserRoutine
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteUserRoutine'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteUserRoutine"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."UserRoutine"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteUserRoutine" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteUserRoutine" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteUserRoutine" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent User Policies
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'AIAgentUserPolicy'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'AgentID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_user_policy_agent_id"
            ON "__mj"."AIAgentUserPolicy" ("AgentID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'AIAgentUserPolicy'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'UserID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_user_policy_user_id"
            ON "__mj"."AIAgentUserPolicy" ("UserID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'AIAgentUserPolicy'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'PreferredPersonaID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_user_policy_preferred_persona_id"
            ON "__mj"."AIAgentUserPolicy" ("PreferredPersonaID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent User Policies
-- Item: vwAIAgentUserPolicies
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent User Policies
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentUserPolicy
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentUserPolicies"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJUser_UserID."Name" AS "User",
    MJAIPersona_PreferredPersonaID."Name" AS "PreferredPersona"
FROM
    "__mj"."AIAgentUserPolicy" AS a
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."AIPersona" AS MJAIPersona_PreferredPersonaID
  ON
    "a"."PreferredPersonaID" = MJAIPersona_PreferredPersonaID."ID"
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
        AND tc.relname = 'vwAIAgentUserPolicies'
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
                           AND tc.relname = 'vwAIAgentUserPolicies'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentUserPolicies" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIAgentUserPolicies" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentUserPolicies" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwAIAgentUserPolicies" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent User Policies
-- Item: spCreateAIAgentUserPolicy
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentUserPolicy
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentUserPolicy'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentUserPolicy"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_displaynameoverride_clear boolean DEFAULT false,
    p_displaynameoverride varchar(100) DEFAULT NULL,
    p_preferredpersonaid_clear boolean DEFAULT false,
    p_preferredpersonaid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_onboardingstatus varchar(20) DEFAULT NULL,
    p_onboardedat_clear boolean DEFAULT false,
    p_onboardedat TIMESTAMPTZ DEFAULT NULL,
    p_coordinationmode varchar(20) DEFAULT NULL,
    p_defaultdataaccessmode varchar(20) DEFAULT NULL,
    p_emailchannelmode varchar(20) DEFAULT NULL,
    p_phonechannelmode varchar(20) DEFAULT NULL,
    p_messagingchannelmode varchar(20) DEFAULT NULL,
    p_calendarchannelmode varchar(30) DEFAULT NULL,
    p_allowinteragentcoordination BOOLEAN DEFAULT NULL,
    p_requireapprovalforexternalcomms BOOLEAN DEFAULT NULL,
    p_requireapprovalforfinancials BOOLEAN DEFAULT NULL,
    p_requireapprovalfordestructiveactions BOOLEAN DEFAULT NULL,
    p_autoapproveamountthreshold_clear boolean DEFAULT false,
    p_autoapproveamountthreshold decimal(18, 2) DEFAULT NULL,
    p_entityaccessrules_clear boolean DEFAULT false,
    p_entityaccessrules TEXT DEFAULT NULL,
    p_actionpolicyrules_clear boolean DEFAULT false,
    p_actionpolicyrules TEXT DEFAULT NULL,
    p_instructionsoverride_clear boolean DEFAULT false,
    p_instructionsoverride TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentUserPolicies" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentUserPolicy"
        (
            "ID",
            "AgentID",
                "UserID",
                "DisplayNameOverride",
                "PreferredPersonaID",
                "Status",
                "OnboardingStatus",
                "OnboardedAt",
                "CoordinationMode",
                "DefaultDataAccessMode",
                "EmailChannelMode",
                "PhoneChannelMode",
                "MessagingChannelMode",
                "CalendarChannelMode",
                "AllowInterAgentCoordination",
                "RequireApprovalForExternalComms",
                "RequireApprovalForFinancials",
                "RequireApprovalForDestructiveActions",
                "AutoApproveAmountThreshold",
                "EntityAccessRules",
                "ActionPolicyRules",
                "InstructionsOverride"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_userid,
                CASE WHEN p_displaynameoverride_clear = true THEN NULL ELSE COALESCE(p_displaynameoverride, NULL) END,
                CASE WHEN p_preferredpersonaid_clear = true THEN NULL ELSE COALESCE(p_preferredpersonaid, NULL) END,
                COALESCE(p_status, 'Active'),
                COALESCE(p_onboardingstatus, 'NotStarted'),
                CASE WHEN p_onboardedat_clear = true THEN NULL ELSE COALESCE(p_onboardedat, NULL) END,
                COALESCE(p_coordinationmode, 'Autonomous'),
                COALESCE(p_defaultdataaccessmode, 'UserCeiling'),
                COALESCE(p_emailchannelmode, 'DraftOnly'),
                COALESCE(p_phonechannelmode, 'Disabled'),
                COALESCE(p_messagingchannelmode, 'Enabled'),
                COALESCE(p_calendarchannelmode, 'ProposeWithApproval'),
                COALESCE(p_allowinteragentcoordination, TRUE),
                COALESCE(p_requireapprovalforexternalcomms, TRUE),
                COALESCE(p_requireapprovalforfinancials, TRUE),
                COALESCE(p_requireapprovalfordestructiveactions, TRUE),
                CASE WHEN p_autoapproveamountthreshold_clear = true THEN NULL ELSE COALESCE(p_autoapproveamountthreshold, NULL) END,
                CASE WHEN p_entityaccessrules_clear = true THEN NULL ELSE COALESCE(p_entityaccessrules, NULL) END,
                CASE WHEN p_actionpolicyrules_clear = true THEN NULL ELSE COALESCE(p_actionpolicyrules, NULL) END,
                CASE WHEN p_instructionsoverride_clear = true THEN NULL ELSE COALESCE(p_instructionsoverride, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentUserPolicies"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentUserPolicy" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentUserPolicy" TO "cdp_UI";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent User Policies
-- Item: spUpdateAIAgentUserPolicy
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentUserPolicy
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentUserPolicy'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentUserPolicy"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_displaynameoverride_clear boolean DEFAULT false,
    p_displaynameoverride varchar(100) DEFAULT NULL,
    p_preferredpersonaid_clear boolean DEFAULT false,
    p_preferredpersonaid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_onboardingstatus varchar(20) DEFAULT NULL,
    p_onboardedat_clear boolean DEFAULT false,
    p_onboardedat TIMESTAMPTZ DEFAULT NULL,
    p_coordinationmode varchar(20) DEFAULT NULL,
    p_defaultdataaccessmode varchar(20) DEFAULT NULL,
    p_emailchannelmode varchar(20) DEFAULT NULL,
    p_phonechannelmode varchar(20) DEFAULT NULL,
    p_messagingchannelmode varchar(20) DEFAULT NULL,
    p_calendarchannelmode varchar(30) DEFAULT NULL,
    p_allowinteragentcoordination BOOLEAN DEFAULT NULL,
    p_requireapprovalforexternalcomms BOOLEAN DEFAULT NULL,
    p_requireapprovalforfinancials BOOLEAN DEFAULT NULL,
    p_requireapprovalfordestructiveactions BOOLEAN DEFAULT NULL,
    p_autoapproveamountthreshold_clear boolean DEFAULT false,
    p_autoapproveamountthreshold decimal(18, 2) DEFAULT NULL,
    p_entityaccessrules_clear boolean DEFAULT false,
    p_entityaccessrules TEXT DEFAULT NULL,
    p_actionpolicyrules_clear boolean DEFAULT false,
    p_actionpolicyrules TEXT DEFAULT NULL,
    p_instructionsoverride_clear boolean DEFAULT false,
    p_instructionsoverride TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentUserPolicies" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentUserPolicy"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "DisplayNameOverride" = CASE WHEN p_displaynameoverride_clear = true THEN NULL ELSE COALESCE(p_displaynameoverride, "DisplayNameOverride") END,
        "PreferredPersonaID" = CASE WHEN p_preferredpersonaid_clear = true THEN NULL ELSE COALESCE(p_preferredpersonaid, "PreferredPersonaID") END,
        "Status" = COALESCE(p_status, "Status"),
        "OnboardingStatus" = COALESCE(p_onboardingstatus, "OnboardingStatus"),
        "OnboardedAt" = CASE WHEN p_onboardedat_clear = true THEN NULL ELSE COALESCE(p_onboardedat, "OnboardedAt") END,
        "CoordinationMode" = COALESCE(p_coordinationmode, "CoordinationMode"),
        "DefaultDataAccessMode" = COALESCE(p_defaultdataaccessmode, "DefaultDataAccessMode"),
        "EmailChannelMode" = COALESCE(p_emailchannelmode, "EmailChannelMode"),
        "PhoneChannelMode" = COALESCE(p_phonechannelmode, "PhoneChannelMode"),
        "MessagingChannelMode" = COALESCE(p_messagingchannelmode, "MessagingChannelMode"),
        "CalendarChannelMode" = COALESCE(p_calendarchannelmode, "CalendarChannelMode"),
        "AllowInterAgentCoordination" = COALESCE(p_allowinteragentcoordination, "AllowInterAgentCoordination"),
        "RequireApprovalForExternalComms" = COALESCE(p_requireapprovalforexternalcomms, "RequireApprovalForExternalComms"),
        "RequireApprovalForFinancials" = COALESCE(p_requireapprovalforfinancials, "RequireApprovalForFinancials"),
        "RequireApprovalForDestructiveActions" = COALESCE(p_requireapprovalfordestructiveactions, "RequireApprovalForDestructiveActions"),
        "AutoApproveAmountThreshold" = CASE WHEN p_autoapproveamountthreshold_clear = true THEN NULL ELSE COALESCE(p_autoapproveamountthreshold, "AutoApproveAmountThreshold") END,
        "EntityAccessRules" = CASE WHEN p_entityaccessrules_clear = true THEN NULL ELSE COALESCE(p_entityaccessrules, "EntityAccessRules") END,
        "ActionPolicyRules" = CASE WHEN p_actionpolicyrules_clear = true THEN NULL ELSE COALESCE(p_actionpolicyrules, "ActionPolicyRules") END,
        "InstructionsOverride" = CASE WHEN p_instructionsoverride_clear = true THEN NULL ELSE COALESCE(p_instructionsoverride, "InstructionsOverride") END,
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentUserPolicies"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentUserPolicy" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentUserPolicy" TO "cdp_UI";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentUserPolicy table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_user_policy"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_user_policy" ON "__mj"."AIAgentUserPolicy";

CREATE TRIGGER "trg_update_ai_agent_user_policy"
BEFORE UPDATE ON "__mj"."AIAgentUserPolicy"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_user_policy"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent User Policies
-- Item: spDeleteAIAgentUserPolicy
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentUserPolicy
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentUserPolicy'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentUserPolicy"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIAgentUserPolicy"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentUserPolicy" TO "cdp_Integration";

-- ===================== HAND-FINISHED (v6.3.0-edge.2 release build) =====================
-- RelatedEntityNameFieldMap calls. The SQL Server CodeGen section sets these with
-- EXEC spUpdateEntityFieldRelatedEntityNameFieldMap; the split converter reports those EXECs as unhandled
-- (blocking the bake, so they were removed from the bake input) and the bake does not carry them, so a PG
-- database built by mj migrate would leave the map NULL. On PostgreSQL the routine is a FUNCTION, so the
-- calls are PERFORM with named arguments (same form as V202609091200 / V202611161546).

/* related entity name field map for entity field cd0276af-4431-47c1-85e6-a827367ab848 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'cd0276af-4431-47c1-85e6-a827367ab848'::uuid,
    p_relatedentitynamefieldmap := 'DefaultAgentConfiguration'
  );
END $$;

/* related entity name field map for entity field 0c17773e-a295-41b5-8404-b90ed739c5fd */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '0c17773e-a295-41b5-8404-b90ed739c5fd'::uuid,
    p_relatedentitynamefieldmap := 'AgentConfiguration'
  );
END $$;
-- ===================== END HAND-FINISHED =====================
