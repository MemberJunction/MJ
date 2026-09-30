-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609260053__v6.2.x__Project_OwnerUserID_Personal_Folders.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."Project"
ADD COLUMN "OwnerUserID" UUID NULL /* ============================================================================ */ /* v6.2.x — Project.OwnerUserID: conversation folders can be PERSONAL */ /* WHY. `Project` is the conversation sidebar's folder. Its entire column list is */ /* ID, EnvironmentID, ParentID, Name, Description, Color, Icon, IsArchived — there is */ /* no owner. Folders are therefore environment-wide by construction: */ /* ConversationEngine.LoadProjects reads them with */ /* `EnvironmentID='…' AND (IsArchived IS NULL OR IsArchived=0)` and its own docstring */ /* states the consequence plainly — "Projects are environment-scoped (not */ /* user-scoped)". */ /* That is fine for a single-team environment and wrong for two things people are */ /* actually asking for: */ /*   1. PERSONAL FOLDERS. There is nothing to toggle. "My drafts" cannot exist, */ /*      because every folder is everyone's folder. */ /*   2. MULTI-TENANT HOSTS. An application serving several customers from one */ /*      environment leaks folder NAMES between them. Conversations do not leak — */ /*      they carry UserID and hosts row-level-secure them — but the folder holding */ /*      them is readable by everyone with Read on the entity. Names are user-authored */ /*      free text, so "Q3 Layoff Comms" or "Acquisition — Project Bluebird" is one */ /*      folder away from being visible to the wrong customer. Reported from a */ /*      white-label deployment (Betty) where three customer-created folders were */ /*      readable by all 26 users across 5 organizations. */ /* Both are the same missing column, approached from different directions, which is */ /* why one column answers both. */ /* WHAT. One additive, NULLABLE column, so nothing existing changes behaviour: */ /*   Project.OwnerUserID   UNIQUEIDENTIFIER NULL   FK -> __mj.User(ID) */ /*       NULL (default for every existing row) — SHARED: the folder is visible to the */ /*             environment, exactly as today. */ /*       set                                      — PERSONAL: the folder belongs to */ /*             that user. Consumers filter it to its owner. */ /* NULL-means-shared is deliberate. The inverse (owner required, a sentinel for */ /* shared) would need a backfill, would make every existing folder personal to */ /* whoever happened to create it, and would give "shared" no honest representation. */ /* This way the migration is a pure add: every folder that already exists stays */ /* exactly as visible as it is today, and nothing is migrated. */ /* NOTE ON THE UI DEFAULT, which is a separate decision from the column default: */ /* the folder dialog now defaults a NEW folder to PERSONAL. The sidebar is a */ /* personal surface (its conversations are already bound to their owner), so a */ /* folder everyone can see is the surprising option. Existing folders are */ /* unaffected either way — this only governs which option the dialog starts at. */ /* Named OwnerUserID rather than UserID to match MJ's existing spelling for exactly */ /* this relationship — AIAgent.OwnerUserID, ScheduledJob.OwnerUserID, */ /* SearchScope.OwnerUserID, each a nullable-or-defaulted owner with an */ /* FK_<table>_OwnerUserID constraint. `UserID` in MJ (Conversation, ActionExecutionLog) */ /* is a different, NOT NULL "whose row is this" semantic and would read as a */ /* required field here. */ /* WHAT THIS DOES NOT DO. A column is not a policy — so this migration does not stop */ /* at the column. It also attaches a row-level-security filter to the UI role's read */ /* permission (see the section below the DDL). For a user whose every read grant on */ /* the entity carries that filter, a personal folder is unreadable server-side rather */ /* than merely unlisted by two Angular readers. That is narrower than "every other */ /* user": a user holding any role with unfiltered read is exempt, and under the seeded */ /* roles that includes everyone who can create a folder — see SCOPE below. A host that */ /* does nothing still sees no difference, because every folder that exists today is */ /* shared and the filter admits shared folders unchanged. */ /* What it still does not do is close the multi-tenant leak in the motivating incident: */ /* those folders were SHARED, and a shared folder is readable by the environment by */ /* definition. They become private when someone makes them personal, not when this */ /* migration runs. Tenant separation stays the host's Environment or its own RLS choice. */ /* The consumer side ships in the same change as this migration: */ /*   - `BuildProjectVisibilityFilter` (MJCoreEntities) is the one client-side */ /*     definition of "shared plus mine", `(OwnerUserID IS NULL OR */ /*     OwnerUserID='<contextUser.ID>')`, used by ConversationEngine.LoadProjects and */ /*     the Assign Project picker. It keeps a personal folder out of other people's */ /*     sidebars whatever their roles; it is a listing rule, not a boundary. */ /*   - The folder dialog offers personal vs shared at create time, and personal -> */ /*     shared afterwards (never the reverse). */ /*   - TENANT scoping is NOT addressed here and should not be. Multi-tenant hosts */ /*     separate customers by Environment (which Project is already keyed on) or by */ /*     their own row-level security; an OrganizationID on a core MJ table would be */ /*     inventing a tenancy model MJ does not have. */ /* ============================================================================ */;

ALTER TABLE __mj."Project"
  ADD CONSTRAINT "FK_Project_OwnerUserID" FOREIGN KEY ("OwnerUserID") REFERENCES __mj."User" (
    "ID"
  );

COMMENT ON COLUMN __mj."Project"."OwnerUserID" IS 'The user who owns this folder, or NULL when the folder is shared with the whole environment. NULL (the value every pre-existing folder carries) means SHARED: visible to anyone who can read projects in the environment, which was the only possible behaviour before this column existed. A set value means PERSONAL: the folder belongs to that user and consumers filter it to them, so it stays out of other people''s sidebars. Personal is opt-in at create time; nothing is migrated.';

-- Baked from the source with its row-level-security section (DECLARE / IF EXISTS blocks the AST
-- transpiler cannot handle) removed, so CodeGen could bake; that section is hand-ported here.

-- ── Hand-ported: the 'UI: Own or Shared Projects' RLS filter, attached to the UI role's read ──
-- The filter. Parenthesised in the text as well as by the composer: MJ wraps each filter in its own
-- parens when it ORs a user's filters together, but a bare top-level OR is one refactor away from
-- binding wrongly, and the redundancy costs nothing.
DO $mj$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = '7596823D-CA3B-4CE5-A66E-FC929E0FEB02') THEN
        INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "FilterText", "Description")
        VALUES (
            '7596823D-CA3B-4CE5-A66E-FC929E0FEB02',
            'UI: Own or Shared Projects',
            '(OwnerUserID IS NULL OR OwnerUserID = ''{{UserID}}'')',
            'Narrows MJ: Projects to folders the current user may see: shared folders (OwnerUserID IS NULL, which is every folder that predates the column) plus their own personal folders. Attached to the UI role''s read permission, which every ordinary signed-in user holds. Without it "personal" is only a client-side convention — the folder name is still readable through a direct RunView, the entity browser, or the Projects grid on the User form. Developer and Integration are deliberately unfiltered so entity-admin surfaces are unaffected.'
        );
    END IF;
END
$mj$;

-- Attach it to the UI role's READ permission on MJ: Projects, matching on the natural key because
-- the row's ID is database-generated. Create the permission row only if the deployment somehow has
-- none; CanCreate/Update/Delete stay false either way, so this can only narrow reads.
DO $mj$
BEGIN
    IF EXISTS (SELECT 1 FROM __mj."EntityPermission"
               WHERE "EntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND "RoleID" = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E') THEN
        UPDATE __mj."EntityPermission"
           SET "ReadRLSFilterID" = '7596823D-CA3B-4CE5-A66E-FC929E0FEB02',
               "__mj_UpdatedAt"  = (now() AT TIME ZONE 'UTC')
         WHERE "EntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A'
           AND "RoleID"   = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
           AND ("ReadRLSFilterID" IS NULL OR "ReadRLSFilterID" <> '7596823D-CA3B-4CE5-A66E-FC929E0FEB02');
    ELSE
        INSERT INTO __mj."EntityPermission" ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "ReadRLSFilterID")
        VALUES ('B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, '7596823D-CA3B-4CE5-A66E-FC929E0FEB02');
    END IF;
END
$mj$;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d40cdd7-7a73-4449-81e0-a603e5be41ab' OR ("EntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND "Name" = 'OwnerUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4d40cdd7-7a73-4449-81e0-a603e5be41ab', 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' /* Entity: MJ: Projects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A'), 'OwnerUserID', 'Owner User ID', 'The user who owns this folder, or NULL when the folder is shared with the whole environment. NULL (the value every pre-existing folder carries) means SHARED: visible to anyone who can read projects in the environment, which was the only possible behaviour before this column existed. A set value means PERSONAL: the folder belongs to that user and consumers filter it to them, so it stays out of other people''s sidebars. Personal is opt-in at create time; nothing is migrated.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '509b5753-3021-46d5-a8f5-967ff4c32e32') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('509b5753-3021-46d5-a8f5-967ff4c32e32', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', 'OwnerUserID', 'One To Many', TRUE, TRUE, 106, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '36a2c7e2-3e20-4349-8c19-2850e0ecea38' OR ("EntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND "Name" = 'OwnerUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('36a2c7e2-3e20-4349-8c19-2850e0ecea38', 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' /* Entity: MJ: Projects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A'), 'OwnerUser', 'Owner User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Projects
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_project_environment_id"
    ON "__mj"."Project" ("EnvironmentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_project_parent_id"
    ON "__mj"."Project" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_project_owner_user_id"
    ON "__mj"."Project" ("OwnerUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Projects
-- Item: fn_project_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: Project.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_project_parent_id_get_hierarchy_meta"(
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
            "__mj"."Project"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."Project" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."Project" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."Project" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Projects
-- Item: fn_project_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: Project.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_project_parent_id_get_descendants"(
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
            "__mj"."Project"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."Project" c
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
        (NOT EXISTS (SELECT 1 FROM "__mj"."Project" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."Project" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Projects
-- Item: fn_project_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: Project.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_project_parent_id_get_ancestors"(
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
            "__mj"."Project"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."Project" p
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
-- PostgreSQL Generated SQL for Entity: MJ: Projects
-- Item: fn_project_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: Project.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_project_parent_id_get_root_id"(
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
            "__mj"."Project"
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
            "__mj"."Project" c
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
-- PostgreSQL Generated SQL for Entity: MJ: Projects
-- Item: vwProjects
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Projects
-----               SCHEMA:      __mj
-----               BASE TABLE:  Project
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwProjects"
AS
SELECT
    p.*,
    MJEnvironment_EnvironmentID."Name" AS "Environment",
    MJProject_ParentID."Name" AS "Parent",
    MJUser_OwnerUserID."Name" AS "OwnerUser",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."Project" AS p
INNER JOIN
    "__mj"."Environment" AS MJEnvironment_EnvironmentID
  ON
    "p"."EnvironmentID" = MJEnvironment_EnvironmentID."ID"
LEFT OUTER JOIN
    "__mj"."Project" AS MJProject_ParentID
  ON
    "p"."ParentID" = MJProject_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_OwnerUserID
  ON
    "p"."OwnerUserID" = MJUser_OwnerUserID."ID"

LEFT JOIN LATERAL "__mj"."fn_project_parent_id_get_hierarchy_meta"(p."ID", p."ParentID") AS hier_ParentID ON true
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwProjects'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwProjects'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwProjects'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwProjects" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwProjects" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwProjects" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwProjects" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Projects
-- Item: spCreateProject
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Project
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateProject'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateProject"(
    p_id UUID DEFAULT NULL,
    p_environmentid UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(7) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(50) DEFAULT NULL,
    p_isarchived BOOLEAN DEFAULT NULL,
    p_owneruserid_clear boolean DEFAULT false,
    p_owneruserid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwProjects" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Project"
        (
            "ID",
            "EnvironmentID",
                "ParentID",
                "Name",
                "Description",
                "Color",
                "Icon",
                "IsArchived",
                "OwnerUserID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_environmentid = '00000000-0000-0000-0000-000000000000'::UUID THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_environmentid, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                COALESCE(p_isarchived, FALSE),
                CASE WHEN p_owneruserid_clear = true THEN NULL ELSE COALESCE(p_owneruserid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwProjects"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateProject" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateProject" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Projects
-- Item: spUpdateProject
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Project
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateProject'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateProject"(
    p_id UUID,
    p_environmentid UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(7) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(50) DEFAULT NULL,
    p_isarchived BOOLEAN DEFAULT NULL,
    p_owneruserid_clear boolean DEFAULT false,
    p_owneruserid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwProjects" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Project"
    SET
        "EnvironmentID" = COALESCE(p_environmentid, "EnvironmentID"),
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Color" = CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, "Color") END,
        "Icon" = CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, "Icon") END,
        "IsArchived" = COALESCE(p_isarchived, "IsArchived"),
        "OwnerUserID" = CASE WHEN p_owneruserid_clear = true THEN NULL ELSE COALESCE(p_owneruserid, "OwnerUserID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwProjects"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateProject" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateProject" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Project table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_project"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_project" ON "__mj"."Project";

CREATE TRIGGER "trg_update_project"
BEFORE UPDATE ON "__mj"."Project"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_project"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Projects
-- Item: spDeleteProject
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Project
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteProject'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteProject"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."Project"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteProject" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteProject" TO "cdp_Integration";
