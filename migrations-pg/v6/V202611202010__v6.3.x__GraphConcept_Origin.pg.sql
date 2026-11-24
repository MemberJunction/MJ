-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611202010__v6.3.x__GraphConcept_Origin.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."GraphConcept"
  ADD COLUMN "Origin" VARCHAR(20) NOT NULL DEFAULT (
    'Declared'
  ),
  ADD CONSTRAINT "CK_GraphConcept_Origin" CHECK ("Origin" IN ('Declared', 'Inferred'))
 /* ============================================================================= */ /* MJ: Graph Concepts gain Origin ('Declared' | 'Inferred'), matching MJ: Graph Edges. */ /* A concept the Content Pipeline synthesizes from document chunks can quote any of */ /* them, so the graph engine's provenance policy shows it only to someone who can */ /* read its sources (its SourcedFrom edges). A concept a person authored has no */ /* SourcedFrom edges and is visible to anyone who can read concepts. */ /* Without Origin those two cases are indistinguishable once a synthesized concept */ /* loses its last source: a re-indexed or deleted document retracts its chunks' */ /* edges, and the orphaned concept would then read as authored and become visible */ /* to everyone. Origin keeps the distinction: an Inferred concept with no visible */ /* source stays hidden. */ /* Backfill: every existing concept that is the source of a SourcedFrom edge was */ /* synthesized by the pipeline, so it is marked Inferred. */ /* ============================================================================= */;

-- [edge.2 hand-fix] T-SQL UPDATE <alias> ... FROM <table> AS <alias> was emitted as UPDATE "c" ... FROM ... AS "c"
-- (relation "c" does not exist). PostgreSQL form: UPDATE <table> AS <alias> SET <col> (no alias on the SET target).
UPDATE __mj."GraphConcept" AS "c" SET "Origin" = 'Inferred'
WHERE
  EXISTS(
    SELECT
      1
    FROM __mj."GraphEdge" AS "e"
    INNER JOIN __mj."GraphEdgeType" AS "t"
      ON "t"."ID" = "e"."EdgeTypeID"
    INNER JOIN __mj."Entity" AS "en"
      ON "en"."ID" = "e"."SourceEntityID"
    WHERE
      "t"."Name" = 'SourcedFrom'
      AND "en"."Name" = 'MJ: Graph Concepts'
      AND "e"."SourceRecordID" = CAST("c"."ID" AS VARCHAR(400))
  );

COMMENT ON COLUMN __mj."GraphConcept"."Origin" IS 'How the concept came to exist. Declared: authored by a person or seeded; visible to anyone who can read concepts. Inferred: synthesized by the Content Pipeline from document chunks; visible only to someone who can read its sources (SourcedFrom edges), unless it is Approved in a Canon graph.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8c992b61-974d-49e5-8886-9290dd9eea71' OR ("EntityID" = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND "Name" = 'Origin')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8c992b61-974d-49e5-8886-9290dd9eea71', '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' /* Entity: MJ: Graph Concepts */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'), 'Origin', 'Origin', 'How the concept came to exist. Declared: authored by a person or seeded; visible to anyone who can read concepts. Inferred: synthesized by the Content Pipeline from document chunks; visible only to someone who can read its sources (SourcedFrom edges), unless it is Approved in a Canon graph.', 'nvarchar', 40, 0, 0, FALSE, 'Declared', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to sync 2 entity field value row(s) for entity field ID 8C992B61-974D-49E5-8886-9290DD9EEA71 */
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
    'a6e991d7-f8ad-47c8-b2b5-886eb84b9778',
    '8C992B61-974D-49E5-8886-9290DD9EEA71',
    1,
    'Declared',
    'Declared',
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
    '912368a3-4f59-4ae4-b4de-b5daa1ff1819',
    '8C992B61-974D-49E5-8886-9290DD9EEA71',
    2,
    'Inferred',
    'Inferred',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 8C992B61-974D-49E5-8886-9290DD9EEA71 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '8C992B61-974D-49E5-8886-9290DD9EEA71';
/* Update attributes on "MJ: Conversations" from additionalSchemaInfo */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW(), "SubtypeSelector" = '{"Path": "TypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "TypeID.DriverClass", "BaseClass": "ConversationTypeDriver"}}'
WHERE
  "ID" = '13248F34-2837-EF11-86D4-6045BDEE16E6';
/* Update attributes on "MJ: Comments" from additionalSchemaInfo */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW(), "SubtypeSelector" = '{"Path": "CommentTypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "CommentTypeID.DriverClass", "BaseClass": "CommentTypeDriver"}, "UIDriver": {"Path": "CommentTypeID.UIDriverClass"}}'
WHERE
  "ID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Graph Concepts
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
          AND t.relname = 'GraphConcept'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'GraphID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_graph_concept_graph_id"
            ON "__mj"."GraphConcept" ("GraphID");
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
          AND t.relname = 'GraphConcept'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ParentID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_graph_concept_parent_id"
            ON "__mj"."GraphConcept" ("ParentID");
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
          AND t.relname = 'GraphConcept'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ConceptTypeID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_graph_concept_concept_type_id"
            ON "__mj"."GraphConcept" ("ConceptTypeID");
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
          AND t.relname = 'GraphConcept'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'AuthorityTierID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_graph_concept_authority_tier_id"
            ON "__mj"."GraphConcept" ("AuthorityTierID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Graph Concepts
-- Item: vwGraphConcepts
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Graph Concepts
-----               SCHEMA:      __mj
-----               BASE TABLE:  GraphConcept
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwGraphConcepts"
AS
SELECT
    g.*,
    MJGraph_GraphID."Name" AS "Graph",
    MJGraphConcept_ParentID."Name" AS "Parent",
    MJGraphConceptType_ConceptTypeID."Name" AS "ConceptType",
    MJGraphAuthorityTier_AuthorityTierID."Name" AS "AuthorityTier"
FROM
    "__mj"."GraphConcept" AS g
LEFT OUTER JOIN
    "__mj"."Graph" AS MJGraph_GraphID
  ON
    "g"."GraphID" = MJGraph_GraphID."ID"
LEFT OUTER JOIN
    "__mj"."GraphConcept" AS MJGraphConcept_ParentID
  ON
    "g"."ParentID" = MJGraphConcept_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."GraphConceptType" AS MJGraphConceptType_ConceptTypeID
  ON
    "g"."ConceptTypeID" = MJGraphConceptType_ConceptTypeID."ID"
LEFT OUTER JOIN
    "__mj"."GraphAuthorityTier" AS MJGraphAuthorityTier_AuthorityTierID
  ON
    "g"."AuthorityTierID" = MJGraphAuthorityTier_AuthorityTierID."ID"
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
        AND tc.relname = 'vwGraphConcepts'
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
                           AND tc.relname = 'vwGraphConcepts'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwGraphConcepts" CASCADE;
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
GRANT SELECT ON "__mj"."vwGraphConcepts" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwGraphConcepts" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwGraphConcepts" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Graph Concepts
-- Item: spCreateGraphConcept
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR GraphConcept
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateGraphConcept'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateGraphConcept"(
    p_id UUID DEFAULT NULL,
    p_graphid UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_concepttypeid UUID DEFAULT NULL,
    p_authoritytierid_clear boolean DEFAULT false,
    p_authoritytierid UUID DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_specification_clear boolean DEFAULT false,
    p_specification TEXT DEFAULT NULL,
    p_synonyms_clear boolean DEFAULT false,
    p_synonyms TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_origin varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwGraphConcepts" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."GraphConcept"
        (
            "ID",
            "GraphID",
                "ParentID",
                "Name",
                "ConceptTypeID",
                "AuthorityTierID",
                "Description",
                "Specification",
                "Synonyms",
                "Status",
                "Origin"
        )
    VALUES
        (
            v_new_id,
            p_graphid,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                p_name,
                p_concepttypeid,
                CASE WHEN p_authoritytierid_clear = true THEN NULL ELSE COALESCE(p_authoritytierid, NULL) END,
                p_description,
                CASE WHEN p_specification_clear = true THEN NULL ELSE COALESCE(p_specification, NULL) END,
                CASE WHEN p_synonyms_clear = true THEN NULL ELSE COALESCE(p_synonyms, NULL) END,
                COALESCE(p_status, 'Draft'),
                COALESCE(p_origin, 'Declared')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwGraphConcepts"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateGraphConcept" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateGraphConcept" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Graph Concepts
-- Item: spUpdateGraphConcept
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR GraphConcept
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateGraphConcept'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateGraphConcept"(
    p_id UUID,
    p_graphid UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_concepttypeid UUID DEFAULT NULL,
    p_authoritytierid_clear boolean DEFAULT false,
    p_authoritytierid UUID DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_specification_clear boolean DEFAULT false,
    p_specification TEXT DEFAULT NULL,
    p_synonyms_clear boolean DEFAULT false,
    p_synonyms TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_origin varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwGraphConcepts" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."GraphConcept"
    SET
        "GraphID" = COALESCE(p_graphid, "GraphID"),
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Name" = COALESCE(p_name, "Name"),
        "ConceptTypeID" = COALESCE(p_concepttypeid, "ConceptTypeID"),
        "AuthorityTierID" = CASE WHEN p_authoritytierid_clear = true THEN NULL ELSE COALESCE(p_authoritytierid, "AuthorityTierID") END,
        "Description" = COALESCE(p_description, "Description"),
        "Specification" = CASE WHEN p_specification_clear = true THEN NULL ELSE COALESCE(p_specification, "Specification") END,
        "Synonyms" = CASE WHEN p_synonyms_clear = true THEN NULL ELSE COALESCE(p_synonyms, "Synonyms") END,
        "Status" = COALESCE(p_status, "Status"),
        "Origin" = COALESCE(p_origin, "Origin"),
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
    SELECT * FROM "__mj"."vwGraphConcepts"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateGraphConcept" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateGraphConcept" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GraphConcept table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_graph_concept"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_graph_concept" ON "__mj"."GraphConcept";

CREATE TRIGGER "trg_update_graph_concept"
BEFORE UPDATE ON "__mj"."GraphConcept"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_graph_concept"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Graph Concepts
-- Item: spDeleteGraphConcept
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR GraphConcept
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteGraphConcept'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteGraphConcept"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."GraphConcept"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteGraphConcept" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteGraphConcept" TO "cdp_Integration";
