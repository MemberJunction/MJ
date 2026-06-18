-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606071125__v5.40.x__Fix_AIAgentRun_NameField_Remove_PK.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* Corrective metadata repair for a regression shipped in v5.39. */ /* Background: */ /*   The migration V202606021958__v5.39.x__AI_Prompt_Cache_Columns.sql included */ /*   CodeGen-generated "Set field properties" output produced with the Advanced */ /*   Generation "Smart Field Identification" (SFI) feature enabled. The SFI LLM */ /*   incorrectly flagged MJ: AI Agent Runs.ID (a uniqueidentifier PRIMARY KEY) as */ /*   IsNameField=1, so that entity ended up with TWO name fields: ID and RunName. */ /*   EntityInfo.NameField resolves a multi-name-field entity to the first field by */ /*   sequence when none is literally named "Name" — that's ID (sequence 1). Every */ /*   FK that joins to AI Agent Runs (SourceAIAgentRun, OriginatingAgentRun, */ /*   ResumingAgentRun, AgentRun, ParentRun, LastRun, ...) therefore had its */ /*   related-entity name virtual field resolve to the uniqueidentifier PK instead */ /*   of the nvarchar RunName column, corrupting those virtual fields' SQL type */ /*   (nvarchar(255) -> uniqueidentifier) on the next CodeGen run. */ /* Why this lives in a migration (exception to the usual "no EntityField metadata */ /* updates in migrations — CodeGen handles those" rule): */ /*   * The bad value SHIPPED in a versioned migration, so it is already applied on */ /*     every database that ran v5.39. CodeGen will NOT repair it: applyNameFieldUpdates */ /*     only ever SETS IsNameField, never clears it. A forward migration is the only */ /*     channel that reliably reaches every installed database (metadata-sync runs */ /*     only in the MJ dev repo, not customer installs). */ /*   * The CodeGenLib guardrail added alongside this migration (isFieldEligibleForNameField) */ /*     prevents SFI from re-flagging a PK/uniqueidentifier as a name field going forward, */ /*     so this correction will not be undone by a later CodeGen run. */ /* Effect: RunName becomes the sole IsNameField for MJ: AI Agent Runs (its intended, */ /* pre-v5.39 state). RunName is nullable, so the FK name virtual fields go back to */ /* nullable nvarchar(255); when a run has no RunName the virtual field is NULL, which */ /* is the correct semantic. The next CodeGen run regenerates the views and entity */ /* subclasses with the correct nvarchar type. */
UPDATE __mj."EntityField" SET "IsNameField" = FALSE
WHERE
  "ID" = '0CDCEFDE-FBFE-44CD-ACAF-A1543F309EC4' /* MJ: AI Agent Runs.ID (uniqueidentifier PK) */
  AND "IsNameField" = TRUE;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Examples
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_agent_id"
    ON __mj."AIAgentExample" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_user_id"
    ON __mj."AIAgentExample" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_company_id"
    ON __mj."AIAgentExample" ("CompanyID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_source_conversation_id"
    ON __mj."AIAgentExample" ("SourceConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_source_conversation_detail_id"
    ON __mj."AIAgentExample" ("SourceConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_source_ai_agent_run_id"
    ON __mj."AIAgentExample" ("SourceAIAgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_embedding_model_id"
    ON __mj."AIAgentExample" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_example_primary_scope_entity_id"
    ON __mj."AIAgentExample" ("PrimaryScopeEntityID");

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentExamples"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJUser_UserID."Name" AS "User",
    MJCompany_CompanyID."Name" AS "Company",
    MJConversation_SourceConversationID."Name" AS "SourceConversation",
    MJConversationDetail_SourceConversationDetailID."Message" AS "SourceConversationDetail",
    MJAIAgentRun_SourceAIAgentRunID."RunName" AS "SourceAIAgentRun",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity"
FROM
    __mj."AIAgentExample" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."Company" AS MJCompany_CompanyID
  ON
    "a"."CompanyID" = MJCompany_CompanyID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_SourceConversationID
  ON
    "a"."SourceConversationID" = MJConversation_SourceConversationID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_SourceConversationDetailID
  ON
    "a"."SourceConversationDetailID" = MJConversationDetail_SourceConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_SourceAIAgentRunID
  ON
    "a"."SourceAIAgentRunID" = MJAIAgentRun_SourceAIAgentRunID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "a"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_PrimaryScopeEntityID
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
    AND tc.relname = 'vwAIAgentExamples'
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
    AND tc.relname = 'vwAIAgentExamples'
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
        AND tc.relname = 'vwAIAgentExamples'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentExamples" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentExamples" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentExamples" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentExamples" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentExample"(
    p_id uuid DEFAULT NULL,
    p_agentid uuid DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_exampleinput text DEFAULT NULL,
    p_exampleoutput text DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid uuid DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid uuid DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid uuid DEFAULT NULL,
    p_successscore_clear boolean DEFAULT false,
    p_successscore decimal(5, 2) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector text DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentExamples" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentExample"
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
                "ExpiresAt"
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
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentExamples"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentExample" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentExample" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentExample"(
    p_id uuid,
    p_agentid uuid DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_exampleinput text DEFAULT NULL,
    p_exampleoutput text DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid uuid DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid uuid DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid uuid DEFAULT NULL,
    p_successscore_clear boolean DEFAULT false,
    p_successscore decimal(5, 2) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector text DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentExamples" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentExample"
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
        "ExpiresAt" = CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, "ExpiresAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentExamples"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentExample" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentExample" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentExample table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_example"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_example" ON __mj."AIAgentExample";

CREATE TRIGGER "trg_update_ai_agent_example"
BEFORE UPDATE ON __mj."AIAgentExample"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_example"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentExample"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentExample"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentExample" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentExample" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_agent_id"
    ON __mj."AIAgentNote" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_agent_note_type_id"
    ON __mj."AIAgentNote" ("AgentNoteTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_user_id"
    ON __mj."AIAgentNote" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_conversation_id"
    ON __mj."AIAgentNote" ("SourceConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_conversation_detail_id"
    ON __mj."AIAgentNote" ("SourceConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_source_ai_agent_run_id"
    ON __mj."AIAgentNote" ("SourceAIAgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_company_id"
    ON __mj."AIAgentNote" ("CompanyID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_embedding_model_id"
    ON __mj."AIAgentNote" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_primary_scope_entity_id"
    ON __mj."AIAgentNote" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_note_consolidated_into_note_id"
    ON __mj."AIAgentNote" ("ConsolidatedIntoNoteID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Notes
-- Item: fnAIAgentNoteConsolidatedIntoNoteID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentNote.ConsolidatedIntoNoteID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_note_consolidated_into_note_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ConsolidatedIntoNoteID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentNote"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ConsolidatedIntoNoteID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentNote" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ConsolidatedIntoNoteID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ConsolidatedIntoNoteID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentNotes"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentNoteType_AgentNoteTypeID."Name" AS "AgentNoteType",
    MJUser_UserID."Name" AS "User",
    MJConversation_SourceConversationID."Name" AS "SourceConversation",
    MJConversationDetail_SourceConversationDetailID."Message" AS "SourceConversationDetail",
    MJAIAgentRun_SourceAIAgentRunID."RunName" AS "SourceAIAgentRun",
    MJCompany_CompanyID."Name" AS "Company",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    MJAIAgentNote_ConsolidatedIntoNoteID."Note" AS "ConsolidatedIntoNote",
    root_ConsolidatedIntoNoteID.root_id AS "RootConsolidatedIntoNoteID"
FROM
    __mj."AIAgentNote" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentNoteType" AS MJAIAgentNoteType_AgentNoteTypeID
  ON
    "a"."AgentNoteTypeID" = MJAIAgentNoteType_AgentNoteTypeID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_SourceConversationID
  ON
    "a"."SourceConversationID" = MJConversation_SourceConversationID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_SourceConversationDetailID
  ON
    "a"."SourceConversationDetailID" = MJConversationDetail_SourceConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_SourceAIAgentRunID
  ON
    "a"."SourceAIAgentRunID" = MJAIAgentRun_SourceAIAgentRunID."ID"
LEFT OUTER JOIN
    __mj."Company" AS MJCompany_CompanyID
  ON
    "a"."CompanyID" = MJCompany_CompanyID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "a"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"
LEFT OUTER JOIN
    __mj."AIAgentNote" AS MJAIAgentNote_ConsolidatedIntoNoteID
  ON
    "a"."ConsolidatedIntoNoteID" = MJAIAgentNote_ConsolidatedIntoNoteID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_note_consolidated_into_note_id_get_root_id"(a."ID", a."ConsolidatedIntoNoteID") AS root_id
) AS root_ConsolidatedIntoNoteID ON true
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
    AND tc.relname = 'vwAIAgentNotes'
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
    AND tc.relname = 'vwAIAgentNotes'
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
        AND tc.relname = 'vwAIAgentNotes'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentNotes" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentNote"(
    p_id uuid DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_agentnotetypeid_clear boolean DEFAULT false,
    p_agentnotetypeid uuid DEFAULT NULL,
    p_note_clear boolean DEFAULT false,
    p_note text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid uuid DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid uuid DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid uuid DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector text DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_consolidatedintonoteid_clear boolean DEFAULT false,
    p_consolidatedintonoteid uuid DEFAULT NULL,
    p_consolidationcount integer DEFAULT NULL,
    p_derivedfromnoteids_clear boolean DEFAULT false,
    p_derivedfromnoteids text DEFAULT NULL,
    p_protectiontier text DEFAULT NULL,
    p_importancescore_clear boolean DEFAULT false,
    p_importancescore decimal(5, 2) DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentNotes" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentNote"
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
                "ImportanceScore"
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
                CASE WHEN p_importancescore_clear = true THEN NULL ELSE COALESCE(p_importancescore, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentNotes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentNote" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentNote"(
    p_id uuid,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_agentnotetypeid_clear boolean DEFAULT false,
    p_agentnotetypeid uuid DEFAULT NULL,
    p_note_clear boolean DEFAULT false,
    p_note text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_isautogenerated BOOLEAN DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_sourceconversationid_clear boolean DEFAULT false,
    p_sourceconversationid uuid DEFAULT NULL,
    p_sourceconversationdetailid_clear boolean DEFAULT false,
    p_sourceconversationdetailid uuid DEFAULT NULL,
    p_sourceaiagentrunid_clear boolean DEFAULT false,
    p_sourceaiagentrunid uuid DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector text DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_lastaccessedat_clear boolean DEFAULT false,
    p_lastaccessedat TIMESTAMPTZ DEFAULT NULL,
    p_accesscount integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_consolidatedintonoteid_clear boolean DEFAULT false,
    p_consolidatedintonoteid uuid DEFAULT NULL,
    p_consolidationcount integer DEFAULT NULL,
    p_derivedfromnoteids_clear boolean DEFAULT false,
    p_derivedfromnoteids text DEFAULT NULL,
    p_protectiontier text DEFAULT NULL,
    p_importancescore_clear boolean DEFAULT false,
    p_importancescore decimal(5, 2) DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentNotes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentNote"
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
        "ImportanceScore" = CASE WHEN p_importancescore_clear = true THEN NULL ELSE COALESCE(p_importancescore, "ImportanceScore") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentNotes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentNote" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNote table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_note"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_note" ON __mj."AIAgentNote";

CREATE TRIGGER "trg_update_ai_agent_note"
BEFORE UPDATE ON __mj."AIAgentNote"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_note"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentNote"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentNote"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Requests
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_request_agent_id"
    ON __mj."AIAgentRequest" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_request_request_for_user_id"
    ON __mj."AIAgentRequest" ("RequestForUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_request_response_by_user_id"
    ON __mj."AIAgentRequest" ("ResponseByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_request_request_type_id"
    ON __mj."AIAgentRequest" ("RequestTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_request_originating_agent_run_id"
    ON __mj."AIAgentRequest" ("OriginatingAgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_request_originating_agent_run_step_id"
    ON __mj."AIAgentRequest" ("OriginatingAgentRunStepID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_request_resuming_agent_run_id"
    ON __mj."AIAgentRequest" ("ResumingAgentRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Requests
-- Item: vwAIAgentRequests
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Requests
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRequest
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRequests"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJUser_RequestForUserID."Name" AS "RequestForUser",
    MJUser_ResponseByUserID."Name" AS "ResponseByUser",
    MJAIAgentRequestType_RequestTypeID."Name" AS "RequestType",
    MJAIAgentRun_OriginatingAgentRunID."RunName" AS "OriginatingAgentRun",
    MJAIAgentRunStep_OriginatingAgentRunStepID."StepName" AS "OriginatingAgentRunStep",
    MJAIAgentRun_ResumingAgentRunID."RunName" AS "ResumingAgentRun"
FROM
    __mj."AIAgentRequest" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_RequestForUserID
  ON
    "a"."RequestForUserID" = MJUser_RequestForUserID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_ResponseByUserID
  ON
    "a"."ResponseByUserID" = MJUser_ResponseByUserID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRequestType" AS MJAIAgentRequestType_RequestTypeID
  ON
    "a"."RequestTypeID" = MJAIAgentRequestType_RequestTypeID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_OriginatingAgentRunID
  ON
    "a"."OriginatingAgentRunID" = MJAIAgentRun_OriginatingAgentRunID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRunStep" AS MJAIAgentRunStep_OriginatingAgentRunStepID
  ON
    "a"."OriginatingAgentRunStepID" = MJAIAgentRunStep_OriginatingAgentRunStepID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_ResumingAgentRunID
  ON
    "a"."ResumingAgentRunID" = MJAIAgentRun_ResumingAgentRunID."ID"
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
    AND tc.relname = 'vwAIAgentRequests'
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
    AND tc.relname = 'vwAIAgentRequests'
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
        AND tc.relname = 'vwAIAgentRequests'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentRequests" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentRequests" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentRequests" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentRequests" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Requests
-- Item: spCreateAIAgentRequest
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRequest
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRequest'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRequest"(
    p_id uuid DEFAULT NULL,
    p_agentid uuid DEFAULT NULL,
    p_requestedat TIMESTAMPTZ DEFAULT NULL,
    p_requestforuserid_clear boolean DEFAULT false,
    p_requestforuserid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_request text DEFAULT NULL,
    p_response_clear boolean DEFAULT false,
    p_response text DEFAULT NULL,
    p_responsebyuserid_clear boolean DEFAULT false,
    p_responsebyuserid uuid DEFAULT NULL,
    p_respondedat_clear boolean DEFAULT false,
    p_respondedat TIMESTAMPTZ DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_requesttypeid_clear boolean DEFAULT false,
    p_requesttypeid uuid DEFAULT NULL,
    p_responseschema_clear boolean DEFAULT false,
    p_responseschema text DEFAULT NULL,
    p_responsedata_clear boolean DEFAULT false,
    p_responsedata text DEFAULT NULL,
    p_priority integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_originatingagentrunid_clear boolean DEFAULT false,
    p_originatingagentrunid uuid DEFAULT NULL,
    p_originatingagentrunstepid_clear boolean DEFAULT false,
    p_originatingagentrunstepid uuid DEFAULT NULL,
    p_resumingagentrunid_clear boolean DEFAULT false,
    p_resumingagentrunid uuid DEFAULT NULL,
    p_responsesource_clear boolean DEFAULT false,
    p_responsesource text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRequests" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentRequest"
        (
            "ID",
            "AgentID",
                "RequestedAt",
                "RequestForUserID",
                "Status",
                "Request",
                "Response",
                "ResponseByUserID",
                "RespondedAt",
                "Comments",
                "RequestTypeID",
                "ResponseSchema",
                "ResponseData",
                "Priority",
                "ExpiresAt",
                "OriginatingAgentRunID",
                "OriginatingAgentRunStepID",
                "ResumingAgentRunID",
                "ResponseSource"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_requestedat,
                CASE WHEN p_requestforuserid_clear = true THEN NULL ELSE COALESCE(p_requestforuserid, NULL) END,
                p_status,
                p_request,
                CASE WHEN p_response_clear = true THEN NULL ELSE COALESCE(p_response, NULL) END,
                CASE WHEN p_responsebyuserid_clear = true THEN NULL ELSE COALESCE(p_responsebyuserid, NULL) END,
                CASE WHEN p_respondedat_clear = true THEN NULL ELSE COALESCE(p_respondedat, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_requesttypeid_clear = true THEN NULL ELSE COALESCE(p_requesttypeid, NULL) END,
                CASE WHEN p_responseschema_clear = true THEN NULL ELSE COALESCE(p_responseschema, NULL) END,
                CASE WHEN p_responsedata_clear = true THEN NULL ELSE COALESCE(p_responsedata, NULL) END,
                COALESCE(p_priority, 50),
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END,
                CASE WHEN p_originatingagentrunid_clear = true THEN NULL ELSE COALESCE(p_originatingagentrunid, NULL) END,
                CASE WHEN p_originatingagentrunstepid_clear = true THEN NULL ELSE COALESCE(p_originatingagentrunstepid, NULL) END,
                CASE WHEN p_resumingagentrunid_clear = true THEN NULL ELSE COALESCE(p_resumingagentrunid, NULL) END,
                CASE WHEN p_responsesource_clear = true THEN NULL ELSE COALESCE(p_responsesource, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRequests"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRequest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRequest" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Requests
-- Item: spUpdateAIAgentRequest
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRequest
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRequest'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRequest"(
    p_id uuid,
    p_agentid uuid DEFAULT NULL,
    p_requestedat TIMESTAMPTZ DEFAULT NULL,
    p_requestforuserid_clear boolean DEFAULT false,
    p_requestforuserid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_request text DEFAULT NULL,
    p_response_clear boolean DEFAULT false,
    p_response text DEFAULT NULL,
    p_responsebyuserid_clear boolean DEFAULT false,
    p_responsebyuserid uuid DEFAULT NULL,
    p_respondedat_clear boolean DEFAULT false,
    p_respondedat TIMESTAMPTZ DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_requesttypeid_clear boolean DEFAULT false,
    p_requesttypeid uuid DEFAULT NULL,
    p_responseschema_clear boolean DEFAULT false,
    p_responseschema text DEFAULT NULL,
    p_responsedata_clear boolean DEFAULT false,
    p_responsedata text DEFAULT NULL,
    p_priority integer DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_originatingagentrunid_clear boolean DEFAULT false,
    p_originatingagentrunid uuid DEFAULT NULL,
    p_originatingagentrunstepid_clear boolean DEFAULT false,
    p_originatingagentrunstepid uuid DEFAULT NULL,
    p_resumingagentrunid_clear boolean DEFAULT false,
    p_resumingagentrunid uuid DEFAULT NULL,
    p_responsesource_clear boolean DEFAULT false,
    p_responsesource text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRequests" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentRequest"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "RequestedAt" = COALESCE(p_requestedat, "RequestedAt"),
        "RequestForUserID" = CASE WHEN p_requestforuserid_clear = true THEN NULL ELSE COALESCE(p_requestforuserid, "RequestForUserID") END,
        "Status" = COALESCE(p_status, "Status"),
        "Request" = COALESCE(p_request, "Request"),
        "Response" = CASE WHEN p_response_clear = true THEN NULL ELSE COALESCE(p_response, "Response") END,
        "ResponseByUserID" = CASE WHEN p_responsebyuserid_clear = true THEN NULL ELSE COALESCE(p_responsebyuserid, "ResponseByUserID") END,
        "RespondedAt" = CASE WHEN p_respondedat_clear = true THEN NULL ELSE COALESCE(p_respondedat, "RespondedAt") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "RequestTypeID" = CASE WHEN p_requesttypeid_clear = true THEN NULL ELSE COALESCE(p_requesttypeid, "RequestTypeID") END,
        "ResponseSchema" = CASE WHEN p_responseschema_clear = true THEN NULL ELSE COALESCE(p_responseschema, "ResponseSchema") END,
        "ResponseData" = CASE WHEN p_responsedata_clear = true THEN NULL ELSE COALESCE(p_responsedata, "ResponseData") END,
        "Priority" = COALESCE(p_priority, "Priority"),
        "ExpiresAt" = CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, "ExpiresAt") END,
        "OriginatingAgentRunID" = CASE WHEN p_originatingagentrunid_clear = true THEN NULL ELSE COALESCE(p_originatingagentrunid, "OriginatingAgentRunID") END,
        "OriginatingAgentRunStepID" = CASE WHEN p_originatingagentrunstepid_clear = true THEN NULL ELSE COALESCE(p_originatingagentrunstepid, "OriginatingAgentRunStepID") END,
        "ResumingAgentRunID" = CASE WHEN p_resumingagentrunid_clear = true THEN NULL ELSE COALESCE(p_resumingagentrunid, "ResumingAgentRunID") END,
        "ResponseSource" = CASE WHEN p_responsesource_clear = true THEN NULL ELSE COALESCE(p_responsesource, "ResponseSource") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRequests"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRequest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRequest" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRequest table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_request"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_request" ON __mj."AIAgentRequest";

CREATE TRIGGER "trg_update_ai_agent_request"
BEFORE UPDATE ON __mj."AIAgentRequest"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_request"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Requests
-- Item: spDeleteAIAgentRequest
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRequest
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRequest'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRequest"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentRequest"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRequest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRequest" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Medias
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_media_agent_run_id"
    ON __mj."AIAgentRunMedia" ("AgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_media_source_prompt_run_media_id"
    ON __mj."AIAgentRunMedia" ("SourcePromptRunMediaID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_media_modality_id"
    ON __mj."AIAgentRunMedia" ("ModalityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_media_file_id"
    ON __mj."AIAgentRunMedia" ("FileID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Medias
-- Item: vwAIAgentRunMedias
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Run Medias
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRunMedia
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRunMedias"
AS
SELECT
    a.*,
    MJAIAgentRun_AgentRunID."RunName" AS "AgentRun",
    MJAIPromptRunMedia_SourcePromptRunMediaID."FileName" AS "SourcePromptRunMedia",
    MJAIModality_ModalityID."Name" AS "Modality",
    MJFile_FileID."Name" AS "File"
FROM
    __mj."AIAgentRunMedia" AS a
INNER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_AgentRunID
  ON
    "a"."AgentRunID" = MJAIAgentRun_AgentRunID."ID"
LEFT OUTER JOIN
    __mj."AIPromptRunMedia" AS MJAIPromptRunMedia_SourcePromptRunMediaID
  ON
    "a"."SourcePromptRunMediaID" = MJAIPromptRunMedia_SourcePromptRunMediaID."ID"
INNER JOIN
    __mj."AIModality" AS MJAIModality_ModalityID
  ON
    "a"."ModalityID" = MJAIModality_ModalityID."ID"
LEFT OUTER JOIN
    __mj."File" AS MJFile_FileID
  ON
    "a"."FileID" = MJFile_FileID."ID"
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
    AND tc.relname = 'vwAIAgentRunMedias'
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
    AND tc.relname = 'vwAIAgentRunMedias'
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
        AND tc.relname = 'vwAIAgentRunMedias'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentRunMedias" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentRunMedias" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentRunMedias" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentRunMedias" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Medias
-- Item: spCreateAIAgentRunMedia
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRunMedia
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRunMedia'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRunMedia"(
    p_id uuid DEFAULT NULL,
    p_agentrunid uuid DEFAULT NULL,
    p_sourcepromptrunmediaid_clear boolean DEFAULT false,
    p_sourcepromptrunmediaid uuid DEFAULT NULL,
    p_modalityid uuid DEFAULT NULL,
    p_mimetype text DEFAULT NULL,
    p_filename_clear boolean DEFAULT false,
    p_filename text DEFAULT NULL,
    p_filesizebytes_clear boolean DEFAULT false,
    p_filesizebytes integer DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width integer DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height integer DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds decimal(10, 2) DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata text DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid uuid DEFAULT NULL,
    p_thumbnailbase64_clear boolean DEFAULT false,
    p_thumbnailbase64 text DEFAULT NULL,
    p_label_clear boolean DEFAULT false,
    p_label text DEFAULT NULL,
    p_metadata_clear boolean DEFAULT false,
    p_metadata text DEFAULT NULL,
    p_displayorder integer DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRunMedias" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentRunMedia"
        (
            "ID",
            "AgentRunID",
                "SourcePromptRunMediaID",
                "ModalityID",
                "MimeType",
                "FileName",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "InlineData",
                "FileID",
                "ThumbnailBase64",
                "Label",
                "Metadata",
                "DisplayOrder",
                "Description"
        )
    VALUES
        (
            v_new_id,
            p_agentrunid,
                CASE WHEN p_sourcepromptrunmediaid_clear = true THEN NULL ELSE COALESCE(p_sourcepromptrunmediaid, NULL) END,
                p_modalityid,
                p_mimetype,
                CASE WHEN p_filename_clear = true THEN NULL ELSE COALESCE(p_filename, NULL) END,
                CASE WHEN p_filesizebytes_clear = true THEN NULL ELSE COALESCE(p_filesizebytes, NULL) END,
                CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, NULL) END,
                CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, NULL) END,
                CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, NULL) END,
                CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, NULL) END,
                CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, NULL) END,
                CASE WHEN p_thumbnailbase64_clear = true THEN NULL ELSE COALESCE(p_thumbnailbase64, NULL) END,
                CASE WHEN p_label_clear = true THEN NULL ELSE COALESCE(p_label, NULL) END,
                CASE WHEN p_metadata_clear = true THEN NULL ELSE COALESCE(p_metadata, NULL) END,
                COALESCE(p_displayorder, 0),
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRunMedias"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRunMedia" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRunMedia" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRunMedia" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Medias
-- Item: spUpdateAIAgentRunMedia
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRunMedia
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRunMedia'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRunMedia"(
    p_id uuid,
    p_agentrunid uuid DEFAULT NULL,
    p_sourcepromptrunmediaid_clear boolean DEFAULT false,
    p_sourcepromptrunmediaid uuid DEFAULT NULL,
    p_modalityid uuid DEFAULT NULL,
    p_mimetype text DEFAULT NULL,
    p_filename_clear boolean DEFAULT false,
    p_filename text DEFAULT NULL,
    p_filesizebytes_clear boolean DEFAULT false,
    p_filesizebytes integer DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width integer DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height integer DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds decimal(10, 2) DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata text DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid uuid DEFAULT NULL,
    p_thumbnailbase64_clear boolean DEFAULT false,
    p_thumbnailbase64 text DEFAULT NULL,
    p_label_clear boolean DEFAULT false,
    p_label text DEFAULT NULL,
    p_metadata_clear boolean DEFAULT false,
    p_metadata text DEFAULT NULL,
    p_displayorder integer DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRunMedias" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentRunMedia"
    SET
        "AgentRunID" = COALESCE(p_agentrunid, "AgentRunID"),
        "SourcePromptRunMediaID" = CASE WHEN p_sourcepromptrunmediaid_clear = true THEN NULL ELSE COALESCE(p_sourcepromptrunmediaid, "SourcePromptRunMediaID") END,
        "ModalityID" = COALESCE(p_modalityid, "ModalityID"),
        "MimeType" = COALESCE(p_mimetype, "MimeType"),
        "FileName" = CASE WHEN p_filename_clear = true THEN NULL ELSE COALESCE(p_filename, "FileName") END,
        "FileSizeBytes" = CASE WHEN p_filesizebytes_clear = true THEN NULL ELSE COALESCE(p_filesizebytes, "FileSizeBytes") END,
        "Width" = CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, "Width") END,
        "Height" = CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, "Height") END,
        "DurationSeconds" = CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, "DurationSeconds") END,
        "InlineData" = CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, "InlineData") END,
        "FileID" = CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, "FileID") END,
        "ThumbnailBase64" = CASE WHEN p_thumbnailbase64_clear = true THEN NULL ELSE COALESCE(p_thumbnailbase64, "ThumbnailBase64") END,
        "Label" = CASE WHEN p_label_clear = true THEN NULL ELSE COALESCE(p_label, "Label") END,
        "Metadata" = CASE WHEN p_metadata_clear = true THEN NULL ELSE COALESCE(p_metadata, "Metadata") END,
        "DisplayOrder" = COALESCE(p_displayorder, "DisplayOrder"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRunMedias"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRunMedia" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRunMedia" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRunMedia" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunMedia table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_run_media"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run_media" ON __mj."AIAgentRunMedia";

CREATE TRIGGER "trg_update_ai_agent_run_media"
BEFORE UPDATE ON __mj."AIAgentRunMedia"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_run_media"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Medias
-- Item: spDeleteAIAgentRunMedia
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRunMedia
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRunMedia'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRunMedia"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentRunMedia"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunMedia" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunMedia" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_agent_run_id"
    ON __mj."AIAgentRunStep" ("AgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_parent_id"
    ON __mj."AIAgentRunStep" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fnAIAgentRunStepParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_step_parent_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRunStep"
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
            __mj."AIAgentRunStep" c
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRunSteps"
AS
SELECT
    a.*,
    MJAIAgentRun_AgentRunID."RunName" AS "AgentRun",
    MJAIAgentRunStep_ParentID."StepName" AS "Parent",
    root_ParentID.root_id AS "RootParentID"
FROM
    __mj."AIAgentRunStep" AS a
INNER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_AgentRunID
  ON
    "a"."AgentRunID" = MJAIAgentRun_AgentRunID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRunStep" AS MJAIAgentRunStep_ParentID
  ON
    "a"."ParentID" = MJAIAgentRunStep_ParentID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_step_parent_id_get_root_id"(a."ID", a."ParentID") AS root_id
) AS root_ParentID ON true
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
    AND tc.relname = 'vwAIAgentRunSteps'
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
    AND tc.relname = 'vwAIAgentRunSteps'
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
        AND tc.relname = 'vwAIAgentRunSteps'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentRunSteps" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentRunSteps" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentRunSteps" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentRunSteps" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRunStep"(
    p_id uuid DEFAULT NULL,
    p_agentrunid uuid DEFAULT NULL,
    p_stepnumber integer DEFAULT NULL,
    p_steptype text DEFAULT NULL,
    p_stepname text DEFAULT NULL,
    p_targetid_clear boolean DEFAULT false,
    p_targetid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage text DEFAULT NULL,
    p_inputdata_clear boolean DEFAULT false,
    p_inputdata text DEFAULT NULL,
    p_outputdata_clear boolean DEFAULT false,
    p_outputdata text DEFAULT NULL,
    p_targetlogid_clear boolean DEFAULT false,
    p_targetlogid uuid DEFAULT NULL,
    p_payloadatstart_clear boolean DEFAULT false,
    p_payloadatstart text DEFAULT NULL,
    p_payloadatend_clear boolean DEFAULT false,
    p_payloadatend text DEFAULT NULL,
    p_finalpayloadvalidationresult_clear boolean DEFAULT false,
    p_finalpayloadvalidationresult text DEFAULT NULL,
    p_finalpayloadvalidationmessages_clear boolean DEFAULT false,
    p_finalpayloadvalidationmessages text DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRunSteps" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentRunStep"
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
                "Comments"
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
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRunSteps"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRunStep" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRunStep" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRunStep"(
    p_id uuid,
    p_agentrunid uuid DEFAULT NULL,
    p_stepnumber integer DEFAULT NULL,
    p_steptype text DEFAULT NULL,
    p_stepname text DEFAULT NULL,
    p_targetid_clear boolean DEFAULT false,
    p_targetid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage text DEFAULT NULL,
    p_inputdata_clear boolean DEFAULT false,
    p_inputdata text DEFAULT NULL,
    p_outputdata_clear boolean DEFAULT false,
    p_outputdata text DEFAULT NULL,
    p_targetlogid_clear boolean DEFAULT false,
    p_targetlogid uuid DEFAULT NULL,
    p_payloadatstart_clear boolean DEFAULT false,
    p_payloadatstart text DEFAULT NULL,
    p_payloadatend_clear boolean DEFAULT false,
    p_payloadatend text DEFAULT NULL,
    p_finalpayloadvalidationresult_clear boolean DEFAULT false,
    p_finalpayloadvalidationresult text DEFAULT NULL,
    p_finalpayloadvalidationmessages_clear boolean DEFAULT false,
    p_finalpayloadvalidationmessages text DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRunSteps" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentRunStep"
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
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRunSteps"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRunStep" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRunStep" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunStep table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_run_step"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run_step" ON __mj."AIAgentRunStep";

CREATE TRIGGER "trg_update_ai_agent_run_step"
BEFORE UPDATE ON __mj."AIAgentRunStep"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_run_step"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRunStep"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunStepID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "OriginatingAgentRunStepID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "OriginatingAgentRunStepID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Run Steps.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunStep"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRunStep"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgentRunStep"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunStep" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_id"
    ON __mj."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_parent_run_id"
    ON __mj."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_id"
    ON __mj."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_user_id"
    ON __mj."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_detail_id"
    ON __mj."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_last_run_id"
    ON __mj."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_configuration_id"
    ON __mj."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_model_id"
    ON __mj."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_vendor_id"
    ON __mj."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_scheduled_job_run_id"
    ON __mj."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_test_run_id"
    ON __mj."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_primary_scope_entity_id"
    ON __mj."AIAgentRun" ("PrimaryScopeEntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunParentRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_parent_run_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunLastRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.LastRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_last_run_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "LastRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."LastRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."LastRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "LastRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRuns"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentRun_ParentRunID."RunName" AS "ParentRun",
    MJConversation_ConversationID."Name" AS "Conversation",
    MJUser_UserID."Name" AS "User",
    MJConversationDetail_ConversationDetailID."Message" AS "ConversationDetail",
    MJAIAgentRun_LastRunID."RunName" AS "LastRun",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIModel_OverrideModelID."Name" AS "OverrideModel",
    MJAIVendor_OverrideVendorID."Name" AS "OverrideVendor",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    root_ParentRunID.root_id AS "RootParentRunID",
    root_LastRunID.root_id AS "RootLastRunID"
FROM
    __mj."AIAgentRun" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_ParentRunID
  ON
    "a"."ParentRunID" = MJAIAgentRun_ParentRunID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "a"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_LastRunID
  ON
    "a"."LastRunID" = MJAIAgentRun_LastRunID."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_OverrideModelID
  ON
    "a"."OverrideModelID" = MJAIModel_OverrideModelID."ID"
LEFT OUTER JOIN
    __mj."AIVendor" AS MJAIVendor_OverrideVendorID
  ON
    "a"."OverrideVendorID" = MJAIVendor_OverrideVendorID."ID"
LEFT OUTER JOIN
    __mj."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "a"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_parent_run_id_get_root_id"(a."ID", a."ParentRunID") AS root_id
) AS root_ParentRunID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_last_run_id_get_root_id"(a."ID", a."LastRunID") AS root_id
) AS root_LastRunID ON true
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
    AND tc.relname = 'vwAIAgentRuns'
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
    AND tc.relname = 'vwAIAgentRuns'
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
        AND tc.relname = 'vwAIAgentRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentRuns" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRun"(
    p_id uuid DEFAULT NULL,
    p_agentid uuid DEFAULT NULL,
    p_parentrunid_clear boolean DEFAULT false,
    p_parentrunid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage text DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid uuid DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_result_clear boolean DEFAULT false,
    p_result text DEFAULT NULL,
    p_agentstate_clear boolean DEFAULT false,
    p_agentstate text DEFAULT NULL,
    p_totaltokensused_clear boolean DEFAULT false,
    p_totaltokensused integer DEFAULT NULL,
    p_totalcost_clear boolean DEFAULT false,
    p_totalcost decimal(18, 6) DEFAULT NULL,
    p_totalprompttokensused_clear boolean DEFAULT false,
    p_totalprompttokensused integer DEFAULT NULL,
    p_totalcompletiontokensused_clear boolean DEFAULT false,
    p_totalcompletiontokensused integer DEFAULT NULL,
    p_totaltokensusedrollup_clear boolean DEFAULT false,
    p_totaltokensusedrollup integer DEFAULT NULL,
    p_totalprompttokensusedrollup_clear boolean DEFAULT false,
    p_totalprompttokensusedrollup integer DEFAULT NULL,
    p_totalcompletiontokensusedrollup_clear boolean DEFAULT false,
    p_totalcompletiontokensusedrollup integer DEFAULT NULL,
    p_totalcostrollup_clear boolean DEFAULT false,
    p_totalcostrollup decimal(19, 8) DEFAULT NULL,
    p_conversationdetailid_clear boolean DEFAULT false,
    p_conversationdetailid uuid DEFAULT NULL,
    p_conversationdetailsequence_clear boolean DEFAULT false,
    p_conversationdetailsequence integer DEFAULT NULL,
    p_cancellationreason_clear boolean DEFAULT false,
    p_cancellationreason text DEFAULT NULL,
    p_finalstep_clear boolean DEFAULT false,
    p_finalstep text DEFAULT NULL,
    p_finalpayload_clear boolean DEFAULT false,
    p_finalpayload text DEFAULT NULL,
    p_message_clear boolean DEFAULT false,
    p_message text DEFAULT NULL,
    p_lastrunid_clear boolean DEFAULT false,
    p_lastrunid uuid DEFAULT NULL,
    p_startingpayload_clear boolean DEFAULT false,
    p_startingpayload text DEFAULT NULL,
    p_totalpromptiterations integer DEFAULT NULL,
    p_configurationid_clear boolean DEFAULT false,
    p_configurationid uuid DEFAULT NULL,
    p_overridemodelid_clear boolean DEFAULT false,
    p_overridemodelid uuid DEFAULT NULL,
    p_overridevendorid_clear boolean DEFAULT false,
    p_overridevendorid uuid DEFAULT NULL,
    p_data_clear boolean DEFAULT false,
    p_data text DEFAULT NULL,
    p_verbose_clear boolean DEFAULT false,
    p_verbose BOOLEAN DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel integer DEFAULT NULL,
    p_runname_clear boolean DEFAULT false,
    p_runname text DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid uuid DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_externalreferenceid_clear boolean DEFAULT false,
    p_externalreferenceid text DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_lastheartbeatat_clear boolean DEFAULT false,
    p_lastheartbeatat timestamptz DEFAULT NULL,
    p_totalcachereadtokensused_clear boolean DEFAULT false,
    p_totalcachereadtokensused integer DEFAULT NULL,
    p_totalcachewritetokensused_clear boolean DEFAULT false,
    p_totalcachewritetokensused integer DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRuns" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentRun"
        (
            "ID",
            "AgentID",
                "ParentRunID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "Success",
                "ErrorMessage",
                "ConversationID",
                "UserID",
                "Result",
                "AgentState",
                "TotalTokensUsed",
                "TotalCost",
                "TotalPromptTokensUsed",
                "TotalCompletionTokensUsed",
                "TotalTokensUsedRollup",
                "TotalPromptTokensUsedRollup",
                "TotalCompletionTokensUsedRollup",
                "TotalCostRollup",
                "ConversationDetailID",
                "ConversationDetailSequence",
                "CancellationReason",
                "FinalStep",
                "FinalPayload",
                "Message",
                "LastRunID",
                "StartingPayload",
                "TotalPromptIterations",
                "ConfigurationID",
                "OverrideModelID",
                "OverrideVendorID",
                "Data",
                "Verbose",
                "EffortLevel",
                "RunName",
                "Comments",
                "ScheduledJobRunID",
                "TestRunID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "ExternalReferenceID",
                "CompanyID",
                "LastHeartbeatAt",
                "TotalCacheReadTokensUsed",
                "TotalCacheWriteTokensUsed"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                CASE WHEN p_parentrunid_clear = true THEN NULL ELSE COALESCE(p_parentrunid, NULL) END,
                COALESCE(p_status, 'Running'),
                COALESCE(p_startedat, NOW()),
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_result_clear = true THEN NULL ELSE COALESCE(p_result, NULL) END,
                CASE WHEN p_agentstate_clear = true THEN NULL ELSE COALESCE(p_agentstate, NULL) END,
                CASE WHEN p_totaltokensused_clear = true THEN NULL ELSE COALESCE(p_totaltokensused, 0) END,
                CASE WHEN p_totalcost_clear = true THEN NULL ELSE COALESCE(p_totalcost, 0.000000) END,
                CASE WHEN p_totalprompttokensused_clear = true THEN NULL ELSE COALESCE(p_totalprompttokensused, NULL) END,
                CASE WHEN p_totalcompletiontokensused_clear = true THEN NULL ELSE COALESCE(p_totalcompletiontokensused, NULL) END,
                CASE WHEN p_totaltokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totaltokensusedrollup, NULL) END,
                CASE WHEN p_totalprompttokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totalprompttokensusedrollup, NULL) END,
                CASE WHEN p_totalcompletiontokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totalcompletiontokensusedrollup, NULL) END,
                CASE WHEN p_totalcostrollup_clear = true THEN NULL ELSE COALESCE(p_totalcostrollup, NULL) END,
                CASE WHEN p_conversationdetailid_clear = true THEN NULL ELSE COALESCE(p_conversationdetailid, NULL) END,
                CASE WHEN p_conversationdetailsequence_clear = true THEN NULL ELSE COALESCE(p_conversationdetailsequence, NULL) END,
                CASE WHEN p_cancellationreason_clear = true THEN NULL ELSE COALESCE(p_cancellationreason, NULL) END,
                CASE WHEN p_finalstep_clear = true THEN NULL ELSE COALESCE(p_finalstep, NULL) END,
                CASE WHEN p_finalpayload_clear = true THEN NULL ELSE COALESCE(p_finalpayload, NULL) END,
                CASE WHEN p_message_clear = true THEN NULL ELSE COALESCE(p_message, NULL) END,
                CASE WHEN p_lastrunid_clear = true THEN NULL ELSE COALESCE(p_lastrunid, NULL) END,
                CASE WHEN p_startingpayload_clear = true THEN NULL ELSE COALESCE(p_startingpayload, NULL) END,
                COALESCE(p_totalpromptiterations, 0),
                CASE WHEN p_configurationid_clear = true THEN NULL ELSE COALESCE(p_configurationid, NULL) END,
                CASE WHEN p_overridemodelid_clear = true THEN NULL ELSE COALESCE(p_overridemodelid, NULL) END,
                CASE WHEN p_overridevendorid_clear = true THEN NULL ELSE COALESCE(p_overridevendorid, NULL) END,
                CASE WHEN p_data_clear = true THEN NULL ELSE COALESCE(p_data, NULL) END,
                CASE WHEN p_verbose_clear = true THEN NULL ELSE COALESCE(p_verbose, FALSE) END,
                CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, NULL) END,
                CASE WHEN p_runname_clear = true THEN NULL ELSE COALESCE(p_runname, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, NULL) END,
                CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, NULL) END,
                CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, NULL) END,
                CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, NULL) END,
                CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, NULL) END,
                CASE WHEN p_externalreferenceid_clear = true THEN NULL ELSE COALESCE(p_externalreferenceid, NULL) END,
                CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, NULL) END,
                CASE WHEN p_lastheartbeatat_clear = true THEN NULL ELSE COALESCE(p_lastheartbeatat, NULL) END,
                CASE WHEN p_totalcachereadtokensused_clear = true THEN NULL ELSE COALESCE(p_totalcachereadtokensused, NULL) END,
                CASE WHEN p_totalcachewritetokensused_clear = true THEN NULL ELSE COALESCE(p_totalcachewritetokensused, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRun"(
    p_id uuid,
    p_agentid uuid DEFAULT NULL,
    p_parentrunid_clear boolean DEFAULT false,
    p_parentrunid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage text DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid uuid DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_result_clear boolean DEFAULT false,
    p_result text DEFAULT NULL,
    p_agentstate_clear boolean DEFAULT false,
    p_agentstate text DEFAULT NULL,
    p_totaltokensused_clear boolean DEFAULT false,
    p_totaltokensused integer DEFAULT NULL,
    p_totalcost_clear boolean DEFAULT false,
    p_totalcost decimal(18, 6) DEFAULT NULL,
    p_totalprompttokensused_clear boolean DEFAULT false,
    p_totalprompttokensused integer DEFAULT NULL,
    p_totalcompletiontokensused_clear boolean DEFAULT false,
    p_totalcompletiontokensused integer DEFAULT NULL,
    p_totaltokensusedrollup_clear boolean DEFAULT false,
    p_totaltokensusedrollup integer DEFAULT NULL,
    p_totalprompttokensusedrollup_clear boolean DEFAULT false,
    p_totalprompttokensusedrollup integer DEFAULT NULL,
    p_totalcompletiontokensusedrollup_clear boolean DEFAULT false,
    p_totalcompletiontokensusedrollup integer DEFAULT NULL,
    p_totalcostrollup_clear boolean DEFAULT false,
    p_totalcostrollup decimal(19, 8) DEFAULT NULL,
    p_conversationdetailid_clear boolean DEFAULT false,
    p_conversationdetailid uuid DEFAULT NULL,
    p_conversationdetailsequence_clear boolean DEFAULT false,
    p_conversationdetailsequence integer DEFAULT NULL,
    p_cancellationreason_clear boolean DEFAULT false,
    p_cancellationreason text DEFAULT NULL,
    p_finalstep_clear boolean DEFAULT false,
    p_finalstep text DEFAULT NULL,
    p_finalpayload_clear boolean DEFAULT false,
    p_finalpayload text DEFAULT NULL,
    p_message_clear boolean DEFAULT false,
    p_message text DEFAULT NULL,
    p_lastrunid_clear boolean DEFAULT false,
    p_lastrunid uuid DEFAULT NULL,
    p_startingpayload_clear boolean DEFAULT false,
    p_startingpayload text DEFAULT NULL,
    p_totalpromptiterations integer DEFAULT NULL,
    p_configurationid_clear boolean DEFAULT false,
    p_configurationid uuid DEFAULT NULL,
    p_overridemodelid_clear boolean DEFAULT false,
    p_overridemodelid uuid DEFAULT NULL,
    p_overridevendorid_clear boolean DEFAULT false,
    p_overridevendorid uuid DEFAULT NULL,
    p_data_clear boolean DEFAULT false,
    p_data text DEFAULT NULL,
    p_verbose_clear boolean DEFAULT false,
    p_verbose BOOLEAN DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel integer DEFAULT NULL,
    p_runname_clear boolean DEFAULT false,
    p_runname text DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid uuid DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_externalreferenceid_clear boolean DEFAULT false,
    p_externalreferenceid text DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_lastheartbeatat_clear boolean DEFAULT false,
    p_lastheartbeatat timestamptz DEFAULT NULL,
    p_totalcachereadtokensused_clear boolean DEFAULT false,
    p_totalcachereadtokensused integer DEFAULT NULL,
    p_totalcachewritetokensused_clear boolean DEFAULT false,
    p_totalcachewritetokensused integer DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentRun"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "ParentRunID" = CASE WHEN p_parentrunid_clear = true THEN NULL ELSE COALESCE(p_parentrunid, "ParentRunID") END,
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "Success" = CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, "Success") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "ConversationID" = CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, "ConversationID") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "Result" = CASE WHEN p_result_clear = true THEN NULL ELSE COALESCE(p_result, "Result") END,
        "AgentState" = CASE WHEN p_agentstate_clear = true THEN NULL ELSE COALESCE(p_agentstate, "AgentState") END,
        "TotalTokensUsed" = CASE WHEN p_totaltokensused_clear = true THEN NULL ELSE COALESCE(p_totaltokensused, "TotalTokensUsed") END,
        "TotalCost" = CASE WHEN p_totalcost_clear = true THEN NULL ELSE COALESCE(p_totalcost, "TotalCost") END,
        "TotalPromptTokensUsed" = CASE WHEN p_totalprompttokensused_clear = true THEN NULL ELSE COALESCE(p_totalprompttokensused, "TotalPromptTokensUsed") END,
        "TotalCompletionTokensUsed" = CASE WHEN p_totalcompletiontokensused_clear = true THEN NULL ELSE COALESCE(p_totalcompletiontokensused, "TotalCompletionTokensUsed") END,
        "TotalTokensUsedRollup" = CASE WHEN p_totaltokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totaltokensusedrollup, "TotalTokensUsedRollup") END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_totalprompttokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totalprompttokensusedrollup, "TotalPromptTokensUsedRollup") END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_totalcompletiontokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totalcompletiontokensusedrollup, "TotalCompletionTokensUsedRollup") END,
        "TotalCostRollup" = CASE WHEN p_totalcostrollup_clear = true THEN NULL ELSE COALESCE(p_totalcostrollup, "TotalCostRollup") END,
        "ConversationDetailID" = CASE WHEN p_conversationdetailid_clear = true THEN NULL ELSE COALESCE(p_conversationdetailid, "ConversationDetailID") END,
        "ConversationDetailSequence" = CASE WHEN p_conversationdetailsequence_clear = true THEN NULL ELSE COALESCE(p_conversationdetailsequence, "ConversationDetailSequence") END,
        "CancellationReason" = CASE WHEN p_cancellationreason_clear = true THEN NULL ELSE COALESCE(p_cancellationreason, "CancellationReason") END,
        "FinalStep" = CASE WHEN p_finalstep_clear = true THEN NULL ELSE COALESCE(p_finalstep, "FinalStep") END,
        "FinalPayload" = CASE WHEN p_finalpayload_clear = true THEN NULL ELSE COALESCE(p_finalpayload, "FinalPayload") END,
        "Message" = CASE WHEN p_message_clear = true THEN NULL ELSE COALESCE(p_message, "Message") END,
        "LastRunID" = CASE WHEN p_lastrunid_clear = true THEN NULL ELSE COALESCE(p_lastrunid, "LastRunID") END,
        "StartingPayload" = CASE WHEN p_startingpayload_clear = true THEN NULL ELSE COALESCE(p_startingpayload, "StartingPayload") END,
        "TotalPromptIterations" = COALESCE(p_totalpromptiterations, "TotalPromptIterations"),
        "ConfigurationID" = CASE WHEN p_configurationid_clear = true THEN NULL ELSE COALESCE(p_configurationid, "ConfigurationID") END,
        "OverrideModelID" = CASE WHEN p_overridemodelid_clear = true THEN NULL ELSE COALESCE(p_overridemodelid, "OverrideModelID") END,
        "OverrideVendorID" = CASE WHEN p_overridevendorid_clear = true THEN NULL ELSE COALESCE(p_overridevendorid, "OverrideVendorID") END,
        "Data" = CASE WHEN p_data_clear = true THEN NULL ELSE COALESCE(p_data, "Data") END,
        "Verbose" = CASE WHEN p_verbose_clear = true THEN NULL ELSE COALESCE(p_verbose, "Verbose") END,
        "EffortLevel" = CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, "EffortLevel") END,
        "RunName" = CASE WHEN p_runname_clear = true THEN NULL ELSE COALESCE(p_runname, "RunName") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "ScheduledJobRunID" = CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, "ScheduledJobRunID") END,
        "TestRunID" = CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, "TestRunID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, "SecondaryScopes") END,
        "ExternalReferenceID" = CASE WHEN p_externalreferenceid_clear = true THEN NULL ELSE COALESCE(p_externalreferenceid, "ExternalReferenceID") END,
        "CompanyID" = CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, "CompanyID") END,
        "LastHeartbeatAt" = CASE WHEN p_lastheartbeatat_clear = true THEN NULL ELSE COALESCE(p_lastheartbeatat, "LastHeartbeatAt") END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_totalcachereadtokensused_clear = true THEN NULL ELSE COALESCE(p_totalcachereadtokensused, "TotalCacheReadTokensUsed") END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_totalcachewritetokensused_clear = true THEN NULL ELSE COALESCE(p_totalcachewritetokensused, "TotalCacheWriteTokensUsed") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run" ON __mj."AIAgentRun";

CREATE TRIGGER "trg_update_ai_agent_run"
BEFORE UPDATE ON __mj."AIAgentRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRun"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentExample"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "OriginatingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "OriginatingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.ResumingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "ResumingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "ResumingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Medias records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunMedia"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Steps records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunStep"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ParentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ParentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ParentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.LastRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "LastRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "LastRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgentRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_prompt_id"
    ON __mj."AIPromptRun" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_model_id"
    ON __mj."AIPromptRun" ("ModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_vendor_id"
    ON __mj."AIPromptRun" ("VendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_agent_id"
    ON __mj."AIPromptRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_configuration_id"
    ON __mj."AIPromptRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_parent_id"
    ON __mj."AIPromptRun" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_agent_run_id"
    ON __mj."AIPromptRun" ("AgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_original_model_id"
    ON __mj."AIPromptRun" ("OriginalModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_rerun_from_prompt_run_id"
    ON __mj."AIPromptRun" ("RerunFromPromptRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_judge_id"
    ON __mj."AIPromptRun" ("JudgeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_child_prompt_id"
    ON __mj."AIPromptRun" ("ChildPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_test_run_id"
    ON __mj."AIPromptRun" ("TestRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fnAIPromptRunParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_prompt_run_parent_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIPromptRun"
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
            __mj."AIPromptRun" c
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
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fnAIPromptRunRerunFromPromptRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIPromptRun.RerunFromPromptRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_prompt_run_rerun_from_prompt_run_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "RerunFromPromptRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIPromptRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."RerunFromPromptRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIPromptRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."RerunFromPromptRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "RerunFromPromptRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIPromptRuns"
AS
SELECT
    a.*,
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJAIModel_ModelID."Name" AS "Model",
    MJAIVendor_VendorID."Name" AS "Vendor",
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIPromptRun_ParentID."RunName" AS "Parent",
    MJAIAgentRun_AgentRunID."RunName" AS "AgentRun",
    MJAIModel_OriginalModelID."Name" AS "OriginalModel",
    MJAIPromptRun_RerunFromPromptRunID."RunName" AS "RerunFromPromptRun",
    MJAIPrompt_JudgeID."Name" AS "Judge",
    MJAIPrompt_ChildPromptID."Name" AS "ChildPrompt",
    MJTestRun_TestRunID."Test" AS "TestRun",
    root_ParentID.root_id AS "RootParentID",
    root_RerunFromPromptRunID.root_id AS "RootRerunFromPromptRunID"
FROM
    __mj."AIPromptRun" AS a
INNER JOIN
    __mj."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "a"."PromptID" = MJAIPrompt_PromptID."ID"
INNER JOIN
    __mj."AIModel" AS MJAIModel_ModelID
  ON
    "a"."ModelID" = MJAIModel_ModelID."ID"
INNER JOIN
    __mj."AIVendor" AS MJAIVendor_VendorID
  ON
    "a"."VendorID" = MJAIVendor_VendorID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    __mj."AIPromptRun" AS MJAIPromptRun_ParentID
  ON
    "a"."ParentID" = MJAIPromptRun_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_AgentRunID
  ON
    "a"."AgentRunID" = MJAIAgentRun_AgentRunID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_OriginalModelID
  ON
    "a"."OriginalModelID" = MJAIModel_OriginalModelID."ID"
LEFT OUTER JOIN
    __mj."AIPromptRun" AS MJAIPromptRun_RerunFromPromptRunID
  ON
    "a"."RerunFromPromptRunID" = MJAIPromptRun_RerunFromPromptRunID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_JudgeID
  ON
    "a"."JudgeID" = MJAIPrompt_JudgeID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ChildPromptID
  ON
    "a"."ChildPromptID" = MJAIPrompt_ChildPromptID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_prompt_run_parent_id_get_root_id"(a."ID", a."ParentID") AS root_id
) AS root_ParentID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_prompt_run_rerun_from_prompt_run_id_get_root_id"(a."ID", a."RerunFromPromptRunID") AS root_id
) AS root_RerunFromPromptRunID ON true
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
    AND tc.relname = 'vwAIPromptRuns'
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
    AND tc.relname = 'vwAIPromptRuns'
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
        AND tc.relname = 'vwAIPromptRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIPromptRuns" CASCADE;
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
GRANT SELECT ON __mj."vwAIPromptRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIPromptRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIPromptRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIPromptRuns"
AS $$
DECLARE
    v_id uuid;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::uuid;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::uuid';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['PromptID', 'ModelID', 'VendorID', 'AgentID', 'ConfigurationID', 'RunAt', 'CompletedAt', 'ExecutionTimeMS', 'Messages', 'Result', 'TokensUsed', 'TokensPrompt', 'TokensCompletion', 'TotalCost', 'Success', 'ErrorMessage', 'ParentID', 'RunType', 'ExecutionOrder', 'AgentRunID', 'Cost', 'CostCurrency', 'TokensUsedRollup', 'TokensPromptRollup', 'TokensCompletionRollup', 'Temperature', 'TopP', 'TopK', 'MinP', 'FrequencyPenalty', 'PresencePenalty', 'Seed', 'StopSequences', 'ResponseFormat', 'LogProbs', 'TopLogProbs', 'DescendantCost', 'ValidationAttemptCount', 'SuccessfulValidationCount', 'FinalValidationPassed', 'ValidationBehavior', 'RetryStrategy', 'MaxRetriesConfigured', 'FinalValidationError', 'ValidationErrorCount', 'CommonValidationError', 'FirstAttemptAt', 'LastAttemptAt', 'TotalRetryDurationMS', 'ValidationAttempts', 'ValidationSummary', 'FailoverAttempts', 'FailoverErrors', 'FailoverDurations', 'OriginalModelID', 'OriginalRequestStartTime', 'TotalFailoverDuration', 'RerunFromPromptRunID', 'ModelSelection', 'Status', 'Cancelled', 'CancellationReason', 'ModelPowerRank', 'SelectionStrategy', 'CacheHit', 'CacheKey', 'JudgeID', 'JudgeScore', 'WasSelectedResult', 'StreamingEnabled', 'FirstTokenTime', 'ErrorDetails', 'ChildPromptID', 'QueueTime', 'PromptTime', 'CompletionTime', 'ModelSpecificResponseDetails', 'EffortLevel', 'RunName', 'Comments', 'TestRunID', 'AssistantPrefill', 'TokensCacheRead', 'TokensCacheWrite', 'TokensCacheReadRollup', 'TokensCacheWriteRollup']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'PromptID' THEN '($1->>''PromptID'')::UUID'
        WHEN 'ModelID' THEN '($1->>''ModelID'')::UUID'
        WHEN 'VendorID' THEN '($1->>''VendorID'')::UUID'
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'RunAt' THEN 'COALESCE(($1->>''RunAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'ExecutionTimeMS' THEN '($1->>''ExecutionTimeMS'')::INTEGER'
        WHEN 'Messages' THEN '($1->>''Messages'')'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'TokensUsed' THEN '($1->>''TokensUsed'')::INTEGER'
        WHEN 'TokensPrompt' THEN '($1->>''TokensPrompt'')::INTEGER'
        WHEN 'TokensCompletion' THEN '($1->>''TokensCompletion'')::INTEGER'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'Success' THEN 'COALESCE(($1->>''Success'')::BOOLEAN, FALSE)'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'RunType' THEN 'COALESCE(($1->>''RunType''), ''Single'')'
        WHEN 'ExecutionOrder' THEN '($1->>''ExecutionOrder'')::INTEGER'
        WHEN 'AgentRunID' THEN '($1->>''AgentRunID'')::UUID'
        WHEN 'Cost' THEN '($1->>''Cost'')::DECIMAL(19, 8)'
        WHEN 'CostCurrency' THEN '($1->>''CostCurrency'')'
        WHEN 'TokensUsedRollup' THEN '($1->>''TokensUsedRollup'')::INTEGER'
        WHEN 'TokensPromptRollup' THEN '($1->>''TokensPromptRollup'')::INTEGER'
        WHEN 'TokensCompletionRollup' THEN '($1->>''TokensCompletionRollup'')::INTEGER'
        WHEN 'Temperature' THEN '($1->>''Temperature'')::DECIMAL(3, 2)'
        WHEN 'TopP' THEN '($1->>''TopP'')::DECIMAL(3, 2)'
        WHEN 'TopK' THEN '($1->>''TopK'')::INTEGER'
        WHEN 'MinP' THEN '($1->>''MinP'')::DECIMAL(3, 2)'
        WHEN 'FrequencyPenalty' THEN '($1->>''FrequencyPenalty'')::DECIMAL(3, 2)'
        WHEN 'PresencePenalty' THEN '($1->>''PresencePenalty'')::DECIMAL(3, 2)'
        WHEN 'Seed' THEN '($1->>''Seed'')::INTEGER'
        WHEN 'StopSequences' THEN '($1->>''StopSequences'')'
        WHEN 'ResponseFormat' THEN '($1->>''ResponseFormat'')'
        WHEN 'LogProbs' THEN '($1->>''LogProbs'')::BOOLEAN'
        WHEN 'TopLogProbs' THEN '($1->>''TopLogProbs'')::INTEGER'
        WHEN 'DescendantCost' THEN '($1->>''DescendantCost'')::DECIMAL(18, 6)'
        WHEN 'ValidationAttemptCount' THEN '($1->>''ValidationAttemptCount'')::INTEGER'
        WHEN 'SuccessfulValidationCount' THEN '($1->>''SuccessfulValidationCount'')::INTEGER'
        WHEN 'FinalValidationPassed' THEN '($1->>''FinalValidationPassed'')::BOOLEAN'
        WHEN 'ValidationBehavior' THEN '($1->>''ValidationBehavior'')'
        WHEN 'RetryStrategy' THEN '($1->>''RetryStrategy'')'
        WHEN 'MaxRetriesConfigured' THEN '($1->>''MaxRetriesConfigured'')::INTEGER'
        WHEN 'FinalValidationError' THEN '($1->>''FinalValidationError'')'
        WHEN 'ValidationErrorCount' THEN '($1->>''ValidationErrorCount'')::INTEGER'
        WHEN 'CommonValidationError' THEN '($1->>''CommonValidationError'')'
        WHEN 'FirstAttemptAt' THEN '($1->>''FirstAttemptAt'')::TIMESTAMPTZ'
        WHEN 'LastAttemptAt' THEN '($1->>''LastAttemptAt'')::TIMESTAMPTZ'
        WHEN 'TotalRetryDurationMS' THEN '($1->>''TotalRetryDurationMS'')::INTEGER'
        WHEN 'ValidationAttempts' THEN '($1->>''ValidationAttempts'')'
        WHEN 'ValidationSummary' THEN '($1->>''ValidationSummary'')'
        WHEN 'FailoverAttempts' THEN '($1->>''FailoverAttempts'')::INTEGER'
        WHEN 'FailoverErrors' THEN '($1->>''FailoverErrors'')'
        WHEN 'FailoverDurations' THEN '($1->>''FailoverDurations'')'
        WHEN 'OriginalModelID' THEN '($1->>''OriginalModelID'')::UUID'
        WHEN 'OriginalRequestStartTime' THEN '($1->>''OriginalRequestStartTime'')::TIMESTAMPTZ'
        WHEN 'TotalFailoverDuration' THEN '($1->>''TotalFailoverDuration'')::INTEGER'
        WHEN 'RerunFromPromptRunID' THEN '($1->>''RerunFromPromptRunID'')::UUID'
        WHEN 'ModelSelection' THEN '($1->>''ModelSelection'')'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'Cancelled' THEN 'COALESCE(($1->>''Cancelled'')::BOOLEAN, FALSE)'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'ModelPowerRank' THEN '($1->>''ModelPowerRank'')::INTEGER'
        WHEN 'SelectionStrategy' THEN '($1->>''SelectionStrategy'')'
        WHEN 'CacheHit' THEN 'COALESCE(($1->>''CacheHit'')::BOOLEAN, FALSE)'
        WHEN 'CacheKey' THEN '($1->>''CacheKey'')'
        WHEN 'JudgeID' THEN '($1->>''JudgeID'')::UUID'
        WHEN 'JudgeScore' THEN '($1->>''JudgeScore'')::FLOAT(53)'
        WHEN 'WasSelectedResult' THEN 'COALESCE(($1->>''WasSelectedResult'')::BOOLEAN, FALSE)'
        WHEN 'StreamingEnabled' THEN 'COALESCE(($1->>''StreamingEnabled'')::BOOLEAN, FALSE)'
        WHEN 'FirstTokenTime' THEN '($1->>''FirstTokenTime'')::INTEGER'
        WHEN 'ErrorDetails' THEN '($1->>''ErrorDetails'')'
        WHEN 'ChildPromptID' THEN '($1->>''ChildPromptID'')::UUID'
        WHEN 'QueueTime' THEN '($1->>''QueueTime'')::INTEGER'
        WHEN 'PromptTime' THEN '($1->>''PromptTime'')::INTEGER'
        WHEN 'CompletionTime' THEN '($1->>''CompletionTime'')::INTEGER'
        WHEN 'ModelSpecificResponseDetails' THEN '($1->>''ModelSpecificResponseDetails'')'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INTEGER'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'AssistantPrefill' THEN '($1->>''AssistantPrefill'')'
        WHEN 'TokensCacheRead' THEN '($1->>''TokensCacheRead'')::INTEGER'
        WHEN 'TokensCacheWrite' THEN '($1->>''TokensCacheWrite'')::INTEGER'
        WHEN 'TokensCacheReadRollup' THEN '($1->>''TokensCacheReadRollup'')::INTEGER'
        WHEN 'TokensCacheWriteRollup' THEN '($1->>''TokensCacheWriteRollup'')::INTEGER'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO __mj."AIPromptRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM __mj."vwAIPromptRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIPromptRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIPromptRuns"
AS $$
DECLARE
    v_id uuid := (p_data->>'ID')::uuid;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIPromptRun: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIPromptRun"
    SET
        "PromptID" = CASE WHEN p_data ? 'PromptID' THEN (p_data->>'PromptID')::UUID ELSE "PromptID" END,
        "ModelID" = CASE WHEN p_data ? 'ModelID' THEN (p_data->>'ModelID')::UUID ELSE "ModelID" END,
        "VendorID" = CASE WHEN p_data ? 'VendorID' THEN (p_data->>'VendorID')::UUID ELSE "VendorID" END,
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "RunAt" = CASE WHEN p_data ? 'RunAt' THEN (p_data->>'RunAt')::TIMESTAMPTZ ELSE "RunAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "ExecutionTimeMS" = CASE WHEN p_data ? 'ExecutionTimeMS' THEN (p_data->>'ExecutionTimeMS')::INTEGER ELSE "ExecutionTimeMS" END,
        "Messages" = CASE WHEN p_data ? 'Messages' THEN (p_data->>'Messages') ELSE "Messages" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "TokensUsed" = CASE WHEN p_data ? 'TokensUsed' THEN (p_data->>'TokensUsed')::INTEGER ELSE "TokensUsed" END,
        "TokensPrompt" = CASE WHEN p_data ? 'TokensPrompt' THEN (p_data->>'TokensPrompt')::INTEGER ELSE "TokensPrompt" END,
        "TokensCompletion" = CASE WHEN p_data ? 'TokensCompletion' THEN (p_data->>'TokensCompletion')::INTEGER ELSE "TokensCompletion" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "RunType" = CASE WHEN p_data ? 'RunType' THEN (p_data->>'RunType') ELSE "RunType" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INTEGER ELSE "ExecutionOrder" END,
        "AgentRunID" = CASE WHEN p_data ? 'AgentRunID' THEN (p_data->>'AgentRunID')::UUID ELSE "AgentRunID" END,
        "Cost" = CASE WHEN p_data ? 'Cost' THEN (p_data->>'Cost')::DECIMAL(19, 8) ELSE "Cost" END,
        "CostCurrency" = CASE WHEN p_data ? 'CostCurrency' THEN (p_data->>'CostCurrency') ELSE "CostCurrency" END,
        "TokensUsedRollup" = CASE WHEN p_data ? 'TokensUsedRollup' THEN (p_data->>'TokensUsedRollup')::INTEGER ELSE "TokensUsedRollup" END,
        "TokensPromptRollup" = CASE WHEN p_data ? 'TokensPromptRollup' THEN (p_data->>'TokensPromptRollup')::INTEGER ELSE "TokensPromptRollup" END,
        "TokensCompletionRollup" = CASE WHEN p_data ? 'TokensCompletionRollup' THEN (p_data->>'TokensCompletionRollup')::INTEGER ELSE "TokensCompletionRollup" END,
        "Temperature" = CASE WHEN p_data ? 'Temperature' THEN (p_data->>'Temperature')::DECIMAL(3, 2) ELSE "Temperature" END,
        "TopP" = CASE WHEN p_data ? 'TopP' THEN (p_data->>'TopP')::DECIMAL(3, 2) ELSE "TopP" END,
        "TopK" = CASE WHEN p_data ? 'TopK' THEN (p_data->>'TopK')::INTEGER ELSE "TopK" END,
        "MinP" = CASE WHEN p_data ? 'MinP' THEN (p_data->>'MinP')::DECIMAL(3, 2) ELSE "MinP" END,
        "FrequencyPenalty" = CASE WHEN p_data ? 'FrequencyPenalty' THEN (p_data->>'FrequencyPenalty')::DECIMAL(3, 2) ELSE "FrequencyPenalty" END,
        "PresencePenalty" = CASE WHEN p_data ? 'PresencePenalty' THEN (p_data->>'PresencePenalty')::DECIMAL(3, 2) ELSE "PresencePenalty" END,
        "Seed" = CASE WHEN p_data ? 'Seed' THEN (p_data->>'Seed')::INTEGER ELSE "Seed" END,
        "StopSequences" = CASE WHEN p_data ? 'StopSequences' THEN (p_data->>'StopSequences') ELSE "StopSequences" END,
        "ResponseFormat" = CASE WHEN p_data ? 'ResponseFormat' THEN (p_data->>'ResponseFormat') ELSE "ResponseFormat" END,
        "LogProbs" = CASE WHEN p_data ? 'LogProbs' THEN (p_data->>'LogProbs')::BOOLEAN ELSE "LogProbs" END,
        "TopLogProbs" = CASE WHEN p_data ? 'TopLogProbs' THEN (p_data->>'TopLogProbs')::INTEGER ELSE "TopLogProbs" END,
        "DescendantCost" = CASE WHEN p_data ? 'DescendantCost' THEN (p_data->>'DescendantCost')::DECIMAL(18, 6) ELSE "DescendantCost" END,
        "ValidationAttemptCount" = CASE WHEN p_data ? 'ValidationAttemptCount' THEN (p_data->>'ValidationAttemptCount')::INTEGER ELSE "ValidationAttemptCount" END,
        "SuccessfulValidationCount" = CASE WHEN p_data ? 'SuccessfulValidationCount' THEN (p_data->>'SuccessfulValidationCount')::INTEGER ELSE "SuccessfulValidationCount" END,
        "FinalValidationPassed" = CASE WHEN p_data ? 'FinalValidationPassed' THEN (p_data->>'FinalValidationPassed')::BOOLEAN ELSE "FinalValidationPassed" END,
        "ValidationBehavior" = CASE WHEN p_data ? 'ValidationBehavior' THEN (p_data->>'ValidationBehavior') ELSE "ValidationBehavior" END,
        "RetryStrategy" = CASE WHEN p_data ? 'RetryStrategy' THEN (p_data->>'RetryStrategy') ELSE "RetryStrategy" END,
        "MaxRetriesConfigured" = CASE WHEN p_data ? 'MaxRetriesConfigured' THEN (p_data->>'MaxRetriesConfigured')::INTEGER ELSE "MaxRetriesConfigured" END,
        "FinalValidationError" = CASE WHEN p_data ? 'FinalValidationError' THEN (p_data->>'FinalValidationError') ELSE "FinalValidationError" END,
        "ValidationErrorCount" = CASE WHEN p_data ? 'ValidationErrorCount' THEN (p_data->>'ValidationErrorCount')::INTEGER ELSE "ValidationErrorCount" END,
        "CommonValidationError" = CASE WHEN p_data ? 'CommonValidationError' THEN (p_data->>'CommonValidationError') ELSE "CommonValidationError" END,
        "FirstAttemptAt" = CASE WHEN p_data ? 'FirstAttemptAt' THEN (p_data->>'FirstAttemptAt')::TIMESTAMPTZ ELSE "FirstAttemptAt" END,
        "LastAttemptAt" = CASE WHEN p_data ? 'LastAttemptAt' THEN (p_data->>'LastAttemptAt')::TIMESTAMPTZ ELSE "LastAttemptAt" END,
        "TotalRetryDurationMS" = CASE WHEN p_data ? 'TotalRetryDurationMS' THEN (p_data->>'TotalRetryDurationMS')::INTEGER ELSE "TotalRetryDurationMS" END,
        "ValidationAttempts" = CASE WHEN p_data ? 'ValidationAttempts' THEN (p_data->>'ValidationAttempts') ELSE "ValidationAttempts" END,
        "ValidationSummary" = CASE WHEN p_data ? 'ValidationSummary' THEN (p_data->>'ValidationSummary') ELSE "ValidationSummary" END,
        "FailoverAttempts" = CASE WHEN p_data ? 'FailoverAttempts' THEN (p_data->>'FailoverAttempts')::INTEGER ELSE "FailoverAttempts" END,
        "FailoverErrors" = CASE WHEN p_data ? 'FailoverErrors' THEN (p_data->>'FailoverErrors') ELSE "FailoverErrors" END,
        "FailoverDurations" = CASE WHEN p_data ? 'FailoverDurations' THEN (p_data->>'FailoverDurations') ELSE "FailoverDurations" END,
        "OriginalModelID" = CASE WHEN p_data ? 'OriginalModelID' THEN (p_data->>'OriginalModelID')::UUID ELSE "OriginalModelID" END,
        "OriginalRequestStartTime" = CASE WHEN p_data ? 'OriginalRequestStartTime' THEN (p_data->>'OriginalRequestStartTime')::TIMESTAMPTZ ELSE "OriginalRequestStartTime" END,
        "TotalFailoverDuration" = CASE WHEN p_data ? 'TotalFailoverDuration' THEN (p_data->>'TotalFailoverDuration')::INTEGER ELSE "TotalFailoverDuration" END,
        "RerunFromPromptRunID" = CASE WHEN p_data ? 'RerunFromPromptRunID' THEN (p_data->>'RerunFromPromptRunID')::UUID ELSE "RerunFromPromptRunID" END,
        "ModelSelection" = CASE WHEN p_data ? 'ModelSelection' THEN (p_data->>'ModelSelection') ELSE "ModelSelection" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "Cancelled" = CASE WHEN p_data ? 'Cancelled' THEN (p_data->>'Cancelled')::BOOLEAN ELSE "Cancelled" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "ModelPowerRank" = CASE WHEN p_data ? 'ModelPowerRank' THEN (p_data->>'ModelPowerRank')::INTEGER ELSE "ModelPowerRank" END,
        "SelectionStrategy" = CASE WHEN p_data ? 'SelectionStrategy' THEN (p_data->>'SelectionStrategy') ELSE "SelectionStrategy" END,
        "CacheHit" = CASE WHEN p_data ? 'CacheHit' THEN (p_data->>'CacheHit')::BOOLEAN ELSE "CacheHit" END,
        "CacheKey" = CASE WHEN p_data ? 'CacheKey' THEN (p_data->>'CacheKey') ELSE "CacheKey" END,
        "JudgeID" = CASE WHEN p_data ? 'JudgeID' THEN (p_data->>'JudgeID')::UUID ELSE "JudgeID" END,
        "JudgeScore" = CASE WHEN p_data ? 'JudgeScore' THEN (p_data->>'JudgeScore')::FLOAT(53) ELSE "JudgeScore" END,
        "WasSelectedResult" = CASE WHEN p_data ? 'WasSelectedResult' THEN (p_data->>'WasSelectedResult')::BOOLEAN ELSE "WasSelectedResult" END,
        "StreamingEnabled" = CASE WHEN p_data ? 'StreamingEnabled' THEN (p_data->>'StreamingEnabled')::BOOLEAN ELSE "StreamingEnabled" END,
        "FirstTokenTime" = CASE WHEN p_data ? 'FirstTokenTime' THEN (p_data->>'FirstTokenTime')::INTEGER ELSE "FirstTokenTime" END,
        "ErrorDetails" = CASE WHEN p_data ? 'ErrorDetails' THEN (p_data->>'ErrorDetails') ELSE "ErrorDetails" END,
        "ChildPromptID" = CASE WHEN p_data ? 'ChildPromptID' THEN (p_data->>'ChildPromptID')::UUID ELSE "ChildPromptID" END,
        "QueueTime" = CASE WHEN p_data ? 'QueueTime' THEN (p_data->>'QueueTime')::INTEGER ELSE "QueueTime" END,
        "PromptTime" = CASE WHEN p_data ? 'PromptTime' THEN (p_data->>'PromptTime')::INTEGER ELSE "PromptTime" END,
        "CompletionTime" = CASE WHEN p_data ? 'CompletionTime' THEN (p_data->>'CompletionTime')::INTEGER ELSE "CompletionTime" END,
        "ModelSpecificResponseDetails" = CASE WHEN p_data ? 'ModelSpecificResponseDetails' THEN (p_data->>'ModelSpecificResponseDetails') ELSE "ModelSpecificResponseDetails" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INTEGER ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "AssistantPrefill" = CASE WHEN p_data ? 'AssistantPrefill' THEN (p_data->>'AssistantPrefill') ELSE "AssistantPrefill" END,
        "TokensCacheRead" = CASE WHEN p_data ? 'TokensCacheRead' THEN (p_data->>'TokensCacheRead')::INTEGER ELSE "TokensCacheRead" END,
        "TokensCacheWrite" = CASE WHEN p_data ? 'TokensCacheWrite' THEN (p_data->>'TokensCacheWrite')::INTEGER ELSE "TokensCacheWrite" END,
        "TokensCacheReadRollup" = CASE WHEN p_data ? 'TokensCacheReadRollup' THEN (p_data->>'TokensCacheReadRollup')::INTEGER ELSE "TokensCacheReadRollup" END,
        "TokensCacheWriteRollup" = CASE WHEN p_data ? 'TokensCacheWriteRollup' THEN (p_data->>'TokensCacheWriteRollup')::INTEGER ELSE "TokensCacheWriteRollup" END,
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
    SELECT * FROM __mj."vwAIPromptRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_prompt_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt_run" ON __mj."AIPromptRun";

CREATE TRIGGER "trg_update_ai_prompt_run"
BEFORE UPDATE ON __mj."AIPromptRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_prompt_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPromptRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptRun"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: AI Prompt Run Medias records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRunMedia"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIPromptRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.RerunFromPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "RerunFromPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "RerunFromPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIResultCache"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Content Item Tags.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ContentItemTag"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ContentItemTag"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Content Process Run Prompt Runs records via AIPromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ContentProcessRunPromptRun"
        WHERE "AIPromptRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteContentProcessRunPromptRun"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."AIPromptRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Integration";
