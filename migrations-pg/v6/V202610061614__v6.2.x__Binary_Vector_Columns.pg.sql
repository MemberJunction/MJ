-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610061614__v6.2.x__Binary_Vector_Columns.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The T-SQL migration ends its DDL with sp_refreshview on vwEntityRecordDocuments, vwAIAgentNotes,
-- vwAIAgentExamples, vwQueries, vwTags and vwComponents so the views pick up the new columns. The
-- transpiler reported five of the six and silently dropped the first. PostgreSQL has no
-- sp_refreshview and freezes a view's column list at CREATE; all six views are CodeGen-generated
-- (BaseViewGenerated = true), so the CodeGen section baked below regenerates each view, and the CRUD
-- routines, with the new BYTEA columns. Nothing is ported for the refresh calls themselves.
-- ╚════════════════════════════════════════╝

ALTER TABLE __mj."EntityRecordDocument"
ADD COLUMN "VectorBinary" BYTEA NULL /* ============================================================================= */ /* Binary companions for every persisted embedding vector */ /* ============================================================================= */ /* Embeddings are stored as JSON text today (e.g. EntityRecordDocument.VectorJSON), which every */ /* index load must parse number by number — about 4.4 s for 20,000 × 1,536 vectors — and which */ /* takes 3–5× the space of the raw values. Each embedding column gets a VARBINARY(MAX) companion */ /* holding the same vector as little-endian IEEE-754 float32 bytes (4 bytes per dimension, no */ /* header; the dimension count is DATALENGTH / 4). */ /* The JSON columns are kept: existing rows keep working, readers fall back to them when the */ /* binary column is NULL (so no backfill is needed — the next embedding of each record fills it), */ /* and dropping them would break the publish-no-break policy. */ /* Writers set both columns. Readers prefer the binary column. In a BaseEntity, and over GraphQL, */ /* a binary value is a base64 string; the database providers convert at the database boundary. */ /* The views select the base tables with `*`, so they are refreshed after the ALTERs; the */ /* repeatable R__RefreshMetadata script then recompiles views and renumbers EntityField sequences. */ /* ============================================================================= */;

COMMENT ON COLUMN __mj."EntityRecordDocument"."VectorBinary" IS 'The embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of VectorJSON. Written alongside VectorJSON by vector sync; readers prefer it and fall back to VectorJSON when it is NULL.';

ALTER TABLE __mj."AIAgentNote"
ADD COLUMN "EmbeddingVectorBinary" BYTEA NULL;

COMMENT ON COLUMN __mj."AIAgentNote"."EmbeddingVectorBinary" IS 'The note embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.';

ALTER TABLE __mj."AIAgentExample"
ADD COLUMN "EmbeddingVectorBinary" BYTEA NULL;

COMMENT ON COLUMN __mj."AIAgentExample"."EmbeddingVectorBinary" IS 'The example embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.';

ALTER TABLE __mj."Query"
ADD COLUMN "EmbeddingVectorBinary" BYTEA NULL;

COMMENT ON COLUMN __mj."Query"."EmbeddingVectorBinary" IS 'The query embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.';

ALTER TABLE __mj."Tag"
ADD COLUMN "EmbeddingVectorBinary" BYTEA NULL;

COMMENT ON COLUMN __mj."Tag"."EmbeddingVectorBinary" IS 'The tag embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.';

ALTER TABLE __mj."Component"
  ADD COLUMN "FunctionalRequirementsVectorBinary" BYTEA NULL,
  ADD COLUMN "TechnicalDesignVectorBinary" BYTEA NULL;

COMMENT ON COLUMN __mj."Component"."FunctionalRequirementsVectorBinary" IS 'The functional-requirements embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of FunctionalRequirementsVector. Written alongside FunctionalRequirementsVector; readers prefer it and fall back to FunctionalRequirementsVector when it is NULL.';

COMMENT ON COLUMN __mj."Component"."TechnicalDesignVectorBinary" IS 'The technical-design embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of TechnicalDesignVector. Written alongside TechnicalDesignVector; readers prefer it and fall back to TechnicalDesignVector when it is NULL.';

/* Pick up the new columns in the views that select the base tables with `*`. */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e2624541-4a9a-461b-bcc4-ee5c1e870baf' OR ("EntityID" = '21248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'VectorBinary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e2624541-4a9a-461b-bcc4-ee5c1e870baf', '21248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entity Record Documents */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '21248F34-2837-EF11-86D4-6045BDEE16E6'), 'VectorBinary', 'Vector Binary', 'The embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of VectorJSON. Written alongside VectorJSON by vector sync; readers prefer it and fall back to VectorJSON when it is NULL.', 'varbinary', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0670bf39-1c81-4501-b517-50a5c3a79ec1' OR ("EntityID" = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND "Name" = 'EmbeddingVectorBinary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0670bf39-1c81-4501-b517-50a5c3a79ec1', 'A24EF5EC-D32C-4A53-85A9-364E322451E6' /* Entity: MJ: AI Agent Notes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A24EF5EC-D32C-4A53-85A9-364E322451E6'), 'EmbeddingVectorBinary', 'Embedding Vector Binary', 'The note embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.', 'varbinary', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'edc9e7eb-1a9e-4728-aba4-32d150d3f6ae' OR ("EntityID" = '3A139346-CC48-479A-A53B-8892664F5DFD' AND "Name" = 'EmbeddingVectorBinary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('edc9e7eb-1a9e-4728-aba4-32d150d3f6ae', '3A139346-CC48-479A-A53B-8892664F5DFD' /* Entity: MJ: AI Agent Examples */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3A139346-CC48-479A-A53B-8892664F5DFD'), 'EmbeddingVectorBinary', 'Embedding Vector Binary', 'The example embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.', 'varbinary', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b88ef2f6-711f-4081-9ebc-3562be686115' OR ("EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EmbeddingVectorBinary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b88ef2f6-711f-4081-9ebc-3562be686115', '1B248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Queries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6'), 'EmbeddingVectorBinary', 'Embedding Vector Binary', 'The query embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.', 'varbinary', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '09d952c6-9a1c-4752-a76f-54ebdd8c9839' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EmbeddingVectorBinary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('09d952c6-9a1c-4752-a76f-54ebdd8c9839', '0C248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Tags */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6'), 'EmbeddingVectorBinary', 'Embedding Vector Binary', 'The tag embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.', 'varbinary', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9f87bb61-779c-4c38-ad2e-563d953d8b54' OR ("EntityID" = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND "Name" = 'FunctionalRequirementsVectorBinary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9f87bb61-779c-4c38-ad2e-563d953d8b54', '0FB98A1D-C6AE-4427-B66C-7B31E669756F' /* Entity: MJ: Components */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0FB98A1D-C6AE-4427-B66C-7B31E669756F'), 'FunctionalRequirementsVectorBinary', 'Functional Requirements Vector Binary', 'The functional-requirements embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of FunctionalRequirementsVector. Written alongside FunctionalRequirementsVector; readers prefer it and fall back to FunctionalRequirementsVector when it is NULL.', 'varbinary', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '52c86f71-cccb-4ac9-a175-103d9adb2a2f' OR ("EntityID" = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND "Name" = 'TechnicalDesignVectorBinary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('52c86f71-cccb-4ac9-a175-103d9adb2a2f', '0FB98A1D-C6AE-4427-B66C-7B31E669756F' /* Entity: MJ: Components */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0FB98A1D-C6AE-4427-B66C-7B31E669756F'), 'TechnicalDesignVectorBinary', 'Technical Design Vector Binary', 'The technical-design embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of TechnicalDesignVector. Written alongside TechnicalDesignVector; readers prefer it and fall back to TechnicalDesignVector when it is NULL.', 'varbinary', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Record Documents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_record_document_entity_id"
    ON "__mj"."EntityRecordDocument" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_record_document_entity_document_id"
    ON "__mj"."EntityRecordDocument" ("EntityDocumentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_record_document_vector_index_id"
    ON "__mj"."EntityRecordDocument" ("VectorIndexID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Record Documents
-- Item: vwEntityRecordDocuments
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Record Documents
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityRecordDocument
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwEntityRecordDocuments"
AS
SELECT
    e.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJEntityDocument_EntityDocumentID."Name" AS "EntityDocument",
    MJVectorIndex_VectorIndexID."Name" AS "VectorIndex"
FROM
    "__mj"."EntityRecordDocument" AS e
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "e"."EntityID" = MJEntity_EntityID."ID"
INNER JOIN
    "__mj"."EntityDocument" AS MJEntityDocument_EntityDocumentID
  ON
    "e"."EntityDocumentID" = MJEntityDocument_EntityDocumentID."ID"
INNER JOIN
    "__mj"."VectorIndex" AS MJVectorIndex_VectorIndexID
  ON
    "e"."VectorIndexID" = MJVectorIndex_VectorIndexID."ID"
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
        AND tc.relname = 'vwEntityRecordDocuments'
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
                           AND tc.relname = 'vwEntityRecordDocuments'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwEntityRecordDocuments" CASCADE;
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
GRANT SELECT ON "__mj"."vwEntityRecordDocuments" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwEntityRecordDocuments" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwEntityRecordDocuments" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Record Documents
-- Item: spCreateEntityRecordDocument
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityRecordDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityRecordDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityRecordDocument"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_entitydocumentid UUID DEFAULT NULL,
    p_documenttext_clear boolean DEFAULT false,
    p_documenttext TEXT DEFAULT NULL,
    p_vectorindexid UUID DEFAULT NULL,
    p_vectorid_clear boolean DEFAULT false,
    p_vectorid varchar(50) DEFAULT NULL,
    p_vectorjson_clear boolean DEFAULT false,
    p_vectorjson TEXT DEFAULT NULL,
    p_entityrecordupdatedat TIMESTAMPTZ DEFAULT NULL,
    p_vectorbinary_clear boolean DEFAULT false,
    p_vectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityRecordDocuments" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityRecordDocument"
        (
            "ID",
            "EntityID",
                "RecordID",
                "EntityDocumentID",
                "DocumentText",
                "VectorIndexID",
                "VectorID",
                "VectorJSON",
                "EntityRecordUpdatedAt",
                "VectorBinary"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_recordid,
                p_entitydocumentid,
                CASE WHEN p_documenttext_clear = true THEN NULL ELSE COALESCE(p_documenttext, NULL) END,
                p_vectorindexid,
                CASE WHEN p_vectorid_clear = true THEN NULL ELSE COALESCE(p_vectorid, NULL) END,
                CASE WHEN p_vectorjson_clear = true THEN NULL ELSE COALESCE(p_vectorjson, NULL) END,
                p_entityrecordupdatedat,
                CASE WHEN p_vectorbinary_clear = true THEN NULL ELSE COALESCE(p_vectorbinary, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityRecordDocuments"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityRecordDocument" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityRecordDocument" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Record Documents
-- Item: spUpdateEntityRecordDocument
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityRecordDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityRecordDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityRecordDocument"(
    p_id UUID,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_entitydocumentid UUID DEFAULT NULL,
    p_documenttext_clear boolean DEFAULT false,
    p_documenttext TEXT DEFAULT NULL,
    p_vectorindexid UUID DEFAULT NULL,
    p_vectorid_clear boolean DEFAULT false,
    p_vectorid varchar(50) DEFAULT NULL,
    p_vectorjson_clear boolean DEFAULT false,
    p_vectorjson TEXT DEFAULT NULL,
    p_entityrecordupdatedat TIMESTAMPTZ DEFAULT NULL,
    p_vectorbinary_clear boolean DEFAULT false,
    p_vectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityRecordDocuments" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityRecordDocument"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "EntityDocumentID" = COALESCE(p_entitydocumentid, "EntityDocumentID"),
        "DocumentText" = CASE WHEN p_documenttext_clear = true THEN NULL ELSE COALESCE(p_documenttext, "DocumentText") END,
        "VectorIndexID" = COALESCE(p_vectorindexid, "VectorIndexID"),
        "VectorID" = CASE WHEN p_vectorid_clear = true THEN NULL ELSE COALESCE(p_vectorid, "VectorID") END,
        "VectorJSON" = CASE WHEN p_vectorjson_clear = true THEN NULL ELSE COALESCE(p_vectorjson, "VectorJSON") END,
        "EntityRecordUpdatedAt" = COALESCE(p_entityrecordupdatedat, "EntityRecordUpdatedAt"),
        "VectorBinary" = CASE WHEN p_vectorbinary_clear = true THEN NULL ELSE COALESCE(p_vectorbinary, "VectorBinary") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityRecordDocuments"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityRecordDocument" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityRecordDocument" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityRecordDocument table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_record_document"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_record_document" ON "__mj"."EntityRecordDocument";

CREATE TRIGGER "trg_update_entity_record_document"
BEFORE UPDATE ON "__mj"."EntityRecordDocument"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_record_document"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Record Documents
-- Item: spDeleteEntityRecordDocument
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityRecordDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityRecordDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityRecordDocument"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."EntityRecordDocument"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityRecordDocument" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityRecordDocument" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_agent_id"
    ON "__mj"."AIAgentNote" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_agent_note_type_id"
    ON "__mj"."AIAgentNote" ("AgentNoteTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_user_id"
    ON "__mj"."AIAgentNote" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_conversation_id"
    ON "__mj"."AIAgentNote" ("SourceConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_conversation_detail_id"
    ON "__mj"."AIAgentNote" ("SourceConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_ai_agent_run_id"
    ON "__mj"."AIAgentNote" ("SourceAIAgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_company_id"
    ON "__mj"."AIAgentNote" ("CompanyID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_embedding_model_id"
    ON "__mj"."AIAgentNote" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_primary_scope_entity_id"
    ON "__mj"."AIAgentNote" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_consolidated_into_note_id"
    ON "__mj"."AIAgentNote" ("ConsolidatedIntoNoteID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: vwAIAgentNotes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Notes
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentNote
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentNotes"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentNoteType_AgentNoteTypeID."Name" AS "AgentNoteType",
    MJUser_UserID."Name" AS "User",
    MJConversation_SourceConversationID."Name" AS "SourceConversation",
    MJConversationDetail_SourceConversationDetailID."ExternalID" AS "SourceConversationDetail",
    MJAIAgentRun_SourceAIAgentRunID."RunName" AS "SourceAIAgentRun",
    MJCompany_CompanyID."Name" AS "Company",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    MJAIAgentNote_ConsolidatedIntoNoteID."Type" AS "ConsolidatedIntoNote"
FROM
    "__mj"."AIAgentNote" AS a
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentNoteType" AS MJAIAgentNoteType_AgentNoteTypeID
  ON
    "a"."AgentNoteTypeID" = MJAIAgentNoteType_AgentNoteTypeID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."Conversation" AS MJConversation_SourceConversationID
  ON
    "a"."SourceConversationID" = MJConversation_SourceConversationID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationDetail" AS MJConversationDetail_SourceConversationDetailID
  ON
    "a"."SourceConversationDetailID" = MJConversationDetail_SourceConversationDetailID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_SourceAIAgentRunID
  ON
    "a"."SourceAIAgentRunID" = MJAIAgentRun_SourceAIAgentRunID."ID"
LEFT OUTER JOIN
    "__mj"."Company" AS MJCompany_CompanyID
  ON
    "a"."CompanyID" = MJCompany_CompanyID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "a"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentNote" AS MJAIAgentNote_ConsolidatedIntoNoteID
  ON
    "a"."ConsolidatedIntoNoteID" = MJAIAgentNote_ConsolidatedIntoNoteID."ID"
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
        AND tc.relname = 'vwAIAgentNotes'
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
                           AND tc.relname = 'vwAIAgentNotes'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentNotes" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIAgentNotes" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentNotes" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentNotes" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: spCreateAIAgentNote
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentNote
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentNote'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentNote"(
    p_id UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_agentnotetypeid_clear boolean DEFAULT false,
    p_agentnotetypeid UUID DEFAULT NULL,
    p_note_clear boolean DEFAULT false,
    p_note TEXT DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid UUID DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid UUID DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid UUID DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid UUID DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid varchar(100) DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes TEXT DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount int DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_consolidatedintonoteid_clear boolean DEFAULT false,
    p_consolidatedintonoteid UUID DEFAULT NULL,
    p_consolidationcount int DEFAULT NULL,
    p_derivedfromnoteids_clear boolean DEFAULT false,
    p_derivedfromnoteids TEXT DEFAULT NULL,
    p_protectiontier varchar(20) DEFAULT NULL,
    p_importancescore_clear boolean DEFAULT false,
    p_importancescore decimal(5, 2) DEFAULT NULL,
    p_authortype varchar(20) DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentNotes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentNote"
        (
            "ID",
            "AgentID",
                "AgentNoteTypeID",
                "Note",
                "UserID",
                "Type",
                "IsAutoGenerated",
                "Comments",
                "Status",
                "SourceConversationID",
                "SourceConversationDetailID",
                "SourceAIAgentRunID",
                "CompanyID",
                "EmbeddingVector",
                "EmbeddingModelID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "LastAccessedAt",
                "AccessCount",
                "ExpiresAt",
                "ConsolidatedIntoNoteID",
                "ConsolidationCount",
                "DerivedFromNoteIDs",
                "ProtectionTier",
                "ImportanceScore",
                "AuthorType",
                "EmbeddingVectorBinary"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, NULL) END,
                CASE WHEN p_agentnotetypeid_clear = true THEN NULL ELSE COALESCE(p_agentnotetypeid, NULL) END,
                CASE WHEN p_note_clear = true THEN NULL ELSE COALESCE(p_note, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                COALESCE(p_type, 'Preference'),
                COALESCE(p_isautogenerated, FALSE),
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_sourceconversationid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationid, NULL) END,
                CASE WHEN p_sourceconversationdetailid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationdetailid, NULL) END,
                CASE WHEN p_sourceaiagentrunid_clear = true THEN NULL ELSE COALESCE(p_sourceaiagentrunid, NULL) END,
                CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, NULL) END,
                CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, NULL) END,
                CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, NULL) END,
                CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, NULL) END,
                CASE WHEN p_lastaccessedat_clear = true THEN NULL ELSE COALESCE(p_lastaccessedat, NULL) END,
                COALESCE(p_accesscount, 0),
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END,
                CASE WHEN p_consolidatedintonoteid_clear = true THEN NULL ELSE COALESCE(p_consolidatedintonoteid, NULL) END,
                COALESCE(p_consolidationcount, 0),
                CASE WHEN p_derivedfromnoteids_clear = true THEN NULL ELSE COALESCE(p_derivedfromnoteids, NULL) END,
                COALESCE(p_protectiontier, 'Standard'),
                CASE WHEN p_importancescore_clear = true THEN NULL ELSE COALESCE(p_importancescore, NULL) END,
                COALESCE(p_authortype, 'MemoryManager'),
                CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentNotes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentNote" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: spUpdateAIAgentNote
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentNote
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentNote'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentNote"(
    p_id UUID,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_agentnotetypeid_clear boolean DEFAULT false,
    p_agentnotetypeid UUID DEFAULT NULL,
    p_note_clear boolean DEFAULT false,
    p_note TEXT DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid UUID DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid UUID DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid UUID DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid UUID DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid varchar(100) DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes TEXT DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount int DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_consolidatedintonoteid_clear boolean DEFAULT false,
    p_consolidatedintonoteid UUID DEFAULT NULL,
    p_consolidationcount int DEFAULT NULL,
    p_derivedfromnoteids_clear boolean DEFAULT false,
    p_derivedfromnoteids TEXT DEFAULT NULL,
    p_protectiontier varchar(20) DEFAULT NULL,
    p_importancescore_clear boolean DEFAULT false,
    p_importancescore decimal(5, 2) DEFAULT NULL,
    p_authortype varchar(20) DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentNotes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentNote"
    SET
        "AgentID" = CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, "AgentID") END,
        "AgentNoteTypeID" = CASE WHEN p_agentnotetypeid_clear = true THEN NULL ELSE COALESCE(p_agentnotetypeid, "AgentNoteTypeID") END,
        "Note" = CASE WHEN p_note_clear = true THEN NULL ELSE COALESCE(p_note, "Note") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "Type" = COALESCE(p_type, "Type"),
        "IsAutoGenerated" = COALESCE(p_isautogenerated, "IsAutoGenerated"),
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "Status" = COALESCE(p_status, "Status"),
        "SourceConversationID" = CASE WHEN p_sourceconversationid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationid, "SourceConversationID") END,
        "SourceConversationDetailID" = CASE WHEN p_sourceconversationdetailid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationdetailid, "SourceConversationDetailID") END,
        "SourceAIAgentRunID" = CASE WHEN p_sourceaiagentrunid_clear = true THEN NULL ELSE COALESCE(p_sourceaiagentrunid, "SourceAIAgentRunID") END,
        "CompanyID" = CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, "CompanyID") END,
        "EmbeddingVector" = CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, "SecondaryScopes") END,
        "LastAccessedAt" = CASE WHEN p_lastaccessedat_clear = true THEN NULL ELSE COALESCE(p_lastaccessedat, "LastAccessedAt") END,
        "AccessCount" = COALESCE(p_accesscount, "AccessCount"),
        "ExpiresAt" = CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, "ExpiresAt") END,
        "ConsolidatedIntoNoteID" = CASE WHEN p_consolidatedintonoteid_clear = true THEN NULL ELSE COALESCE(p_consolidatedintonoteid, "ConsolidatedIntoNoteID") END,
        "ConsolidationCount" = COALESCE(p_consolidationcount, "ConsolidationCount"),
        "DerivedFromNoteIDs" = CASE WHEN p_derivedfromnoteids_clear = true THEN NULL ELSE COALESCE(p_derivedfromnoteids, "DerivedFromNoteIDs") END,
        "ProtectionTier" = COALESCE(p_protectiontier, "ProtectionTier"),
        "ImportanceScore" = CASE WHEN p_importancescore_clear = true THEN NULL ELSE COALESCE(p_importancescore, "ImportanceScore") END,
        "AuthorType" = COALESCE(p_authortype, "AuthorType"),
        "EmbeddingVectorBinary" = CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, "EmbeddingVectorBinary") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentNotes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentNote" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNote table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_note"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_note" ON "__mj"."AIAgentNote";

CREATE TRIGGER "trg_update_ai_agent_note"
BEFORE UPDATE ON "__mj"."AIAgentNote"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_note"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: spDeleteAIAgentNote
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentNote
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentNote'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentNote"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIAgentNote"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentNote" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Examples
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_agent_id"
    ON "__mj"."AIAgentExample" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_user_id"
    ON "__mj"."AIAgentExample" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_company_id"
    ON "__mj"."AIAgentExample" ("CompanyID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_source_conversation_id"
    ON "__mj"."AIAgentExample" ("SourceConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_source_conversation_detail_id"
    ON "__mj"."AIAgentExample" ("SourceConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_source_ai_agent_run_id"
    ON "__mj"."AIAgentExample" ("SourceAIAgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_embedding_model_id"
    ON "__mj"."AIAgentExample" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_primary_scope_entity_id"
    ON "__mj"."AIAgentExample" ("PrimaryScopeEntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Examples
-- Item: vwAIAgentExamples
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Examples
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentExample
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentExamples"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJUser_UserID."Name" AS "User",
    MJCompany_CompanyID."Name" AS "Company",
    MJConversation_SourceConversationID."Name" AS "SourceConversation",
    MJConversationDetail_SourceConversationDetailID."ExternalID" AS "SourceConversationDetail",
    MJAIAgentRun_SourceAIAgentRunID."RunName" AS "SourceAIAgentRun",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity"
FROM
    "__mj"."AIAgentExample" AS a
INNER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."Company" AS MJCompany_CompanyID
  ON
    "a"."CompanyID" = MJCompany_CompanyID."ID"
LEFT OUTER JOIN
    "__mj"."Conversation" AS MJConversation_SourceConversationID
  ON
    "a"."SourceConversationID" = MJConversation_SourceConversationID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationDetail" AS MJConversationDetail_SourceConversationDetailID
  ON
    "a"."SourceConversationDetailID" = MJConversationDetail_SourceConversationDetailID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_SourceAIAgentRunID
  ON
    "a"."SourceAIAgentRunID" = MJAIAgentRun_SourceAIAgentRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "a"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"
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
        AND tc.relname = 'vwAIAgentExamples'
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
                           AND tc.relname = 'vwAIAgentExamples'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentExamples" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIAgentExamples" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentExamples" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentExamples" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Examples
-- Item: spCreateAIAgentExample
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentExample
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentExample'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentExample"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_exampleinput TEXT DEFAULT NULL,
    p_exampleoutput TEXT DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid UUID DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid UUID DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid UUID DEFAULT NULL,
    p_successscore_clear boolean DEFAULT false,
    p_successscore decimal(5, 2) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid UUID DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid varchar(100) DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes TEXT DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount int DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentExamples" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentExample"
        (
            "ID",
            "AgentID",
                "UserID",
                "CompanyID",
                "Type",
                "ExampleInput",
                "ExampleOutput",
                "IsAutoGenerated",
                "SourceConversationID",
                "SourceConversationDetailID",
                "SourceAIAgentRunID",
                "SuccessScore",
                "Comments",
                "Status",
                "EmbeddingVector",
                "EmbeddingModelID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "LastAccessedAt",
                "AccessCount",
                "ExpiresAt",
                "EmbeddingVectorBinary"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, NULL) END,
                COALESCE(p_type, 'Example'),
                p_exampleinput,
                p_exampleoutput,
                COALESCE(p_isautogenerated, FALSE),
                CASE WHEN p_sourceconversationid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationid, NULL) END,
                CASE WHEN p_sourceconversationdetailid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationdetailid, NULL) END,
                CASE WHEN p_sourceaiagentrunid_clear = true THEN NULL ELSE COALESCE(p_sourceaiagentrunid, NULL) END,
                CASE WHEN p_successscore_clear = true THEN NULL ELSE COALESCE(p_successscore, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, NULL) END,
                CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, NULL) END,
                CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, NULL) END,
                CASE WHEN p_lastaccessedat_clear = true THEN NULL ELSE COALESCE(p_lastaccessedat, NULL) END,
                COALESCE(p_accesscount, 0),
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END,
                CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentExamples"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentExample" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentExample" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Examples
-- Item: spUpdateAIAgentExample
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentExample
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentExample'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentExample"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_exampleinput TEXT DEFAULT NULL,
    p_exampleoutput TEXT DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid UUID DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid UUID DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid UUID DEFAULT NULL,
    p_successscore_clear boolean DEFAULT false,
    p_successscore decimal(5, 2) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid UUID DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid varchar(100) DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes TEXT DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount int DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentExamples" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentExample"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "CompanyID" = CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, "CompanyID") END,
        "Type" = COALESCE(p_type, "Type"),
        "ExampleInput" = COALESCE(p_exampleinput, "ExampleInput"),
        "ExampleOutput" = COALESCE(p_exampleoutput, "ExampleOutput"),
        "IsAutoGenerated" = COALESCE(p_isautogenerated, "IsAutoGenerated"),
        "SourceConversationID" = CASE WHEN p_sourceconversationid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationid, "SourceConversationID") END,
        "SourceConversationDetailID" = CASE WHEN p_sourceconversationdetailid_clear = true THEN NULL ELSE COALESCE(p_sourceconversationdetailid, "SourceConversationDetailID") END,
        "SourceAIAgentRunID" = CASE WHEN p_sourceaiagentrunid_clear = true THEN NULL ELSE COALESCE(p_sourceaiagentrunid, "SourceAIAgentRunID") END,
        "SuccessScore" = CASE WHEN p_successscore_clear = true THEN NULL ELSE COALESCE(p_successscore, "SuccessScore") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "Status" = COALESCE(p_status, "Status"),
        "EmbeddingVector" = CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, "SecondaryScopes") END,
        "LastAccessedAt" = CASE WHEN p_lastaccessedat_clear = true THEN NULL ELSE COALESCE(p_lastaccessedat, "LastAccessedAt") END,
        "AccessCount" = COALESCE(p_accesscount, "AccessCount"),
        "ExpiresAt" = CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, "ExpiresAt") END,
        "EmbeddingVectorBinary" = CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, "EmbeddingVectorBinary") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentExamples"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentExample" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentExample" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentExample table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_example"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_example" ON "__mj"."AIAgentExample";

CREATE TRIGGER "trg_update_ai_agent_example"
BEFORE UPDATE ON "__mj"."AIAgentExample"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_example"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Examples
-- Item: spDeleteAIAgentExample
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentExample
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentExample'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentExample"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIAgentExample"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentExample" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentExample" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_category_id"
    ON "__mj"."Query" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_embedding_model_id"
    ON "__mj"."Query" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_sql_dialect_id"
    ON "__mj"."Query" ("SQLDialectID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_external_data_source_id"
    ON "__mj"."Query" ("ExternalDataSourceID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: vwQueries
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Queries
-----               SCHEMA:      __mj
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwQueries"
AS
SELECT
    q.*,
    MJQueryCategory_CategoryID."Name" AS "Category",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJSQLDialect_SQLDialectID."Name" AS "SQLDialect",
    MJExternalDataSource_ExternalDataSourceID."Name" AS "ExternalDataSource"
FROM
    "__mj"."Query" AS q
LEFT OUTER JOIN
    "__mj"."QueryCategory" AS MJQueryCategory_CategoryID
  ON
    "q"."CategoryID" = MJQueryCategory_CategoryID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "q"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
INNER JOIN
    "__mj"."SQLDialect" AS MJSQLDialect_SQLDialectID
  ON
    "q"."SQLDialectID" = MJSQLDialect_SQLDialectID."ID"
LEFT OUTER JOIN
    "__mj"."ExternalDataSource" AS MJExternalDataSource_ExternalDataSourceID
  ON
    "q"."ExternalDataSourceID" = MJExternalDataSource_ExternalDataSourceID."ID"
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
        AND tc.relname = 'vwQueries'
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
                           AND tc.relname = 'vwQueries'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwQueries" CASCADE;
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
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spCreateQuery
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateQuery"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_userquestion_clear boolean DEFAULT false,
    p_userquestion TEXT DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sql_clear boolean DEFAULT false,
    p_sql TEXT DEFAULT NULL,
    p_technicaldescription_clear boolean DEFAULT false,
    p_technicaldescription TEXT DEFAULT NULL,
    p_originalsql_clear boolean DEFAULT false,
    p_originalsql TEXT DEFAULT NULL,
    p_feedback_clear boolean DEFAULT false,
    p_feedback TEXT DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_qualityrank_clear boolean DEFAULT false,
    p_qualityrank int DEFAULT NULL,
    p_executioncostrank_clear boolean DEFAULT false,
    p_executioncostrank int DEFAULT NULL,
    p_usestemplate_clear boolean DEFAULT false,
    p_usestemplate BOOLEAN DEFAULT NULL,
    p_auditqueryruns BOOLEAN DEFAULT NULL,
    p_cacheenabled BOOLEAN DEFAULT NULL,
    p_cachettlminutes_clear boolean DEFAULT false,
    p_cachettlminutes int DEFAULT NULL,
    p_cachemaxsize_clear boolean DEFAULT false,
    p_cachemaxsize int DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_cachevalidationsql_clear boolean DEFAULT false,
    p_cachevalidationsql TEXT DEFAULT NULL,
    p_sqldialectid UUID DEFAULT NULL,
    p_reusable BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_ismaterialized BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueries" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Query"
        (
            "ID",
            "Name",
                "CategoryID",
                "UserQuestion",
                "Description",
                "SQL",
                "TechnicalDescription",
                "OriginalSQL",
                "Feedback",
                "Status",
                "QualityRank",
                "ExecutionCostRank",
                "UsesTemplate",
                "AuditQueryRuns",
                "CacheEnabled",
                "CacheTTLMinutes",
                "CacheMaxSize",
                "EmbeddingVector",
                "EmbeddingModelID",
                "CacheValidationSQL",
                "SQLDialectID",
                "Reusable",
                "ExternalDataSourceID",
                "IsMaterialized",
                "Configuration",
                "EmbeddingVectorBinary"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                CASE WHEN p_userquestion_clear = true THEN NULL ELSE COALESCE(p_userquestion, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_sql_clear = true THEN NULL ELSE COALESCE(p_sql, NULL) END,
                CASE WHEN p_technicaldescription_clear = true THEN NULL ELSE COALESCE(p_technicaldescription, NULL) END,
                CASE WHEN p_originalsql_clear = true THEN NULL ELSE COALESCE(p_originalsql, NULL) END,
                CASE WHEN p_feedback_clear = true THEN NULL ELSE COALESCE(p_feedback, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_qualityrank_clear = true THEN NULL ELSE COALESCE(p_qualityrank, 0) END,
                CASE WHEN p_executioncostrank_clear = true THEN NULL ELSE COALESCE(p_executioncostrank, NULL) END,
                CASE WHEN p_usestemplate_clear = true THEN NULL ELSE COALESCE(p_usestemplate, FALSE) END,
                COALESCE(p_auditqueryruns, FALSE),
                COALESCE(p_cacheenabled, FALSE),
                CASE WHEN p_cachettlminutes_clear = true THEN NULL ELSE COALESCE(p_cachettlminutes, NULL) END,
                CASE WHEN p_cachemaxsize_clear = true THEN NULL ELSE COALESCE(p_cachemaxsize, NULL) END,
                CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_cachevalidationsql_clear = true THEN NULL ELSE COALESCE(p_cachevalidationsql, NULL) END,
                CASE WHEN p_sqldialectid = '00000000-0000-0000-0000-000000000000'::UUID THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE COALESCE(p_sqldialectid, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                COALESCE(p_reusable, FALSE),
                CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, NULL) END,
                COALESCE(p_ismaterialized, FALSE),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwQueries"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQuery" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spUpdateQuery
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateQuery"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_userquestion_clear boolean DEFAULT false,
    p_userquestion TEXT DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sql_clear boolean DEFAULT false,
    p_sql TEXT DEFAULT NULL,
    p_technicaldescription_clear boolean DEFAULT false,
    p_technicaldescription TEXT DEFAULT NULL,
    p_originalsql_clear boolean DEFAULT false,
    p_originalsql TEXT DEFAULT NULL,
    p_feedback_clear boolean DEFAULT false,
    p_feedback TEXT DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_qualityrank_clear boolean DEFAULT false,
    p_qualityrank int DEFAULT NULL,
    p_executioncostrank_clear boolean DEFAULT false,
    p_executioncostrank int DEFAULT NULL,
    p_usestemplate_clear boolean DEFAULT false,
    p_usestemplate BOOLEAN DEFAULT NULL,
    p_auditqueryruns BOOLEAN DEFAULT NULL,
    p_cacheenabled BOOLEAN DEFAULT NULL,
    p_cachettlminutes_clear boolean DEFAULT false,
    p_cachettlminutes int DEFAULT NULL,
    p_cachemaxsize_clear boolean DEFAULT false,
    p_cachemaxsize int DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_cachevalidationsql_clear boolean DEFAULT false,
    p_cachevalidationsql TEXT DEFAULT NULL,
    p_sqldialectid UUID DEFAULT NULL,
    p_reusable BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_ismaterialized BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueries" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Query"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "UserQuestion" = CASE WHEN p_userquestion_clear = true THEN NULL ELSE COALESCE(p_userquestion, "UserQuestion") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "SQL" = CASE WHEN p_sql_clear = true THEN NULL ELSE COALESCE(p_sql, "SQL") END,
        "TechnicalDescription" = CASE WHEN p_technicaldescription_clear = true THEN NULL ELSE COALESCE(p_technicaldescription, "TechnicalDescription") END,
        "OriginalSQL" = CASE WHEN p_originalsql_clear = true THEN NULL ELSE COALESCE(p_originalsql, "OriginalSQL") END,
        "Feedback" = CASE WHEN p_feedback_clear = true THEN NULL ELSE COALESCE(p_feedback, "Feedback") END,
        "Status" = COALESCE(p_status, "Status"),
        "QualityRank" = CASE WHEN p_qualityrank_clear = true THEN NULL ELSE COALESCE(p_qualityrank, "QualityRank") END,
        "ExecutionCostRank" = CASE WHEN p_executioncostrank_clear = true THEN NULL ELSE COALESCE(p_executioncostrank, "ExecutionCostRank") END,
        "UsesTemplate" = CASE WHEN p_usestemplate_clear = true THEN NULL ELSE COALESCE(p_usestemplate, "UsesTemplate") END,
        "AuditQueryRuns" = COALESCE(p_auditqueryruns, "AuditQueryRuns"),
        "CacheEnabled" = COALESCE(p_cacheenabled, "CacheEnabled"),
        "CacheTTLMinutes" = CASE WHEN p_cachettlminutes_clear = true THEN NULL ELSE COALESCE(p_cachettlminutes, "CacheTTLMinutes") END,
        "CacheMaxSize" = CASE WHEN p_cachemaxsize_clear = true THEN NULL ELSE COALESCE(p_cachemaxsize, "CacheMaxSize") END,
        "EmbeddingVector" = CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "CacheValidationSQL" = CASE WHEN p_cachevalidationsql_clear = true THEN NULL ELSE COALESCE(p_cachevalidationsql, "CacheValidationSQL") END,
        "SQLDialectID" = COALESCE(p_sqldialectid, "SQLDialectID"),
        "Reusable" = COALESCE(p_reusable, "Reusable"),
        "ExternalDataSourceID" = CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, "ExternalDataSourceID") END,
        "IsMaterialized" = COALESCE(p_ismaterialized, "IsMaterialized"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "EmbeddingVectorBinary" = CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, "EmbeddingVectorBinary") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwQueries"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQuery" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_query"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_query" ON "__mj"."Query";

CREATE TRIGGER "trg_update_query"
BEFORE UPDATE ON "__mj"."Query"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_query"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spDeleteQuery
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteQuery"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Data Context Items.QueryID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DataContextItem"
        WHERE "QueryID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DataContextItem"
        SET "QueryID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Materialized Result Queries records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."MaterializedResultQuery"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteMaterializedResultQuery"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryDependency"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via DependsOnQueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryDependency"
        WHERE "DependsOnQueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Entities records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryEntity"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryEntity"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Fields records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryField"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryField"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Parameters records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryParameter"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryParameter"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Permissions records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryPermission"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query SQLs records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QuerySQL"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQuerySQL"(v_rec."ID");
    END LOOP;

    
    DELETE FROM "__mj"."Query"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQuery" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tags
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_tag_parent_id"
    ON "__mj"."Tag" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_tag_merged_into_tag_id"
    ON "__mj"."Tag" ("MergedIntoTagID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_tag_embedding_model_id"
    ON "__mj"."Tag" ("EmbeddingModelID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tags
-- Item: fn_tag_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: Tag.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_tag_parent_id_get_hierarchy_meta"(
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
            "__mj"."Tag"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."Tag" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."Tag" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."Tag" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tags
-- Item: fn_tag_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: Tag.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_tag_parent_id_get_descendants"(
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
            "__mj"."Tag"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."Tag" c
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
        (NOT EXISTS (SELECT 1 FROM "__mj"."Tag" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."Tag" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tags
-- Item: fn_tag_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: Tag.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_tag_parent_id_get_ancestors"(
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
            "__mj"."Tag"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."Tag" p
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
-- PostgreSQL Generated SQL for Entity: MJ: Tags
-- Item: fn_tag_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: Tag.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_tag_parent_id_get_root_id"(
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
            "__mj"."Tag"
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
            "__mj"."Tag" c
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
-- PostgreSQL Generated SQL for Entity: MJ: Tags
-- Item: vwTags
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tags
-----               SCHEMA:      __mj
-----               BASE TABLE:  Tag
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwTags"
AS
SELECT
    t.*,
    MJTag_ParentID."Name" AS "Parent",
    MJTag_MergedIntoTagID."Name" AS "MergedIntoTag",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."Tag" AS t
LEFT OUTER JOIN
    "__mj"."Tag" AS MJTag_ParentID
  ON
    "t"."ParentID" = MJTag_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."Tag" AS MJTag_MergedIntoTagID
  ON
    "t"."MergedIntoTagID" = MJTag_MergedIntoTagID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "t"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"

LEFT JOIN LATERAL "__mj"."fn_tag_parent_id_get_hierarchy_meta"(t."ID", t."ParentID") AS hier_ParentID ON true
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
        AND tc.relname = 'vwTags'
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
                           AND tc.relname = 'vwTags'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwTags" CASCADE;
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
GRANT SELECT ON "__mj"."vwTags" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tags
-- Item: spCreateTag
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Tag
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTag'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateTag"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_mergedintotagid_clear boolean DEFAULT false,
    p_mergedintotagid UUID DEFAULT NULL,
    p_isglobal BOOLEAN DEFAULT NULL,
    p_allowautogrow BOOLEAN DEFAULT NULL,
    p_isfrozen BOOLEAN DEFAULT NULL,
    p_maxchildren_clear boolean DEFAULT false,
    p_maxchildren int DEFAULT NULL,
    p_maxdescendantdepth_clear boolean DEFAULT false,
    p_maxdescendantdepth int DEFAULT NULL,
    p_minweight_clear boolean DEFAULT false,
    p_minweight decimal(3, 2) DEFAULT NULL,
    p_requiresreview BOOLEAN DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwTags" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Tag"
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
                "EmbeddingModelID",
                "EmbeddingVectorBinary"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                p_displayname,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_mergedintotagid_clear = true THEN NULL ELSE COALESCE(p_mergedintotagid, NULL) END,
                COALESCE(p_isglobal, TRUE),
                COALESCE(p_allowautogrow, TRUE),
                COALESCE(p_isfrozen, FALSE),
                CASE WHEN p_maxchildren_clear = true THEN NULL ELSE COALESCE(p_maxchildren, NULL) END,
                CASE WHEN p_maxdescendantdepth_clear = true THEN NULL ELSE COALESCE(p_maxdescendantdepth, NULL) END,
                CASE WHEN p_minweight_clear = true THEN NULL ELSE COALESCE(p_minweight, NULL) END,
                COALESCE(p_requiresreview, FALSE),
                CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwTags"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTag" TO "cdp_UI";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tags
-- Item: spUpdateTag
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Tag
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTag'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateTag"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_mergedintotagid_clear boolean DEFAULT false,
    p_mergedintotagid UUID DEFAULT NULL,
    p_isglobal BOOLEAN DEFAULT NULL,
    p_allowautogrow BOOLEAN DEFAULT NULL,
    p_isfrozen BOOLEAN DEFAULT NULL,
    p_maxchildren_clear boolean DEFAULT false,
    p_maxchildren int DEFAULT NULL,
    p_maxdescendantdepth_clear boolean DEFAULT false,
    p_maxdescendantdepth int DEFAULT NULL,
    p_minweight_clear boolean DEFAULT false,
    p_minweight decimal(3, 2) DEFAULT NULL,
    p_requiresreview BOOLEAN DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwTags" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Tag"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "DisplayName" = COALESCE(p_displayname, "DisplayName"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Status" = COALESCE(p_status, "Status"),
        "MergedIntoTagID" = CASE WHEN p_mergedintotagid_clear = true THEN NULL ELSE COALESCE(p_mergedintotagid, "MergedIntoTagID") END,
        "IsGlobal" = COALESCE(p_isglobal, "IsGlobal"),
        "AllowAutoGrow" = COALESCE(p_allowautogrow, "AllowAutoGrow"),
        "IsFrozen" = COALESCE(p_isfrozen, "IsFrozen"),
        "MaxChildren" = CASE WHEN p_maxchildren_clear = true THEN NULL ELSE COALESCE(p_maxchildren, "MaxChildren") END,
        "MaxDescendantDepth" = CASE WHEN p_maxdescendantdepth_clear = true THEN NULL ELSE COALESCE(p_maxdescendantdepth, "MaxDescendantDepth") END,
        "MinWeight" = CASE WHEN p_minweight_clear = true THEN NULL ELSE COALESCE(p_minweight, "MinWeight") END,
        "RequiresReview" = COALESCE(p_requiresreview, "RequiresReview"),
        "EmbeddingVector" = CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "EmbeddingVectorBinary" = CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, "EmbeddingVectorBinary") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwTags"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTag" TO "cdp_UI";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Tag table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_tag"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_tag" ON "__mj"."Tag";

CREATE TRIGGER "trg_update_tag"
BEFORE UPDATE ON "__mj"."Tag"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_tag"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tags
-- Item: spDeleteTag
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Tag
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteTag'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteTag"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."Tag"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTag" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Components
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_component_source_registry_id"
    ON "__mj"."Component" ("SourceRegistryID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Components
-- Item: vwComponents
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Components
-----               SCHEMA:      __mj
-----               BASE TABLE:  Component
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwComponents"
AS
SELECT
    c.*,
    MJComponentRegistry_SourceRegistryID."Name" AS "SourceRegistry"
FROM
    "__mj"."Component" AS c
LEFT OUTER JOIN
    "__mj"."ComponentRegistry" AS MJComponentRegistry_SourceRegistryID
  ON
    "c"."SourceRegistryID" = MJComponentRegistry_SourceRegistryID."ID"
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
        AND tc.relname = 'vwComponents'
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
                           AND tc.relname = 'vwComponents'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwComponents" CASCADE;
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
GRANT SELECT ON "__mj"."vwComponents" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwComponents" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwComponents" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Components
-- Item: spCreateComponent
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Component
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateComponent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateComponent"(
    p_id UUID DEFAULT NULL,
    p_namespace_clear boolean DEFAULT false,
    p_namespace TEXT DEFAULT NULL,
    p_name varchar(500) DEFAULT NULL,
    p_version varchar(50) DEFAULT NULL,
    p_versionsequence int DEFAULT NULL,
    p_title_clear boolean DEFAULT false,
    p_title varchar(1000) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_type_clear boolean DEFAULT false,
    p_type varchar(255) DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(50) DEFAULT NULL,
    p_developername_clear boolean DEFAULT false,
    p_developername varchar(255) DEFAULT NULL,
    p_developeremail_clear boolean DEFAULT false,
    p_developeremail varchar(255) DEFAULT NULL,
    p_developerorganization_clear boolean DEFAULT false,
    p_developerorganization varchar(255) DEFAULT NULL,
    p_sourceregistryid_clear boolean DEFAULT false,
    p_sourceregistryid UUID DEFAULT NULL,
    p_replicatedat_clear boolean DEFAULT false,
    p_replicatedat TIMESTAMPTZ DEFAULT NULL,
    p_lastsyncedat_clear boolean DEFAULT false,
    p_lastsyncedat TIMESTAMPTZ DEFAULT NULL,
    p_specification TEXT DEFAULT NULL,
    p_functionalrequirements_clear boolean DEFAULT false,
    p_functionalrequirements TEXT DEFAULT NULL,
    p_technicaldesign_clear boolean DEFAULT false,
    p_technicaldesign TEXT DEFAULT NULL,
    p_functionalrequirementsvector_clear boolean DEFAULT false,
    p_functionalrequirementsvector TEXT DEFAULT NULL,
    p_technicaldesignvector_clear boolean DEFAULT false,
    p_technicaldesignvector TEXT DEFAULT NULL,
    p_hascustomprops BOOLEAN DEFAULT NULL,
    p_hascustomevents BOOLEAN DEFAULT NULL,
    p_requiresdata BOOLEAN DEFAULT NULL,
    p_dependencycount int DEFAULT NULL,
    p_technicaldesignvectorembeddingmodelid_clear boolean DEFAULT false,
    p_technicaldesignvectorembeddingmodelid TEXT DEFAULT NULL,
    p_functionalrequirementsvectorembeddingmodelid_clear boolean DEFAULT false,
    p_functionalrequirementsvectorembeddingmodelid TEXT DEFAULT NULL,
    p_hasrequiredcustomprops BOOLEAN DEFAULT NULL,
    p_functionalrequirementsvectorbinary_clear boolean DEFAULT false,
    p_functionalrequirementsvectorbinary BYTEA DEFAULT NULL,
    p_technicaldesignvectorbinary_clear boolean DEFAULT false,
    p_technicaldesignvectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwComponents" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Component"
        (
            "ID",
            "Namespace",
                "Name",
                "Version",
                "VersionSequence",
                "Title",
                "Description",
                "Type",
                "Status",
                "DeveloperName",
                "DeveloperEmail",
                "DeveloperOrganization",
                "SourceRegistryID",
                "ReplicatedAt",
                "LastSyncedAt",
                "Specification",
                "FunctionalRequirements",
                "TechnicalDesign",
                "FunctionalRequirementsVector",
                "TechnicalDesignVector",
                "HasCustomProps",
                "HasCustomEvents",
                "RequiresData",
                "DependencyCount",
                "TechnicalDesignVectorEmbeddingModelID",
                "FunctionalRequirementsVectorEmbeddingModelID",
                "HasRequiredCustomProps",
                "FunctionalRequirementsVectorBinary",
                "TechnicalDesignVectorBinary"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_namespace_clear = true THEN NULL ELSE COALESCE(p_namespace, NULL) END,
                p_name,
                p_version,
                COALESCE(p_versionsequence, 0),
                CASE WHEN p_title_clear = true THEN NULL ELSE COALESCE(p_title, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_type_clear = true THEN NULL ELSE COALESCE(p_type, NULL) END,
                CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, NULL) END,
                CASE WHEN p_developername_clear = true THEN NULL ELSE COALESCE(p_developername, NULL) END,
                CASE WHEN p_developeremail_clear = true THEN NULL ELSE COALESCE(p_developeremail, NULL) END,
                CASE WHEN p_developerorganization_clear = true THEN NULL ELSE COALESCE(p_developerorganization, NULL) END,
                CASE WHEN p_sourceregistryid_clear = true THEN NULL ELSE COALESCE(p_sourceregistryid, NULL) END,
                CASE WHEN p_replicatedat_clear = true THEN NULL ELSE COALESCE(p_replicatedat, NULL) END,
                CASE WHEN p_lastsyncedat_clear = true THEN NULL ELSE COALESCE(p_lastsyncedat, NULL) END,
                p_specification,
                CASE WHEN p_functionalrequirements_clear = true THEN NULL ELSE COALESCE(p_functionalrequirements, NULL) END,
                CASE WHEN p_technicaldesign_clear = true THEN NULL ELSE COALESCE(p_technicaldesign, NULL) END,
                CASE WHEN p_functionalrequirementsvector_clear = true THEN NULL ELSE COALESCE(p_functionalrequirementsvector, NULL) END,
                CASE WHEN p_technicaldesignvector_clear = true THEN NULL ELSE COALESCE(p_technicaldesignvector, NULL) END,
                COALESCE(p_hascustomprops, FALSE),
                COALESCE(p_hascustomevents, FALSE),
                COALESCE(p_requiresdata, FALSE),
                COALESCE(p_dependencycount, 0),
                CASE WHEN p_technicaldesignvectorembeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_technicaldesignvectorembeddingmodelid, NULL) END,
                CASE WHEN p_functionalrequirementsvectorembeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_functionalrequirementsvectorembeddingmodelid, NULL) END,
                COALESCE(p_hasrequiredcustomprops, FALSE),
                CASE WHEN p_functionalrequirementsvectorbinary_clear = true THEN NULL ELSE COALESCE(p_functionalrequirementsvectorbinary, NULL) END,
                CASE WHEN p_technicaldesignvectorbinary_clear = true THEN NULL ELSE COALESCE(p_technicaldesignvectorbinary, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwComponents"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateComponent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateComponent" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Components
-- Item: spUpdateComponent
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Component
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateComponent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateComponent"(
    p_id UUID,
    p_namespace_clear boolean DEFAULT false,
    p_namespace TEXT DEFAULT NULL,
    p_name varchar(500) DEFAULT NULL,
    p_version varchar(50) DEFAULT NULL,
    p_versionsequence int DEFAULT NULL,
    p_title_clear boolean DEFAULT false,
    p_title varchar(1000) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_type_clear boolean DEFAULT false,
    p_type varchar(255) DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(50) DEFAULT NULL,
    p_developername_clear boolean DEFAULT false,
    p_developername varchar(255) DEFAULT NULL,
    p_developeremail_clear boolean DEFAULT false,
    p_developeremail varchar(255) DEFAULT NULL,
    p_developerorganization_clear boolean DEFAULT false,
    p_developerorganization varchar(255) DEFAULT NULL,
    p_sourceregistryid_clear boolean DEFAULT false,
    p_sourceregistryid UUID DEFAULT NULL,
    p_replicatedat_clear boolean DEFAULT false,
    p_replicatedat TIMESTAMPTZ DEFAULT NULL,
    p_lastsyncedat_clear boolean DEFAULT false,
    p_lastsyncedat TIMESTAMPTZ DEFAULT NULL,
    p_specification TEXT DEFAULT NULL,
    p_functionalrequirements_clear boolean DEFAULT false,
    p_functionalrequirements TEXT DEFAULT NULL,
    p_technicaldesign_clear boolean DEFAULT false,
    p_technicaldesign TEXT DEFAULT NULL,
    p_functionalrequirementsvector_clear boolean DEFAULT false,
    p_functionalrequirementsvector TEXT DEFAULT NULL,
    p_technicaldesignvector_clear boolean DEFAULT false,
    p_technicaldesignvector TEXT DEFAULT NULL,
    p_hascustomprops BOOLEAN DEFAULT NULL,
    p_hascustomevents BOOLEAN DEFAULT NULL,
    p_requiresdata BOOLEAN DEFAULT NULL,
    p_dependencycount int DEFAULT NULL,
    p_technicaldesignvectorembeddingmodelid_clear boolean DEFAULT false,
    p_technicaldesignvectorembeddingmodelid TEXT DEFAULT NULL,
    p_functionalrequirementsvectorembeddingmodelid_clear boolean DEFAULT false,
    p_functionalrequirementsvectorembeddingmodelid TEXT DEFAULT NULL,
    p_hasrequiredcustomprops BOOLEAN DEFAULT NULL,
    p_functionalrequirementsvectorbinary_clear boolean DEFAULT false,
    p_functionalrequirementsvectorbinary BYTEA DEFAULT NULL,
    p_technicaldesignvectorbinary_clear boolean DEFAULT false,
    p_technicaldesignvectorbinary BYTEA DEFAULT NULL
) RETURNS SETOF "__mj"."vwComponents" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Component"
    SET
        "Namespace" = CASE WHEN p_namespace_clear = true THEN NULL ELSE COALESCE(p_namespace, "Namespace") END,
        "Name" = COALESCE(p_name, "Name"),
        "Version" = COALESCE(p_version, "Version"),
        "VersionSequence" = COALESCE(p_versionsequence, "VersionSequence"),
        "Title" = CASE WHEN p_title_clear = true THEN NULL ELSE COALESCE(p_title, "Title") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Type" = CASE WHEN p_type_clear = true THEN NULL ELSE COALESCE(p_type, "Type") END,
        "Status" = CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, "Status") END,
        "DeveloperName" = CASE WHEN p_developername_clear = true THEN NULL ELSE COALESCE(p_developername, "DeveloperName") END,
        "DeveloperEmail" = CASE WHEN p_developeremail_clear = true THEN NULL ELSE COALESCE(p_developeremail, "DeveloperEmail") END,
        "DeveloperOrganization" = CASE WHEN p_developerorganization_clear = true THEN NULL ELSE COALESCE(p_developerorganization, "DeveloperOrganization") END,
        "SourceRegistryID" = CASE WHEN p_sourceregistryid_clear = true THEN NULL ELSE COALESCE(p_sourceregistryid, "SourceRegistryID") END,
        "ReplicatedAt" = CASE WHEN p_replicatedat_clear = true THEN NULL ELSE COALESCE(p_replicatedat, "ReplicatedAt") END,
        "LastSyncedAt" = CASE WHEN p_lastsyncedat_clear = true THEN NULL ELSE COALESCE(p_lastsyncedat, "LastSyncedAt") END,
        "Specification" = COALESCE(p_specification, "Specification"),
        "FunctionalRequirements" = CASE WHEN p_functionalrequirements_clear = true THEN NULL ELSE COALESCE(p_functionalrequirements, "FunctionalRequirements") END,
        "TechnicalDesign" = CASE WHEN p_technicaldesign_clear = true THEN NULL ELSE COALESCE(p_technicaldesign, "TechnicalDesign") END,
        "FunctionalRequirementsVector" = CASE WHEN p_functionalrequirementsvector_clear = true THEN NULL ELSE COALESCE(p_functionalrequirementsvector, "FunctionalRequirementsVector") END,
        "TechnicalDesignVector" = CASE WHEN p_technicaldesignvector_clear = true THEN NULL ELSE COALESCE(p_technicaldesignvector, "TechnicalDesignVector") END,
        "HasCustomProps" = COALESCE(p_hascustomprops, "HasCustomProps"),
        "HasCustomEvents" = COALESCE(p_hascustomevents, "HasCustomEvents"),
        "RequiresData" = COALESCE(p_requiresdata, "RequiresData"),
        "DependencyCount" = COALESCE(p_dependencycount, "DependencyCount"),
        "TechnicalDesignVectorEmbeddingModelID" = CASE WHEN p_technicaldesignvectorembeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_technicaldesignvectorembeddingmodelid, "TechnicalDesignVectorEmbeddingModelID") END,
        "FunctionalRequirementsVectorEmbeddingModelID" = CASE WHEN p_functionalrequirementsvectorembeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_functionalrequirementsvectorembeddingmodelid, "FunctionalRequirementsVectorEmbeddingModelID") END,
        "HasRequiredCustomProps" = COALESCE(p_hasrequiredcustomprops, "HasRequiredCustomProps"),
        "FunctionalRequirementsVectorBinary" = CASE WHEN p_functionalrequirementsvectorbinary_clear = true THEN NULL ELSE COALESCE(p_functionalrequirementsvectorbinary, "FunctionalRequirementsVectorBinary") END,
        "TechnicalDesignVectorBinary" = CASE WHEN p_technicaldesignvectorbinary_clear = true THEN NULL ELSE COALESCE(p_technicaldesignvectorbinary, "TechnicalDesignVectorBinary") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwComponents"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateComponent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateComponent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Component table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_component"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_component" ON "__mj"."Component";

CREATE TRIGGER "trg_update_component"
BEFORE UPDATE ON "__mj"."Component"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_component"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Components
-- Item: spDeleteComponent
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Component
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteComponent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteComponent"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."Component"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteComponent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteComponent" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Result Cache
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_result_cache_ai_prompt_id"
    ON "__mj"."AIResultCache" ("AIPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_result_cache_ai_model_id"
    ON "__mj"."AIResultCache" ("AIModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_result_cache_vendor_id"
    ON "__mj"."AIResultCache" ("VendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_result_cache_agent_id"
    ON "__mj"."AIResultCache" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_result_cache_configuration_id"
    ON "__mj"."AIResultCache" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_result_cache_prompt_run_id"
    ON "__mj"."AIResultCache" ("PromptRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Result Cache
-- Item: vwAIResultCaches
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Result Cache
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIResultCache
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIResultCaches"
AS
SELECT
    a.*,
    MJAIPrompt_AIPromptID."Name" AS "AIPrompt",
    MJAIModel_AIModelID."Name" AS "AIModel",
    MJAIVendor_VendorID."Name" AS "Vendor",
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIPromptRun_PromptRunID."RunName" AS "PromptRun"
FROM
    "__mj"."AIResultCache" AS a
INNER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_AIPromptID
  ON
    "a"."AIPromptID" = MJAIPrompt_AIPromptID."ID"
INNER JOIN
    "__mj"."AIModel" AS MJAIModel_AIModelID
  ON
    "a"."AIModelID" = MJAIModel_AIModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIVendor" AS MJAIVendor_VendorID
  ON
    "a"."VendorID" = MJAIVendor_VendorID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptRun" AS MJAIPromptRun_PromptRunID
  ON
    "a"."PromptRunID" = MJAIPromptRun_PromptRunID."ID"
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
        AND tc.relname = 'vwAIResultCaches'
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
                           AND tc.relname = 'vwAIResultCaches'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIResultCaches" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIResultCaches" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIResultCaches" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwAIResultCaches" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Result Cache
-- Item: spCreateAIResultCache
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIResultCache
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIResultCache'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIResultCache"(
    p_id UUID DEFAULT NULL,
    p_aipromptid UUID DEFAULT NULL,
    p_aimodelid UUID DEFAULT NULL,
    p_runat TIMESTAMPTZ DEFAULT NULL,
    p_prompttext TEXT DEFAULT NULL,
    p_resulttext_clear boolean DEFAULT false,
    p_resulttext TEXT DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_expiredon_clear boolean DEFAULT false,
    p_expiredon TIMESTAMPTZ DEFAULT NULL,
    p_vendorid_clear boolean DEFAULT false,
    p_vendorid UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_configurationid_clear boolean DEFAULT false,
    p_configurationid UUID DEFAULT NULL,
    p_promptembedding_clear boolean DEFAULT false,
    p_promptembedding BYTEA DEFAULT NULL,
    p_promptrunid_clear boolean DEFAULT false,
    p_promptrunid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIResultCaches" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIResultCache"
        (
            "ID",
            "AIPromptID",
                "AIModelID",
                "RunAt",
                "PromptText",
                "ResultText",
                "Status",
                "ExpiredOn",
                "VendorID",
                "AgentID",
                "ConfigurationID",
                "PromptEmbedding",
                "PromptRunID"
        )
    VALUES
        (
            v_new_id,
            p_aipromptid,
                p_aimodelid,
                p_runat,
                p_prompttext,
                CASE WHEN p_resulttext_clear = true THEN NULL ELSE COALESCE(p_resulttext, NULL) END,
                p_status,
                CASE WHEN p_expiredon_clear = true THEN NULL ELSE COALESCE(p_expiredon, NULL) END,
                CASE WHEN p_vendorid_clear = true THEN NULL ELSE COALESCE(p_vendorid, NULL) END,
                CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, NULL) END,
                CASE WHEN p_configurationid_clear = true THEN NULL ELSE COALESCE(p_configurationid, NULL) END,
                CASE WHEN p_promptembedding_clear = true THEN NULL ELSE COALESCE(p_promptembedding, NULL) END,
                CASE WHEN p_promptrunid_clear = true THEN NULL ELSE COALESCE(p_promptrunid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIResultCaches"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Result Cache
-- Item: spUpdateAIResultCache
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIResultCache
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIResultCache'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIResultCache"(
    p_id UUID,
    p_aipromptid UUID DEFAULT NULL,
    p_aimodelid UUID DEFAULT NULL,
    p_runat TIMESTAMPTZ DEFAULT NULL,
    p_prompttext TEXT DEFAULT NULL,
    p_resulttext_clear boolean DEFAULT false,
    p_resulttext TEXT DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_expiredon_clear boolean DEFAULT false,
    p_expiredon TIMESTAMPTZ DEFAULT NULL,
    p_vendorid_clear boolean DEFAULT false,
    p_vendorid UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_configurationid_clear boolean DEFAULT false,
    p_configurationid UUID DEFAULT NULL,
    p_promptembedding_clear boolean DEFAULT false,
    p_promptembedding BYTEA DEFAULT NULL,
    p_promptrunid_clear boolean DEFAULT false,
    p_promptrunid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIResultCaches" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIResultCache"
    SET
        "AIPromptID" = COALESCE(p_aipromptid, "AIPromptID"),
        "AIModelID" = COALESCE(p_aimodelid, "AIModelID"),
        "RunAt" = COALESCE(p_runat, "RunAt"),
        "PromptText" = COALESCE(p_prompttext, "PromptText"),
        "ResultText" = CASE WHEN p_resulttext_clear = true THEN NULL ELSE COALESCE(p_resulttext, "ResultText") END,
        "Status" = COALESCE(p_status, "Status"),
        "ExpiredOn" = CASE WHEN p_expiredon_clear = true THEN NULL ELSE COALESCE(p_expiredon, "ExpiredOn") END,
        "VendorID" = CASE WHEN p_vendorid_clear = true THEN NULL ELSE COALESCE(p_vendorid, "VendorID") END,
        "AgentID" = CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, "AgentID") END,
        "ConfigurationID" = CASE WHEN p_configurationid_clear = true THEN NULL ELSE COALESCE(p_configurationid, "ConfigurationID") END,
        "PromptEmbedding" = CASE WHEN p_promptembedding_clear = true THEN NULL ELSE COALESCE(p_promptembedding, "PromptEmbedding") END,
        "PromptRunID" = CASE WHEN p_promptrunid_clear = true THEN NULL ELSE COALESCE(p_promptrunid, "PromptRunID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIResultCaches"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;



------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIResultCache table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_result_cache"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_result_cache" ON "__mj"."AIResultCache";

CREATE TRIGGER "trg_update_ai_result_cache"
BEFORE UPDATE ON "__mj"."AIResultCache"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_result_cache"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Result Cache
-- Item: spDeleteAIResultCache
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIResultCache
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIResultCache'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIResultCache"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIResultCache"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
