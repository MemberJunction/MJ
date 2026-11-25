-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611202005__v6.3.x__GraphType_Overlay_Defaults.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."GraphType"
  ADD COLUMN "DefaultAuthorityTierID" UUID NULL,
  ADD COLUMN "DefaultConceptTaxonomyMode" VARCHAR(30) NOT NULL DEFAULT (
    'Auto Grow'
  ),
  ADD COLUMN "DefaultGroundingMode" VARCHAR(30) NOT NULL DEFAULT (
    'None'
  ),
  ADD CONSTRAINT "FK_GraphType_DefaultAuthorityTier" FOREIGN KEY ("DefaultAuthorityTierID") REFERENCES __mj."GraphAuthorityTier" (
    "ID"
  ),
  ADD CONSTRAINT "CK_GraphType_DefaultConceptTaxonomyMode" CHECK ("DefaultConceptTaxonomyMode" IN ('Constrained', 'Propose Only', 'Auto Grow')),
  ADD CONSTRAINT "CK_GraphType_DefaultGroundingMode" CHECK ("DefaultGroundingMode" IN ('None', 'Schema and Queries', 'Full Canon'))
 /* ===================================================================================== */ /* Graph Type overlay defaults: make authority tiers and overlay modes fully metadata-driven. */ /* Until now the Content Pipeline Graph stage chose a source's default authority tier, concept */ /* taxonomy mode and grounding mode in code, by the graph type's name (Canon -> 'Executive SOP', */ /* 'propose-only', 'full-canon'; anything else -> 'Reference', 'auto-grow', 'none'). These three */ /* columns move those defaults onto each MJ: Graph Types row, so an organization configures them */ /* (and renames or replaces the seeded authority tiers) without touching code. */ /* Seeded graph types receive their values through metadata/graph-types/, not here. */ /* ===================================================================================== */;

COMMENT ON COLUMN __mj."GraphType"."DefaultAuthorityTierID" IS 'Authority tier given to content sources that feed graphs of this type and name no tier of their own. NULL leaves such sources unranked, below every configured tier.';

COMMENT ON COLUMN __mj."GraphType"."DefaultConceptTaxonomyMode" IS 'Concept taxonomy mode used when a content source feeding a graph of this type names none: Constrained links only to existing concepts, Propose Only creates new concepts and edges as Proposed for steward review, Auto Grow creates them as Approved.';

COMMENT ON COLUMN __mj."GraphType"."DefaultGroundingMode" IS 'Grounding depth used when a content source feeding a graph of this type names none: None extracts document concepts only, Schema and Queries also links concepts to entities, alternate base views and queries, Full Canon additionally links actions, skills and workflows.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5c1d514d-8b19-4a9f-81c6-62ff2a528384' OR ("EntityID" = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND "Name" = 'DefaultAuthorityTierID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5c1d514d-8b19-4a9f-81c6-62ff2a528384', 'C52B0468-A653-49AD-9FC6-097D7374E803' /* Entity: MJ: Graph Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C52B0468-A653-49AD-9FC6-097D7374E803'), 'DefaultAuthorityTierID', 'Default Authority Tier ID', 'Authority tier given to content sources that feed graphs of this type and name no tier of their own. NULL leaves such sources unranked, below every configured tier.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '4E40BD04-842D-4CAE-841D-D69DEC4B17E9', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ce98c0e2-6255-4712-ab9b-20261be7136f' OR ("EntityID" = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND "Name" = 'DefaultConceptTaxonomyMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ce98c0e2-6255-4712-ab9b-20261be7136f', 'C52B0468-A653-49AD-9FC6-097D7374E803' /* Entity: MJ: Graph Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C52B0468-A653-49AD-9FC6-097D7374E803'), 'DefaultConceptTaxonomyMode', 'Default Concept Taxonomy Mode', 'Concept taxonomy mode used when a content source feeding a graph of this type names none: Constrained links only to existing concepts, Propose Only creates new concepts and edges as Proposed for steward review, Auto Grow creates them as Approved.', 'nvarchar', 60, 0, 0, FALSE, 'Auto Grow', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '331e6174-e408-4acd-bc8a-512c7397c9a6' OR ("EntityID" = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND "Name" = 'DefaultGroundingMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('331e6174-e408-4acd-bc8a-512c7397c9a6', 'C52B0468-A653-49AD-9FC6-097D7374E803' /* Entity: MJ: Graph Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C52B0468-A653-49AD-9FC6-097D7374E803'), 'DefaultGroundingMode', 'Default Grounding Mode', 'Grounding depth used when a content source feeding a graph of this type names none: None extracts document concepts only, Schema and Queries also links concepts to entities, alternate base views and queries, Full Canon additionally links actions, skills and workflows.', 'nvarchar', 60, 0, 0, FALSE, 'None', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to sync 3 entity field value row(s) for entity field ID CE98C0E2-6255-4712-AB9B-20261BE7136F */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '0af9f066-f387-4fa6-97be-daac7de6908f',
    'CE98C0E2-6255-4712-AB9B-20261BE7136F',
    1,
    'Auto Grow',
    'Auto Grow',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'be4f7908-e9ed-4843-b9b3-b9ed4b29990f',
    'CE98C0E2-6255-4712-AB9B-20261BE7136F',
    2,
    'Constrained',
    'Constrained',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '0205ad14-ac7a-43ea-93cb-4faea0a7ea1b',
    'CE98C0E2-6255-4712-AB9B-20261BE7136F',
    3,
    'Propose Only',
    'Propose Only',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID CE98C0E2-6255-4712-AB9B-20261BE7136F */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'CE98C0E2-6255-4712-AB9B-20261BE7136F';
/* SQL text to sync 3 entity field value row(s) for entity field ID 331E6174-E408-4ACD-BC8A-512C7397C9A6 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '882f571d-04d5-4dd5-a24f-9c106f85fc1d',
    '331E6174-E408-4ACD-BC8A-512C7397C9A6',
    1,
    'Full Canon',
    'Full Canon',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '46ca9276-5f1f-4d1f-92fe-e7c880bb30b6',
    '331E6174-E408-4ACD-BC8A-512C7397C9A6',
    2,
    'None',
    'None',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7c6d0b12-1c68-49ea-bb11-875db8fa4bbd',
    '331E6174-E408-4ACD-BC8A-512C7397C9A6',
    3,
    'Schema and Queries',
    'Schema and Queries',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 331E6174-E408-4ACD-BC8A-512C7397C9A6 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '331E6174-E408-4ACD-BC8A-512C7397C9A6';
/* Create Entity Relationship: MJ: Graph Authority Tiers -> MJ: Graph Types (One To Many via DefaultAuthorityTierID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '981ac18e-8155-47e5-9e5a-e5220a8a1f1e' OR ("EntityID" = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9' AND "RelatedEntityID" = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND "RelatedEntityJoinField" = 'DefaultAuthorityTierID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('981ac18e-8155-47e5-9e5a-e5220a8a1f1e', '4E40BD04-842D-4CAE-841D-D69DEC4B17E9', 'C52B0468-A653-49AD-9FC6-097D7374E803', 'DefaultAuthorityTierID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

/* Update attributes on "MJ: Conversations" from additionalSchemaInfo */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW(), "SubtypeSelector" = '{"Path": "TypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "TypeID.DriverClass", "BaseClass": "ConversationTypeDriver"}}'
WHERE
  "ID" = '13248F34-2837-EF11-86D4-6045BDEE16E6';
/* Update attributes on "MJ: Comments" from additionalSchemaInfo */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW(), "SubtypeSelector" = '{"Path": "CommentTypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "CommentTypeID.DriverClass", "BaseClass": "CommentTypeDriver"}, "UIDriver": {"Path": "CommentTypeID.UIDriverClass"}}'
WHERE
  "ID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229';
/* SQL text to update entity field related entity name field map for entity field ID 531A3948-3CBB-4209-8E3C-3079D15AF7F2 */ /* SQL text to update entity field related entity name field map for entity field ID F07B7C51-F532-48E1-B4C1-31F8B34B76AC */ /* SQL text to update entity field related entity name field map for entity field ID 5CD350B5-2FE5-42DA-957B-A6E9C9E6E47E */ /* SQL text to update entity field related entity name field map for entity field ID 5C1D514D-8B19-4A9F-81C6-62FF2A528384 */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '534a8c44-9b3b-490d-b719-b5fa0ecd3dec' OR ("EntityID" = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND "Name" = 'DefaultAuthorityTier')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('534a8c44-9b3b-490d-b719-b5fa0ecd3dec', 'C52B0468-A653-49AD-9FC6-097D7374E803' /* Entity: MJ: Graph Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'C52B0468-A653-49AD-9FC6-097D7374E803'), 'DefaultAuthorityTier', 'Default Authority Tier', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Graph Types
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
          AND t.relname = 'GraphType'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'DefaultAuthorityTierID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_graph_type_default_authority_tier_id"
            ON "__mj"."GraphType" ("DefaultAuthorityTierID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Graph Types
-- Item: vwGraphTypes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Graph Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  GraphType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwGraphTypes"
AS
SELECT
    g.*,
    MJGraphAuthorityTier_DefaultAuthorityTierID."Name" AS "DefaultAuthorityTier"
FROM
    "__mj"."GraphType" AS g
LEFT OUTER JOIN
    "__mj"."GraphAuthorityTier" AS MJGraphAuthorityTier_DefaultAuthorityTierID
  ON
    "g"."DefaultAuthorityTierID" = MJGraphAuthorityTier_DefaultAuthorityTierID."ID"
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
        AND tc.relname = 'vwGraphTypes'
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
                           AND tc.relname = 'vwGraphTypes'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwGraphTypes" CASCADE;
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
GRANT SELECT ON "__mj"."vwGraphTypes" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwGraphTypes" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwGraphTypes" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Graph Types
-- Item: spCreateGraphType
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR GraphType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateGraphType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateGraphType"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_iscanon BOOLEAN DEFAULT NULL,
    p_rank int DEFAULT NULL,
    p_iconclass_clear boolean DEFAULT false,
    p_iconclass varchar(100) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_defaultauthoritytierid_clear boolean DEFAULT false,
    p_defaultauthoritytierid UUID DEFAULT NULL,
    p_defaultconcepttaxonomymode varchar(30) DEFAULT NULL,
    p_defaultgroundingmode varchar(30) DEFAULT NULL
) RETURNS SETOF "__mj"."vwGraphTypes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."GraphType"
        (
            "ID",
            "Name",
                "Description",
                "IsCanon",
                "Rank",
                "IconClass",
                "Status",
                "DefaultAuthorityTierID",
                "DefaultConceptTaxonomyMode",
                "DefaultGroundingMode"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_iscanon, FALSE),
                COALESCE(p_rank, 100),
                CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_defaultauthoritytierid_clear = true THEN NULL ELSE COALESCE(p_defaultauthoritytierid, NULL) END,
                COALESCE(p_defaultconcepttaxonomymode, 'Auto Grow'),
                COALESCE(p_defaultgroundingmode, 'None')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwGraphTypes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateGraphType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateGraphType" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Graph Types
-- Item: spUpdateGraphType
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR GraphType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateGraphType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateGraphType"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_iscanon BOOLEAN DEFAULT NULL,
    p_rank int DEFAULT NULL,
    p_iconclass_clear boolean DEFAULT false,
    p_iconclass varchar(100) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_defaultauthoritytierid_clear boolean DEFAULT false,
    p_defaultauthoritytierid UUID DEFAULT NULL,
    p_defaultconcepttaxonomymode varchar(30) DEFAULT NULL,
    p_defaultgroundingmode varchar(30) DEFAULT NULL
) RETURNS SETOF "__mj"."vwGraphTypes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."GraphType"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "IsCanon" = COALESCE(p_iscanon, "IsCanon"),
        "Rank" = COALESCE(p_rank, "Rank"),
        "IconClass" = CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, "IconClass") END,
        "Status" = COALESCE(p_status, "Status"),
        "DefaultAuthorityTierID" = CASE WHEN p_defaultauthoritytierid_clear = true THEN NULL ELSE COALESCE(p_defaultauthoritytierid, "DefaultAuthorityTierID") END,
        "DefaultConceptTaxonomyMode" = COALESCE(p_defaultconcepttaxonomymode, "DefaultConceptTaxonomyMode"),
        "DefaultGroundingMode" = COALESCE(p_defaultgroundingmode, "DefaultGroundingMode"),
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
    SELECT * FROM "__mj"."vwGraphTypes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateGraphType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateGraphType" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GraphType table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_graph_type"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_graph_type" ON "__mj"."GraphType";

CREATE TRIGGER "trg_update_graph_type"
BEFORE UPDATE ON "__mj"."GraphType"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_graph_type"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Graph Types
-- Item: spDeleteGraphType
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR GraphType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteGraphType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteGraphType"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."GraphType"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteGraphType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteGraphType" TO "cdp_Integration";

-- ===================== HAND-FINISHED (v6.3.0-edge.2 release build) =====================
-- RelatedEntityNameFieldMap calls. The SQL Server CodeGen section sets these with
-- EXEC spUpdateEntityFieldRelatedEntityNameFieldMap; the split converter reports those EXECs as unhandled
-- (blocking the bake, so they were removed from the bake input) and the bake does not carry them, so a PG
-- database built by mj migrate would leave the map NULL. On PostgreSQL the routine is a FUNCTION, so the
-- calls are PERFORM with named arguments (same form as V202609091200 / V202611161546).

/* related entity name field map for entity field 531A3948-3CBB-4209-8E3C-3079D15AF7F2 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '531A3948-3CBB-4209-8E3C-3079D15AF7F2'::uuid,
    p_relatedentitynamefieldmap := 'Artifact'
  );
END $$;

/* related entity name field map for entity field F07B7C51-F532-48E1-B4C1-31F8B34B76AC */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'F07B7C51-F532-48E1-B4C1-31F8B34B76AC'::uuid,
    p_relatedentitynamefieldmap := 'ArtifactVersion'
  );
END $$;

/* related entity name field map for entity field 5CD350B5-2FE5-42DA-957B-A6E9C9E6E47E */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '5CD350B5-2FE5-42DA-957B-A6E9C9E6E47E'::uuid,
    p_relatedentitynamefieldmap := 'CreatedByUser'
  );
END $$;

/* related entity name field map for entity field 5C1D514D-8B19-4A9F-81C6-62FF2A528384 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '5C1D514D-8B19-4A9F-81C6-62FF2A528384'::uuid,
    p_relatedentitynamefieldmap := 'DefaultAuthorityTier'
  );
END $$;
-- ===================== END HAND-FINISHED =====================
