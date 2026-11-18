-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611170732__v6.3.x__ContentPipeline_Discover_State.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."ContentSource"
ADD COLUMN "DiscoverState" TEXT NULL /* ===================================================================================== */ /* Content pipeline: a Discover walk can stop and carry on in its next run */ /* A source too large to walk in one run (a long website crawl, a big API listing) had */ /* either to finish in one go or start again from the top every time. A driver may now */ /* stop part-way (when the walk's time budget, Options.Tuning DiscoverWalkBudgetMs, runs */ /* out) and return a resume token; the next walk receives it and carries on from there. */ /* This column holds that state between runs, as JSON: */ /*   ResumeToken    The driver's token: where the walk stopped. */ /*   WalkStartedAt  When the walk's first part started. LastDiscoveredAt takes it once the */ /*                  walk finishes, so a page changed while the walk was in progress is */ /*                  still seen as changed by the next walk. */ /*   Mode           'Discover' or 'Sync'. A walk resumes only in the mode it started in. */ /*   ItemsFound     Items the walk's earlier parts found. */ /* NULL means no walk is in progress. Until the walk finishes the source stays due: */ /* ForceDiscovery stays set and LastDiscoveredAt / LastSyncedAt are not moved. */ /* ===================================================================================== */;

COMMENT ON COLUMN __mj."ContentSource"."DiscoverState" IS 'Where an unfinished Discover or Sync walk of this source stopped, as JSON: the driver''s ResumeToken, WalkStartedAt (when the walk''s first part started), Mode and ItemsFound. The next walk carries on from it; cleared when a walk finishes. NULL when no walk is in progress.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b3d486b1-9842-44e4-9fd9-713a7b395031' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'DiscoverState')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b3d486b1-9842-44e4-9fd9-713a7b395031', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Sources */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'), 'DiscoverState', 'Discover State', 'Where an unfinished Discover or Sync walk of this source stopped, as JSON: the driver''s ResumeToken, WalkStartedAt (when the walk''s first part started), Mode and ItemsFound. The next walk carries on from it; cleared when a walk finishes. NULL when no walk is in progress.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set categories for 1 field */
/* UPDATE Entity Field Category Info MJ: Content Sources.DiscoverState */
UPDATE __mj."EntityField" SET "Category" = 'Processing & Automation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'B3D486B1-9842-44E4-9FD9-713A7B395031';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
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
          AND t.relname = 'ContentSource'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ContentTypeID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_content_type_id"
            ON "__mj"."ContentSource" ("ContentTypeID");
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
          AND t.relname = 'ContentSource'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ContentSourceTypeID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_content_source_type_id"
            ON "__mj"."ContentSource" ("ContentSourceTypeID");
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
          AND t.relname = 'ContentSource'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ContentFileTypeID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_content_file_type_id"
            ON "__mj"."ContentSource" ("ContentFileTypeID");
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
          AND t.relname = 'ContentSource'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EmbeddingModelID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_embedding_model_id"
            ON "__mj"."ContentSource" ("EmbeddingModelID");
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
          AND t.relname = 'ContentSource'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'VectorIndexID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_vector_index_id"
            ON "__mj"."ContentSource" ("VectorIndexID");
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
          AND t.relname = 'ContentSource'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EntityID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_entity_id"
            ON "__mj"."ContentSource" ("EntityID");
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
          AND t.relname = 'ContentSource'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EntityDocumentID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_entity_document_id"
            ON "__mj"."ContentSource" ("EntityDocumentID");
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
          AND t.relname = 'ContentSource'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ScheduledJobID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_scheduled_job_id"
            ON "__mj"."ContentSource" ("ScheduledJobID");
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
          AND t.relname = 'ContentSource'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'GraphID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_graph_id"
            ON "__mj"."ContentSource" ("GraphID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: vwContentSources
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Sources
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwContentSources"
AS
SELECT
    c.*,
    MJContentType_ContentTypeID."Name" AS "ContentType",
    MJContentSourceType_ContentSourceTypeID."Name" AS "ContentSourceType",
    MJContentFileType_ContentFileTypeID."Name" AS "ContentFileType",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJVectorIndex_VectorIndexID."Name" AS "VectorIndex",
    MJEntity_EntityID."Name" AS "Entity",
    MJEntityDocument_EntityDocumentID."Name" AS "EntityDocument",
    MJScheduledJob_ScheduledJobID."Name" AS "ScheduledJob",
    MJGraph_GraphID."Name" AS "Graph"
FROM
    "__mj"."ContentSource" AS c
LEFT OUTER JOIN
    "__mj"."ContentType" AS MJContentType_ContentTypeID
  ON
    "c"."ContentTypeID" = MJContentType_ContentTypeID."ID"
LEFT OUTER JOIN
    "__mj"."ContentSourceType" AS MJContentSourceType_ContentSourceTypeID
  ON
    "c"."ContentSourceTypeID" = MJContentSourceType_ContentSourceTypeID."ID"
LEFT OUTER JOIN
    "__mj"."ContentFileType" AS MJContentFileType_ContentFileTypeID
  ON
    "c"."ContentFileTypeID" = MJContentFileType_ContentFileTypeID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "c"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    "__mj"."VectorIndex" AS MJVectorIndex_VectorIndexID
  ON
    "c"."VectorIndexID" = MJVectorIndex_VectorIndexID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "c"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "__mj"."EntityDocument" AS MJEntityDocument_EntityDocumentID
  ON
    "c"."EntityDocumentID" = MJEntityDocument_EntityDocumentID."ID"
LEFT OUTER JOIN
    "__mj"."ScheduledJob" AS MJScheduledJob_ScheduledJobID
  ON
    "c"."ScheduledJobID" = MJScheduledJob_ScheduledJobID."ID"
LEFT OUTER JOIN
    "__mj"."Graph" AS MJGraph_GraphID
  ON
    "c"."GraphID" = MJGraph_GraphID."ID"
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
        AND tc.relname = 'vwContentSources'
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
                           AND tc.relname = 'vwContentSources'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwContentSources" CASCADE;
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
GRANT SELECT ON "__mj"."vwContentSources" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwContentSources" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentSources" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spCreateContentSource
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateContentSource"(
    p_id UUID DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_entitydocumentid_clear boolean DEFAULT false,
    p_entitydocumentid UUID DEFAULT NULL,
    p_scheduledjobid_clear boolean DEFAULT false,
    p_scheduledjobid uuid DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_forcediscovery BOOLEAN DEFAULT NULL,
    p_lastdiscoveredat_clear boolean DEFAULT false,
    p_lastdiscoveredat TIMESTAMPTZ DEFAULT NULL,
    p_lastsyncedat_clear boolean DEFAULT false,
    p_lastsyncedat TIMESTAMPTZ DEFAULT NULL,
    p_graphid_clear boolean DEFAULT false,
    p_graphid UUID DEFAULT NULL,
    p_discoverstate_clear boolean DEFAULT false,
    p_discoverstate TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentSources" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ContentSource"
        (
            "ID",
            "Name",
                "ContentTypeID",
                "ContentSourceTypeID",
                "ContentFileTypeID",
                "URL",
                "EmbeddingModelID",
                "VectorIndexID",
                "Configuration",
                "EntityID",
                "EntityDocumentID",
                "ScheduledJobID",
                "SegmenterKey",
                "CleanerKey",
                "FieldConfidence",
                "ForceDiscovery",
                "LastDiscoveredAt",
                "LastSyncedAt",
                "GraphID",
                "DiscoverState"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, NULL) END,
                p_contenttypeid,
                p_contentsourcetypeid,
                p_contentfiletypeid,
                p_url,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, NULL) END,
                CASE WHEN p_entitydocumentid_clear = true THEN NULL ELSE COALESCE(p_entitydocumentid, NULL) END,
                CASE WHEN p_scheduledjobid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobid, NULL) END,
                CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, NULL) END,
                CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, NULL) END,
                CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, NULL) END,
                COALESCE(p_forcediscovery, FALSE),
                CASE WHEN p_lastdiscoveredat_clear = true THEN NULL ELSE COALESCE(p_lastdiscoveredat, NULL) END,
                CASE WHEN p_lastsyncedat_clear = true THEN NULL ELSE COALESCE(p_lastsyncedat, NULL) END,
                CASE WHEN p_graphid_clear = true THEN NULL ELSE COALESCE(p_graphid, NULL) END,
                CASE WHEN p_discoverstate_clear = true THEN NULL ELSE COALESCE(p_discoverstate, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwContentSources"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentSource" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spUpdateContentSource
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateContentSource"(
    p_id UUID,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_entitydocumentid_clear boolean DEFAULT false,
    p_entitydocumentid UUID DEFAULT NULL,
    p_scheduledjobid_clear boolean DEFAULT false,
    p_scheduledjobid uuid DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_forcediscovery BOOLEAN DEFAULT NULL,
    p_lastdiscoveredat_clear boolean DEFAULT false,
    p_lastdiscoveredat TIMESTAMPTZ DEFAULT NULL,
    p_lastsyncedat_clear boolean DEFAULT false,
    p_lastsyncedat TIMESTAMPTZ DEFAULT NULL,
    p_graphid_clear boolean DEFAULT false,
    p_graphid UUID DEFAULT NULL,
    p_discoverstate_clear boolean DEFAULT false,
    p_discoverstate TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentSources" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ContentSource"
    SET
        "Name" = CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, "Name") END,
        "ContentTypeID" = COALESCE(p_contenttypeid, "ContentTypeID"),
        "ContentSourceTypeID" = COALESCE(p_contentsourcetypeid, "ContentSourceTypeID"),
        "ContentFileTypeID" = COALESCE(p_contentfiletypeid, "ContentFileTypeID"),
        "URL" = COALESCE(p_url, "URL"),
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "VectorIndexID" = CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, "VectorIndexID") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "EntityID" = CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, "EntityID") END,
        "EntityDocumentID" = CASE WHEN p_entitydocumentid_clear = true THEN NULL ELSE COALESCE(p_entitydocumentid, "EntityDocumentID") END,
        "ScheduledJobID" = CASE WHEN p_scheduledjobid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobid, "ScheduledJobID") END,
        "SegmenterKey" = CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, "SegmenterKey") END,
        "CleanerKey" = CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, "CleanerKey") END,
        "FieldConfidence" = CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, "FieldConfidence") END,
        "ForceDiscovery" = COALESCE(p_forcediscovery, "ForceDiscovery"),
        "LastDiscoveredAt" = CASE WHEN p_lastdiscoveredat_clear = true THEN NULL ELSE COALESCE(p_lastdiscoveredat, "LastDiscoveredAt") END,
        "LastSyncedAt" = CASE WHEN p_lastsyncedat_clear = true THEN NULL ELSE COALESCE(p_lastsyncedat, "LastSyncedAt") END,
        "GraphID" = CASE WHEN p_graphid_clear = true THEN NULL ELSE COALESCE(p_graphid, "GraphID") END,
        "DiscoverState" = CASE WHEN p_discoverstate_clear = true THEN NULL ELSE COALESCE(p_discoverstate, "DiscoverState") END,
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
    SELECT * FROM "__mj"."vwContentSources"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentSource" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSource table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_content_source"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_source" ON "__mj"."ContentSource";

CREATE TRIGGER "trg_update_content_source"
BEFORE UPDATE ON "__mj"."ContentSource"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_content_source"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spDeleteContentSource
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteContentSource"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ContentSource"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentSource" TO "cdp_Integration";
