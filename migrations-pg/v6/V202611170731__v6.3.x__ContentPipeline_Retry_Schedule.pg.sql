-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611170731__v6.3.x__ContentPipeline_Retry_Schedule.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."ContentItem"
  ADD COLUMN "RetryCount" INT NOT NULL DEFAULT 0 CONSTRAINT "CK_ContentItem_RetryCount" CHECK ("RetryCount" >= 0),
  ADD COLUMN "RetryAfter" TIMESTAMPTZ NULL
 /* ===================================================================================== */ /* Content pipeline retry schedule: a Retry outcome waits, with backoff, instead of failing */ /* A pipeline stage answers a passing failure (a provider's rate limit, a timeout, a */ /* stage out of its time budget) with a Retry outcome. Until now the pipeline committed */ /* every outcome but Complete and Skipped as the stage's 'Failed' status, and no stage's */ /* readiness filter selects 'Failed', so a record a stage asked to try again stayed */ /* failed for good. */ /* A Retry now leaves the record's status ready and sets a wait instead. These two */ /* columns hold it, on both entities the pipeline's stages run over: */ /*   RetryCount  Retry outcomes in a row since a stage last settled the record; each one */ /*               doubles the wait (Options.Tuning RetryBackoffBaseMs, RetryBackoffMaxMs). */ /*   RetryAfter  The earliest time a stage may pick the record up again. Every pipeline */ /*               Record Process's ScopeFilter skips the record until then. */ /* A commit that settles the record (Complete, Skipped, Failed), and new content that */ /* resets the downstream stages, clear both. */ /* The schedule is per record, not per stage: when two stages are both ready on a Content */ /* Item (Tag and Segment), a Retry from one delays the other until the wait has passed. */ /* ===================================================================================== */;

ALTER TABLE __mj."ContentItemChunk"
  ADD COLUMN "RetryCount" INT NOT NULL DEFAULT 0 CONSTRAINT "CK_ContentItemChunk_RetryCount" CHECK ("RetryCount" >= 0),
  ADD COLUMN "RetryAfter" TIMESTAMPTZ NULL;

COMMENT ON COLUMN __mj."ContentItem"."RetryCount" IS 'Retry outcomes in a row since a content pipeline stage last settled this item. Each one doubles the wait before the next attempt (RetryAfter). Reset to 0 when a stage completes, skips or fails the item, or when its content changes.';

COMMENT ON COLUMN __mj."ContentItem"."RetryAfter" IS 'The earliest time a content pipeline stage may pick this item up again, after a Retry outcome. Every pipeline Record Process skips the item until then. NULL means no wait.';

COMMENT ON COLUMN __mj."ContentItemChunk"."RetryCount" IS 'Retry outcomes in a row since a content pipeline stage last settled this chunk. Each one doubles the wait before the next attempt (RetryAfter). Reset to 0 when a stage completes, skips or fails the chunk.';

COMMENT ON COLUMN __mj."ContentItemChunk"."RetryAfter" IS 'The earliest time a content pipeline stage may pick this chunk up again, after a Retry outcome. Every pipeline Record Process skips the chunk until then. NULL means no wait.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cf23aed7-8023-41a9-81bf-d1b35bdfc69e' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'RetryCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cf23aed7-8023-41a9-81bf-d1b35bdfc69e', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'RetryCount', 'Retry Count', 'Retry outcomes in a row since a content pipeline stage last settled this item. Each one doubles the wait before the next attempt (RetryAfter). Reset to 0 when a stage completes, skips or fails the item, or when its content changes.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8c00d92-af4b-4e2a-8542-3e66fb83e510' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'RetryAfter')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d8c00d92-af4b-4e2a-8542-3e66fb83e510', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'RetryAfter', 'Retry After', 'The earliest time a content pipeline stage may pick this item up again, after a Retry outcome. Every pipeline Record Process skips the item until then. NULL means no wait.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '61ab11e6-4bdb-406f-8daa-2817078a2bd0' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'RetryCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('61ab11e6-4bdb-406f-8daa-2817078a2bd0', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21'), 'RetryCount', 'Retry Count', 'Retry outcomes in a row since a content pipeline stage last settled this chunk. Each one doubles the wait before the next attempt (RetryAfter). Reset to 0 when a stage completes, skips or fails the chunk.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9186cc7e-cc6d-4141-90db-e2d2676bda5f' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'RetryAfter')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9186cc7e-cc6d-4141-90db-e2d2676bda5f', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21'), 'RetryAfter', 'Retry After', 'The earliest time a content pipeline stage may pick this chunk up again, after a Retry outcome. Every pipeline Record Process skips the chunk until then. NULL means no wait.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set categories for 2 fields */
/* UPDATE Entity Field Category Info MJ: Content Items.RetryCount */
UPDATE __mj."EntityField" SET "Category" = 'AI & Vectorization', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CF23AED7-8023-41A9-81BF-D1B35BDFC69E';
/* UPDATE Entity Field Category Info MJ: Content Items.RetryAfter */
UPDATE __mj."EntityField" SET "Category" = 'AI & Vectorization', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D8C00D92-AF4B-4E2A-8542-3E66FB83E510';

/* Set categories for 2 fields */
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.RetryCount */
UPDATE __mj."EntityField" SET "Category" = 'Processing State', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '61AB11E6-4BDB-406F-8DAA-2817078A2BD0';
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.RetryAfter */
UPDATE __mj."EntityField" SET "Category" = 'Processing State', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9186CC7E-CC6D-4141-90DB-E2D2676BDA5F';

/* Update FieldCategoryInfo setting for entity */
UPDATE __mj."EntitySetting" SET "Value" = '{
  "Processing State": {
    "description": "Pipeline retry counts and scheduling timestamps for chunk processing",
    "icon": "fa fa-redo"
  },
  "Provenance": {
    "description": "Source location tracking using offsets, time windows, or page numbers",
    "icon": "fa fa-map-marked-alt"
  }
}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21'
  AND "Name" = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */
UPDATE __mj."EntitySetting" SET "Value" = '{
  "Processing State": "fa fa-redo",
  "Provenance": "fa fa-map-marked-alt"
}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21'
  AND "Name" = 'FieldCategoryIcons';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
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
          AND t.relname = 'ContentItemChunk'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ContentItemID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_chunk_content_item_id"
            ON "__mj"."ContentItemChunk" ("ContentItemID");
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
          AND t.relname = 'ContentItemChunk'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ParentChunkID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_chunk_parent_chunk_id"
            ON "__mj"."ContentItemChunk" ("ParentChunkID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: fn_content_item_chunk_parent_chunk_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: ContentItemChunk.ParentChunkID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_chunk_parent_chunk_id_get_hierarchy_meta"(
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
            "ParentChunkID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItemChunk"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentChunkID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."ContentItemChunk" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentChunkID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        a.depth::INTEGER AS "Depth",
        a.path::TEXT AS "Path",
        (ch.child_count = 0)::BOOLEAN AS "IsLeaf",
        ch.child_count AS "ChildCount"
    FROM
        cte_ancestors a
    CROSS JOIN LATERAL (
        SELECT COUNT(1)::INTEGER AS child_count
        FROM "__mj"."ContentItemChunk"
        WHERE "ParentChunkID" = p_record_id
    ) ch
    WHERE
        a."ParentChunkID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: fn_content_item_chunk_parent_chunk_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: ContentItemChunk.ParentChunkID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_chunk_parent_chunk_id_get_descendants"(
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
            "ParentChunkID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItemChunk"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentChunkID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItemChunk" c
        INNER JOIN
            cte_descendants p ON c."ParentChunkID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."ContentItemChunk" WHERE "ParentChunkID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."ContentItemChunk" WHERE "ParentChunkID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: fn_content_item_chunk_parent_chunk_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: ContentItemChunk.ParentChunkID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_chunk_parent_chunk_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentChunkID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItemChunk"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentChunkID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."ContentItemChunk" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentChunkID"
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
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: fn_content_item_chunk_parent_chunk_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ContentItemChunk.ParentChunkID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_chunk_parent_chunk_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentChunkID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."ContentItemChunk"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentChunkID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."ContentItemChunk" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentChunkID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentChunkID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: vwContentItemChunks
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Chunks
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentItemChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwContentItemChunks"
AS
SELECT
    c.*,
    MJContentItem_ContentItemID."Name" AS "ContentItem",
    MJContentItemChunk_ParentChunkID."SegmentTitle" AS "ParentChunk",
    hier_ParentChunkID."RootID" AS "RootParentChunkID",
    hier_ParentChunkID."Depth" AS "ParentChunkIDDepth",
    hier_ParentChunkID."Path" AS "ParentChunkIDPath",
    hier_ParentChunkID."IsLeaf" AS "ParentChunkIDIsLeaf",
    hier_ParentChunkID."ChildCount" AS "ParentChunkIDChildCount"
FROM
    "__mj"."ContentItemChunk" AS c
LEFT OUTER JOIN
    "__mj"."ContentItem" AS MJContentItem_ContentItemID
  ON
    "c"."ContentItemID" = MJContentItem_ContentItemID."ID"
LEFT OUTER JOIN
    "__mj"."ContentItemChunk" AS MJContentItemChunk_ParentChunkID
  ON
    "c"."ParentChunkID" = MJContentItemChunk_ParentChunkID."ID"

LEFT JOIN LATERAL "__mj"."fn_content_item_chunk_parent_chunk_id_get_hierarchy_meta"(c."ID", c."ParentChunkID") AS hier_ParentChunkID ON true
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
        AND tc.relname = 'vwContentItemChunks'
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
                           AND tc.relname = 'vwContentItemChunks'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwContentItemChunks" CASCADE;
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
GRANT SELECT ON "__mj"."vwContentItemChunks" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentItemChunks" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwContentItemChunks" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spCreateContentItemChunk
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateContentItemChunk"(
    p_id UUID DEFAULT NULL,
    p_contentitemid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_lastdeletedat_clear boolean DEFAULT false,
    p_lastdeletedat TIMESTAMPTZ DEFAULT NULL,
    p_modality varchar(20) DEFAULT NULL,
    p_startoffset_clear boolean DEFAULT false,
    p_startoffset int DEFAULT NULL,
    p_endoffset_clear boolean DEFAULT false,
    p_endoffset int DEFAULT NULL,
    p_startms_clear boolean DEFAULT false,
    p_startms int DEFAULT NULL,
    p_endms_clear boolean DEFAULT false,
    p_endms int DEFAULT NULL,
    p_pagenumber_clear boolean DEFAULT false,
    p_pagenumber int DEFAULT NULL,
    p_segmenttitle_clear boolean DEFAULT false,
    p_segmenttitle varchar(500) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transcript_clear boolean DEFAULT false,
    p_transcript TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_parentchunkid_clear boolean DEFAULT false,
    p_parentchunkid UUID DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_decorator_clear boolean DEFAULT false,
    p_decorator TEXT DEFAULT NULL,
    p_retrycount int DEFAULT NULL,
    p_retryafter_clear boolean DEFAULT false,
    p_retryafter TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentItemChunks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ContentItemChunk"
        (
            "ID",
            "ContentItemID",
                "Sequence",
                "Text",
                "VectorRecordID",
                "EmbeddingStatus",
                "TaggingStatus",
                "DeleteStatus",
                "LastEmbeddedAt",
                "LastTaggedAt",
                "LastDeletedAt",
                "Modality",
                "StartOffset",
                "EndOffset",
                "StartMs",
                "EndMs",
                "PageNumber",
                "SegmentTitle",
                "Description",
                "Transcript",
                "SegmenterKey",
                "ParentChunkID",
                "FieldConfidence",
                "Decorator",
                "RetryCount",
                "RetryAfter"
        )
    VALUES
        (
            v_new_id,
            p_contentitemid,
                p_sequence,
                CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, NULL) END,
                CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, NULL) END,
                COALESCE(p_embeddingstatus, 'Pending'),
                COALESCE(p_taggingstatus, 'Pending'),
                CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, NULL) END,
                CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, NULL) END,
                CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, NULL) END,
                CASE WHEN p_lastdeletedat_clear = true THEN NULL ELSE COALESCE(p_lastdeletedat, NULL) END,
                COALESCE(p_modality, 'text'),
                CASE WHEN p_startoffset_clear = true THEN NULL ELSE COALESCE(p_startoffset, NULL) END,
                CASE WHEN p_endoffset_clear = true THEN NULL ELSE COALESCE(p_endoffset, NULL) END,
                CASE WHEN p_startms_clear = true THEN NULL ELSE COALESCE(p_startms, NULL) END,
                CASE WHEN p_endms_clear = true THEN NULL ELSE COALESCE(p_endms, NULL) END,
                CASE WHEN p_pagenumber_clear = true THEN NULL ELSE COALESCE(p_pagenumber, NULL) END,
                CASE WHEN p_segmenttitle_clear = true THEN NULL ELSE COALESCE(p_segmenttitle, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_transcript_clear = true THEN NULL ELSE COALESCE(p_transcript, NULL) END,
                CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, NULL) END,
                CASE WHEN p_parentchunkid_clear = true THEN NULL ELSE COALESCE(p_parentchunkid, NULL) END,
                CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, NULL) END,
                CASE WHEN p_decorator_clear = true THEN NULL ELSE COALESCE(p_decorator, NULL) END,
                COALESCE(p_retrycount, 0),
                CASE WHEN p_retryafter_clear = true THEN NULL ELSE COALESCE(p_retryafter, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwContentItemChunks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItemChunk" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spUpdateContentItemChunk
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateContentItemChunk"(
    p_id UUID,
    p_contentitemid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_lastdeletedat_clear boolean DEFAULT false,
    p_lastdeletedat TIMESTAMPTZ DEFAULT NULL,
    p_modality varchar(20) DEFAULT NULL,
    p_startoffset_clear boolean DEFAULT false,
    p_startoffset int DEFAULT NULL,
    p_endoffset_clear boolean DEFAULT false,
    p_endoffset int DEFAULT NULL,
    p_startms_clear boolean DEFAULT false,
    p_startms int DEFAULT NULL,
    p_endms_clear boolean DEFAULT false,
    p_endms int DEFAULT NULL,
    p_pagenumber_clear boolean DEFAULT false,
    p_pagenumber int DEFAULT NULL,
    p_segmenttitle_clear boolean DEFAULT false,
    p_segmenttitle varchar(500) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transcript_clear boolean DEFAULT false,
    p_transcript TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_parentchunkid_clear boolean DEFAULT false,
    p_parentchunkid UUID DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_decorator_clear boolean DEFAULT false,
    p_decorator TEXT DEFAULT NULL,
    p_retrycount int DEFAULT NULL,
    p_retryafter_clear boolean DEFAULT false,
    p_retryafter TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentItemChunks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ContentItemChunk"
    SET
        "ContentItemID" = COALESCE(p_contentitemid, "ContentItemID"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Text" = CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, "Text") END,
        "VectorRecordID" = CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, "VectorRecordID") END,
        "EmbeddingStatus" = COALESCE(p_embeddingstatus, "EmbeddingStatus"),
        "TaggingStatus" = COALESCE(p_taggingstatus, "TaggingStatus"),
        "DeleteStatus" = CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, "DeleteStatus") END,
        "LastEmbeddedAt" = CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, "LastEmbeddedAt") END,
        "LastTaggedAt" = CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, "LastTaggedAt") END,
        "LastDeletedAt" = CASE WHEN p_lastdeletedat_clear = true THEN NULL ELSE COALESCE(p_lastdeletedat, "LastDeletedAt") END,
        "Modality" = COALESCE(p_modality, "Modality"),
        "StartOffset" = CASE WHEN p_startoffset_clear = true THEN NULL ELSE COALESCE(p_startoffset, "StartOffset") END,
        "EndOffset" = CASE WHEN p_endoffset_clear = true THEN NULL ELSE COALESCE(p_endoffset, "EndOffset") END,
        "StartMs" = CASE WHEN p_startms_clear = true THEN NULL ELSE COALESCE(p_startms, "StartMs") END,
        "EndMs" = CASE WHEN p_endms_clear = true THEN NULL ELSE COALESCE(p_endms, "EndMs") END,
        "PageNumber" = CASE WHEN p_pagenumber_clear = true THEN NULL ELSE COALESCE(p_pagenumber, "PageNumber") END,
        "SegmentTitle" = CASE WHEN p_segmenttitle_clear = true THEN NULL ELSE COALESCE(p_segmenttitle, "SegmentTitle") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Transcript" = CASE WHEN p_transcript_clear = true THEN NULL ELSE COALESCE(p_transcript, "Transcript") END,
        "SegmenterKey" = CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, "SegmenterKey") END,
        "ParentChunkID" = CASE WHEN p_parentchunkid_clear = true THEN NULL ELSE COALESCE(p_parentchunkid, "ParentChunkID") END,
        "FieldConfidence" = CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, "FieldConfidence") END,
        "Decorator" = CASE WHEN p_decorator_clear = true THEN NULL ELSE COALESCE(p_decorator, "Decorator") END,
        "RetryCount" = COALESCE(p_retrycount, "RetryCount"),
        "RetryAfter" = CASE WHEN p_retryafter_clear = true THEN NULL ELSE COALESCE(p_retryafter, "RetryAfter") END,
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
    SELECT * FROM "__mj"."vwContentItemChunks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItemChunk" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemChunk table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_content_item_chunk"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_item_chunk" ON "__mj"."ContentItemChunk";

CREATE TRIGGER "trg_update_content_item_chunk"
BEFORE UPDATE ON "__mj"."ContentItemChunk"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_content_item_chunk"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spDeleteContentItemChunk
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteContentItemChunk"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ContentItemChunk"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItemChunk" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
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
          AND t.relname = 'ContentItem'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ContentSourceID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_content_source_id"
            ON "__mj"."ContentItem" ("ContentSourceID");
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
          AND t.relname = 'ContentItem'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ContentTypeID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_content_type_id"
            ON "__mj"."ContentItem" ("ContentTypeID");
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
          AND t.relname = 'ContentItem'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ContentSourceTypeID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_content_source_type_id"
            ON "__mj"."ContentItem" ("ContentSourceTypeID");
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
          AND t.relname = 'ContentItem'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ContentFileTypeID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_content_file_type_id"
            ON "__mj"."ContentItem" ("ContentFileTypeID");
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
          AND t.relname = 'ContentItem'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EntityRecordDocumentID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_entity_record_document_id"
            ON "__mj"."ContentItem" ("EntityRecordDocumentID");
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
          AND t.relname = 'ContentItem'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EmbeddingModelID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_embedding_model_id"
            ON "__mj"."ContentItem" ("EmbeddingModelID");
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
          AND t.relname = 'ContentItem'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ParentID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_parent_id"
            ON "__mj"."ContentItem" ("ParentID");
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
          AND t.relname = 'ContentItem'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'FileID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_file_id"
            ON "__mj"."ContentItem" ("FileID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: fn_content_item_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: ContentItem.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_parent_id_get_hierarchy_meta"(
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
            "__mj"."ContentItem"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."ContentItem" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        a.depth::INTEGER AS "Depth",
        a.path::TEXT AS "Path",
        (ch.child_count = 0)::BOOLEAN AS "IsLeaf",
        ch.child_count AS "ChildCount"
    FROM
        cte_ancestors a
    CROSS JOIN LATERAL (
        SELECT COUNT(1)::INTEGER AS child_count
        FROM "__mj"."ContentItem"
        WHERE "ParentID" = p_record_id
    ) ch
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: fn_content_item_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: ContentItem.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_parent_id_get_descendants"(
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
            "__mj"."ContentItem"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."ContentItem" c
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
        (NOT EXISTS (SELECT 1 FROM "__mj"."ContentItem" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."ContentItem" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: fn_content_item_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: ContentItem.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_parent_id_get_ancestors"(
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
            "__mj"."ContentItem"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."ContentItem" p
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
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: fn_content_item_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ContentItem.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_content_item_parent_id_get_root_id"(
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
            "__mj"."ContentItem"
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
            "__mj"."ContentItem" c
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
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: vwContentItems
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Items
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwContentItems"
AS
SELECT
    c.*,
    MJContentSource_ContentSourceID."Name" AS "ContentSource",
    MJContentType_ContentTypeID."Name" AS "ContentType",
    MJContentSourceType_ContentSourceTypeID."Name" AS "ContentSourceType",
    MJContentFileType_ContentFileTypeID."Name" AS "ContentFileType",
    MJEntityRecordDocument_EntityRecordDocumentID."RecordID" AS "EntityRecordDocument",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJContentItem_ParentID."Name" AS "Parent",
    MJFile_FileID."Name" AS "File",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."ContentItem" AS c
LEFT OUTER JOIN
    "__mj"."ContentSource" AS MJContentSource_ContentSourceID
  ON
    "c"."ContentSourceID" = MJContentSource_ContentSourceID."ID"
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
    "__mj"."EntityRecordDocument" AS MJEntityRecordDocument_EntityRecordDocumentID
  ON
    "c"."EntityRecordDocumentID" = MJEntityRecordDocument_EntityRecordDocumentID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "c"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    "__mj"."ContentItem" AS MJContentItem_ParentID
  ON
    "c"."ParentID" = MJContentItem_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."File" AS MJFile_FileID
  ON
    "c"."FileID" = MJFile_FileID."ID"

LEFT JOIN LATERAL "__mj"."fn_content_item_parent_id_get_hierarchy_meta"(c."ID", c."ParentID") AS hier_ParentID ON true
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
        AND tc.relname = 'vwContentItems'
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
                           AND tc.relname = 'vwContentItems'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwContentItems" CASCADE;
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
GRANT SELECT ON "__mj"."vwContentItems" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwContentItems" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentItems" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: spCreateContentItem
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateContentItem"(
    p_id UUID DEFAULT NULL,
    p_contentsourceid UUID DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(250) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_checksum_clear boolean DEFAULT false,
    p_checksum varchar(100) DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_entityrecorddocumentid_clear boolean DEFAULT false,
    p_entityrecorddocumentid UUID DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_displaylink_clear boolean DEFAULT false,
    p_displaylink varchar(2000) DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_extractionstatus_clear boolean DEFAULT false,
    p_extractionstatus varchar(40) DEFAULT NULL,
    p_segmentationstatus_clear boolean DEFAULT false,
    p_segmentationstatus varchar(40) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_extractorkey_clear boolean DEFAULT false,
    p_extractorkey varchar(100) DEFAULT NULL,
    p_extractorkeyoverride_clear boolean DEFAULT false,
    p_extractorkeyoverride varchar(100) DEFAULT NULL,
    p_modality_clear boolean DEFAULT false,
    p_modality varchar(20) DEFAULT NULL,
    p_date_clear boolean DEFAULT false,
    p_date TIMESTAMPTZ DEFAULT NULL,
    p_decorator_clear boolean DEFAULT false,
    p_decorator TEXT DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid UUID DEFAULT NULL,
    p_retrycount int DEFAULT NULL,
    p_retryafter_clear boolean DEFAULT false,
    p_retryafter TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentItems" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ContentItem"
        (
            "ID",
            "ContentSourceID",
                "Name",
                "Description",
                "ContentTypeID",
                "ContentSourceTypeID",
                "ContentFileTypeID",
                "Checksum",
                "URL",
                "Text",
                "EntityRecordDocumentID",
                "EmbeddingStatus",
                "LastEmbeddedAt",
                "EmbeddingModelID",
                "TaggingStatus",
                "LastTaggedAt",
                "VectorRecordID",
                "ParentID",
                "DisplayLink",
                "FieldConfidence",
                "ExtractionStatus",
                "SegmentationStatus",
                "DeleteStatus",
                "ExtractorKey",
                "ExtractorKeyOverride",
                "Modality",
                "Date",
                "Decorator",
                "FileID",
                "RetryCount",
                "RetryAfter"
        )
    VALUES
        (
            v_new_id,
            p_contentsourceid,
                CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_contenttypeid,
                p_contentsourcetypeid,
                p_contentfiletypeid,
                CASE WHEN p_checksum_clear = true THEN NULL ELSE COALESCE(p_checksum, NULL) END,
                p_url,
                CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, NULL) END,
                CASE WHEN p_entityrecorddocumentid_clear = true THEN NULL ELSE COALESCE(p_entityrecorddocumentid, NULL) END,
                COALESCE(p_embeddingstatus, 'Pending'),
                CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                COALESCE(p_taggingstatus, 'Pending'),
                CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, NULL) END,
                CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                CASE WHEN p_displaylink_clear = true THEN NULL ELSE COALESCE(p_displaylink, NULL) END,
                CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, NULL) END,
                CASE WHEN p_extractionstatus_clear = true THEN NULL ELSE COALESCE(p_extractionstatus, NULL) END,
                CASE WHEN p_segmentationstatus_clear = true THEN NULL ELSE COALESCE(p_segmentationstatus, NULL) END,
                CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, NULL) END,
                CASE WHEN p_extractorkey_clear = true THEN NULL ELSE COALESCE(p_extractorkey, NULL) END,
                CASE WHEN p_extractorkeyoverride_clear = true THEN NULL ELSE COALESCE(p_extractorkeyoverride, NULL) END,
                CASE WHEN p_modality_clear = true THEN NULL ELSE COALESCE(p_modality, NULL) END,
                CASE WHEN p_date_clear = true THEN NULL ELSE COALESCE(p_date, NULL) END,
                CASE WHEN p_decorator_clear = true THEN NULL ELSE COALESCE(p_decorator, NULL) END,
                CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, NULL) END,
                COALESCE(p_retrycount, 0),
                CASE WHEN p_retryafter_clear = true THEN NULL ELSE COALESCE(p_retryafter, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwContentItems"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentItem" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: spUpdateContentItem
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateContentItem"(
    p_id UUID,
    p_contentsourceid UUID DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(250) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_checksum_clear boolean DEFAULT false,
    p_checksum varchar(100) DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_entityrecorddocumentid_clear boolean DEFAULT false,
    p_entityrecorddocumentid UUID DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_displaylink_clear boolean DEFAULT false,
    p_displaylink varchar(2000) DEFAULT NULL,
    p_fieldconfidence_clear boolean DEFAULT false,
    p_fieldconfidence TEXT DEFAULT NULL,
    p_extractionstatus_clear boolean DEFAULT false,
    p_extractionstatus varchar(40) DEFAULT NULL,
    p_segmentationstatus_clear boolean DEFAULT false,
    p_segmentationstatus varchar(40) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_extractorkey_clear boolean DEFAULT false,
    p_extractorkey varchar(100) DEFAULT NULL,
    p_extractorkeyoverride_clear boolean DEFAULT false,
    p_extractorkeyoverride varchar(100) DEFAULT NULL,
    p_modality_clear boolean DEFAULT false,
    p_modality varchar(20) DEFAULT NULL,
    p_date_clear boolean DEFAULT false,
    p_date TIMESTAMPTZ DEFAULT NULL,
    p_decorator_clear boolean DEFAULT false,
    p_decorator TEXT DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid UUID DEFAULT NULL,
    p_retrycount int DEFAULT NULL,
    p_retryafter_clear boolean DEFAULT false,
    p_retryafter TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentItems" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ContentItem"
    SET
        "ContentSourceID" = COALESCE(p_contentsourceid, "ContentSourceID"),
        "Name" = CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, "Name") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ContentTypeID" = COALESCE(p_contenttypeid, "ContentTypeID"),
        "ContentSourceTypeID" = COALESCE(p_contentsourcetypeid, "ContentSourceTypeID"),
        "ContentFileTypeID" = COALESCE(p_contentfiletypeid, "ContentFileTypeID"),
        "Checksum" = CASE WHEN p_checksum_clear = true THEN NULL ELSE COALESCE(p_checksum, "Checksum") END,
        "URL" = COALESCE(p_url, "URL"),
        "Text" = CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, "Text") END,
        "EntityRecordDocumentID" = CASE WHEN p_entityrecorddocumentid_clear = true THEN NULL ELSE COALESCE(p_entityrecorddocumentid, "EntityRecordDocumentID") END,
        "EmbeddingStatus" = COALESCE(p_embeddingstatus, "EmbeddingStatus"),
        "LastEmbeddedAt" = CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, "LastEmbeddedAt") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "TaggingStatus" = COALESCE(p_taggingstatus, "TaggingStatus"),
        "LastTaggedAt" = CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, "LastTaggedAt") END,
        "VectorRecordID" = CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, "VectorRecordID") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "DisplayLink" = CASE WHEN p_displaylink_clear = true THEN NULL ELSE COALESCE(p_displaylink, "DisplayLink") END,
        "FieldConfidence" = CASE WHEN p_fieldconfidence_clear = true THEN NULL ELSE COALESCE(p_fieldconfidence, "FieldConfidence") END,
        "ExtractionStatus" = CASE WHEN p_extractionstatus_clear = true THEN NULL ELSE COALESCE(p_extractionstatus, "ExtractionStatus") END,
        "SegmentationStatus" = CASE WHEN p_segmentationstatus_clear = true THEN NULL ELSE COALESCE(p_segmentationstatus, "SegmentationStatus") END,
        "DeleteStatus" = CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, "DeleteStatus") END,
        "ExtractorKey" = CASE WHEN p_extractorkey_clear = true THEN NULL ELSE COALESCE(p_extractorkey, "ExtractorKey") END,
        "ExtractorKeyOverride" = CASE WHEN p_extractorkeyoverride_clear = true THEN NULL ELSE COALESCE(p_extractorkeyoverride, "ExtractorKeyOverride") END,
        "Modality" = CASE WHEN p_modality_clear = true THEN NULL ELSE COALESCE(p_modality, "Modality") END,
        "Date" = CASE WHEN p_date_clear = true THEN NULL ELSE COALESCE(p_date, "Date") END,
        "Decorator" = CASE WHEN p_decorator_clear = true THEN NULL ELSE COALESCE(p_decorator, "Decorator") END,
        "FileID" = CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, "FileID") END,
        "RetryCount" = COALESCE(p_retrycount, "RetryCount"),
        "RetryAfter" = CASE WHEN p_retryafter_clear = true THEN NULL ELSE COALESCE(p_retryafter, "RetryAfter") END,
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
    SELECT * FROM "__mj"."vwContentItems"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentItem" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItem table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_content_item"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_item" ON "__mj"."ContentItem";

CREATE TRIGGER "trg_update_content_item"
BEFORE UPDATE ON "__mj"."ContentItem"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_content_item"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Items
-- Item: spDeleteContentItem
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteContentItem"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ContentItem"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentItem" TO "cdp_Integration";
