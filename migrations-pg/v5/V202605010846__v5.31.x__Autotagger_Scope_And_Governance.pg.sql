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

-- ===================== DDL: Tables, PKs, Indexes =====================

-- Migration: Autotagger Scope & Governance
--
-- Adds per-tag governance + persisted embedding fields to Tag, plus three new
-- tables that support polymorphic per-tenant tag scoping (TagScope), authored
-- and auto-discovered synonyms (TagSynonym), and a human-in-the-loop review
-- queue for ambiguous / governance-blocked tags (TagSuggestion).
--
-- Notes:
--   - The IsGlobal ⊕ TagScope invariant is enforced in Save() overrides on
--     the entity classes, NOT via DB triggers. The UNIQUE constraint on
--     TagScope (TagID, ScopeEntityID, ScopeRecordID) is the only DB-level
--     guard.
--   - Existing rows default to IsGlobal=1 via the column DEFAULT — no
--     separate backfill UPDATE is needed.
--   - Autotagger configuration knobs (taxonomy mode, thresholds, budgets)
--     remain in the ContentSource."Configuration" JSON and are extended via
--     the IContentSourceConfiguration TypeScript interface in metadata/.
--     CodeGen emits the strong type from there.

-- =============================================================================
-- 1. Extend Tag with governance + embedding fields
-- =============================================================================

ALTER TABLE __mj."Tag"
 ADD COLUMN "IsGlobal"              BOOLEAN NOT NULL CONSTRAINT DF_Tag_IsGlobal              DEFAULT TRUE,
 ADD COLUMN "AllowAutoGrow"         BOOLEAN NOT NULL CONSTRAINT DF_Tag_AllowAutoGrow         DEFAULT TRUE,
 ADD COLUMN "IsFrozen"              BOOLEAN NOT NULL CONSTRAINT DF_Tag_IsFrozen              DEFAULT FALSE,
 ADD COLUMN "MaxChildren"           INTEGER NULL,
 ADD COLUMN "MaxDescendantDepth"    INTEGER NULL,
 ADD COLUMN "MinWeight"             DECIMAL(3,2) NULL,
 ADD COLUMN "RequiresReview"        BOOLEAN NOT NULL CONSTRAINT DF_Tag_RequiresReview        DEFAULT FALSE,
 ADD COLUMN "EmbeddingVector"       TEXT NULL,
 ADD COLUMN "EmbeddingModelID"      UUID NULL
        CONSTRAINT FK_Tag_EmbeddingModel REFERENCES __mj."AIModel"("ID");

-- =============================================================================
-- 2. TagScope — polymorphic M2M between Tag and any (Entity, Record) scope
-- =============================================================================

CREATE TABLE __mj."TagScope" (
 "ID" UUID NOT NULL CONSTRAINT DF_TagScope_ID DEFAULT gen_random_uuid(),
 "TagID" UUID NOT NULL,
 "ScopeEntityID" UUID NOT NULL,
 "ScopeRecordID" VARCHAR(450) NOT NULL,
 CONSTRAINT PK_TagScope PRIMARY KEY ("ID"),
 CONSTRAINT FK_TagScope_Tag FOREIGN KEY ("TagID")
 REFERENCES __mj."Tag"("ID"),
 CONSTRAINT FK_TagScope_Entity FOREIGN KEY ("ScopeEntityID")
 REFERENCES __mj."Entity"("ID"),
 CONSTRAINT UQ_TagScope_Tag_Entity_Record UNIQUE ("TagID", "ScopeEntityID", "ScopeRecordID")
);

CREATE INDEX IF NOT EXISTS IDX_TagScope_Scope_Tag
    ON __mj."TagScope" ("ScopeEntityID", "ScopeRecordID", "TagID");

-- =============================================================================
-- 3. TagSynonym — alternate names that should resolve to a tag
-- =============================================================================

CREATE TABLE __mj."TagSynonym" (
 "ID" UUID NOT NULL CONSTRAINT DF_TagSynonym_ID DEFAULT gen_random_uuid(),
 "TagID" UUID NOT NULL,
 "Synonym" VARCHAR(255) NOT NULL,
 "Source" VARCHAR(20) NOT NULL CONSTRAINT DF_TagSynonym_Source DEFAULT 'Manual',
 CONSTRAINT PK_TagSynonym PRIMARY KEY ("ID"),
 CONSTRAINT FK_TagSynonym_Tag FOREIGN KEY ("TagID")
 REFERENCES __mj."Tag"("ID"),
 CONSTRAINT UQ_TagSynonym_Tag_Synonym UNIQUE ("TagID", "Synonym"),
 CONSTRAINT CK_TagSynonym_Source CHECK ("Source" IN ('Manual','LLM','Imported','Merged'))
);

-- =============================================================================
-- 4. TagSuggestion — human-in-the-loop review queue
-- =============================================================================

CREATE TABLE __mj."TagSuggestion" (
 "ID" UUID NOT NULL CONSTRAINT DF_TagSuggestion_ID DEFAULT gen_random_uuid(),
 "ProposedName" VARCHAR(255) NOT NULL,
 "ProposedParentID" UUID NULL,
 "BestMatchTagID" UUID NULL,
 "BestMatchScore" DECIMAL(4,3) NULL,
 "Reason" VARCHAR(50) NOT NULL,
 "SourceContentItemID" UUID NULL,
 "SourceContentSourceID" UUID NULL,
 "SourceText" TEXT NULL,
 "Status" VARCHAR(20) NOT NULL CONSTRAINT DF_TagSuggestion_Status DEFAULT 'Pending',
 "ResolvedTagID" UUID NULL,
 "ReviewedByUserID" UUID NULL,
 "ReviewedAt" TIMESTAMPTZ NULL,
 "ReviewerNotes" TEXT NULL,
 CONSTRAINT PK_TagSuggestion PRIMARY KEY ("ID"),
 CONSTRAINT FK_TagSuggestion_ProposedParent FOREIGN KEY ("ProposedParentID")
 REFERENCES __mj."Tag"("ID"),
 CONSTRAINT FK_TagSuggestion_BestMatch FOREIGN KEY ("BestMatchTagID")
 REFERENCES __mj."Tag"("ID"),
 CONSTRAINT FK_TagSuggestion_Resolved FOREIGN KEY ("ResolvedTagID")
 REFERENCES __mj."Tag"("ID"),
 CONSTRAINT FK_TagSuggestion_ContentItem FOREIGN KEY ("SourceContentItemID")
 REFERENCES __mj."ContentItem"("ID"),
 CONSTRAINT FK_TagSuggestion_ContentSource FOREIGN KEY ("SourceContentSourceID")
 REFERENCES __mj."ContentSource"("ID"),
 CONSTRAINT FK_TagSuggestion_ReviewedByUser FOREIGN KEY ("ReviewedByUserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT CK_TagSuggestion_Status CHECK ("Status" IN ('Pending','Approved','Rejected','Merged'))
);

ALTER TABLE __mj."TagSuggestion"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagSuggestion" */
ALTER TABLE __mj."TagSuggestion"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagSynonym" */
ALTER TABLE __mj."TagSynonym"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagSynonym" */
ALTER TABLE __mj."TagSynonym"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagScope" */
ALTER TABLE __mj."TagScope"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagScope" */
ALTER TABLE __mj."TagScope"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagScope_TagID" ON __mj."TagScope" ("TagID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagScope_ScopeEntityID" ON __mj."TagScope" ("ScopeEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagSuggestion_ProposedParentID" ON __mj."TagSuggestion" ("ProposedParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagSuggestion_BestMatchTagID" ON __mj."TagSuggestion" ("BestMatchTagID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagSuggestion_SourceContentItemID" ON __mj."TagSuggestion" ("SourceContentItemID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagSuggestion_SourceContentSourceID" ON __mj."TagSuggestion" ("SourceContentSourceID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagSuggestion_ResolvedTagID" ON __mj."TagSuggestion" ("ResolvedTagID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagSuggestion_ReviewedByUserID" ON __mj."TagSuggestion" ("ReviewedByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagSynonym_TagID" ON __mj."TagSynonym" ("TagID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Tag_ParentID" ON __mj."Tag" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Tag_MergedIntoTagID" ON __mj."Tag" ("MergedIntoTagID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Tag_EmbeddingModelID" ON __mj."Tag" ("EmbeddingModelID");


-- ===================== Helper Functions (fn*) =====================

CREATE OR REPLACE FUNCTION __mj."fnTagParentID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."Tag"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."Tag" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION __mj."fnTagMergedIntoTagID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "MergedIntoTagID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."Tag"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."MergedIntoTagID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."Tag" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."MergedIntoTagID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "MergedIntoTagID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwTagSynonyms';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwTagSynonyms"
AS SELECT
    t.*,
    "MJTag_TagID"."Name" AS "Tag"
FROM
    __mj."TagSynonym" AS t
INNER JOIN
    __mj."Tag" AS "MJTag_TagID"
  ON
    t."TagID" = "MJTag_TagID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwTagScopes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwTagScopes"
AS SELECT
    t.*,
    "MJTag_TagID"."Name" AS "Tag",
    "MJEntity_ScopeEntityID"."Name" AS "ScopeEntity"
FROM
    __mj."TagScope" AS t
INNER JOIN
    __mj."Tag" AS "MJTag_TagID"
  ON
    t."TagID" = "MJTag_TagID"."ID"
INNER JOIN
    __mj."Entity" AS "MJEntity_ScopeEntityID"
  ON
    t."ScopeEntityID" = "MJEntity_ScopeEntityID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwTagSuggestions';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwTagSuggestions"
AS SELECT
    t.*,
    "MJTag_ProposedParentID"."Name" AS "ProposedParent",
    "MJTag_BestMatchTagID"."Name" AS "BestMatchTag",
    "MJContentItem_SourceContentItemID"."Name" AS "SourceContentItem",
    "MJContentSource_SourceContentSourceID"."Name" AS "SourceContentSource",
    "MJTag_ResolvedTagID"."Name" AS "ResolvedTag",
    "MJUser_ReviewedByUserID"."Name" AS "ReviewedByUser"
FROM
    __mj."TagSuggestion" AS t
LEFT OUTER JOIN
    __mj."Tag" AS "MJTag_ProposedParentID"
  ON
    t."ProposedParentID" = "MJTag_ProposedParentID"."ID"
LEFT OUTER JOIN
    __mj."Tag" AS "MJTag_BestMatchTagID"
  ON
    t."BestMatchTagID" = "MJTag_BestMatchTagID"."ID"
LEFT OUTER JOIN
    __mj."ContentItem" AS "MJContentItem_SourceContentItemID"
  ON
    t."SourceContentItemID" = "MJContentItem_SourceContentItemID"."ID"
LEFT OUTER JOIN
    __mj."ContentSource" AS "MJContentSource_SourceContentSourceID"
  ON
    t."SourceContentSourceID" = "MJContentSource_SourceContentSourceID"."ID"
LEFT OUTER JOIN
    __mj."Tag" AS "MJTag_ResolvedTagID"
  ON
    t."ResolvedTagID" = "MJTag_ResolvedTagID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_ReviewedByUserID"
  ON
    t."ReviewedByUserID" = "MJUser_ReviewedByUserID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwTags';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwTags"
AS SELECT
    t.*,
    "MJTag_ParentID"."Name" AS "Parent",
    "MJTag_MergedIntoTagID"."Name" AS "MergedIntoTag",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel",
    "root_ParentID"."RootID" AS "RootParentID",
    "root_MergedIntoTagID"."RootID" AS "RootMergedIntoTagID"
FROM
    __mj."Tag" AS t
LEFT OUTER JOIN
    __mj."Tag" AS "MJTag_ParentID"
  ON
    t."ParentID" = "MJTag_ParentID"."ID"
LEFT OUTER JOIN
    __mj."Tag" AS "MJTag_MergedIntoTagID"
  ON
    t."MergedIntoTagID" = "MJTag_MergedIntoTagID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    t."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnTagParentID_GetRootID"(t."ID", t."ParentID")) AS "root_ParentID"
    ON TRUE
LEFT JOIN LATERAL (SELECT * FROM __mj."fnTagMergedIntoTagID_GetRootID"(t."ID", t."MergedIntoTagID")) AS "root_MergedIntoTagID"
    ON TRUE$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateTagSynonym"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TagID UUID DEFAULT NULL,
    IN p_Synonym VARCHAR(255) DEFAULT NULL,
    IN p_Source VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwTagSynonyms" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TagSynonym"
            (
                "ID",
                "TagID",
                "Synonym",
                "Source"
            )
        VALUES
            (
                p_ID,
                p_TagID,
                p_Synonym,
                COALESCE(p_Source, 'Manual')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TagSynonym"
            (
                "TagID",
                "Synonym",
                "Source"
            )
        VALUES
            (
                p_TagID,
                p_Synonym,
                COALESCE(p_Source, 'Manual')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTagSynonyms" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTagSynonym"(
    IN p_ID UUID,
    IN p_TagID UUID,
    IN p_Synonym VARCHAR(255),
    IN p_Source VARCHAR(20)
)
RETURNS SETOF __mj."vwTagSynonyms" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TagSynonym"
    SET
        "TagID" = p_TagID,
        "Synonym" = p_Synonym,
        "Source" = p_Source
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTagSynonyms" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTagSynonyms" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTagSynonym"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TagSynonym"
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

CREATE OR REPLACE FUNCTION __mj."spCreateTagScope"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TagID UUID DEFAULT NULL,
    IN p_ScopeEntityID UUID DEFAULT NULL,
    IN p_ScopeRecordID VARCHAR(450) DEFAULT NULL
)
RETURNS SETOF __mj."vwTagScopes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TagScope"
            (
                "ID",
                "TagID",
                "ScopeEntityID",
                "ScopeRecordID"
            )
        VALUES
            (
                p_ID,
                p_TagID,
                p_ScopeEntityID,
                p_ScopeRecordID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TagScope"
            (
                "TagID",
                "ScopeEntityID",
                "ScopeRecordID"
            )
        VALUES
            (
                p_TagID,
                p_ScopeEntityID,
                p_ScopeRecordID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTagScopes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTagScope"(
    IN p_ID UUID,
    IN p_TagID UUID,
    IN p_ScopeEntityID UUID,
    IN p_ScopeRecordID VARCHAR(450)
)
RETURNS SETOF __mj."vwTagScopes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TagScope"
    SET
        "TagID" = p_TagID,
        "ScopeEntityID" = p_ScopeEntityID,
        "ScopeRecordID" = p_ScopeRecordID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTagScopes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTagScopes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTagScope"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TagScope"
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

CREATE OR REPLACE FUNCTION __mj."spCreateTagSuggestion"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ProposedName VARCHAR(255) DEFAULT NULL,
    IN p_ProposedParentID UUID DEFAULT NULL,
    IN p_BestMatchTagID UUID DEFAULT NULL,
    IN p_BestMatchScore NUMERIC(4,3) DEFAULT NULL,
    IN p_Reason VARCHAR(50) DEFAULT NULL,
    IN p_SourceContentItemID UUID DEFAULT NULL,
    IN p_SourceContentSourceID UUID DEFAULT NULL,
    IN p_SourceText TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ResolvedTagID UUID DEFAULT NULL,
    IN p_ReviewedByUserID UUID DEFAULT NULL,
    IN p_ReviewedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ReviewerNotes TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwTagSuggestions" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TagSuggestion"
            (
                "ID",
                "ProposedName",
                "ProposedParentID",
                "BestMatchTagID",
                "BestMatchScore",
                "Reason",
                "SourceContentItemID",
                "SourceContentSourceID",
                "SourceText",
                "Status",
                "ResolvedTagID",
                "ReviewedByUserID",
                "ReviewedAt",
                "ReviewerNotes"
            )
        VALUES
            (
                p_ID,
                p_ProposedName,
                p_ProposedParentID,
                p_BestMatchTagID,
                p_BestMatchScore,
                p_Reason,
                p_SourceContentItemID,
                p_SourceContentSourceID,
                p_SourceText,
                COALESCE(p_Status, 'Pending'),
                p_ResolvedTagID,
                p_ReviewedByUserID,
                p_ReviewedAt,
                p_ReviewerNotes
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TagSuggestion"
            (
                "ProposedName",
                "ProposedParentID",
                "BestMatchTagID",
                "BestMatchScore",
                "Reason",
                "SourceContentItemID",
                "SourceContentSourceID",
                "SourceText",
                "Status",
                "ResolvedTagID",
                "ReviewedByUserID",
                "ReviewedAt",
                "ReviewerNotes"
            )
        VALUES
            (
                p_ProposedName,
                p_ProposedParentID,
                p_BestMatchTagID,
                p_BestMatchScore,
                p_Reason,
                p_SourceContentItemID,
                p_SourceContentSourceID,
                p_SourceText,
                COALESCE(p_Status, 'Pending'),
                p_ResolvedTagID,
                p_ReviewedByUserID,
                p_ReviewedAt,
                p_ReviewerNotes
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTagSuggestions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTagSuggestion"(
    IN p_ID UUID,
    IN p_ProposedName VARCHAR(255),
    IN p_ProposedParentID UUID,
    IN p_BestMatchTagID UUID,
    IN p_BestMatchScore NUMERIC(4,3),
    IN p_Reason VARCHAR(50),
    IN p_SourceContentItemID UUID,
    IN p_SourceContentSourceID UUID,
    IN p_SourceText TEXT,
    IN p_Status VARCHAR(20),
    IN p_ResolvedTagID UUID,
    IN p_ReviewedByUserID UUID,
    IN p_ReviewedAt TIMESTAMPTZ,
    IN p_ReviewerNotes TEXT
)
RETURNS SETOF __mj."vwTagSuggestions" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TagSuggestion"
    SET
        "ProposedName" = p_ProposedName,
        "ProposedParentID" = p_ProposedParentID,
        "BestMatchTagID" = p_BestMatchTagID,
        "BestMatchScore" = p_BestMatchScore,
        "Reason" = p_Reason,
        "SourceContentItemID" = p_SourceContentItemID,
        "SourceContentSourceID" = p_SourceContentSourceID,
        "SourceText" = p_SourceText,
        "Status" = p_Status,
        "ResolvedTagID" = p_ResolvedTagID,
        "ReviewedByUserID" = p_ReviewedByUserID,
        "ReviewedAt" = p_ReviewedAt,
        "ReviewerNotes" = p_ReviewerNotes
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTagSuggestions" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTagSuggestions" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTagSuggestion"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TagSuggestion"
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

CREATE OR REPLACE FUNCTION __mj."spCreateTag"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_MergedIntoTagID UUID DEFAULT NULL,
    IN p_IsGlobal BOOLEAN DEFAULT NULL,
    IN p_AllowAutoGrow BOOLEAN DEFAULT NULL,
    IN p_IsFrozen BOOLEAN DEFAULT NULL,
    IN p_MaxChildren INTEGER DEFAULT NULL,
    IN p_MaxDescendantDepth INTEGER DEFAULT NULL,
    IN p_MinWeight NUMERIC(3,2) DEFAULT NULL,
    IN p_RequiresReview BOOLEAN DEFAULT NULL,
    IN p_EmbeddingVector TEXT DEFAULT NULL,
    IN p_EmbeddingModelID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwTags" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."Tag"
            (
                "ID",
                "Name",
                "ParentID",
                "DisplayName",
                "Description",
                "Status",
                "MergedIntoTagID",
                "IsGlobal",
                "AllowAutoGrow",
                "IsFrozen",
                "MaxChildren",
                "MaxDescendantDepth",
                "MinWeight",
                "RequiresReview",
                "EmbeddingVector",
                "EmbeddingModelID"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_ParentID,
                p_DisplayName,
                p_Description,
                COALESCE(p_Status, 'Active'),
                p_MergedIntoTagID,
                COALESCE(p_IsGlobal, TRUE),
                COALESCE(p_AllowAutoGrow, TRUE),
                COALESCE(p_IsFrozen, FALSE),
                p_MaxChildren,
                p_MaxDescendantDepth,
                p_MinWeight,
                COALESCE(p_RequiresReview, FALSE),
                p_EmbeddingVector,
                p_EmbeddingModelID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."Tag"
            (
                "Name",
                "ParentID",
                "DisplayName",
                "Description",
                "Status",
                "MergedIntoTagID",
                "IsGlobal",
                "AllowAutoGrow",
                "IsFrozen",
                "MaxChildren",
                "MaxDescendantDepth",
                "MinWeight",
                "RequiresReview",
                "EmbeddingVector",
                "EmbeddingModelID"
            )
        VALUES
            (
                p_Name,
                p_ParentID,
                p_DisplayName,
                p_Description,
                COALESCE(p_Status, 'Active'),
                p_MergedIntoTagID,
                COALESCE(p_IsGlobal, TRUE),
                COALESCE(p_AllowAutoGrow, TRUE),
                COALESCE(p_IsFrozen, FALSE),
                p_MaxChildren,
                p_MaxDescendantDepth,
                p_MinWeight,
                COALESCE(p_RequiresReview, FALSE),
                p_EmbeddingVector,
                p_EmbeddingModelID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTags" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTag"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255),
    IN p_ParentID UUID,
    IN p_DisplayName VARCHAR(255),
    IN p_Description TEXT,
    IN p_Status VARCHAR(20),
    IN p_MergedIntoTagID UUID,
    IN p_IsGlobal BOOLEAN,
    IN p_AllowAutoGrow BOOLEAN,
    IN p_IsFrozen BOOLEAN,
    IN p_MaxChildren INTEGER,
    IN p_MaxDescendantDepth INTEGER,
    IN p_MinWeight NUMERIC(3,2),
    IN p_RequiresReview BOOLEAN,
    IN p_EmbeddingVector TEXT,
    IN p_EmbeddingModelID UUID
)
RETURNS SETOF __mj."vwTags" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."Tag"
    SET
        "Name" = p_Name,
        "ParentID" = p_ParentID,
        "DisplayName" = p_DisplayName,
        "Description" = p_Description,
        "Status" = p_Status,
        "MergedIntoTagID" = p_MergedIntoTagID,
        "IsGlobal" = p_IsGlobal,
        "AllowAutoGrow" = p_AllowAutoGrow,
        "IsFrozen" = p_IsFrozen,
        "MaxChildren" = p_MaxChildren,
        "MaxDescendantDepth" = p_MaxDescendantDepth,
        "MinWeight" = p_MinWeight,
        "RequiresReview" = p_RequiresReview,
        "EmbeddingVector" = p_EmbeddingVector,
        "EmbeddingModelID" = p_EmbeddingModelID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTags" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTags" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTag"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Tag"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateTagSynonym_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTagSynonym" ON __mj."TagSynonym";
CREATE TRIGGER "trgUpdateTagSynonym"
    BEFORE UPDATE ON __mj."TagSynonym"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTagSynonym_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateTagScope_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTagScope" ON __mj."TagScope";
CREATE TRIGGER "trgUpdateTagScope"
    BEFORE UPDATE ON __mj."TagScope"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTagScope_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateTagSuggestion_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTagSuggestion" ON __mj."TagSuggestion";
CREATE TRIGGER "trgUpdateTagSuggestion"
    BEFORE UPDATE ON __mj."TagSuggestion"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTagSuggestion_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateTag_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTag" ON __mj."Tag";
CREATE TRIGGER "trgUpdateTag"
    BEFORE UPDATE ON __mj."Tag"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTag_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO __mj."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'ea41de76-f03f-4335-a98d-facfa37afb1c',
         'MJ: Tag Scopes',
         'Tag Scopes',
         'Polymorphic junction binding a Tag to one or more (Entity, Record) scope rows. A Tag with one or more TagScope rows is only visible inside those scopes; a Tag with no rows AND IsGlobal=1 is visible everywhere. Mirrors the shape of TaggedItem.',
         NULL,
         'TagScope',
         'vwTagScopes',
         '__mj',
         TRUE,
         TRUE,
         TRUE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Tag Scopes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ea41de76-f03f-4335-a98d-facfa37afb1c', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Scopes for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ea41de76-f03f-4335-a98d-facfa37afb1c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Scopes for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ea41de76-f03f-4335-a98d-facfa37afb1c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Scopes for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ea41de76-f03f-4335-a98d-facfa37afb1c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Tag Synonyms */

INSERT INTO __mj."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'fe0d485e-8c3f-4fe0-bd07-ef81e8f14ce0',
         'MJ: Tag Synonyms',
         'Tag Synonyms',
         'Alternate names that should resolve to a Tag during autotagging. Consulted before exact/fuzzy/semantic match tiers in TagEngine."ResolveTag".',
         NULL,
         'TagSynonym',
         'vwTagSynonyms',
         '__mj',
         TRUE,
         TRUE,
         TRUE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Tag Synonyms to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'fe0d485e-8c3f-4fe0-bd07-ef81e8f14ce0', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Synonyms for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('fe0d485e-8c3f-4fe0-bd07-ef81e8f14ce0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Synonyms for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('fe0d485e-8c3f-4fe0-bd07-ef81e8f14ce0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Synonyms for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('fe0d485e-8c3f-4fe0-bd07-ef81e8f14ce0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Tag Suggestions */

INSERT INTO __mj."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'bcf03e3b-d2b2-4557-aceb-95b18495f451',
         'MJ: Tag Suggestions',
         'Tag Suggestions',
         'Human-in-the-loop review queue for tag changes the autotagger could not commit autonomously: ambiguous matches, governance-blocked auto-grows, low-usage deprecation candidates, and merge candidates from co-occurrence analysis.',
         NULL,
         'TagSuggestion',
         'vwTagSuggestions',
         '__mj',
         TRUE,
         TRUE,
         TRUE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Tag Suggestions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'bcf03e3b-d2b2-4557-aceb-95b18495f451', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Suggestions for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('bcf03e3b-d2b2-4557-aceb-95b18495f451', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Suggestions for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('bcf03e3b-d2b2-4557-aceb-95b18495f451', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Suggestions for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('bcf03e3b-d2b2-4557-aceb-95b18495f451', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagSuggestion" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagSuggestion" */
UPDATE __mj."TagSuggestion" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagSuggestion" */
ALTER TABLE __mj."TagSuggestion" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."TagSuggestion"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagSuggestion" */
UPDATE __mj."TagSuggestion" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagSuggestion" */
ALTER TABLE __mj."TagSuggestion" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."TagSuggestion"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagSynonym" */
UPDATE __mj."TagSynonym" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagSynonym" */
ALTER TABLE __mj."TagSynonym" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."TagSynonym"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagSynonym" */
UPDATE __mj."TagSynonym" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagSynonym" */
ALTER TABLE __mj."TagSynonym" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."TagSynonym"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagScope" */
UPDATE __mj."TagScope" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagScope" */
ALTER TABLE __mj."TagScope" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."TagScope"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagScope" */
UPDATE __mj."TagScope" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagScope" */
ALTER TABLE __mj."TagScope" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."TagScope"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8e4149a0-d01d-48fd-9e1b-8764ebc4409d' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'IsGlobal')
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
        '8e4149a0-d01d-48fd-9e1b-8764ebc4409d',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100032,
        'IsGlobal',
        'Is Global',
        'When 1, the tag is visible to every tenant/scope. When 0, the tag is only visible to the (Entity, Record) pairs listed in TagScope. Cannot be set together with TagScope rows — enforced in entity Save() override.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '188a03e5-163f-4305-b05d-a1cafc786695' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AllowAutoGrow')
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
        '188a03e5-163f-4305-b05d-a1cafc786695',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100033,
        'AllowAutoGrow',
        'Allow Auto Grow',
        'When 1, the autotagger may auto-create new child tags under this node when running in AutoGrow or FreeFlow mode. When 0, new children must come through the TagSuggestion review queue.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '06c53ad9-6e47-40f6-8a54-22b08ffac96e' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'IsFrozen')
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
        '06c53ad9-6e47-40f6-8a54-22b08ffac96e',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100034,
        'IsFrozen',
        'Is Frozen',
        'When 1, this subtree is locked: no new children may be created under this node or any descendant, regardless of taxonomy mode. Existing children remain editable.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '40c2e9d8-c6f6-4060-b56b-88abbc8e0698' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'MaxChildren')
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
        '40c2e9d8-c6f6-4060-b56b-88abbc8e0698',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100035,
        'MaxChildren',
        'Max Children',
        'Optional cap on the number of direct children allowed under this tag. NULL = unlimited. Auto-grow is blocked once this cap is reached and routed to the TagSuggestion queue.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b752f3f4-1d32-4645-925f-28e6d6c122c0' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'MaxDescendantDepth')
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
        'b752f3f4-1d32-4645-925f-28e6d6c122c0',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100036,
        'MaxDescendantDepth',
        'Max Descendant Depth',
        'Optional cap on the depth of the subtree rooted at this tag. NULL = unlimited. 0 = leaf-only (no children at all). Enforced via ancestor walk during auto-grow.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9e7ed65e-41c6-4c6d-8659-52cfff1b46dd' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'MinWeight')
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
        '9e7ed65e-41c6-4c6d-8659-52cfff1b46dd',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100037,
        'MinWeight',
        'Min Weight',
        'Optional minimum classifier confidence (0.00-1.00) required for this tag to be applied. Items below this floor are routed to the TagSuggestion queue instead of being tagged.',
        'decimal',
        5,
        3,
        2,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e54b8418-2042-44d3-acdd-00e34d6db818' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RequiresReview')
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
        'e54b8418-2042-44d3-acdd-00e34d6db818',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100038,
        'RequiresReview',
        'Requires Review',
        'When 1, every classifier-applied use of this tag is routed to the TagSuggestion queue for human approval before being persisted as a ContentItemTag → TaggedItem.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32bd0c45-ce4c-41c5-8f42-9075a36b27ae' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EmbeddingVector')
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
        '32bd0c45-ce4c-41c5-8f42-9075a36b27ae',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100039,
        'EmbeddingVector',
        'Embedding Vector',
        'JSON-encoded numeric vector representing the tag''s embedding under the model identified by EmbeddingModelID. Refreshed automatically on Save() when Name or Description changes. Used to seed the in-memory tag vector cache without a cold-start LLM round-trip.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2681aeac-3d38-478e-854b-9c0d271279f8' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EmbeddingModelID')
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
        '2681aeac-3d38-478e-854b-9c0d271279f8',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100040,
        'EmbeddingModelID',
        'Embedding Model ID',
        'AI model whose embedding produced EmbeddingVector. When the configured tag-embedding model differs from this value, the cached vector is treated as stale and recomputed.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'FD238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ac912468-b579-46ce-a7f7-cb110aa54789' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'ID')
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
        'ac912468-b579-46ce-a7f7-cb110aa54789',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '25782ccd-889e-433d-b2cc-c2a0e2e2be5d' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'ProposedName')
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
        '25782ccd-889e-433d-b2cc-c2a0e2e2be5d',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100002,
        'ProposedName',
        'Proposed Name',
        'The proposed tag name as seen by the classifier or analyzer.',
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2cba41b4-7ca6-43b7-b854-8f1b5c9d8413' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'ProposedParentID')
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
        '2cba41b4-7ca6-43b7-b854-8f1b5c9d8413',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100003,
        'ProposedParentID',
        'Proposed Parent ID',
        'Tag under which the suggestion would be created if approved as a new tag. NULL = root.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '0C248F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd9dfcf44-e225-4ec2-a08c-c2c1ede9565d' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'BestMatchTagID')
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
        'd9dfcf44-e225-4ec2-a08c-c2c1ede9565d',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100004,
        'BestMatchTagID',
        'Best Match Tag ID',
        'When non-null, the existing Tag the system believes is the closest match. The reviewer may accept this as a merge target instead of creating a new tag.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '0C248F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '14685a97-7362-4755-847b-3c6043d0967f' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'BestMatchScore')
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
        '14685a97-7362-4755-847b-3c6043d0967f',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100005,
        'BestMatchScore',
        'Best Match Score',
        'Cosine similarity score (0.000-1.000) between the proposed name embedding and BestMatchTagID''s embedding, when applicable.',
        'decimal',
        5,
        4,
        3,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '83526f85-6adc-40bd-a2df-ac433f616f9b' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'Reason')
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
        '83526f85-6adc-40bd-a2df-ac433f616f9b',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100006,
        'Reason',
        'Reason',
        'Why this suggestion was created. Free-form TEXT for forward compatibility; conventional values include ConstrainedMode, BelowThreshold, ParentFrozen, AutoGrowDisabled, MaxChildrenExceeded, MaxDepthExceeded, BelowMinWeight, RequiresReview, MergeCandidate, LowUsage, WideNode.',
        'TEXT',
        100,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fbab09cd-db94-4db7-a3c2-b783247e0e21' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'SourceContentItemID')
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
        'fbab09cd-db94-4db7-a3c2-b783247e0e21',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100007,
        'SourceContentItemID',
        'Source Content Item ID',
        'ContentItem that triggered this suggestion, when item-level. NULL for taxonomy-level suggestions (merge candidates, low-usage alerts).',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3bdfb3e2-f43e-44ab-ad6b-516c47c12e9b' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'SourceContentSourceID')
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
        '3bdfb3e2-f43e-44ab-ad6b-516c47c12e9b',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100008,
        'SourceContentSourceID',
        'Source Content Source ID',
        'ContentSource that triggered this suggestion, when source-attributable.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '960c7bea-30a6-4d48-845a-065d8a6275be' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'SourceText')
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
        '960c7bea-30a6-4d48-845a-065d8a6275be',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100009,
        'SourceText',
        'Source Text',
        'Optional snippet of source text that prompted the suggestion. Useful for reviewer context.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ef060f94-efb2-4057-af53-4b13280c307c' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'Status')
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
        'ef060f94-efb2-4057-af53-4b13280c307c',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100010,
        'Status',
        'Status',
        'Pending = awaiting review; Approved = accepted as a new tag; Merged = accepted as a merge into BestMatchTagID; Rejected = dismissed.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Pending',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9d6d17da-da7f-43f1-90f1-424f908448d9' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'ResolvedTagID')
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
        '9d6d17da-da7f-43f1-90f1-424f908448d9',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100011,
        'ResolvedTagID',
        'Resolved Tag ID',
        'When Approved or Merged, points to the resulting Tag (the new tag for Approved, the merge target for Merged).',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '0C248F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd5357c14-3b81-4a98-9e1d-516b56248907' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'ReviewedByUserID')
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
        'd5357c14-3b81-4a98-9e1d-516b56248907',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100012,
        'ReviewedByUserID',
        'Reviewed By User ID',
        'User who took action on this suggestion.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'E1238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c4fd8477-e9b1-4156-8b34-0d03d2e332dc' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'ReviewedAt')
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
        'c4fd8477-e9b1-4156-8b34-0d03d2e332dc',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100013,
        'ReviewedAt',
        'Reviewed At',
        'Timestamp of the review action.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7a894cca-6bce-4f45-ada9-d750813a7462' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'ReviewerNotes')
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
        '7a894cca-6bce-4f45-ada9-d750813a7462',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100014,
        'ReviewerNotes',
        'Reviewer Notes',
        'Free-form notes captured at review time. Useful for rejection rationale or merge decisions.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '371b3a78-7a29-4c93-99e5-e88e8f243c63' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = '__mj_CreatedAt')
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
        '371b3a78-7a29-4c93-99e5-e88e8f243c63',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100015,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6ad03eff-39f3-4227-9260-bb2e3118f6fc' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = '__mj_UpdatedAt')
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
        '6ad03eff-39f3-4227-9260-bb2e3118f6fc',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100016,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6ba484dc-192c-4d78-bda6-f05cc8fb9565' OR ("EntityID" = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND "Name" = 'ID')
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
        '6ba484dc-192c-4d78-bda6-f05cc8fb9565',
        'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- "Entity": "MJ": "Tag" "Synonyms"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'de84807f-a1a6-40ed-a154-bc7b7f59fad3' OR ("EntityID" = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND "Name" = 'TagID')
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
        'de84807f-a1a6-40ed-a154-bc7b7f59fad3',
        'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- "Entity": "MJ": "Tag" "Synonyms"
        100002,
        'TagID',
        'Tag ID',
        'The Tag this synonym maps to.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '0C248F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f95e7337-1169-4d05-b6ec-0a14a7626e21' OR ("EntityID" = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND "Name" = 'Synonym')
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
        'f95e7337-1169-4d05-b6ec-0a14a7626e21',
        'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- "Entity": "MJ": "Tag" "Synonyms"
        100003,
        'Synonym',
        'Synonym',
        'The alternate name that should resolve to the Tag. Case-insensitive; uniqueness is enforced per-Tag via UQ_TagSynonym_Tag_Synonym.',
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b50a4543-d60f-4440-9587-cb61c449d06a' OR ("EntityID" = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND "Name" = 'Source')
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
        'b50a4543-d60f-4440-9587-cb61c449d06a',
        'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- "Entity": "MJ": "Tag" "Synonyms"
        100004,
        'Source',
        'Source',
        'How this synonym was introduced. Manual = admin-authored; LLM = suggested by an LLM run; Imported = bulk-loaded; Merged = inherited from a tag merged into this one.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Manual',
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2fbd3c83-dc1c-41b6-9bf2-bbe89dc42901' OR ("EntityID" = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND "Name" = '__mj_CreatedAt')
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
        '2fbd3c83-dc1c-41b6-9bf2-bbe89dc42901',
        'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- "Entity": "MJ": "Tag" "Synonyms"
        100005,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4ae65fca-b822-44f1-ac56-70606e6cc190' OR ("EntityID" = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND "Name" = '__mj_UpdatedAt')
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
        '4ae65fca-b822-44f1-ac56-70606e6cc190',
        'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- "Entity": "MJ": "Tag" "Synonyms"
        100006,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8b3123f9-9973-4c70-9b0b-7156a6bd57f2' OR ("EntityID" = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND "Name" = 'ID')
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
        '8b3123f9-9973-4c70-9b0b-7156a6bd57f2',
        'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- "Entity": "MJ": "Tag" "Scopes"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '78a7d431-93eb-485a-9667-e2ce0eb31f2a' OR ("EntityID" = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND "Name" = 'TagID')
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
        '78a7d431-93eb-485a-9667-e2ce0eb31f2a',
        'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- "Entity": "MJ": "Tag" "Scopes"
        100002,
        'TagID',
        'Tag ID',
        'The Tag whose visibility this row constrains.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '0C248F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '815c5c75-ecde-4090-bc99-615c6b209532' OR ("EntityID" = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND "Name" = 'ScopeEntityID')
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
        '815c5c75-ecde-4090-bc99-615c6b209532',
        'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- "Entity": "MJ": "Tag" "Scopes"
        100003,
        'ScopeEntityID',
        'Scope Entity ID',
        'Entity that the scope record belongs to (e.g., Companies, AI Agents). Combined with ScopeRecordID identifies the specific tenant or context that may see the tag.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'E0238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7366be86-000c-44e3-8b16-fc97fbd8b586' OR ("EntityID" = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND "Name" = 'ScopeRecordID')
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
        '7366be86-000c-44e3-8b16-fc97fbd8b586',
        'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- "Entity": "MJ": "Tag" "Scopes"
        100004,
        'ScopeRecordID',
        'Scope Record ID',
        'Primary key value of the scope record. Stored as VARCHAR(450) to match the polymorphic RecordID convention used by TaggedItem.',
        'TEXT',
        900,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '73fa4eef-db95-469d-92b0-3318a9c2663d' OR ("EntityID" = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND "Name" = '__mj_CreatedAt')
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
        '73fa4eef-db95-469d-92b0-3318a9c2663d',
        'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- "Entity": "MJ": "Tag" "Scopes"
        100005,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b925e50c-aa27-4c58-9c3a-9625e17989e8' OR ("EntityID" = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND "Name" = '__mj_UpdatedAt')
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
        'b925e50c-aa27-4c58-9c3a-9625e17989e8',
        'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- "Entity": "MJ": "Tag" "Scopes"
        100006,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('3c7064ab-4eda-41fb-8c07-dd58edb4717c', 'B50A4543-D60F-4440-9587-CB61C449D06A', 1, 'Imported', 'Imported', NOW(), NOW());
/* SQL text to insert entity field value with ID 9a3dd414-b2cb-4629-949f-6fd2120b8953 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('9a3dd414-b2cb-4629-949f-6fd2120b8953', 'B50A4543-D60F-4440-9587-CB61C449D06A', 2, 'LLM', 'LLM', NOW(), NOW());
/* SQL text to insert entity field value with ID d55f6a3c-134e-4617-9d01-620a3c46acea */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d55f6a3c-134e-4617-9d01-620a3c46acea', 'B50A4543-D60F-4440-9587-CB61C449D06A', 3, 'Manual', 'Manual', NOW(), NOW());
/* SQL text to insert entity field value with ID 372b49cc-6343-4bf4-9169-e9cc469a6b54 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('372b49cc-6343-4bf4-9169-e9cc469a6b54', 'B50A4543-D60F-4440-9587-CB61C449D06A', 4, 'Merged', 'Merged', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID B50A4543-D60F-4440-9587-CB61C449D06A */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='B50A4543-D60F-4440-9587-CB61C449D06A';
/* SQL text to insert entity field value with ID 245e811c-bf52-4e50-a36a-b2932cf0f49a */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('245e811c-bf52-4e50-a36a-b2932cf0f49a', 'EF060F94-EFB2-4057-AF53-4B13280C307C', 1, 'Approved', 'Approved', NOW(), NOW());
/* SQL text to insert entity field value with ID b2f8e7e8-7f9d-41f8-8070-cc9db200022c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('b2f8e7e8-7f9d-41f8-8070-cc9db200022c', 'EF060F94-EFB2-4057-AF53-4B13280C307C', 2, 'Merged', 'Merged', NOW(), NOW());
/* SQL text to insert entity field value with ID af8c46ec-29aa-46f4-b842-5d9abf5a97ba */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('af8c46ec-29aa-46f4-b842-5d9abf5a97ba', 'EF060F94-EFB2-4057-AF53-4B13280C307C', 3, 'Pending', 'Pending', NOW(), NOW());
/* SQL text to insert entity field value with ID 84145603-0af1-4c3f-9a3d-44160635096d */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('84145603-0af1-4c3f-9a3d-44160635096d', 'EF060F94-EFB2-4057-AF53-4B13280C307C', 4, 'Rejected', 'Rejected', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID EF060F94-EFB2-4057-AF53-4B13280C307C */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='EF060F94-EFB2-4057-AF53-4B13280C307C';
/* Create Entity Relationship: MJ: Entities -> MJ: Tag Scopes (One To Many via ScopeEntityID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c75df88d-1abc-43df-8a1a-fbccdcb2e7df'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('c75df88d-1abc-43df-8a1a-fbccdcb2e7df', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', 'ScopeEntityID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'dda5c2b7-8a10-4ebd-baf0-cae93df7f1e7'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('dda5c2b7-8a10-4ebd-baf0-cae93df7f1e7', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'ReviewedByUserID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd16b8236-75fd-4639-9d05-724e390f826b'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('d16b8236-75fd-4639-9d05-724e390f826b', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'EmbeddingModelID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '00791f8d-289a-4a54-8f88-d87711876dbb'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('00791f8d-289a-4a54-8f88-d87711876dbb', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'ProposedParentID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '522d3a92-5e99-4036-b5ff-843706b4ad84'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('522d3a92-5e99-4036-b5ff-843706b4ad84', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'BestMatchTagID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f27279f6-af3c-4b01-ba65-1406f16b3585'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f27279f6-af3c-4b01-ba65-1406f16b3585', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'ResolvedTagID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a5e149ca-8d5d-4322-8c47-1fc850be7b90'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('a5e149ca-8d5d-4322-8c47-1fc850be7b90', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', 'TagID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'fe79889c-9f50-42aa-be5c-ce9e6e6e4f78'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('fe79889c-9f50-42aa-be5c-ce9e6e6e4f78', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', 'TagID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '882dd9f5-6e18-4a0c-a9d3-90d601f798b1'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('882dd9f5-6e18-4a0c-a9d3-90d601f798b1', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'SourceContentSourceID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7885dbf6-7263-4470-ba4d-0c4c801a622b'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('7885dbf6-7263-4470-ba4d-0c4c801a622b', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'SourceContentItemID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '01ae9e00-305f-4fec-b8d2-a0a906d34f70' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EmbeddingModel')
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
        '01ae9e00-305f-4fec-b8d2-a0a906d34f70',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100043,
        'EmbeddingModel',
        'Embedding Model',
        NULL,
        'TEXT',
        100,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b444eb26-6ed0-4beb-8f8c-f6c6b5cfd820' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'ProposedParent')
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
        'b444eb26-6ed0-4beb-8f8c-f6c6b5cfd820',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100033,
        'ProposedParent',
        'Proposed Parent',
        NULL,
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5d1c0858-4387-4070-a37e-f1b9d840e43b' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'BestMatchTag')
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
        '5d1c0858-4387-4070-a37e-f1b9d840e43b',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100034,
        'BestMatchTag',
        'Best Match Tag',
        NULL,
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '51c44037-ed00-47bb-91f9-aa6b344dec75' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'SourceContentItem')
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
        '51c44037-ed00-47bb-91f9-aa6b344dec75',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100035,
        'SourceContentItem',
        'Source Content Item',
        NULL,
        'TEXT',
        500,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd972301f-d1da-4cbd-90e7-3c6657d15f64' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'SourceContentSource')
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
        'd972301f-d1da-4cbd-90e7-3c6657d15f64',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100036,
        'SourceContentSource',
        'Source Content Source',
        NULL,
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dbbf3af6-4c7c-4116-b357-ce0643e0c7dd' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'ResolvedTag')
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
        'dbbf3af6-4c7c-4116-b357-ce0643e0c7dd',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100037,
        'ResolvedTag',
        'Resolved Tag',
        NULL,
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cc4c9e6d-6326-4e28-bb7d-7686cb281fbe' OR ("EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND "Name" = 'ReviewedByUser')
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
        'cc4c9e6d-6326-4e28-bb7d-7686cb281fbe',
        'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- "Entity": "MJ": "Tag" "Suggestions"
        100038,
        'ReviewedByUser',
        'Reviewed By User',
        NULL,
        'TEXT',
        200,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '43d9e184-f855-43a3-b704-d0036172dd30' OR ("EntityID" = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND "Name" = 'Tag')
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
        '43d9e184-f855-43a3-b704-d0036172dd30',
        'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- "Entity": "MJ": "Tag" "Synonyms"
        100013,
        'Tag',
        'Tag',
        NULL,
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e7aa3a90-0588-4579-8f17-6a6a5c69f51c' OR ("EntityID" = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND "Name" = 'Tag')
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
        'e7aa3a90-0588-4579-8f17-6a6a5c69f51c',
        'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- "Entity": "MJ": "Tag" "Scopes"
        100013,
        'Tag',
        'Tag',
        NULL,
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f98b5333-dfd0-4163-8068-95a913d7326d' OR ("EntityID" = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND "Name" = 'ScopeEntity')
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
        'f98b5333-dfd0-4163-8068-95a913d7326d',
        'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- "Entity": "MJ": "Tag" "Scopes"
        100014,
        'ScopeEntity',
        'Scope Entity',
        NULL,
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
               SET "IsNameField" = TRUE
               WHERE "ID" = 'E7AA3A90-0588-4579-8F17-6A6A5C69F51C'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'F98B5333-DFD0-4163-8068-95A913D7326D'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '7366BE86-000C-44E3-8B16-FC97FBD8B586'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E7AA3A90-0588-4579-8F17-6A6A5C69F51C'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F98B5333-DFD0-4163-8068-95A913D7326D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '7366BE86-000C-44E3-8B16-FC97FBD8B586'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'E7AA3A90-0588-4579-8F17-6A6A5C69F51C'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'F98B5333-DFD0-4163-8068-95A913D7326D'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'E7AA3A90-0588-4579-8F17-6A6A5C69F51C'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'F98B5333-DFD0-4163-8068-95A913D7326D'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '7366BE86-000C-44E3-8B16-FC97FBD8B586'
               AND "AutoUpdateUserSearchPredicate" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '2D4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '8E4149A0-D01D-48FD-9E1B-8764EBC4409D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '2D4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '2D4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '2C4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'F95E7337-1169-4D05-B6EC-0A14A7626E21'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F95E7337-1169-4D05-B6EC-0A14A7626E21'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B50A4543-D60F-4440-9587-CB61C449D06A'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4AE65FCA-B822-44F1-AC56-70606E6CC190'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '43D9E184-F855-43A3-B704-D0036172DD30'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'F95E7337-1169-4D05-B6EC-0A14A7626E21'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'B50A4543-D60F-4440-9587-CB61C449D06A'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '43D9E184-F855-43A3-B704-D0036172DD30'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'B50A4543-D60F-4440-9587-CB61C449D06A'
               AND "AutoUpdateUserSearchPredicate" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '25782CCD-889E-433D-B2CC-C2A0E2E2BE5D'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '25782CCD-889E-433D-B2CC-C2A0E2E2BE5D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '83526F85-6ADC-40BD-A2DF-AC433F616F9B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'EF060F94-EFB2-4057-AF53-4B13280C307C'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5D1C0858-4387-4070-A37E-F1B9D840E43B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '51C44037-ED00-47BB-91F9-AA6B344DEC75'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '25782CCD-889E-433D-B2CC-C2A0E2E2BE5D'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '83526F85-6ADC-40BD-A2DF-AC433F616F9B'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'EF060F94-EFB2-4057-AF53-4B13280C307C'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '51C44037-ED00-47BB-91F9-AA6B344DEC75'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '25782CCD-889E-433D-B2CC-C2A0E2E2BE5D'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '83526F85-6ADC-40BD-A2DF-AC433F616F9B'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'EF060F94-EFB2-4057-AF53-4B13280C307C'
               AND "AutoUpdateUserSearchPredicate" = TRUE;
/* Set categories for 8 fields */
-- UPDATE Entity Field Category Info MJ: Tag Scopes."Tag"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E7AA3A90-0588-4579-8F17-6A6A5C69F51C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Scopes."TagID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '78A7D431-93EB-485A-9667-E2CE0EB31F2A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Scopes."ScopeEntity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Scope Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F98B5333-DFD0-4163-8068-95A913D7326D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Scopes."ScopeEntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Scope Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '815C5C75-ECDE-4090-BC99-615C6B209532' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Scopes."ScopeRecordID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Scope Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7366BE86-000C-44E3-8B16-FC97FBD8B586' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Scopes."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8B3123F9-9973-4C70-9B0B-7156A6BD57F2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Scopes.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '73FA4EEF-DB95-469D-92B0-3318A9C2663D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Scopes.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B925E50C-AA27-4C58-9C3A-9625E17989E8' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-tags */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-tags', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('73b3b11d-8453-40d3-be50-8408485656b0', 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', 'FieldCategoryInfo', '{"Tag Configuration":{"icon":"fa fa-tag","description":"Basic details regarding the tag being scoped"},"Scope Definition":{"icon":"fa fa-crosshairs","description":"Defines the specific entity and record context for tag visibility"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('957f9756-6a09-48d4-be47-25de84ed5ed1', 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', 'FieldCategoryIcons', '{"Tag Configuration":"fa fa-tag","Scope Definition":"fa fa-crosshairs","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: junction, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C';
/* Set categories for 7 fields */
-- UPDATE Entity Field Category Info MJ: Tag Synonyms."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6BA484DC-192C-4D78-BDA6-F05CC8FB9565' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Synonyms."TagID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Mapping',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DE84807F-A1A6-40ED-A154-BC7B7F59FAD3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Synonyms."Tag"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tag Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '43D9E184-F855-43A3-B704-D0036172DD30' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Synonyms."Synonym"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Synonym Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F95E7337-1169-4D05-B6EC-0A14A7626E21' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Synonyms."Source"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Synonym Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B50A4543-D60F-4440-9587-CB61C449D06A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Synonyms.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2FBD3C83-DC1C-41B6-9BF2-BBE89DC42901' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Synonyms.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4AE65FCA-B822-44F1-AC56-70606E6CC190' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-tags */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-tags', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('c19caa18-c01d-4214-9529-a1e1627298e8', 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', 'FieldCategoryInfo', '{"Tag Mapping":{"icon":"fa fa-link","description":"Defines the relationship between the synonym and the target tag"},"Synonym Details":{"icon":"fa fa-tag","description":"Details regarding the synonym term and its origin"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('451f3f46-39b0-452f-9566-c27bb0dadef4', 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', 'FieldCategoryIcons', '{"Tag Mapping":"fa fa-link","Synonym Details":"fa fa-tag","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0';
/* Set categories for 23 fields */
-- UPDATE Entity Field Category Info MJ: Tags."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2B4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2C4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."DisplayName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2D4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2E4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."ParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."Parent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '674317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."RootParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '55C353F4-3F77-4BE6-B931-AA23603CF3CA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '44B30122-35F7-4954-82AA-329F26486ED5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."MergedIntoTagID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Merged Into',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '23E00FA1-C0B5-4370-B526-78F65F2571D2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."MergedIntoTag"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Merged Into Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD942B17-CF54-41C5-B8B3-6A66BAC2C41E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."RootMergedIntoTagID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Merged Into',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D47C8E2A-AAAC-4C4D-992E-F595DC94877C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."IsGlobal"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8E4149A0-D01D-48FD-9E1B-8764EBC4409D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."AllowAutoGrow"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '188A03E5-163F-4305-B05D-A1CAFC786695' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."IsFrozen"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '06C53AD9-6E47-40F6-8A54-22B08FFAC96E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."MaxChildren"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '40C2E9D8-C6F6-4060-B56B-88ABBC8E0698' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."MaxDescendantDepth"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B752F3F4-1D32-4645-925F-28E6D6C122C0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."MinWeight"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9E7ED65E-41C6-4C6D-8659-52CFFF1B46DD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."RequiresReview"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E54B8418-2042-44D3-ACDD-00E34D6DB818' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."EmbeddingVector"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI Intelligence',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '32BD0C45-CE4C-41C5-8F42-9075A36B27AE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."EmbeddingModelID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI Intelligence',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Embedding Model',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2681AEAC-3D38-478E-854B-9C0D271279F8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."EmbeddingModel"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI Intelligence',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Embedding Model Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '01AE9E00-305F-4FEC-B8D2-A0A906D34F70' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BA5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Tag Configuration":{"icon":"fa fa-sliders-h","description":"Behavioral settings and constraints for tag management and auto-tagging."},"AI Intelligence":{"icon":"fa fa-brain","description":"AI-related fields for semantic embeddings and model tracking."}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryInfo';
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Tag Configuration":"fa fa-sliders-h","AI Intelligence":"fa fa-brain"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryIcons';
/* Set categories for 22 fields */
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AC912468-B579-46CE-A7F7-CB110AA54789' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."ProposedName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Suggestion Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '25782CCD-889E-433D-B2CC-C2A0E2E2BE5D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."ProposedParentID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Suggestion Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Proposed Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2CBA41B4-7CA6-43B7-B854-8F1B5C9D8413' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."ProposedParent"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Suggestion Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Proposed Parent Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B444EB26-6ED0-4BEB-8F8C-F6C6B5CFD820' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."BestMatchTagID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Analysis',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Best Match Tag',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D9DFCF44-E225-4EC2-A08C-C2C1EDE9565D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."BestMatchTag"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Analysis',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Best Match Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5D1C0858-4387-4070-A37E-F1B9D840E43B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."BestMatchScore"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Analysis',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '14685A97-7362-4755-847B-3C6043D0967F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."Reason"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Suggestion Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '83526F85-6ADC-40BD-A2DF-AC433F616F9B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."SourceContentItemID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source Content Item',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FBAB09CD-DB94-4DB7-A3C2-B783247E0E21' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."SourceContentItem"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source Content Item Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '51C44037-ED00-47BB-91F9-AA6B344DEC75' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."SourceContentSourceID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source Content Source',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3BDFB3E2-F43E-44AB-AD6B-516C47C12E9B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."SourceContentSource"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source Content Source Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D972301F-D1DA-4CBD-90E7-3C6657D15F64' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."SourceText"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Context',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '960C7BEA-30A6-4D48-845A-065D8A6275BE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Review Workflow',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EF060F94-EFB2-4057-AF53-4B13280C307C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."ResolvedTagID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Review Workflow',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Resolved Tag',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9D6D17DA-DA7F-43F1-90F1-424F908448D9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."ResolvedTag"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Review Workflow',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Resolved Tag Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DBBF3AF6-4C7C-4116-B357-CE0643E0C7DD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."ReviewedByUserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Review Workflow',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Reviewed By User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D5357C14-3B81-4A98-9E1D-516B56248907' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."ReviewedByUser"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Review Workflow',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Reviewed By User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CC4C9E6D-6326-4E28-BB7D-7686CB281FBE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."ReviewedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Review Workflow',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C4FD8477-E9B1-4156-8B34-0D03D2E332DC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions."ReviewerNotes"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Review Workflow',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7A894CCA-6BCE-4F45-ADA9-D750813A7462' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '371B3A78-7A29-4C93-99E5-E88E8F243C63' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Suggestions.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6AD03EFF-39F3-4227-9260-BB2E3118F6FC' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-tags */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-tags', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('b02900a4-fdc4-4cd9-b2cf-e6f796e94ecb', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'FieldCategoryInfo', '{"Suggestion Details":{"icon":"fa fa-lightbulb","description":"Core details regarding the proposed tag and the reason for its generation."},"Matching Analysis":{"icon":"fa fa-project-diagram","description":"System-calculated match scores and references to existing taxonomy tags."},"Source Context":{"icon":"fa fa-file-alt","description":"Contextual information about the content source that triggered the suggestion."},"Review Workflow":{"icon":"fa fa-check-double","description":"Review status, resolution details, and audit information for human-in-the-loop actions."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('f16cd1e5-bdbc-436e-9e37-738d0e3fff57', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'FieldCategoryIcons', '{"Suggestion Details":"fa fa-lightbulb","Matching Analysis":"fa fa-project-diagram","Source Context":"fa fa-file-alt","Review Workflow":"fa fa-check-double","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=1 for NEW entity (category: primary, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451';


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwTagSynonyms" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Tag Synonyms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Synonyms
-- Item: Permissions for vwTagSynonyms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwTagSynonyms" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Tag Synonyms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Synonyms
-- Item: spCreateTagSynonym
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TagSynonym
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTagSynonym" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Tag Synonyms */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTagSynonym" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Tag Synonyms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Synonyms
-- Item: spUpdateTagSynonym
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TagSynonym
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTagSynonym" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTagSynonym" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tag Synonyms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Synonyms
-- Item: spDeleteTagSynonym
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagSynonym
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagSynonym" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tag Synonyms */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagSynonym" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID D9DFCF44-E225-4EC2-A08C-C2C1EDE9565D */

DO $$ BEGIN GRANT SELECT ON __mj."vwTagScopes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Tag Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Scopes
-- Item: Permissions for vwTagScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwTagScopes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Tag Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Scopes
-- Item: spCreateTagScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TagScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTagScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Tag Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTagScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Tag Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Scopes
-- Item: spUpdateTagScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TagScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTagScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTagScope" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tag Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Scopes
-- Item: spDeleteTagScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tag Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID FBAB09CD-DB94-4DB7-A3C2-B783247E0E21 */

DO $$ BEGIN GRANT SELECT ON __mj."vwTagSuggestions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Tag Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Suggestions
-- Item: Permissions for vwTagSuggestions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwTagSuggestions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Tag Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Suggestions
-- Item: spCreateTagSuggestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TagSuggestion
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTagSuggestion" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Tag Suggestions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTagSuggestion" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Tag Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Suggestions
-- Item: spUpdateTagSuggestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TagSuggestion
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTagSuggestion" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTagSuggestion" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tag Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Suggestions
-- Item: spDeleteTagSuggestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagSuggestion
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagSuggestion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tag Suggestions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagSuggestion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for Tag */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Tag;

DO $$ BEGIN GRANT SELECT ON __mj."vwTags" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: Permissions for vwTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwTags" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spCreateTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Tag
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTag" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Tags */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTag" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spUpdateTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Tag
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTag" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTag" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spDeleteTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Tag
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTag" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tags */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTag" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."Tag"."IsGlobal" IS 'When 1, the tag is visible to every tenant/scope. When 0, the tag is only visible to the (Entity, Record) pairs listed in TagScope. Cannot be set together with TagScope rows — enforced in entity Save() override.';

COMMENT ON COLUMN __mj."Tag"."AllowAutoGrow" IS 'When 1, the autotagger may auto-create new child tags under this node when running in AutoGrow or FreeFlow mode. When 0, new children must come through the TagSuggestion review queue.';

COMMENT ON COLUMN __mj."Tag"."IsFrozen" IS 'When 1, this subtree is locked: no new children may be created under this node or any descendant, regardless of taxonomy mode. Existing children remain editable.';

COMMENT ON COLUMN __mj."Tag"."MaxChildren" IS 'Optional cap on the number of direct children allowed under this tag. NULL = unlimited. Auto-grow is blocked once this cap is reached and routed to the TagSuggestion queue.';

COMMENT ON COLUMN __mj."Tag"."MaxDescendantDepth" IS 'Optional cap on the depth of the subtree rooted at this tag. NULL = unlimited. 0 = leaf-only (no children at all). Enforced via ancestor walk during auto-grow.';

COMMENT ON COLUMN __mj."Tag"."MinWeight" IS 'Optional minimum classifier confidence (0.00-1.00) required for this tag to be applied. Items below this floor are routed to the TagSuggestion queue instead of being tagged.';

COMMENT ON COLUMN __mj."Tag"."RequiresReview" IS 'When 1, every classifier-applied use of this tag is routed to the TagSuggestion queue for human approval before being persisted as a ContentItemTag → TaggedItem.';

COMMENT ON COLUMN __mj."Tag"."EmbeddingVector" IS 'JSON-encoded numeric vector representing the tag';

COMMENT ON COLUMN __mj."Tag"."EmbeddingModelID" IS 'AI model whose embedding produced EmbeddingVector. When the configured tag-embedding model differs from this value, the cached vector is treated as stale and recomputed.';

COMMENT ON TABLE __mj."TagScope" IS 'Polymorphic junction binding a Tag to one or more (Entity, Record) scope rows. A Tag with one or more TagScope rows is only visible inside those scopes; a Tag with no rows AND IsGlobal=1 is visible everywhere. Mirrors the shape of TaggedItem.';

COMMENT ON COLUMN __mj."TagScope"."TagID" IS 'The Tag whose visibility this row constrains.';

COMMENT ON COLUMN __mj."TagScope"."ScopeEntityID" IS 'Entity that the scope record belongs to (e.g., Companies, AI Agents). Combined with ScopeRecordID identifies the specific tenant or context that may see the tag.';

COMMENT ON COLUMN __mj."TagScope"."ScopeRecordID" IS 'Primary key value of the scope record. Stored as VARCHAR(450) to match the polymorphic RecordID convention used by TaggedItem.';

COMMENT ON TABLE __mj."TagSynonym" IS 'Alternate names that should resolve to a Tag during autotagging. Consulted before exact/fuzzy/semantic match tiers in TagEngine."ResolveTag".';

COMMENT ON COLUMN __mj."TagSynonym"."TagID" IS 'The Tag this synonym maps to.';

COMMENT ON COLUMN __mj."TagSynonym"."Synonym" IS 'The alternate name that should resolve to the Tag. Case-insensitive; uniqueness is enforced per-Tag via UQ_TagSynonym_Tag_Synonym.';

COMMENT ON COLUMN __mj."TagSynonym"."Source" IS 'How this synonym was introduced. Manual = admin-authored; LLM = suggested by an LLM run; Imported = bulk-loaded; Merged = inherited from a tag merged into this one.';

COMMENT ON TABLE __mj."TagSuggestion" IS 'Human-in-the-loop review queue for tag changes the autotagger could not commit autonomously: ambiguous matches, governance-blocked auto-grows, low-usage deprecation candidates, and merge candidates from co-occurrence analysis.';

COMMENT ON COLUMN __mj."TagSuggestion"."ProposedName" IS 'The proposed tag name as seen by the classifier or analyzer.';

COMMENT ON COLUMN __mj."TagSuggestion"."ProposedParentID" IS 'Tag under which the suggestion would be created if approved as a new tag. NULL = root.';

COMMENT ON COLUMN __mj."TagSuggestion"."BestMatchTagID" IS 'When non-null, the existing Tag the system believes is the closest match. The reviewer may accept this as a merge target instead of creating a new tag.';

COMMENT ON COLUMN __mj."TagSuggestion"."BestMatchScore" IS 'Cosine similarity score (0.000-1.000) between the proposed name embedding and BestMatchTagID';

COMMENT ON COLUMN __mj."TagSuggestion"."Reason" IS 'Why this suggestion was created. Free-form TEXT for forward compatibility; conventional values include ConstrainedMode, BelowThreshold, ParentFrozen, AutoGrowDisabled, MaxChildrenExceeded, MaxDepthExceeded, BelowMinWeight, RequiresReview, MergeCandidate, LowUsage, WideNode.';

COMMENT ON COLUMN __mj."TagSuggestion"."SourceContentItemID" IS 'ContentItem that triggered this suggestion, when item-level. NULL for taxonomy-level suggestions (merge candidates, low-usage alerts).';

COMMENT ON COLUMN __mj."TagSuggestion"."SourceContentSourceID" IS 'ContentSource that triggered this suggestion, when source-attributable.';

COMMENT ON COLUMN __mj."TagSuggestion"."SourceText" IS 'Optional snippet of source text that prompted the suggestion. Useful for reviewer context.';

COMMENT ON COLUMN __mj."TagSuggestion"."Status" IS 'Pending = awaiting review; Approved = accepted as a new tag; Merged = accepted as a merge into BestMatchTagID; Rejected = dismissed.';

COMMENT ON COLUMN __mj."TagSuggestion"."ResolvedTagID" IS 'When Approved or Merged, points to the resulting Tag (the new tag for Approved, the merge target for Merged).';

COMMENT ON COLUMN __mj."TagSuggestion"."ReviewedByUserID" IS 'User who took action on this suggestion.';

COMMENT ON COLUMN __mj."TagSuggestion"."ReviewedAt" IS 'Timestamp of the review action.';

COMMENT ON COLUMN __mj."TagSuggestion"."ReviewerNotes" IS 'Free-form notes captured at review time. Useful for rejection rationale or merge decisions.';


-- ===================== Other =====================

-- CODEGEN RUN
/* SQL generated to create new entity MJ: Tag Scopes */

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Tag Synonyms */

/* spUpdate Permissions for MJ: Tag Scopes */

/* spUpdate Permissions for MJ: Tag Suggestions */

/* spUpdate Permissions for MJ: Tags */
