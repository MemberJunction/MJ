-- ============================================================================
-- MemberJunction PostgreSQL-only migration — v6.2.0-edge.7 CodeGen regeneration
-- ============================================================================
-- WHY THIS FILE EXISTS
-- Four of this release's PostgreSQL counterparts could not have CodeGen objects baked inline:
--   V202610291200 Query_Extraction_Metadata, V202610301710 Agent_Consult_Chat_Handling and
--   V202610301713 Brand_Kits_And_Video_Archetypes (conversion gaps; a gapped file is not baked),
--   plus the value-list-only V202610291210 / V202610292145 / V202610301712, whose CodeGen output is
--   EntityFieldValue rows already carried in their own files.
-- Without this file a fresh PostgreSQL install would have the new columns and tables but stale (or
-- no) base views, CRUD functions, grants and foreign-key indexes for the affected entities.
--
-- SCOPE (by entity, from the SQL Server CodeGen sections of those migrations):
--   MJ: Queries, MJ: Query Fields, MJ: AI Agents (incl. the ParentID hierarchy functions),
--   MJ: AI Agent Relationships, MJ: AI Prompts (spDeleteAIPrompt only), MJ: Brand Kits,
--   MJ: Brand Kit Assets, MJ: Video Archetypes.
--
-- SOURCES
--   * Foreign-key indexes: the SQL Server CodeGen "Index for Foreign Keys" items, as
--     CREATE INDEX IF NOT EXISTS (PG CodeGen did not emit them in this run).
--   * Base views + grants for the three new entities: pg_get_viewdef of the views PG CodeGen created
--     on the working database (its SQL log did not include them).
--   * Everything else: `mj codegen --skipfiles --no-ai` (PostgreSQL) against a working database with
--     this release's counterparts applied, run 2026-11-01 23:03 UTC, sections copied unchanged
--     except the Flyway schema placeholder written as __mj.
-- Stamped before V202611012253 Metadata_Sync so the metadata push finds the regenerated objects.
-- ============================================================================

SET search_path TO __mj, public;

-- ── Foreign-key indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_QueryField_QueryID" ON __mj."QueryField" ("QueryID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_QueryField_SourceEntityID" ON __mj."QueryField" ("SourceEntityID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_QueryField_SourceEntityFieldID" ON __mj."QueryField" ("SourceEntityFieldID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_CategoryID" ON __mj."Query" ("CategoryID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID" ON __mj."Query" ("EmbeddingModelID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_SQLDialectID" ON __mj."Query" ("SQLDialectID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_ExternalDataSourceID" ON __mj."Query" ("ExternalDataSourceID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_ApprovedByUserID" ON __mj."Query" ("ApprovedByUserID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRelationship_AgentID" ON __mj."AIAgentRelationship" ("AgentID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRelationship_SubAgentID" ON __mj."AIAgentRelationship" ("SubAgentID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRelationship_ConfigurationPresetID" ON __mj."AIAgentRelationship" ("ConfigurationPresetID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ParentID" ON __mj."AIAgent" ("ParentID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID" ON __mj."AIAgent" ("ContextCompressionPromptID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_TypeID" ON __mj."AIAgent" ("TypeID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID" ON __mj."AIAgent" ("DefaultArtifactTypeID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID" ON __mj."AIAgent" ("OwnerUserID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID" ON __mj."AIAgent" ("AttachmentStorageProviderID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_CategoryID" ON __mj."AIAgent" ("CategoryID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultStorageAccountID" ON __mj."AIAgent" ("DefaultStorageAccountID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultCoAgentID" ON __mj."AIAgent" ("DefaultCoAgentID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_RecordingStorageProviderID" ON __mj."AIAgent" ("RecordingStorageProviderID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultMediaCollectionID" ON __mj."AIAgent" ("DefaultMediaCollectionID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ConversationSummaryPromptID" ON __mj."AIAgent" ("ConversationSummaryPromptID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_BrandKitAsset_BrandKitID" ON __mj."BrandKitAsset" ("BrandKitID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_BrandKitAsset_FileID" ON __mj."BrandKitAsset" ("FileID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_BrandKit_CompanyID" ON __mj."BrandKit" ("CompanyID");
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_VideoArchetype_CompanyID" ON __mj."VideoArchetype" ("CompanyID");

-- ── Base views and grants for the three new entities ─────────────────────────

CREATE OR REPLACE VIEW __mj."vwBrandKits" AS
 SELECT b."ID",
    b."Name",
    b."Description",
    b."CompanyID",
    b."IsDefault",
    b."Status",
    b."Style",
    b."Voice",
    b."GenerationPolicy",
    b."NeverInvent",
    b."__mj_CreatedAt",
    b."__mj_UpdatedAt",
    mjcompany_companyid."Name" AS "Company"
   FROM __mj."BrandKit" b
     LEFT JOIN __mj."Company" mjcompany_companyid ON b."CompanyID" = mjcompany_companyid."ID";

GRANT SELECT ON __mj."vwBrandKits" TO "cdp_UI";
GRANT SELECT ON __mj."vwBrandKits" TO "cdp_Developer";
GRANT SELECT ON __mj."vwBrandKits" TO "cdp_Integration";

CREATE OR REPLACE VIEW __mj."vwBrandKitAssets" AS
 SELECT b."ID",
    b."BrandKitID",
    b."Name",
    b."AssetType",
    b."FileID",
    b."Usage",
    b."IsPrimary",
    b."Sequence",
    b."LicenseNotes",
    b."IsGenerationReference",
    b."__mj_CreatedAt",
    b."__mj_UpdatedAt",
    mjbrandkit_brandkitid."Name" AS "BrandKit",
    mjfile_fileid."Name" AS "File"
   FROM __mj."BrandKitAsset" b
     JOIN __mj."BrandKit" mjbrandkit_brandkitid ON b."BrandKitID" = mjbrandkit_brandkitid."ID"
     JOIN __mj."File" mjfile_fileid ON b."FileID" = mjfile_fileid."ID";

GRANT SELECT ON __mj."vwBrandKitAssets" TO "cdp_UI";
GRANT SELECT ON __mj."vwBrandKitAssets" TO "cdp_Developer";
GRANT SELECT ON __mj."vwBrandKitAssets" TO "cdp_Integration";

CREATE OR REPLACE VIEW __mj."vwVideoArchetypes" AS
 SELECT v."ID",
    v."Name",
    v."Description",
    v."CompanyID",
    v."Category",
    v."Status",
    v."DefaultDurationSeconds",
    v."MinDurationSeconds",
    v."MaxDurationSeconds",
    v."DefaultFormats",
    v."BeatTemplate",
    v."Pacing",
    v."Guidance",
    v."DefaultInteractionMode",
    v."__mj_CreatedAt",
    v."__mj_UpdatedAt",
    mjcompany_companyid."Name" AS "Company"
   FROM __mj."VideoArchetype" v
     LEFT JOIN __mj."Company" mjcompany_companyid ON v."CompanyID" = mjcompany_companyid."ID";

GRANT SELECT ON __mj."vwVideoArchetypes" TO "cdp_UI";
GRANT SELECT ON __mj."vwVideoArchetypes" TO "cdp_Developer";
GRANT SELECT ON __mj."vwVideoArchetypes" TO "cdp_Integration";



-- ══ MJ: Queries ══

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: vwQueries
-- Generated at: 2026-11-01T23:03:44.817Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Queries
-----               SCHEMA:      __mj
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwQueries"
AS
SELECT
    q.*,
    MJQueryCategory_CategoryID."Name" AS "Category",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJSQLDialect_SQLDialectID."Name" AS "SQLDialect",
    MJExternalDataSource_ExternalDataSourceID."Name" AS "ExternalDataSource",
    MJUser_ApprovedByUserID."Name" AS "ApprovedByUser"
FROM
    __mj."Query" AS q
LEFT OUTER JOIN
    __mj."QueryCategory" AS MJQueryCategory_CategoryID
  ON
    "q"."CategoryID" = MJQueryCategory_CategoryID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "q"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
INNER JOIN
    __mj."SQLDialect" AS MJSQLDialect_SQLDialectID
  ON
    "q"."SQLDialectID" = MJSQLDialect_SQLDialectID."ID"
LEFT OUTER JOIN
    __mj."ExternalDataSource" AS MJExternalDataSource_ExternalDataSourceID
  ON
    "q"."ExternalDataSourceID" = MJExternalDataSource_ExternalDataSourceID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_ApprovedByUserID
  ON
    "q"."ApprovedByUserID" = MJUser_ApprovedByUserID."ID"
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

  DROP VIEW IF EXISTS __mj."vwQueries" CASCADE;
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
GRANT SELECT ON __mj."vwQueries" TO "cdp_Developer";
GRANT SELECT ON __mj."vwQueries" TO "cdp_UI";
GRANT SELECT ON __mj."vwQueries" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: Queries */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: Permissions for vwQueries
-- Generated at: 2026-11-01T23:03:44.820Z
-- ============================================================
GRANT SELECT ON __mj."vwQueries" TO "cdp_Developer";
GRANT SELECT ON __mj."vwQueries" TO "cdp_UI";
GRANT SELECT ON __mj."vwQueries" TO "cdp_Integration";

/* spCreate SQL for MJ: Queries */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spCreateQuery
-- Generated at: 2026-11-01T23:03:44.820Z
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

CREATE OR REPLACE FUNCTION __mj."spCreateQuery"(
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
    p_embeddingvectorbinary BYTEA DEFAULT NULL,
    p_approvalcomments_clear boolean DEFAULT false,
    p_approvalcomments TEXT DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_approvedat_clear boolean DEFAULT false,
    p_approvedat TIMESTAMPTZ DEFAULT NULL,
    p_approvedfingerprint_clear boolean DEFAULT false,
    p_approvedfingerprint varchar(100) DEFAULT NULL,
    p_extractedsqlhash_clear boolean DEFAULT false,
    p_extractedsqlhash varchar(64) DEFAULT NULL,
    p_extractionstatus_clear boolean DEFAULT false,
    p_extractionstatus varchar(20) DEFAULT NULL,
    p_extractionmessage_clear boolean DEFAULT false,
    p_extractionmessage TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwQueries" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Query"
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
                "EmbeddingVectorBinary",
                "ApprovalComments",
                "ApprovedByUserID",
                "ApprovedAt",
                "ApprovedFingerprint",
                "ExtractedSQLHash",
                "ExtractionStatus",
                "ExtractionMessage"
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
                CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, NULL) END,
                CASE WHEN p_approvalcomments_clear = true THEN NULL ELSE COALESCE(p_approvalcomments, NULL) END,
                CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, NULL) END,
                CASE WHEN p_approvedat_clear = true THEN NULL ELSE COALESCE(p_approvedat, NULL) END,
                CASE WHEN p_approvedfingerprint_clear = true THEN NULL ELSE COALESCE(p_approvedfingerprint, NULL) END,
                CASE WHEN p_extractedsqlhash_clear = true THEN NULL ELSE COALESCE(p_extractedsqlhash, NULL) END,
                CASE WHEN p_extractionstatus_clear = true THEN NULL ELSE COALESCE(p_extractionstatus, NULL) END,
                CASE WHEN p_extractionmessage_clear = true THEN NULL ELSE COALESCE(p_extractionmessage, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwQueries"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateQuery" TO "cdp_Integration";

/* spCreate Permissions for MJ: Queries */
GRANT EXECUTE ON FUNCTION __mj."spCreateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateQuery" TO "cdp_Integration";

/* spUpdate SQL for MJ: Queries */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spUpdateQuery
-- Generated at: 2026-11-01T23:03:44.820Z
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

CREATE OR REPLACE FUNCTION __mj."spUpdateQuery"(
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
    p_embeddingvectorbinary BYTEA DEFAULT NULL,
    p_approvalcomments_clear boolean DEFAULT false,
    p_approvalcomments TEXT DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_approvedat_clear boolean DEFAULT false,
    p_approvedat TIMESTAMPTZ DEFAULT NULL,
    p_approvedfingerprint_clear boolean DEFAULT false,
    p_approvedfingerprint varchar(100) DEFAULT NULL,
    p_extractedsqlhash_clear boolean DEFAULT false,
    p_extractedsqlhash varchar(64) DEFAULT NULL,
    p_extractionstatus_clear boolean DEFAULT false,
    p_extractionstatus varchar(20) DEFAULT NULL,
    p_extractionmessage_clear boolean DEFAULT false,
    p_extractionmessage TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwQueries" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Query"
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
        "EmbeddingVectorBinary" = CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, "EmbeddingVectorBinary") END,
        "ApprovalComments" = CASE WHEN p_approvalcomments_clear = true THEN NULL ELSE COALESCE(p_approvalcomments, "ApprovalComments") END,
        "ApprovedByUserID" = CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, "ApprovedByUserID") END,
        "ApprovedAt" = CASE WHEN p_approvedat_clear = true THEN NULL ELSE COALESCE(p_approvedat, "ApprovedAt") END,
        "ApprovedFingerprint" = CASE WHEN p_approvedfingerprint_clear = true THEN NULL ELSE COALESCE(p_approvedfingerprint, "ApprovedFingerprint") END,
        "ExtractedSQLHash" = CASE WHEN p_extractedsqlhash_clear = true THEN NULL ELSE COALESCE(p_extractedsqlhash, "ExtractedSQLHash") END,
        "ExtractionStatus" = CASE WHEN p_extractionstatus_clear = true THEN NULL ELSE COALESCE(p_extractionstatus, "ExtractionStatus") END,
        "ExtractionMessage" = CASE WHEN p_extractionmessage_clear = true THEN NULL ELSE COALESCE(p_extractionmessage, "ExtractionMessage") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwQueries"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateQuery" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_query"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_query" ON __mj."Query";

CREATE TRIGGER "trg_update_query"
BEFORE UPDATE ON __mj."Query"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_query"();

/* spUpdate Permissions for MJ: Queries */
GRANT EXECUTE ON FUNCTION __mj."spUpdateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateQuery" TO "cdp_Integration";

/* spDelete SQL for MJ: Queries */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spDeleteQuery
-- Generated at: 2026-11-01T23:03:44.820Z
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

CREATE OR REPLACE FUNCTION __mj."spDeleteQuery"(
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
        FROM __mj."DataContextItem"
        WHERE "QueryID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."DataContextItem"
        SET "QueryID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Materialized Result Queries records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."MaterializedResultQuery"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteMaterializedResultQuery"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryDependency"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via DependsOnQueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryDependency"
        WHERE "DependsOnQueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Entities records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryEntity"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryEntity"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Fields records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryField"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryField"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Parameters records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryParameter"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryParameter"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Permissions records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QueryPermission"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQueryPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query SQLs records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."QuerySQL"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM __mj."spDeleteQuerySQL"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."Query"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Integration";

/* spDelete Permissions for MJ: Queries */
GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID 437e22c7-73a2-42a4-964f-50e5ee71e3f7 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '437e22c7-73a2-42a4-964f-50e5ee71e3f7', p_RelatedEntityNameFieldMap => 'AlternateBaseView');

/* SQL text to update entity field related entity name field map for entity field ID e037f65c-2e56-4daa-aed3-7593f03d0258 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'e037f65c-2e56-4daa-aed3-7593f03d0258', p_RelatedEntityNameFieldMap => 'SourceEntityField');

/* Base View SQL for MJ: Query Fields */


-- ══ MJ: Query Fields ══

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Fields
-- Item: vwQueryFields
-- Generated at: 2026-11-01T23:03:44.966Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Query Fields
-----               SCHEMA:      __mj
-----               BASE TABLE:  QueryField
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwQueryFields"
AS
SELECT
    q.*,
    MJQuery_QueryID."Name" AS "Query",
    MJEntity_SourceEntityID."Name" AS "SourceEntity",
    MJEntityField_SourceEntityFieldID."Name" AS "SourceEntityField"
FROM
    __mj."QueryField" AS q
INNER JOIN
    __mj."Query" AS MJQuery_QueryID
  ON
    "q"."QueryID" = MJQuery_QueryID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_SourceEntityID
  ON
    "q"."SourceEntityID" = MJEntity_SourceEntityID."ID"
LEFT OUTER JOIN
    __mj."EntityField" AS MJEntityField_SourceEntityFieldID
  ON
    "q"."SourceEntityFieldID" = MJEntityField_SourceEntityFieldID."ID"
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
        AND tc.relname = 'vwQueryFields'
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
                           AND tc.relname = 'vwQueryFields'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS __mj."vwQueryFields" CASCADE;
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
GRANT SELECT ON __mj."vwQueryFields" TO "cdp_UI";
GRANT SELECT ON __mj."vwQueryFields" TO "cdp_Developer";
GRANT SELECT ON __mj."vwQueryFields" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: Query Fields */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Fields
-- Item: Permissions for vwQueryFields
-- Generated at: 2026-11-01T23:03:44.968Z
-- ============================================================
GRANT SELECT ON __mj."vwQueryFields" TO "cdp_UI";
GRANT SELECT ON __mj."vwQueryFields" TO "cdp_Developer";
GRANT SELECT ON __mj."vwQueryFields" TO "cdp_Integration";

/* spCreate SQL for MJ: Query Fields */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Fields
-- Item: spCreateQueryField
-- Generated at: 2026-11-01T23:03:44.968Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR QueryField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateQueryField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateQueryField"(
    p_id UUID DEFAULT NULL,
    p_queryid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_sqlbasetype varchar(50) DEFAULT NULL,
    p_sqlfulltype varchar(100) DEFAULT NULL,
    p_sourceentityid_clear boolean DEFAULT false,
    p_sourceentityid UUID DEFAULT NULL,
    p_sourcefieldname_clear boolean DEFAULT false,
    p_sourcefieldname varchar(255) DEFAULT NULL,
    p_iscomputed BOOLEAN DEFAULT NULL,
    p_computationdescription_clear boolean DEFAULT false,
    p_computationdescription TEXT DEFAULT NULL,
    p_issummary BOOLEAN DEFAULT NULL,
    p_summarydescription_clear boolean DEFAULT false,
    p_summarydescription TEXT DEFAULT NULL,
    p_detectionmethod varchar(50) DEFAULT NULL,
    p_autodetectconfidencescore_clear boolean DEFAULT false,
    p_autodetectconfidencescore decimal(3, 2) DEFAULT NULL,
    p_sourceentityfieldid_clear boolean DEFAULT false,
    p_sourceentityfieldid UUID DEFAULT NULL,
    p_isnullable_clear boolean DEFAULT false,
    p_isnullable BOOLEAN DEFAULT NULL,
    p_sourceobjectname_clear boolean DEFAULT false,
    p_sourceobjectname varchar(500) DEFAULT NULL
) RETURNS SETOF __mj."vwQueryFields" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."QueryField"
        (
            "ID",
            "QueryID",
                "Name",
                "Description",
                "Sequence",
                "SQLBaseType",
                "SQLFullType",
                "SourceEntityID",
                "SourceFieldName",
                "IsComputed",
                "ComputationDescription",
                "IsSummary",
                "SummaryDescription",
                "DetectionMethod",
                "AutoDetectConfidenceScore",
                "SourceEntityFieldID",
                "IsNullable",
                "SourceObjectName"
        )
    VALUES
        (
            v_new_id,
            p_queryid,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_sequence,
                p_sqlbasetype,
                p_sqlfulltype,
                CASE WHEN p_sourceentityid_clear = true THEN NULL ELSE COALESCE(p_sourceentityid, NULL) END,
                CASE WHEN p_sourcefieldname_clear = true THEN NULL ELSE COALESCE(p_sourcefieldname, NULL) END,
                COALESCE(p_iscomputed, FALSE),
                CASE WHEN p_computationdescription_clear = true THEN NULL ELSE COALESCE(p_computationdescription, NULL) END,
                COALESCE(p_issummary, FALSE),
                CASE WHEN p_summarydescription_clear = true THEN NULL ELSE COALESCE(p_summarydescription, NULL) END,
                COALESCE(p_detectionmethod, 'Manual'),
                CASE WHEN p_autodetectconfidencescore_clear = true THEN NULL ELSE COALESCE(p_autodetectconfidencescore, NULL) END,
                CASE WHEN p_sourceentityfieldid_clear = true THEN NULL ELSE COALESCE(p_sourceentityfieldid, NULL) END,
                CASE WHEN p_isnullable_clear = true THEN NULL ELSE COALESCE(p_isnullable, NULL) END,
                CASE WHEN p_sourceobjectname_clear = true THEN NULL ELSE COALESCE(p_sourceobjectname, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwQueryFields"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateQueryField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateQueryField" TO "cdp_Integration";

/* spCreate Permissions for MJ: Query Fields */
GRANT EXECUTE ON FUNCTION __mj."spCreateQueryField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateQueryField" TO "cdp_Integration";

/* spUpdate SQL for MJ: Query Fields */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Fields
-- Item: spUpdateQueryField
-- Generated at: 2026-11-01T23:03:44.968Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR QueryField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateQueryField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateQueryField"(
    p_id UUID,
    p_queryid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_sqlbasetype varchar(50) DEFAULT NULL,
    p_sqlfulltype varchar(100) DEFAULT NULL,
    p_sourceentityid_clear boolean DEFAULT false,
    p_sourceentityid UUID DEFAULT NULL,
    p_sourcefieldname_clear boolean DEFAULT false,
    p_sourcefieldname varchar(255) DEFAULT NULL,
    p_iscomputed BOOLEAN DEFAULT NULL,
    p_computationdescription_clear boolean DEFAULT false,
    p_computationdescription TEXT DEFAULT NULL,
    p_issummary BOOLEAN DEFAULT NULL,
    p_summarydescription_clear boolean DEFAULT false,
    p_summarydescription TEXT DEFAULT NULL,
    p_detectionmethod varchar(50) DEFAULT NULL,
    p_autodetectconfidencescore_clear boolean DEFAULT false,
    p_autodetectconfidencescore decimal(3, 2) DEFAULT NULL,
    p_sourceentityfieldid_clear boolean DEFAULT false,
    p_sourceentityfieldid UUID DEFAULT NULL,
    p_isnullable_clear boolean DEFAULT false,
    p_isnullable BOOLEAN DEFAULT NULL,
    p_sourceobjectname_clear boolean DEFAULT false,
    p_sourceobjectname varchar(500) DEFAULT NULL
) RETURNS SETOF __mj."vwQueryFields" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."QueryField"
    SET
        "QueryID" = COALESCE(p_queryid, "QueryID"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "SQLBaseType" = COALESCE(p_sqlbasetype, "SQLBaseType"),
        "SQLFullType" = COALESCE(p_sqlfulltype, "SQLFullType"),
        "SourceEntityID" = CASE WHEN p_sourceentityid_clear = true THEN NULL ELSE COALESCE(p_sourceentityid, "SourceEntityID") END,
        "SourceFieldName" = CASE WHEN p_sourcefieldname_clear = true THEN NULL ELSE COALESCE(p_sourcefieldname, "SourceFieldName") END,
        "IsComputed" = COALESCE(p_iscomputed, "IsComputed"),
        "ComputationDescription" = CASE WHEN p_computationdescription_clear = true THEN NULL ELSE COALESCE(p_computationdescription, "ComputationDescription") END,
        "IsSummary" = COALESCE(p_issummary, "IsSummary"),
        "SummaryDescription" = CASE WHEN p_summarydescription_clear = true THEN NULL ELSE COALESCE(p_summarydescription, "SummaryDescription") END,
        "DetectionMethod" = COALESCE(p_detectionmethod, "DetectionMethod"),
        "AutoDetectConfidenceScore" = CASE WHEN p_autodetectconfidencescore_clear = true THEN NULL ELSE COALESCE(p_autodetectconfidencescore, "AutoDetectConfidenceScore") END,
        "SourceEntityFieldID" = CASE WHEN p_sourceentityfieldid_clear = true THEN NULL ELSE COALESCE(p_sourceentityfieldid, "SourceEntityFieldID") END,
        "IsNullable" = CASE WHEN p_isnullable_clear = true THEN NULL ELSE COALESCE(p_isnullable, "IsNullable") END,
        "SourceObjectName" = CASE WHEN p_sourceobjectname_clear = true THEN NULL ELSE COALESCE(p_sourceobjectname, "SourceObjectName") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwQueryFields"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateQueryField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateQueryField" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryField table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_query_field"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_query_field" ON __mj."QueryField";

CREATE TRIGGER "trg_update_query_field"
BEFORE UPDATE ON __mj."QueryField"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_query_field"();

/* spUpdate Permissions for MJ: Query Fields */
GRANT EXECUTE ON FUNCTION __mj."spUpdateQueryField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateQueryField" TO "cdp_Integration";

/* spDelete SQL for MJ: Query Fields */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Fields
-- Item: spDeleteQueryField
-- Generated at: 2026-11-01T23:03:44.969Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR QueryField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteQueryField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteQueryField"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."QueryField"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryField" TO "cdp_Integration";

/* spDelete Permissions for MJ: Query Fields */
GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryField" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID 7bf1de44-6f7a-4a3d-8977-21114ea59e14 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '7bf1de44-6f7a-4a3d-8977-21114ea59e14', p_RelatedEntityNameFieldMap => 'CompanyIntegration');

/* SQL text to update entity field related entity name field map for entity field ID adde9665-c1f5-4bb2-9dac-76cfb3779370 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'adde9665-c1f5-4bb2-9dac-76cfb3779370', p_RelatedEntityNameFieldMap => 'Entity');

/* SQL text to update entity field related entity name field map for entity field ID a80ccd12-73d9-49c5-a14b-17f91c08cb16 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'a80ccd12-73d9-49c5-a14b-17f91c08cb16', p_RelatedEntityNameFieldMap => 'RootEntity');

/* SQL text to update entity field related entity name field map for entity field ID 8fbccca0-a6cc-4fae-aa41-1cc13d37bcde */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '8fbccca0-a6cc-4fae-aa41-1cc13d37bcde', p_RelatedEntityNameFieldMap => 'InitiatedByUser');

/* SQL text to update entity field related entity name field map for entity field ID 30dfefd4-d529-48f8-8d41-15d2879416dd */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '30dfefd4-d529-48f8-8d41-15d2879416dd', p_RelatedEntityNameFieldMap => 'Scale');

/* SQL text to update entity field related entity name field map for entity field ID 368a703c-cb22-45d5-9c20-b9e485f384a8 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '368a703c-cb22-45d5-9c20-b9e485f384a8', p_RelatedEntityNameFieldMap => 'Criterion');

/* SQL text to update entity field related entity name field map for entity field ID 82d17768-35bc-4cf5-bb58-09f42efc2a50 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '82d17768-35bc-4cf5-bb58-09f42efc2a50', p_RelatedEntityNameFieldMap => 'ScaleLevel');

/* SQL text to update entity field related entity name field map for entity field ID fb1c7408-28a7-4d8a-adad-a70a1730ed64 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'fb1c7408-28a7-4d8a-adad-a70a1730ed64', p_RelatedEntityNameFieldMap => 'Criterion');

/* SQL text to update entity field related entity name field map for entity field ID 2dcdd8ba-931b-4118-8867-22c58a31d2f4 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '2dcdd8ba-931b-4118-8867-22c58a31d2f4', p_RelatedEntityNameFieldMap => 'ScaleLevel');

/* Base View SQL for MJ: Rubric Evaluation Scores */


-- ══ MJ: AI Agents ══

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: vwAIAgents
-- Generated at: 2026-11-01T23:03:42.654Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agents
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgents"
AS
SELECT
    a.*,
    MJAIAgent_ParentID."Name" AS "Parent",
    MJAIPrompt_ContextCompressionPromptID."Name" AS "ContextCompressionPrompt",
    MJAIAgentType_TypeID."Name" AS "Type",
    MJArtifactType_DefaultArtifactTypeID."Name" AS "DefaultArtifactType",
    MJUser_OwnerUserID."Name" AS "OwnerUser",
    MJFileStorageProvider_AttachmentStorageProviderID."Name" AS "AttachmentStorageProvider",
    MJAIAgentCategory_CategoryID."Name" AS "Category",
    MJFileStorageAccount_DefaultStorageAccountID."Name" AS "DefaultStorageAccount",
    MJAIAgent_DefaultCoAgentID."Name" AS "DefaultCoAgent",
    MJFileStorageProvider_RecordingStorageProviderID."Name" AS "RecordingStorageProvider",
    MJCollection_DefaultMediaCollectionID."Name" AS "DefaultMediaCollection",
    MJAIPrompt_ConversationSummaryPromptID."Name" AS "ConversationSummaryPrompt",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    __mj."AIAgent" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_ParentID
  ON
    "a"."ParentID" = MJAIAgent_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ContextCompressionPromptID
  ON
    "a"."ContextCompressionPromptID" = MJAIPrompt_ContextCompressionPromptID."ID"
LEFT OUTER JOIN
    __mj."AIAgentType" AS MJAIAgentType_TypeID
  ON
    "a"."TypeID" = MJAIAgentType_TypeID."ID"
LEFT OUTER JOIN
    __mj."ArtifactType" AS MJArtifactType_DefaultArtifactTypeID
  ON
    "a"."DefaultArtifactTypeID" = MJArtifactType_DefaultArtifactTypeID."ID"
INNER JOIN
    __mj."User" AS MJUser_OwnerUserID
  ON
    "a"."OwnerUserID" = MJUser_OwnerUserID."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    "a"."AttachmentStorageProviderID" = MJFileStorageProvider_AttachmentStorageProviderID."ID"
LEFT OUTER JOIN
    __mj."AIAgentCategory" AS MJAIAgentCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIAgentCategory_CategoryID."ID"
LEFT OUTER JOIN
    __mj."FileStorageAccount" AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    "a"."DefaultStorageAccountID" = MJFileStorageAccount_DefaultStorageAccountID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_DefaultCoAgentID
  ON
    "a"."DefaultCoAgentID" = MJAIAgent_DefaultCoAgentID."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS MJFileStorageProvider_RecordingStorageProviderID
  ON
    "a"."RecordingStorageProviderID" = MJFileStorageProvider_RecordingStorageProviderID."ID"
LEFT OUTER JOIN
    __mj."Collection" AS MJCollection_DefaultMediaCollectionID
  ON
    "a"."DefaultMediaCollectionID" = MJCollection_DefaultMediaCollectionID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ConversationSummaryPromptID
  ON
    "a"."ConversationSummaryPromptID" = MJAIPrompt_ConversationSummaryPromptID."ID"

LEFT JOIN LATERAL __mj."fn_ai_agent_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
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
        AND tc.relname = 'vwAIAgents'
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
                           AND tc.relname = 'vwAIAgents'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS __mj."vwAIAgents" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Integration";
DO $if_view_exists$
BEGIN
  IF to_regclass('__mj."vwAIAgentsActive"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON __mj."vwAIAgentsActive" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentsActive" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentsActive" TO "cdp_Integration";';
  END IF;
END
$if_view_exists$;

/* Base View Permissions SQL for MJ: AI Agents */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: Permissions for vwAIAgents
-- Generated at: 2026-11-01T23:03:42.657Z
-- ============================================================
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Integration";
DO $if_view_exists$
BEGIN
  IF to_regclass('__mj."vwAIAgentsActive"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON __mj."vwAIAgentsActive" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentsActive" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentsActive" TO "cdp_Integration";';
  END IF;
END
$if_view_exists$;

/* spCreate SQL for MJ: AI Agents */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_hierarchy_meta
-- Generated at: 2026-11-01T23:03:42.654Z
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_parent_id_get_hierarchy_meta"(
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
            __mj."AIAgent"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            __mj."AIAgent" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM __mj."AIAgent" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM __mj."AIAgent" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;

/* Descendants Traversal Function SQL for MJ: AI Agents.ParentID */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_descendants
-- Generated at: 2026-11-01T23:03:42.654Z
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_parent_id_get_descendants"(
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
            __mj."AIAgent"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            __mj."AIAgent" c
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
        (NOT EXISTS (SELECT 1 FROM __mj."AIAgent" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM __mj."AIAgent" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;

/* Ancestors Traversal Function SQL for MJ: AI Agents.ParentID */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_ancestors
-- Generated at: 2026-11-01T23:03:42.654Z
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_parent_id_get_ancestors"(
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
            __mj."AIAgent"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            __mj."AIAgent" p
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

/* Root ID Function SQL for MJ: AI Agents.ParentID */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_root_id
-- Generated at: 2026-11-01T23:03:42.654Z
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_parent_id_get_root_id"(
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
            __mj."AIAgent"
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
            __mj."AIAgent" c
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

/* Base View SQL for MJ: AI Agents */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spCreateAIAgent
-- Generated at: 2026-11-01T23:03:42.657Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgent (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration', 'AllowMemoryWrite', 'RecordingDefault', 'RecordingStorageProviderID', 'DefaultMediaCollectionID', 'SupportsPlanMode', 'AcceptsSkills', 'SkillActivationMode', 'RequirePlanMode', 'ContextWindowMaxTokens', 'CompactionTriggerPercent', 'CompactionTargetPercent', 'ConversationSummaryPromptID', 'DeclareActionsAsNativeTools', 'MaxSubAgentConsultRounds']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'Name' THEN '($1->>''Name'')'
        WHEN 'Description' THEN '($1->>''Description'')'
        WHEN 'LogoURL' THEN '($1->>''LogoURL'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'ExposeAsAction' THEN 'COALESCE(($1->>''ExposeAsAction'')::BOOLEAN, FALSE)'
        WHEN 'ExecutionOrder' THEN 'COALESCE(($1->>''ExecutionOrder'')::INT, 0)'
        WHEN 'ExecutionMode' THEN 'COALESCE(($1->>''ExecutionMode''), ''Sequential'')'
        WHEN 'EnableContextCompression' THEN 'COALESCE(($1->>''EnableContextCompression'')::BOOLEAN, FALSE)'
        WHEN 'ContextCompressionMessageThreshold' THEN '($1->>''ContextCompressionMessageThreshold'')::INT'
        WHEN 'ContextCompressionPromptID' THEN '($1->>''ContextCompressionPromptID'')::UUID'
        WHEN 'ContextCompressionMessageRetentionCount' THEN '($1->>''ContextCompressionMessageRetentionCount'')::INT'
        WHEN 'TypeID' THEN '($1->>''TypeID'')::UUID'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'DriverClass' THEN '($1->>''DriverClass'')'
        WHEN 'IconClass' THEN '($1->>''IconClass'')'
        WHEN 'ModelSelectionMode' THEN 'COALESCE(($1->>''ModelSelectionMode''), ''Agent Type'')'
        WHEN 'PayloadDownstreamPaths' THEN 'COALESCE(($1->>''PayloadDownstreamPaths''), ''["*"]'')'
        WHEN 'PayloadUpstreamPaths' THEN 'COALESCE(($1->>''PayloadUpstreamPaths''), ''["*"]'')'
        WHEN 'PayloadSelfReadPaths' THEN '($1->>''PayloadSelfReadPaths'')'
        WHEN 'PayloadSelfWritePaths' THEN '($1->>''PayloadSelfWritePaths'')'
        WHEN 'PayloadScope' THEN '($1->>''PayloadScope'')'
        WHEN 'FinalPayloadValidation' THEN '($1->>''FinalPayloadValidation'')'
        WHEN 'FinalPayloadValidationMode' THEN 'COALESCE(($1->>''FinalPayloadValidationMode''), ''Retry'')'
        WHEN 'FinalPayloadValidationMaxRetries' THEN 'COALESCE(($1->>''FinalPayloadValidationMaxRetries'')::INT, 3)'
        WHEN 'MaxCostPerRun' THEN '($1->>''MaxCostPerRun'')::DECIMAL(10, 4)'
        WHEN 'MaxTokensPerRun' THEN '($1->>''MaxTokensPerRun'')::INT'
        WHEN 'MaxIterationsPerRun' THEN '($1->>''MaxIterationsPerRun'')::INT'
        WHEN 'MaxTimePerRun' THEN '($1->>''MaxTimePerRun'')::INT'
        WHEN 'MinExecutionsPerRun' THEN '($1->>''MinExecutionsPerRun'')::INT'
        WHEN 'MaxExecutionsPerRun' THEN '($1->>''MaxExecutionsPerRun'')::INT'
        WHEN 'StartingPayloadValidation' THEN '($1->>''StartingPayloadValidation'')'
        WHEN 'StartingPayloadValidationMode' THEN 'COALESCE(($1->>''StartingPayloadValidationMode''), ''Fail'')'
        WHEN 'DefaultPromptEffortLevel' THEN '($1->>''DefaultPromptEffortLevel'')::INT'
        WHEN 'ChatHandlingOption' THEN '($1->>''ChatHandlingOption'')'
        WHEN 'DefaultArtifactTypeID' THEN '($1->>''DefaultArtifactTypeID'')::UUID'
        WHEN 'OwnerUserID' THEN 'CASE WHEN ($1->>''OwnerUserID'')::UUID = ''00000000-0000-0000-0000-000000000000''::uuid THEN ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'' ELSE COALESCE(($1->>''OwnerUserID'')::UUID, ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'') END'
        WHEN 'InvocationMode' THEN 'COALESCE(($1->>''InvocationMode''), ''Any'')'
        WHEN 'ArtifactCreationMode' THEN 'COALESCE(($1->>''ArtifactCreationMode''), ''Always'')'
        WHEN 'FunctionalRequirements' THEN '($1->>''FunctionalRequirements'')'
        WHEN 'TechnicalDesign' THEN '($1->>''TechnicalDesign'')'
        WHEN 'InjectNotes' THEN 'COALESCE(($1->>''InjectNotes'')::BOOLEAN, TRUE)'
        WHEN 'MaxNotesToInject' THEN 'COALESCE(($1->>''MaxNotesToInject'')::INT, 5)'
        WHEN 'NoteInjectionStrategy' THEN 'COALESCE(($1->>''NoteInjectionStrategy''), ''Relevant'')'
        WHEN 'InjectExamples' THEN 'COALESCE(($1->>''InjectExamples'')::BOOLEAN, FALSE)'
        WHEN 'MaxExamplesToInject' THEN 'COALESCE(($1->>''MaxExamplesToInject'')::INT, 3)'
        WHEN 'ExampleInjectionStrategy' THEN 'COALESCE(($1->>''ExampleInjectionStrategy''), ''Semantic'')'
        WHEN 'IsRestricted' THEN 'COALESCE(($1->>''IsRestricted'')::BOOLEAN, FALSE)'
        WHEN 'MessageMode' THEN 'COALESCE(($1->>''MessageMode''), ''None'')'
        WHEN 'MaxMessages' THEN '($1->>''MaxMessages'')::INT'
        WHEN 'AttachmentStorageProviderID' THEN '($1->>''AttachmentStorageProviderID'')::UUID'
        WHEN 'AttachmentRootPath' THEN '($1->>''AttachmentRootPath'')'
        WHEN 'InlineStorageThresholdBytes' THEN '($1->>''InlineStorageThresholdBytes'')::INT'
        WHEN 'AgentTypePromptParams' THEN '($1->>''AgentTypePromptParams'')'
        WHEN 'ScopeConfig' THEN '($1->>''ScopeConfig'')'
        WHEN 'NoteRetentionDays' THEN '($1->>''NoteRetentionDays'')::INT'
        WHEN 'ExampleRetentionDays' THEN '($1->>''ExampleRetentionDays'')::INT'
        WHEN 'AutoArchiveEnabled' THEN 'COALESCE(($1->>''AutoArchiveEnabled'')::BOOLEAN, TRUE)'
        WHEN 'RerankerConfiguration' THEN '($1->>''RerankerConfiguration'')'
        WHEN 'CategoryID' THEN '($1->>''CategoryID'')::UUID'
        WHEN 'AllowEphemeralClientTools' THEN 'COALESCE(($1->>''AllowEphemeralClientTools'')::BOOLEAN, TRUE)'
        WHEN 'DefaultStorageAccountID' THEN '($1->>''DefaultStorageAccountID'')::UUID'
        WHEN 'SearchScopeAccess' THEN 'COALESCE(($1->>''SearchScopeAccess''), ''None'')'
        WHEN 'AcceptUnregisteredFiles' THEN 'COALESCE(($1->>''AcceptUnregisteredFiles'')::BOOLEAN, FALSE)'
        WHEN 'DefaultCoAgentID' THEN '($1->>''DefaultCoAgentID'')::UUID'
        WHEN 'TypeConfiguration' THEN '($1->>''TypeConfiguration'')'
        WHEN 'AllowMemoryWrite' THEN 'COALESCE(($1->>''AllowMemoryWrite'')::BOOLEAN, TRUE)'
        WHEN 'RecordingDefault' THEN '($1->>''RecordingDefault'')'
        WHEN 'RecordingStorageProviderID' THEN '($1->>''RecordingStorageProviderID'')::UUID'
        WHEN 'DefaultMediaCollectionID' THEN '($1->>''DefaultMediaCollectionID'')::UUID'
        WHEN 'SupportsPlanMode' THEN 'COALESCE(($1->>''SupportsPlanMode'')::BOOLEAN, TRUE)'
        WHEN 'AcceptsSkills' THEN 'COALESCE(($1->>''AcceptsSkills''), ''None'')'
        WHEN 'SkillActivationMode' THEN 'COALESCE(($1->>''SkillActivationMode''), ''RequestedOnly'')'
        WHEN 'RequirePlanMode' THEN 'COALESCE(($1->>''RequirePlanMode'')::BOOLEAN, FALSE)'
        WHEN 'ContextWindowMaxTokens' THEN '($1->>''ContextWindowMaxTokens'')::INT'
        WHEN 'CompactionTriggerPercent' THEN '($1->>''CompactionTriggerPercent'')::INT'
        WHEN 'CompactionTargetPercent' THEN '($1->>''CompactionTargetPercent'')::INT'
        WHEN 'ConversationSummaryPromptID' THEN '($1->>''ConversationSummaryPromptID'')::UUID'
        WHEN 'DeclareActionsAsNativeTools' THEN 'COALESCE(($1->>''DeclareActionsAsNativeTools'')::BOOLEAN, TRUE)'
        WHEN 'MaxSubAgentConsultRounds' THEN '($1->>''MaxSubAgentConsultRounds'')::INT'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO __mj."AIAgent" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Integration";

/* spCreate Permissions for MJ: AI Agents */
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Integration";

/* spUpdate SQL for MJ: AI Agents */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spUpdateAIAgent
-- Generated at: 2026-11-01T23:03:42.657Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgent (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgent: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIAgent"
    SET
        "Name" = CASE WHEN p_data ? 'Name' THEN (p_data->>'Name') ELSE "Name" END,
        "Description" = CASE WHEN p_data ? 'Description' THEN (p_data->>'Description') ELSE "Description" END,
        "LogoURL" = CASE WHEN p_data ? 'LogoURL' THEN (p_data->>'LogoURL') ELSE "LogoURL" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "ExposeAsAction" = CASE WHEN p_data ? 'ExposeAsAction' THEN (p_data->>'ExposeAsAction')::BOOLEAN ELSE "ExposeAsAction" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INT ELSE "ExecutionOrder" END,
        "ExecutionMode" = CASE WHEN p_data ? 'ExecutionMode' THEN (p_data->>'ExecutionMode') ELSE "ExecutionMode" END,
        "EnableContextCompression" = CASE WHEN p_data ? 'EnableContextCompression' THEN (p_data->>'EnableContextCompression')::BOOLEAN ELSE "EnableContextCompression" END,
        "ContextCompressionMessageThreshold" = CASE WHEN p_data ? 'ContextCompressionMessageThreshold' THEN (p_data->>'ContextCompressionMessageThreshold')::INT ELSE "ContextCompressionMessageThreshold" END,
        "ContextCompressionPromptID" = CASE WHEN p_data ? 'ContextCompressionPromptID' THEN (p_data->>'ContextCompressionPromptID')::UUID ELSE "ContextCompressionPromptID" END,
        "ContextCompressionMessageRetentionCount" = CASE WHEN p_data ? 'ContextCompressionMessageRetentionCount' THEN (p_data->>'ContextCompressionMessageRetentionCount')::INT ELSE "ContextCompressionMessageRetentionCount" END,
        "TypeID" = CASE WHEN p_data ? 'TypeID' THEN (p_data->>'TypeID')::UUID ELSE "TypeID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "DriverClass" = CASE WHEN p_data ? 'DriverClass' THEN (p_data->>'DriverClass') ELSE "DriverClass" END,
        "IconClass" = CASE WHEN p_data ? 'IconClass' THEN (p_data->>'IconClass') ELSE "IconClass" END,
        "ModelSelectionMode" = CASE WHEN p_data ? 'ModelSelectionMode' THEN (p_data->>'ModelSelectionMode') ELSE "ModelSelectionMode" END,
        "PayloadDownstreamPaths" = CASE WHEN p_data ? 'PayloadDownstreamPaths' THEN (p_data->>'PayloadDownstreamPaths') ELSE "PayloadDownstreamPaths" END,
        "PayloadUpstreamPaths" = CASE WHEN p_data ? 'PayloadUpstreamPaths' THEN (p_data->>'PayloadUpstreamPaths') ELSE "PayloadUpstreamPaths" END,
        "PayloadSelfReadPaths" = CASE WHEN p_data ? 'PayloadSelfReadPaths' THEN (p_data->>'PayloadSelfReadPaths') ELSE "PayloadSelfReadPaths" END,
        "PayloadSelfWritePaths" = CASE WHEN p_data ? 'PayloadSelfWritePaths' THEN (p_data->>'PayloadSelfWritePaths') ELSE "PayloadSelfWritePaths" END,
        "PayloadScope" = CASE WHEN p_data ? 'PayloadScope' THEN (p_data->>'PayloadScope') ELSE "PayloadScope" END,
        "FinalPayloadValidation" = CASE WHEN p_data ? 'FinalPayloadValidation' THEN (p_data->>'FinalPayloadValidation') ELSE "FinalPayloadValidation" END,
        "FinalPayloadValidationMode" = CASE WHEN p_data ? 'FinalPayloadValidationMode' THEN (p_data->>'FinalPayloadValidationMode') ELSE "FinalPayloadValidationMode" END,
        "FinalPayloadValidationMaxRetries" = CASE WHEN p_data ? 'FinalPayloadValidationMaxRetries' THEN (p_data->>'FinalPayloadValidationMaxRetries')::INT ELSE "FinalPayloadValidationMaxRetries" END,
        "MaxCostPerRun" = CASE WHEN p_data ? 'MaxCostPerRun' THEN (p_data->>'MaxCostPerRun')::DECIMAL(10, 4) ELSE "MaxCostPerRun" END,
        "MaxTokensPerRun" = CASE WHEN p_data ? 'MaxTokensPerRun' THEN (p_data->>'MaxTokensPerRun')::INT ELSE "MaxTokensPerRun" END,
        "MaxIterationsPerRun" = CASE WHEN p_data ? 'MaxIterationsPerRun' THEN (p_data->>'MaxIterationsPerRun')::INT ELSE "MaxIterationsPerRun" END,
        "MaxTimePerRun" = CASE WHEN p_data ? 'MaxTimePerRun' THEN (p_data->>'MaxTimePerRun')::INT ELSE "MaxTimePerRun" END,
        "MinExecutionsPerRun" = CASE WHEN p_data ? 'MinExecutionsPerRun' THEN (p_data->>'MinExecutionsPerRun')::INT ELSE "MinExecutionsPerRun" END,
        "MaxExecutionsPerRun" = CASE WHEN p_data ? 'MaxExecutionsPerRun' THEN (p_data->>'MaxExecutionsPerRun')::INT ELSE "MaxExecutionsPerRun" END,
        "StartingPayloadValidation" = CASE WHEN p_data ? 'StartingPayloadValidation' THEN (p_data->>'StartingPayloadValidation') ELSE "StartingPayloadValidation" END,
        "StartingPayloadValidationMode" = CASE WHEN p_data ? 'StartingPayloadValidationMode' THEN (p_data->>'StartingPayloadValidationMode') ELSE "StartingPayloadValidationMode" END,
        "DefaultPromptEffortLevel" = CASE WHEN p_data ? 'DefaultPromptEffortLevel' THEN (p_data->>'DefaultPromptEffortLevel')::INT ELSE "DefaultPromptEffortLevel" END,
        "ChatHandlingOption" = CASE WHEN p_data ? 'ChatHandlingOption' THEN (p_data->>'ChatHandlingOption') ELSE "ChatHandlingOption" END,
        "DefaultArtifactTypeID" = CASE WHEN p_data ? 'DefaultArtifactTypeID' THEN (p_data->>'DefaultArtifactTypeID')::UUID ELSE "DefaultArtifactTypeID" END,
        "OwnerUserID" = CASE WHEN p_data ? 'OwnerUserID' THEN (p_data->>'OwnerUserID')::UUID ELSE "OwnerUserID" END,
        "InvocationMode" = CASE WHEN p_data ? 'InvocationMode' THEN (p_data->>'InvocationMode') ELSE "InvocationMode" END,
        "ArtifactCreationMode" = CASE WHEN p_data ? 'ArtifactCreationMode' THEN (p_data->>'ArtifactCreationMode') ELSE "ArtifactCreationMode" END,
        "FunctionalRequirements" = CASE WHEN p_data ? 'FunctionalRequirements' THEN (p_data->>'FunctionalRequirements') ELSE "FunctionalRequirements" END,
        "TechnicalDesign" = CASE WHEN p_data ? 'TechnicalDesign' THEN (p_data->>'TechnicalDesign') ELSE "TechnicalDesign" END,
        "InjectNotes" = CASE WHEN p_data ? 'InjectNotes' THEN (p_data->>'InjectNotes')::BOOLEAN ELSE "InjectNotes" END,
        "MaxNotesToInject" = CASE WHEN p_data ? 'MaxNotesToInject' THEN (p_data->>'MaxNotesToInject')::INT ELSE "MaxNotesToInject" END,
        "NoteInjectionStrategy" = CASE WHEN p_data ? 'NoteInjectionStrategy' THEN (p_data->>'NoteInjectionStrategy') ELSE "NoteInjectionStrategy" END,
        "InjectExamples" = CASE WHEN p_data ? 'InjectExamples' THEN (p_data->>'InjectExamples')::BOOLEAN ELSE "InjectExamples" END,
        "MaxExamplesToInject" = CASE WHEN p_data ? 'MaxExamplesToInject' THEN (p_data->>'MaxExamplesToInject')::INT ELSE "MaxExamplesToInject" END,
        "ExampleInjectionStrategy" = CASE WHEN p_data ? 'ExampleInjectionStrategy' THEN (p_data->>'ExampleInjectionStrategy') ELSE "ExampleInjectionStrategy" END,
        "IsRestricted" = CASE WHEN p_data ? 'IsRestricted' THEN (p_data->>'IsRestricted')::BOOLEAN ELSE "IsRestricted" END,
        "MessageMode" = CASE WHEN p_data ? 'MessageMode' THEN (p_data->>'MessageMode') ELSE "MessageMode" END,
        "MaxMessages" = CASE WHEN p_data ? 'MaxMessages' THEN (p_data->>'MaxMessages')::INT ELSE "MaxMessages" END,
        "AttachmentStorageProviderID" = CASE WHEN p_data ? 'AttachmentStorageProviderID' THEN (p_data->>'AttachmentStorageProviderID')::UUID ELSE "AttachmentStorageProviderID" END,
        "AttachmentRootPath" = CASE WHEN p_data ? 'AttachmentRootPath' THEN (p_data->>'AttachmentRootPath') ELSE "AttachmentRootPath" END,
        "InlineStorageThresholdBytes" = CASE WHEN p_data ? 'InlineStorageThresholdBytes' THEN (p_data->>'InlineStorageThresholdBytes')::INT ELSE "InlineStorageThresholdBytes" END,
        "AgentTypePromptParams" = CASE WHEN p_data ? 'AgentTypePromptParams' THEN (p_data->>'AgentTypePromptParams') ELSE "AgentTypePromptParams" END,
        "ScopeConfig" = CASE WHEN p_data ? 'ScopeConfig' THEN (p_data->>'ScopeConfig') ELSE "ScopeConfig" END,
        "NoteRetentionDays" = CASE WHEN p_data ? 'NoteRetentionDays' THEN (p_data->>'NoteRetentionDays')::INT ELSE "NoteRetentionDays" END,
        "ExampleRetentionDays" = CASE WHEN p_data ? 'ExampleRetentionDays' THEN (p_data->>'ExampleRetentionDays')::INT ELSE "ExampleRetentionDays" END,
        "AutoArchiveEnabled" = CASE WHEN p_data ? 'AutoArchiveEnabled' THEN (p_data->>'AutoArchiveEnabled')::BOOLEAN ELSE "AutoArchiveEnabled" END,
        "RerankerConfiguration" = CASE WHEN p_data ? 'RerankerConfiguration' THEN (p_data->>'RerankerConfiguration') ELSE "RerankerConfiguration" END,
        "CategoryID" = CASE WHEN p_data ? 'CategoryID' THEN (p_data->>'CategoryID')::UUID ELSE "CategoryID" END,
        "AllowEphemeralClientTools" = CASE WHEN p_data ? 'AllowEphemeralClientTools' THEN (p_data->>'AllowEphemeralClientTools')::BOOLEAN ELSE "AllowEphemeralClientTools" END,
        "DefaultStorageAccountID" = CASE WHEN p_data ? 'DefaultStorageAccountID' THEN (p_data->>'DefaultStorageAccountID')::UUID ELSE "DefaultStorageAccountID" END,
        "SearchScopeAccess" = CASE WHEN p_data ? 'SearchScopeAccess' THEN (p_data->>'SearchScopeAccess') ELSE "SearchScopeAccess" END,
        "AcceptUnregisteredFiles" = CASE WHEN p_data ? 'AcceptUnregisteredFiles' THEN (p_data->>'AcceptUnregisteredFiles')::BOOLEAN ELSE "AcceptUnregisteredFiles" END,
        "DefaultCoAgentID" = CASE WHEN p_data ? 'DefaultCoAgentID' THEN (p_data->>'DefaultCoAgentID')::UUID ELSE "DefaultCoAgentID" END,
        "TypeConfiguration" = CASE WHEN p_data ? 'TypeConfiguration' THEN (p_data->>'TypeConfiguration') ELSE "TypeConfiguration" END,
        "AllowMemoryWrite" = CASE WHEN p_data ? 'AllowMemoryWrite' THEN (p_data->>'AllowMemoryWrite')::BOOLEAN ELSE "AllowMemoryWrite" END,
        "RecordingDefault" = CASE WHEN p_data ? 'RecordingDefault' THEN (p_data->>'RecordingDefault') ELSE "RecordingDefault" END,
        "RecordingStorageProviderID" = CASE WHEN p_data ? 'RecordingStorageProviderID' THEN (p_data->>'RecordingStorageProviderID')::UUID ELSE "RecordingStorageProviderID" END,
        "DefaultMediaCollectionID" = CASE WHEN p_data ? 'DefaultMediaCollectionID' THEN (p_data->>'DefaultMediaCollectionID')::UUID ELSE "DefaultMediaCollectionID" END,
        "SupportsPlanMode" = CASE WHEN p_data ? 'SupportsPlanMode' THEN (p_data->>'SupportsPlanMode')::BOOLEAN ELSE "SupportsPlanMode" END,
        "AcceptsSkills" = CASE WHEN p_data ? 'AcceptsSkills' THEN (p_data->>'AcceptsSkills') ELSE "AcceptsSkills" END,
        "SkillActivationMode" = CASE WHEN p_data ? 'SkillActivationMode' THEN (p_data->>'SkillActivationMode') ELSE "SkillActivationMode" END,
        "RequirePlanMode" = CASE WHEN p_data ? 'RequirePlanMode' THEN (p_data->>'RequirePlanMode')::BOOLEAN ELSE "RequirePlanMode" END,
        "ContextWindowMaxTokens" = CASE WHEN p_data ? 'ContextWindowMaxTokens' THEN (p_data->>'ContextWindowMaxTokens')::INT ELSE "ContextWindowMaxTokens" END,
        "CompactionTriggerPercent" = CASE WHEN p_data ? 'CompactionTriggerPercent' THEN (p_data->>'CompactionTriggerPercent')::INT ELSE "CompactionTriggerPercent" END,
        "CompactionTargetPercent" = CASE WHEN p_data ? 'CompactionTargetPercent' THEN (p_data->>'CompactionTargetPercent')::INT ELSE "CompactionTargetPercent" END,
        "ConversationSummaryPromptID" = CASE WHEN p_data ? 'ConversationSummaryPromptID' THEN (p_data->>'ConversationSummaryPromptID')::UUID ELSE "ConversationSummaryPromptID" END,
        "DeclareActionsAsNativeTools" = CASE WHEN p_data ? 'DeclareActionsAsNativeTools' THEN (p_data->>'DeclareActionsAsNativeTools')::BOOLEAN ELSE "DeclareActionsAsNativeTools" END,
        "MaxSubAgentConsultRounds" = CASE WHEN p_data ? 'MaxSubAgentConsultRounds' THEN (p_data->>'MaxSubAgentConsultRounds')::INT ELSE "MaxSubAgentConsultRounds" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent" ON __mj."AIAgent";

CREATE TRIGGER "trg_update_ai_agent"
BEFORE UPDATE ON __mj."AIAgent"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent"();

/* spUpdate Permissions for MJ: AI Agents */
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Integration";

/* spDelete SQL for MJ: AI Agents */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
-- Generated at: 2026-11-01T23:03:42.658Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgent"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Actions.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentAction"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentAction"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Artifact Types records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentArtifactType"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentArtifactType"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Client Tools records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentClientTool"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentClientTool"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Co Agents records via CoAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentCoAgent"
        WHERE "CoAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentCoAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Co Agents.TargetAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentCoAgent"
        WHERE "TargetAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentCoAgent"
        SET "TargetAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Configurations records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentConfiguration"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentConfiguration"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Credentials records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentCredential"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentCredential"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Data Sources records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentDataSource"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentDataSource"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Examples records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentExample"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Learning Cycles records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentLearningCycle"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentLearningCycle"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Modalities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentModality"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentModality"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Models.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentModel"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentModel"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Permissions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPermission"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Personas records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPersona"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPersona"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPrompt"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRelationship"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRelationship"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Requests records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRequest"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Rubrics records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRubric"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRubric"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Runs records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Search Scopes records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSearchScope"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSearchScope"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Sessions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSession"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSession"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Skills records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSkill"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSkill"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Steps records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.SubAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "SubAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentStep"
        SET "SubAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent User Policies records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentUserPolicy"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentUserPolicy"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.DefaultCoAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "DefaultCoAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "DefaultCoAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Bridge Agent Identities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIBridgeAgentIdentity"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIBridgeAgentIdentity"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIResultCache"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Skill Sub Agents records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AISkillSubAgent"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAISkillSubAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Actions.CreatedByAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Action"
        WHERE "CreatedByAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Action"
        SET "CreatedByAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ConversationDetail"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Widget Instances records via PinnedAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationWidgetInstance"
        WHERE "PinnedAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationWidgetInstance"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversations.DefaultAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Conversation"
        WHERE "DefaultAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Conversation"
        SET "DefaultAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Entity Documents.ReasoningAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityDocument"
        WHERE "ReasoningAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."EntityDocument"
        SET "ReasoningAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Interaction Events.ActorAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."InteractionEvent"
        WHERE "ActorAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."InteractionEvent"
        SET "ActorAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Interaction Offers.OfferedByAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."InteractionOffer"
        WHERE "OfferedByAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."InteractionOffer"
        SET "OfferedByAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Meeting Participants.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."MeetingParticipant"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."MeetingParticipant"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."RecordProcess"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."RecordProcess"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Search Execution Logs.AIAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."SearchExecutionLog"
        WHERE "AIAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."SearchExecutionLog"
        SET "AIAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Task"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Task"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgent"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Integration";

/* spDelete Permissions for MJ: AI Agents */
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Integration";

/* spCreate SQL for MJ: AI Credential Bindings */


-- ══ MJ: AI Agent Relationships ══

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Relationships
-- Item: vwAIAgentRelationships
-- Generated at: 2026-11-01T23:03:42.384Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Relationships
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRelationship
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRelationships"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgent_SubAgentID."Name" AS "SubAgent",
    MJAIAgentConfiguration_ConfigurationPresetID."Name" AS "ConfigurationPreset"
FROM
    __mj."AIAgentRelationship" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_SubAgentID
  ON
    "a"."SubAgentID" = MJAIAgent_SubAgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentConfiguration" AS MJAIAgentConfiguration_ConfigurationPresetID
  ON
    "a"."ConfigurationPresetID" = MJAIAgentConfiguration_ConfigurationPresetID."ID"
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
        AND tc.relname = 'vwAIAgentRelationships'
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
                           AND tc.relname = 'vwAIAgentRelationships'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentRelationships" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentRelationships" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentRelationships" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentRelationships" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: AI Agent Relationships */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Relationships
-- Item: Permissions for vwAIAgentRelationships
-- Generated at: 2026-11-01T23:03:42.386Z
-- ============================================================
GRANT SELECT ON __mj."vwAIAgentRelationships" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentRelationships" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentRelationships" TO "cdp_Integration";

/* spCreate SQL for MJ: AI Agent Relationships */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Relationships
-- Item: spCreateAIAgentRelationship
-- Generated at: 2026-11-01T23:03:42.386Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRelationship
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRelationship'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRelationship"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_subagentid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_subagentoutputmapping_clear boolean DEFAULT false,
    p_subagentoutputmapping TEXT DEFAULT NULL,
    p_subagentinputmapping_clear boolean DEFAULT false,
    p_subagentinputmapping TEXT DEFAULT NULL,
    p_subagentcontextpaths_clear boolean DEFAULT false,
    p_subagentcontextpaths TEXT DEFAULT NULL,
    p_messagemode varchar(50) DEFAULT NULL,
    p_maxmessages_clear boolean DEFAULT false,
    p_maxmessages int DEFAULT NULL,
    p_chathandlingoption_clear boolean DEFAULT false,
    p_chathandlingoption varchar(30) DEFAULT NULL,
    p_configurationpresetid_clear boolean DEFAULT false,
    p_configurationpresetid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRelationships" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentRelationship"
        (
            "ID",
            "AgentID",
                "SubAgentID",
                "Status",
                "SubAgentOutputMapping",
                "SubAgentInputMapping",
                "SubAgentContextPaths",
                "MessageMode",
                "MaxMessages",
                "ChatHandlingOption",
                "ConfigurationPresetID"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_subagentid,
                p_status,
                CASE WHEN p_subagentoutputmapping_clear = true THEN NULL ELSE COALESCE(p_subagentoutputmapping, NULL) END,
                CASE WHEN p_subagentinputmapping_clear = true THEN NULL ELSE COALESCE(p_subagentinputmapping, NULL) END,
                CASE WHEN p_subagentcontextpaths_clear = true THEN NULL ELSE COALESCE(p_subagentcontextpaths, NULL) END,
                COALESCE(p_messagemode, 'None'),
                CASE WHEN p_maxmessages_clear = true THEN NULL ELSE COALESCE(p_maxmessages, NULL) END,
                CASE WHEN p_chathandlingoption_clear = true THEN NULL ELSE COALESCE(p_chathandlingoption, NULL) END,
                CASE WHEN p_configurationpresetid_clear = true THEN NULL ELSE COALESCE(p_configurationpresetid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRelationships"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRelationship" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRelationship" TO "cdp_Integration";

/* spCreate Permissions for MJ: AI Agent Relationships */
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRelationship" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRelationship" TO "cdp_Integration";

/* spUpdate SQL for MJ: AI Agent Relationships */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Relationships
-- Item: spUpdateAIAgentRelationship
-- Generated at: 2026-11-01T23:03:42.387Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRelationship
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRelationship'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRelationship"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_subagentid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_subagentoutputmapping_clear boolean DEFAULT false,
    p_subagentoutputmapping TEXT DEFAULT NULL,
    p_subagentinputmapping_clear boolean DEFAULT false,
    p_subagentinputmapping TEXT DEFAULT NULL,
    p_subagentcontextpaths_clear boolean DEFAULT false,
    p_subagentcontextpaths TEXT DEFAULT NULL,
    p_messagemode varchar(50) DEFAULT NULL,
    p_maxmessages_clear boolean DEFAULT false,
    p_maxmessages int DEFAULT NULL,
    p_chathandlingoption_clear boolean DEFAULT false,
    p_chathandlingoption varchar(30) DEFAULT NULL,
    p_configurationpresetid_clear boolean DEFAULT false,
    p_configurationpresetid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRelationships" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentRelationship"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "SubAgentID" = COALESCE(p_subagentid, "SubAgentID"),
        "Status" = COALESCE(p_status, "Status"),
        "SubAgentOutputMapping" = CASE WHEN p_subagentoutputmapping_clear = true THEN NULL ELSE COALESCE(p_subagentoutputmapping, "SubAgentOutputMapping") END,
        "SubAgentInputMapping" = CASE WHEN p_subagentinputmapping_clear = true THEN NULL ELSE COALESCE(p_subagentinputmapping, "SubAgentInputMapping") END,
        "SubAgentContextPaths" = CASE WHEN p_subagentcontextpaths_clear = true THEN NULL ELSE COALESCE(p_subagentcontextpaths, "SubAgentContextPaths") END,
        "MessageMode" = COALESCE(p_messagemode, "MessageMode"),
        "MaxMessages" = CASE WHEN p_maxmessages_clear = true THEN NULL ELSE COALESCE(p_maxmessages, "MaxMessages") END,
        "ChatHandlingOption" = CASE WHEN p_chathandlingoption_clear = true THEN NULL ELSE COALESCE(p_chathandlingoption, "ChatHandlingOption") END,
        "ConfigurationPresetID" = CASE WHEN p_configurationpresetid_clear = true THEN NULL ELSE COALESCE(p_configurationpresetid, "ConfigurationPresetID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRelationships"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRelationship" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRelationship" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRelationship table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_relationship"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_relationship" ON __mj."AIAgentRelationship";

CREATE TRIGGER "trg_update_ai_agent_relationship"
BEFORE UPDATE ON __mj."AIAgentRelationship"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_relationship"();

/* spUpdate Permissions for MJ: AI Agent Relationships */
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRelationship" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRelationship" TO "cdp_Integration";

/* spDelete SQL for MJ: AI Agent Relationships */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Relationships
-- Item: spDeleteAIAgentRelationship
-- Generated at: 2026-11-01T23:03:42.387Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRelationship
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRelationship'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRelationship"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentRelationship"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRelationship" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRelationship" TO "cdp_Integration";

/* spDelete Permissions for MJ: AI Agent Relationships */
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRelationship" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRelationship" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID 81e9225b-3e70-4bb0-9161-d99b97bac6d9 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '81e9225b-3e70-4bb0-9161-d99b97bac6d9', p_RelatedEntityNameFieldMap => 'Agent');

/* SQL text to update entity field related entity name field map for entity field ID 430acaae-d57e-4b8d-b481-8821088bd468 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '430acaae-d57e-4b8d-b481-8821088bd468', p_RelatedEntityNameFieldMap => 'Rubric');

/* SQL text to update entity field related entity name field map for entity field ID f568a01c-f2b9-4f41-bb34-c3be3549b8f5 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'f568a01c-f2b9-4f41-bb34-c3be3549b8f5', p_RelatedEntityNameFieldMap => 'PayloadAtStartSourceStep');

/* SQL text to update entity field related entity name field map for entity field ID 6b4c84d5-7814-4c93-957f-8840f6b71130 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '6b4c84d5-7814-4c93-957f-8840f6b71130', p_RelatedEntityNameFieldMap => 'PayloadAtEndSourceStep');

/* SQL text to update entity field related entity name field map for entity field ID f1fdc4b8-66d0-4fda-b90b-c22634b19645 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'f1fdc4b8-66d0-4fda-b90b-c22634b19645', p_RelatedEntityNameFieldMap => 'Agent');

/* SQL text to update entity field related entity name field map for entity field ID cfa96b9c-36ef-40eb-9d35-fd70d0e31cc3 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'cfa96b9c-36ef-40eb-9d35-fd70d0e31cc3', p_RelatedEntityNameFieldMap => 'User');

/* SQL text to update entity field related entity name field map for entity field ID 95d689f2-dbee-4840-b5df-d6d24a6351a3 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '95d689f2-dbee-4840-b5df-d6d24a6351a3', p_RelatedEntityNameFieldMap => 'PreferredPersona');

/* Hierarchy Metadata Function SQL for MJ: AI Agents.ParentID */


-- ══ MJ: AI Prompts ══

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
-- Generated at: 2026-11-01T23:03:45.944Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPrompt"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Actions.CompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentAction"
        WHERE "CompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentAction"
        SET "CompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPrompt"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentStep"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.SystemPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentType"
        WHERE "SystemPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentType"
        SET "SystemPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.ContextCompressionPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentType"
        WHERE "ContextCompressionPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentType"
        SET "ContextCompressionPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.ConversationSummaryPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentType"
        WHERE "ConversationSummaryPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentType"
        SET "ConversationSummaryPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ContextCompressionPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "ContextCompressionPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "ContextCompressionPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ConversationSummaryPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "ConversationSummaryPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "ConversationSummaryPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextCompressionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIConfiguration"
        WHERE "DefaultPromptForContextCompressionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIConfiguration"
        SET "DefaultPromptForContextCompressionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextSummarizationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIConfiguration"
        WHERE "DefaultPromptForContextSummarizationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIConfiguration"
        SET "DefaultPromptForContextSummarizationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Models records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptModel"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIPromptModel"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Runs records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.JudgeID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "JudgeID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "JudgeID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ChildPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "ChildPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "ChildPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompts.ResultSelectorPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPrompt"
        WHERE "ResultSelectorPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPrompt"
        SET "ResultSelectorPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Result Cache records via AIPromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "AIPromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIResultCache"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Actions.DefaultCompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Action"
        WHERE "DefaultCompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Action"
        SET "DefaultCompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Entity Documents.ReasoningPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityDocument"
        WHERE "ReasoningPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."EntityDocument"
        SET "ReasoningPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Feature Pipeline Versions.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."FeaturePipelineVersion"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."FeaturePipelineVersion"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Feature Value Caches records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."FeatureValueCache"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteFeatureValueCache"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Feature Values.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."FeatureValue"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."FeatureValue"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."RecordProcess"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."RecordProcess"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Scoped Prompt Configs records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ScopedPromptConfig"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteScopedPromptConfig"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Scoped Prompt Parts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ScopedPromptPart"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteScopedPromptPart"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Tasks.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Task"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Task"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIPrompt"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer";

/* spDelete Permissions for MJ: AI Prompts */
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer";

/* spDelete SQL for MJ: AI Agent Runs */


-- ══ MJ: Brand Kits ══

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Brand Kits
-- Item: spCreateBrandKit
-- Generated at: 2026-11-01T23:03:43.234Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR BrandKit
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateBrandKit'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateBrandKit"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_style_clear boolean DEFAULT false,
    p_style TEXT DEFAULT NULL,
    p_voice_clear boolean DEFAULT false,
    p_voice TEXT DEFAULT NULL,
    p_generationpolicy_clear boolean DEFAULT false,
    p_generationpolicy TEXT DEFAULT NULL,
    p_neverinvent_clear boolean DEFAULT false,
    p_neverinvent TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwBrandKits" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."BrandKit"
        (
            "ID",
            "Name",
                "Description",
                "CompanyID",
                "IsDefault",
                "Status",
                "Style",
                "Voice",
                "GenerationPolicy",
                "NeverInvent"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, NULL) END,
                COALESCE(p_isdefault, FALSE),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_style_clear = true THEN NULL ELSE COALESCE(p_style, NULL) END,
                CASE WHEN p_voice_clear = true THEN NULL ELSE COALESCE(p_voice, NULL) END,
                CASE WHEN p_generationpolicy_clear = true THEN NULL ELSE COALESCE(p_generationpolicy, NULL) END,
                CASE WHEN p_neverinvent_clear = true THEN NULL ELSE COALESCE(p_neverinvent, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwBrandKits"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateBrandKit" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateBrandKit" TO "cdp_Integration";

/* spCreate Permissions for MJ: Brand Kits */
GRANT EXECUTE ON FUNCTION __mj."spCreateBrandKit" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateBrandKit" TO "cdp_Integration";

/* spUpdate SQL for MJ: Brand Kits */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Brand Kits
-- Item: spUpdateBrandKit
-- Generated at: 2026-11-01T23:03:43.234Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR BrandKit
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateBrandKit'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateBrandKit"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_style_clear boolean DEFAULT false,
    p_style TEXT DEFAULT NULL,
    p_voice_clear boolean DEFAULT false,
    p_voice TEXT DEFAULT NULL,
    p_generationpolicy_clear boolean DEFAULT false,
    p_generationpolicy TEXT DEFAULT NULL,
    p_neverinvent_clear boolean DEFAULT false,
    p_neverinvent TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwBrandKits" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."BrandKit"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "CompanyID" = CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, "CompanyID") END,
        "IsDefault" = COALESCE(p_isdefault, "IsDefault"),
        "Status" = COALESCE(p_status, "Status"),
        "Style" = CASE WHEN p_style_clear = true THEN NULL ELSE COALESCE(p_style, "Style") END,
        "Voice" = CASE WHEN p_voice_clear = true THEN NULL ELSE COALESCE(p_voice, "Voice") END,
        "GenerationPolicy" = CASE WHEN p_generationpolicy_clear = true THEN NULL ELSE COALESCE(p_generationpolicy, "GenerationPolicy") END,
        "NeverInvent" = CASE WHEN p_neverinvent_clear = true THEN NULL ELSE COALESCE(p_neverinvent, "NeverInvent") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwBrandKits"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateBrandKit" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateBrandKit" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the BrandKit table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_brand_kit"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_brand_kit" ON __mj."BrandKit";

CREATE TRIGGER "trg_update_brand_kit"
BEFORE UPDATE ON __mj."BrandKit"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_brand_kit"();

/* spUpdate Permissions for MJ: Brand Kits */
GRANT EXECUTE ON FUNCTION __mj."spUpdateBrandKit" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateBrandKit" TO "cdp_Integration";

/* spDelete SQL for MJ: Brand Kits */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Brand Kits
-- Item: spDeleteBrandKit
-- Generated at: 2026-11-01T23:03:43.234Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR BrandKit
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteBrandKit'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteBrandKit"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."BrandKit"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteBrandKit" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteBrandKit" TO "cdp_Integration";

/* spDelete Permissions for MJ: Brand Kits */
GRANT EXECUTE ON FUNCTION __mj."spDeleteBrandKit" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteBrandKit" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID 6b9d4f74-59ab-474b-8994-d1914aca3269 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '6b9d4f74-59ab-474b-8994-d1914aca3269', p_RelatedEntityNameFieldMap => 'CommunicationProvider');

/* SQL text to update entity field related entity name field map for entity field ID 2a7150bb-fb99-4a8d-ae7d-8ef317a41953 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '2a7150bb-fb99-4a8d-ae7d-8ef317a41953', p_RelatedEntityNameFieldMap => 'Entity');

/* SQL text to update entity field related entity name field map for entity field ID 59798844-986f-4d66-86c0-209d1fbe0b03 */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '59798844-986f-4d66-86c0-209d1fbe0b03', p_RelatedEntityNameFieldMap => 'CommunicationProvider');

/* Index for Foreign Keys for ClusterAnalysisCluster */


-- ══ MJ: Brand Kit Assets ══

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Brand Kit Assets
-- Item: spCreateBrandKitAsset
-- Generated at: 2026-11-01T23:03:43.229Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR BrandKitAsset
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateBrandKitAsset'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateBrandKitAsset"(
    p_id UUID DEFAULT NULL,
    p_brandkitid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_assettype varchar(30) DEFAULT NULL,
    p_fileid UUID DEFAULT NULL,
    p_usage_clear boolean DEFAULT false,
    p_usage TEXT DEFAULT NULL,
    p_isprimary BOOLEAN DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_licensenotes_clear boolean DEFAULT false,
    p_licensenotes varchar(500) DEFAULT NULL,
    p_isgenerationreference BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwBrandKitAssets" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."BrandKitAsset"
        (
            "ID",
            "BrandKitID",
                "Name",
                "AssetType",
                "FileID",
                "Usage",
                "IsPrimary",
                "Sequence",
                "LicenseNotes",
                "IsGenerationReference"
        )
    VALUES
        (
            v_new_id,
            p_brandkitid,
                p_name,
                p_assettype,
                p_fileid,
                CASE WHEN p_usage_clear = true THEN NULL ELSE COALESCE(p_usage, NULL) END,
                COALESCE(p_isprimary, FALSE),
                COALESCE(p_sequence, 0),
                CASE WHEN p_licensenotes_clear = true THEN NULL ELSE COALESCE(p_licensenotes, NULL) END,
                COALESCE(p_isgenerationreference, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwBrandKitAssets"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateBrandKitAsset" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateBrandKitAsset" TO "cdp_Integration";

/* spCreate Permissions for MJ: Brand Kit Assets */
GRANT EXECUTE ON FUNCTION __mj."spCreateBrandKitAsset" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateBrandKitAsset" TO "cdp_Integration";

/* spUpdate SQL for MJ: Brand Kit Assets */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Brand Kit Assets
-- Item: spUpdateBrandKitAsset
-- Generated at: 2026-11-01T23:03:43.229Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR BrandKitAsset
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateBrandKitAsset'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateBrandKitAsset"(
    p_id UUID,
    p_brandkitid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_assettype varchar(30) DEFAULT NULL,
    p_fileid UUID DEFAULT NULL,
    p_usage_clear boolean DEFAULT false,
    p_usage TEXT DEFAULT NULL,
    p_isprimary BOOLEAN DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_licensenotes_clear boolean DEFAULT false,
    p_licensenotes varchar(500) DEFAULT NULL,
    p_isgenerationreference BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwBrandKitAssets" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."BrandKitAsset"
    SET
        "BrandKitID" = COALESCE(p_brandkitid, "BrandKitID"),
        "Name" = COALESCE(p_name, "Name"),
        "AssetType" = COALESCE(p_assettype, "AssetType"),
        "FileID" = COALESCE(p_fileid, "FileID"),
        "Usage" = CASE WHEN p_usage_clear = true THEN NULL ELSE COALESCE(p_usage, "Usage") END,
        "IsPrimary" = COALESCE(p_isprimary, "IsPrimary"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "LicenseNotes" = CASE WHEN p_licensenotes_clear = true THEN NULL ELSE COALESCE(p_licensenotes, "LicenseNotes") END,
        "IsGenerationReference" = COALESCE(p_isgenerationreference, "IsGenerationReference")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwBrandKitAssets"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateBrandKitAsset" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateBrandKitAsset" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the BrandKitAsset table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_brand_kit_asset"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_brand_kit_asset" ON __mj."BrandKitAsset";

CREATE TRIGGER "trg_update_brand_kit_asset"
BEFORE UPDATE ON __mj."BrandKitAsset"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_brand_kit_asset"();

/* spUpdate Permissions for MJ: Brand Kit Assets */
GRANT EXECUTE ON FUNCTION __mj."spUpdateBrandKitAsset" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateBrandKitAsset" TO "cdp_Integration";

/* spDelete SQL for MJ: Brand Kit Assets */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Brand Kit Assets
-- Item: spDeleteBrandKitAsset
-- Generated at: 2026-11-01T23:03:43.229Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR BrandKitAsset
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteBrandKitAsset'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteBrandKitAsset"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."BrandKitAsset"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteBrandKitAsset" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteBrandKitAsset" TO "cdp_Integration";

/* spDelete Permissions for MJ: Brand Kit Assets */
GRANT EXECUTE ON FUNCTION __mj."spDeleteBrandKitAsset" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteBrandKitAsset" TO "cdp_Integration";

/* spCreate SQL for MJ: Brand Kits */


-- ══ MJ: Video Archetypes ══

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Video Archetypes
-- Item: spCreateVideoArchetype
-- Generated at: 2026-11-01T23:03:45.842Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR VideoArchetype
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateVideoArchetype'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateVideoArchetype"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL,
    p_category varchar(30) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_defaultdurationseconds int DEFAULT NULL,
    p_mindurationseconds int DEFAULT NULL,
    p_maxdurationseconds int DEFAULT NULL,
    p_defaultformats varchar(100) DEFAULT NULL,
    p_beattemplate TEXT DEFAULT NULL,
    p_pacing_clear boolean DEFAULT false,
    p_pacing TEXT DEFAULT NULL,
    p_guidance_clear boolean DEFAULT false,
    p_guidance TEXT DEFAULT NULL,
    p_defaultinteractionmode varchar(30) DEFAULT NULL
) RETURNS SETOF __mj."vwVideoArchetypes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."VideoArchetype"
        (
            "ID",
            "Name",
                "Description",
                "CompanyID",
                "Category",
                "Status",
                "DefaultDurationSeconds",
                "MinDurationSeconds",
                "MaxDurationSeconds",
                "DefaultFormats",
                "BeatTemplate",
                "Pacing",
                "Guidance",
                "DefaultInteractionMode"
        )
    VALUES
        (
            v_new_id,
            p_name,
                p_description,
                CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, NULL) END,
                p_category,
                COALESCE(p_status, 'Active'),
                p_defaultdurationseconds,
                p_mindurationseconds,
                p_maxdurationseconds,
                p_defaultformats,
                p_beattemplate,
                CASE WHEN p_pacing_clear = true THEN NULL ELSE COALESCE(p_pacing, NULL) END,
                CASE WHEN p_guidance_clear = true THEN NULL ELSE COALESCE(p_guidance, NULL) END,
                COALESCE(p_defaultinteractionmode, 'Autonomous')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwVideoArchetypes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateVideoArchetype" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateVideoArchetype" TO "cdp_Integration";

/* spCreate Permissions for MJ: Video Archetypes */
GRANT EXECUTE ON FUNCTION __mj."spCreateVideoArchetype" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateVideoArchetype" TO "cdp_Integration";

/* spUpdate SQL for MJ: Video Archetypes */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Video Archetypes
-- Item: spUpdateVideoArchetype
-- Generated at: 2026-11-01T23:03:45.843Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR VideoArchetype
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateVideoArchetype'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateVideoArchetype"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL,
    p_category varchar(30) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_defaultdurationseconds int DEFAULT NULL,
    p_mindurationseconds int DEFAULT NULL,
    p_maxdurationseconds int DEFAULT NULL,
    p_defaultformats varchar(100) DEFAULT NULL,
    p_beattemplate TEXT DEFAULT NULL,
    p_pacing_clear boolean DEFAULT false,
    p_pacing TEXT DEFAULT NULL,
    p_guidance_clear boolean DEFAULT false,
    p_guidance TEXT DEFAULT NULL,
    p_defaultinteractionmode varchar(30) DEFAULT NULL
) RETURNS SETOF __mj."vwVideoArchetypes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."VideoArchetype"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = COALESCE(p_description, "Description"),
        "CompanyID" = CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, "CompanyID") END,
        "Category" = COALESCE(p_category, "Category"),
        "Status" = COALESCE(p_status, "Status"),
        "DefaultDurationSeconds" = COALESCE(p_defaultdurationseconds, "DefaultDurationSeconds"),
        "MinDurationSeconds" = COALESCE(p_mindurationseconds, "MinDurationSeconds"),
        "MaxDurationSeconds" = COALESCE(p_maxdurationseconds, "MaxDurationSeconds"),
        "DefaultFormats" = COALESCE(p_defaultformats, "DefaultFormats"),
        "BeatTemplate" = COALESCE(p_beattemplate, "BeatTemplate"),
        "Pacing" = CASE WHEN p_pacing_clear = true THEN NULL ELSE COALESCE(p_pacing, "Pacing") END,
        "Guidance" = CASE WHEN p_guidance_clear = true THEN NULL ELSE COALESCE(p_guidance, "Guidance") END,
        "DefaultInteractionMode" = COALESCE(p_defaultinteractionmode, "DefaultInteractionMode")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwVideoArchetypes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateVideoArchetype" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateVideoArchetype" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the VideoArchetype table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_video_archetype"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_video_archetype" ON __mj."VideoArchetype";

CREATE TRIGGER "trg_update_video_archetype"
BEFORE UPDATE ON __mj."VideoArchetype"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_video_archetype"();

/* spUpdate Permissions for MJ: Video Archetypes */
GRANT EXECUTE ON FUNCTION __mj."spUpdateVideoArchetype" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateVideoArchetype" TO "cdp_Integration";

/* spDelete SQL for MJ: Video Archetypes */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Video Archetypes
-- Item: spDeleteVideoArchetype
-- Generated at: 2026-11-01T23:03:45.843Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR VideoArchetype
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteVideoArchetype'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteVideoArchetype"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."VideoArchetype"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteVideoArchetype" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteVideoArchetype" TO "cdp_Integration";

/* spDelete Permissions for MJ: Video Archetypes */
GRANT EXECUTE ON FUNCTION __mj."spDeleteVideoArchetype" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteVideoArchetype" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID 5d9769bd-7f8b-47e5-866a-a76b90d0090c */
SELECT * FROM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '5d9769bd-7f8b-47e5-866a-a76b90d0090c', p_RelatedEntityNameFieldMap => 'Credential');

/* spDelete SQL for MJ: Applications */
