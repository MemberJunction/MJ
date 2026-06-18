-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202605311333__v5.39.x__ScheduledJob_RunImmediatelyIfNeverRun.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."ScheduledJob"
  ADD COLUMN "RunImmediatelyIfNeverRun" BOOLEAN NOT NULL CONSTRAINT "DF_ScheduledJob_RunImmediatelyIfNeverRun" DEFAULT FALSE
 /* Adds RunImmediatelyIfNeverRun to ScheduledJob. */ /* When true AND LastRunAt IS NULL, ScheduledJobEngine.initializeNextRunTimes() */ /* sets NextRunAt = now() instead of the next cron tick. This ensures a */ /* freshly-seeded job runs on the next polling cycle instead of waiting up */ /* to a full cron interval (e.g. 24h for a daily job) for its first run. */ /* Generally useful well beyond the entity-search-via-EntityDocument feature */ /* that motivated it — any seeded job that should run as soon as it's */ /* installed (data backfill, initial sync, etc.) benefits from this flag. */;

COMMENT ON COLUMN __mj."ScheduledJob"."RunImmediatelyIfNeverRun" IS 'When true AND LastRunAt IS NULL, the scheduler sets NextRunAt to now() instead of the next cron tick on initialization, so the job runs on the next polling cycle. Useful for newly-seeded jobs that should not wait up to a full cron interval before their first execution.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c3233a2e-eee3-4f43-8f80-587dd45e6820' OR ("EntityID" = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND "Name" = 'RunImmediatelyIfNeverRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c3233a2e-eee3-4f43-8f80-587dd45e6820', 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' /* Entity: MJ: Scheduled Jobs */, 100061, 'RunImmediatelyIfNeverRun', 'Run Immediately If Never Run', 'When true AND LastRunAt IS NULL, the scheduler sets NextRunAt to now() instead of the next cron tick on initialization, so the job runs on the next polling cycle. Useful for newly-seeded jobs that should not wait up to a full cron interval before their first execution.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'E4F4B083-A687-43EB-B9E4-2B41273D82D7'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '7CED4F5B-2A51-4D30-968A-7CB0C302F5BE'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '7CED4F5B-2A51-4D30-968A-7CB0C302F5BE'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 32 fields */ /* UPDATE Entity Field Category Info MJ: Scheduled Jobs.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5FF3A193-496F-4A52-BFC4-C34A72B47170' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '68AE196C-1CBD-44B9-A24D-C9F69CF1215D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0A7ACD60-27E1-46F5-B162-00E87EE996E3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.JobTypeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C30FF21A-65A1-4EF3-8978-430CE036C280' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4B118964-92D4-49DE-8C3E-FB5736ED5397' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3B91E50A-C0EB-47B7-89F5-B896933309EA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.Configuration */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'AC6D67F0-D805-4E42-9C4A-34E136107B46' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.ConcurrencyMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BB4BFDA6-0001-43D3-9F48-E9BDB1AC0331' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.JobType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7CED4F5B-2A51-4D30-968A-7CB0C302F5BE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.CronExpression */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9FEFB2A6-873F-4788-9F53-225BAEDF7333' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.Timezone */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E57EF025-B07C-4D17-8602-6120A345ADDF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.StartAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0F3B6855-16D4-486B-A589-698650BFFF96' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.EndAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B2917C35-8B6B-4C02-A42A-6CA26D70125F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.LastRunAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E4F4B083-A687-43EB-B9E4-2B41273D82D7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.NextRunAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B44E0249-46E7-4C54-A0A5-A6A8E79FB4CD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.ExpectedCompletionAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4CEF1A8F-EDC1-4551-B3B8-2B8A6DA3DEAA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.RunImmediatelyIfNeverRun */
UPDATE __mj."EntityField" SET "Category" = 'Schedule & Timing', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C3233A2E-EEE3-4F43-8F80-587DD45E6820' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.RunCount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CC28664E-CF7B-4791-B4BE-D96CBD4E4549' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.SuccessCount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A0B299B6-FEA3-4D84-A56E-0A5369B288D2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.FailureCount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '53667E7F-001E-4977-B588-3619D9A982C6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.OwnerUserID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E4DCCF26-14B1-4033-818D-180AF7C04097' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyOnSuccess */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AB6D25BB-B06B-454D-8216-8D8416A856D6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyOnFailure */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D089DC8A-E08C-4295-B5EA-4C96DDDEB8D1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyUserID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1FFB0397-C54B-4A7D-9394-CFF8A392502A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyViaEmail */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4C6D0B08-D852-444F-9394-C5387C91139F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyViaInApp */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Notify Via In-App', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '03768220-F023-4E46-87E2-5738AAC55985' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.OwnerUser */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C8AC395C-04D8-4E85-881B-D4F5A70B759D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyUser */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0EA25537-7EFD-4FB3-83DD-2E876202D09D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.LockToken */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '105CEAB7-9967-4956-B143-CBC983632481' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.LockedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4D1F66E6-E7DD-4463-BD85-6A34DADFD096' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Scheduled Jobs.LockedByInstance */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '12ED9986-1339-4F4C-88DC-B8B479950062' AND "AutoUpdateCategory" = TRUE;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Attachments
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_attachment_conversation_de"
    ON __mj."ConversationDetailAttachment" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_attachment_modality_id"
    ON __mj."ConversationDetailAttachment" ("ModalityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_attachment_file_id"
    ON __mj."ConversationDetailAttachment" ("FileID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_attachment_artifact_versio"
    ON __mj."ConversationDetailAttachment" ("ArtifactVersionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Attachments
-- Item: vwConversationDetailAttachments
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Attachments
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationDetailAttachment
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetailAttachments"
AS
SELECT
    c.*,
    MJConversationDetail_ConversationDetailID."Message" AS "ConversationDetail",
    MJAIModality_ModalityID."Name" AS "Modality",
    MJFile_FileID."Name" AS "File",
    MJArtifactVersion_ArtifactVersionID."Name" AS "ArtifactVersion"
FROM
    __mj."ConversationDetailAttachment" AS c
INNER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "c"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
INNER JOIN
    __mj."AIModality" AS MJAIModality_ModalityID
  ON
    "c"."ModalityID" = MJAIModality_ModalityID."ID"
LEFT OUTER JOIN
    __mj."File" AS MJFile_FileID
  ON
    "c"."FileID" = MJFile_FileID."ID"
LEFT OUTER JOIN
    __mj."ArtifactVersion" AS MJArtifactVersion_ArtifactVersionID
  ON
    "c"."ArtifactVersionID" = MJArtifactVersion_ArtifactVersionID."ID"
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
    AND tc.relname = 'vwConversationDetailAttachments'
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
    AND tc.relname = 'vwConversationDetailAttachments'
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
        AND tc.relname = 'vwConversationDetailAttachments'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwConversationDetailAttachments" CASCADE;
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
GRANT SELECT ON __mj."vwConversationDetailAttachments" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversationDetailAttachments" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversationDetailAttachments" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Attachments
-- Item: spCreateConversationDetailAttachment
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ConversationDetailAttachment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationDetailAttachment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailAttachment"(
    p_id uuid DEFAULT NULL,
    p_conversationdetailid uuid DEFAULT NULL,
    p_modalityid uuid DEFAULT NULL,
    p_mimetype text DEFAULT NULL,
    p_filename_clear boolean DEFAULT false,
    p_filename text DEFAULT NULL,
    p_filesizebytes integer DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width integer DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height integer DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds integer DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata text DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid uuid DEFAULT NULL,
    p_displayorder integer DEFAULT NULL,
    p_thumbnailbase64_clear boolean DEFAULT false,
    p_thumbnailbase64 text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetailAttachments" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ConversationDetailAttachment"
        (
            "ID",
            "ConversationDetailID",
                "ModalityID",
                "MimeType",
                "FileName",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "InlineData",
                "FileID",
                "DisplayOrder",
                "ThumbnailBase64",
                "Description",
                "ArtifactVersionID"
        )
    VALUES
        (
            v_new_id,
            p_conversationdetailid,
                p_modalityid,
                p_mimetype,
                CASE WHEN p_filename_clear = true THEN NULL ELSE COALESCE(p_filename, NULL) END,
                p_filesizebytes,
                CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, NULL) END,
                CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, NULL) END,
                CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, NULL) END,
                CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, NULL) END,
                CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, NULL) END,
                COALESCE(p_displayorder, 0),
                CASE WHEN p_thumbnailbase64_clear = true THEN NULL ELSE COALESCE(p_thumbnailbase64, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_artifactversionid_clear = true THEN NULL ELSE COALESCE(p_artifactversionid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetailAttachments"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailAttachment" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailAttachment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailAttachment" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Attachments
-- Item: spUpdateConversationDetailAttachment
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ConversationDetailAttachment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationDetailAttachment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailAttachment"(
    p_id uuid,
    p_conversationdetailid uuid DEFAULT NULL,
    p_modalityid uuid DEFAULT NULL,
    p_mimetype text DEFAULT NULL,
    p_filename_clear boolean DEFAULT false,
    p_filename text DEFAULT NULL,
    p_filesizebytes integer DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width integer DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height integer DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds integer DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata text DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid uuid DEFAULT NULL,
    p_displayorder integer DEFAULT NULL,
    p_thumbnailbase64_clear boolean DEFAULT false,
    p_thumbnailbase64 text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetailAttachments" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ConversationDetailAttachment"
    SET
        "ConversationDetailID" = COALESCE(p_conversationdetailid, "ConversationDetailID"),
        "ModalityID" = COALESCE(p_modalityid, "ModalityID"),
        "MimeType" = COALESCE(p_mimetype, "MimeType"),
        "FileName" = CASE WHEN p_filename_clear = true THEN NULL ELSE COALESCE(p_filename, "FileName") END,
        "FileSizeBytes" = COALESCE(p_filesizebytes, "FileSizeBytes"),
        "Width" = CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, "Width") END,
        "Height" = CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, "Height") END,
        "DurationSeconds" = CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, "DurationSeconds") END,
        "InlineData" = CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, "InlineData") END,
        "FileID" = CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, "FileID") END,
        "DisplayOrder" = COALESCE(p_displayorder, "DisplayOrder"),
        "ThumbnailBase64" = CASE WHEN p_thumbnailbase64_clear = true THEN NULL ELSE COALESCE(p_thumbnailbase64, "ThumbnailBase64") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ArtifactVersionID" = CASE WHEN p_artifactversionid_clear = true THEN NULL ELSE COALESCE(p_artifactversionid, "ArtifactVersionID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetailAttachments"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailAttachment" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailAttachment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailAttachment" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetailAttachment table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_conversation_detail_attachment"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_detail_attachment" ON __mj."ConversationDetailAttachment";

CREATE TRIGGER "trg_update_conversation_detail_attachment"
BEFORE UPDATE ON __mj."ConversationDetailAttachment"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_conversation_detail_attachment"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Detail Attachments
-- Item: spDeleteConversationDetailAttachment
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ConversationDetailAttachment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversationDetailAttachment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailAttachment"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ConversationDetailAttachment"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailAttachment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailAttachment" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scheduled Jobs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_scheduled_job_job_type_id"
    ON __mj."ScheduledJob" ("JobTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_scheduled_job_owner_user_id"
    ON __mj."ScheduledJob" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_scheduled_job_notify_user_id"
    ON __mj."ScheduledJob" ("NotifyUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scheduled Jobs
-- Item: vwScheduledJobs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Scheduled Jobs
-----               SCHEMA:      __mj
-----               BASE TABLE:  ScheduledJob
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwScheduledJobs"
AS
SELECT
    s.*,
    MJScheduledJobType_JobTypeID."Name" AS "JobType",
    MJUser_OwnerUserID."Name" AS "OwnerUser",
    MJUser_NotifyUserID."Name" AS "NotifyUser"
FROM
    __mj."ScheduledJob" AS s
INNER JOIN
    __mj."ScheduledJobType" AS MJScheduledJobType_JobTypeID
  ON
    "s"."JobTypeID" = MJScheduledJobType_JobTypeID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_OwnerUserID
  ON
    "s"."OwnerUserID" = MJUser_OwnerUserID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_NotifyUserID
  ON
    "s"."NotifyUserID" = MJUser_NotifyUserID."ID"
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
    AND tc.relname = 'vwScheduledJobs'
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
    AND tc.relname = 'vwScheduledJobs'
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
        AND tc.relname = 'vwScheduledJobs'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwScheduledJobs" CASCADE;
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
GRANT SELECT ON __mj."vwScheduledJobs" TO "cdp_UI";
GRANT SELECT ON __mj."vwScheduledJobs" TO "cdp_Developer";
GRANT SELECT ON __mj."vwScheduledJobs" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scheduled Jobs
-- Item: spCreateScheduledJob
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ScheduledJob
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateScheduledJob'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateScheduledJob"(
    p_id uuid DEFAULT NULL,
    p_jobtypeid uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_cronexpression text DEFAULT NULL,
    p_timezone text DEFAULT NULL,
    p_startat_clear boolean DEFAULT false,
    p_startat TIMESTAMPTZ DEFAULT NULL,
    p_endat_clear boolean DEFAULT false,
    p_endat TIMESTAMPTZ DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL,
    p_owneruserid_clear boolean DEFAULT false,
    p_owneruserid uuid DEFAULT NULL,
    p_lastrunat_clear boolean DEFAULT false,
    p_lastrunat TIMESTAMPTZ DEFAULT NULL,
    p_nextrunat_clear boolean DEFAULT false,
    p_nextrunat TIMESTAMPTZ DEFAULT NULL,
    p_runcount integer DEFAULT NULL,
    p_successcount integer DEFAULT NULL,
    p_failurecount integer DEFAULT NULL,
    p_notifyonsuccess BOOLEAN DEFAULT NULL,
    p_notifyonfailure BOOLEAN DEFAULT NULL,
    p_notifyuserid_clear boolean DEFAULT false,
    p_notifyuserid uuid DEFAULT NULL,
    p_notifyviaemail BOOLEAN DEFAULT NULL,
    p_notifyviainapp BOOLEAN DEFAULT NULL,
    p_locktoken_clear boolean DEFAULT false,
    p_locktoken uuid DEFAULT NULL,
    p_lockedat_clear boolean DEFAULT false,
    p_lockedat TIMESTAMPTZ DEFAULT NULL,
    p_lockedbyinstance_clear boolean DEFAULT false,
    p_lockedbyinstance text DEFAULT NULL,
    p_expectedcompletionat_clear boolean DEFAULT false,
    p_expectedcompletionat TIMESTAMPTZ DEFAULT NULL,
    p_concurrencymode text DEFAULT NULL,
    p_runimmediatelyifneverrun boolean DEFAULT NULL
) RETURNS SETOF __mj."vwScheduledJobs" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ScheduledJob"
        (
            "ID",
            "JobTypeID",
                "Name",
                "Description",
                "CronExpression",
                "Timezone",
                "StartAt",
                "EndAt",
                "Status",
                "Configuration",
                "OwnerUserID",
                "LastRunAt",
                "NextRunAt",
                "RunCount",
                "SuccessCount",
                "FailureCount",
                "NotifyOnSuccess",
                "NotifyOnFailure",
                "NotifyUserID",
                "NotifyViaEmail",
                "NotifyViaInApp",
                "LockToken",
                "LockedAt",
                "LockedByInstance",
                "ExpectedCompletionAt",
                "ConcurrencyMode",
                "RunImmediatelyIfNeverRun"
        )
    VALUES
        (
            v_new_id,
            p_jobtypeid,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_cronexpression,
                COALESCE(p_timezone, 'UTC'),
                CASE WHEN p_startat_clear = true THEN NULL ELSE COALESCE(p_startat, NULL) END,
                CASE WHEN p_endat_clear = true THEN NULL ELSE COALESCE(p_endat, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_owneruserid_clear = true THEN NULL ELSE COALESCE(p_owneruserid, NULL) END,
                CASE WHEN p_lastrunat_clear = true THEN NULL ELSE COALESCE(p_lastrunat, NULL) END,
                CASE WHEN p_nextrunat_clear = true THEN NULL ELSE COALESCE(p_nextrunat, NULL) END,
                COALESCE(p_runcount, 0),
                COALESCE(p_successcount, 0),
                COALESCE(p_failurecount, 0),
                COALESCE(p_notifyonsuccess, FALSE),
                COALESCE(p_notifyonfailure, TRUE),
                CASE WHEN p_notifyuserid_clear = true THEN NULL ELSE COALESCE(p_notifyuserid, NULL) END,
                COALESCE(p_notifyviaemail, FALSE),
                COALESCE(p_notifyviainapp, TRUE),
                CASE WHEN p_locktoken_clear = true THEN NULL ELSE COALESCE(p_locktoken, NULL) END,
                CASE WHEN p_lockedat_clear = true THEN NULL ELSE COALESCE(p_lockedat, NULL) END,
                CASE WHEN p_lockedbyinstance_clear = true THEN NULL ELSE COALESCE(p_lockedbyinstance, NULL) END,
                CASE WHEN p_expectedcompletionat_clear = true THEN NULL ELSE COALESCE(p_expectedcompletionat, NULL) END,
                COALESCE(p_concurrencymode, 'Skip'),
                COALESCE(p_runimmediatelyifneverrun, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwScheduledJobs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateScheduledJob" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateScheduledJob" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scheduled Jobs
-- Item: spUpdateScheduledJob
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ScheduledJob
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateScheduledJob'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateScheduledJob"(
    p_id uuid,
    p_jobtypeid uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_cronexpression text DEFAULT NULL,
    p_timezone text DEFAULT NULL,
    p_startat_clear boolean DEFAULT false,
    p_startat TIMESTAMPTZ DEFAULT NULL,
    p_endat_clear boolean DEFAULT false,
    p_endat TIMESTAMPTZ DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL,
    p_owneruserid_clear boolean DEFAULT false,
    p_owneruserid uuid DEFAULT NULL,
    p_lastrunat_clear boolean DEFAULT false,
    p_lastrunat TIMESTAMPTZ DEFAULT NULL,
    p_nextrunat_clear boolean DEFAULT false,
    p_nextrunat TIMESTAMPTZ DEFAULT NULL,
    p_runcount integer DEFAULT NULL,
    p_successcount integer DEFAULT NULL,
    p_failurecount integer DEFAULT NULL,
    p_notifyonsuccess BOOLEAN DEFAULT NULL,
    p_notifyonfailure BOOLEAN DEFAULT NULL,
    p_notifyuserid_clear boolean DEFAULT false,
    p_notifyuserid uuid DEFAULT NULL,
    p_notifyviaemail BOOLEAN DEFAULT NULL,
    p_notifyviainapp BOOLEAN DEFAULT NULL,
    p_locktoken_clear boolean DEFAULT false,
    p_locktoken uuid DEFAULT NULL,
    p_lockedat_clear boolean DEFAULT false,
    p_lockedat TIMESTAMPTZ DEFAULT NULL,
    p_lockedbyinstance_clear boolean DEFAULT false,
    p_lockedbyinstance text DEFAULT NULL,
    p_expectedcompletionat_clear boolean DEFAULT false,
    p_expectedcompletionat TIMESTAMPTZ DEFAULT NULL,
    p_concurrencymode text DEFAULT NULL,
    p_runimmediatelyifneverrun boolean DEFAULT NULL
) RETURNS SETOF __mj."vwScheduledJobs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ScheduledJob"
    SET
        "JobTypeID" = COALESCE(p_jobtypeid, "JobTypeID"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "CronExpression" = COALESCE(p_cronexpression, "CronExpression"),
        "Timezone" = COALESCE(p_timezone, "Timezone"),
        "StartAt" = CASE WHEN p_startat_clear = true THEN NULL ELSE COALESCE(p_startat, "StartAt") END,
        "EndAt" = CASE WHEN p_endat_clear = true THEN NULL ELSE COALESCE(p_endat, "EndAt") END,
        "Status" = COALESCE(p_status, "Status"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "OwnerUserID" = CASE WHEN p_owneruserid_clear = true THEN NULL ELSE COALESCE(p_owneruserid, "OwnerUserID") END,
        "LastRunAt" = CASE WHEN p_lastrunat_clear = true THEN NULL ELSE COALESCE(p_lastrunat, "LastRunAt") END,
        "NextRunAt" = CASE WHEN p_nextrunat_clear = true THEN NULL ELSE COALESCE(p_nextrunat, "NextRunAt") END,
        "RunCount" = COALESCE(p_runcount, "RunCount"),
        "SuccessCount" = COALESCE(p_successcount, "SuccessCount"),
        "FailureCount" = COALESCE(p_failurecount, "FailureCount"),
        "NotifyOnSuccess" = COALESCE(p_notifyonsuccess, "NotifyOnSuccess"),
        "NotifyOnFailure" = COALESCE(p_notifyonfailure, "NotifyOnFailure"),
        "NotifyUserID" = CASE WHEN p_notifyuserid_clear = true THEN NULL ELSE COALESCE(p_notifyuserid, "NotifyUserID") END,
        "NotifyViaEmail" = COALESCE(p_notifyviaemail, "NotifyViaEmail"),
        "NotifyViaInApp" = COALESCE(p_notifyviainapp, "NotifyViaInApp"),
        "LockToken" = CASE WHEN p_locktoken_clear = true THEN NULL ELSE COALESCE(p_locktoken, "LockToken") END,
        "LockedAt" = CASE WHEN p_lockedat_clear = true THEN NULL ELSE COALESCE(p_lockedat, "LockedAt") END,
        "LockedByInstance" = CASE WHEN p_lockedbyinstance_clear = true THEN NULL ELSE COALESCE(p_lockedbyinstance, "LockedByInstance") END,
        "ExpectedCompletionAt" = CASE WHEN p_expectedcompletionat_clear = true THEN NULL ELSE COALESCE(p_expectedcompletionat, "ExpectedCompletionAt") END,
        "ConcurrencyMode" = COALESCE(p_concurrencymode, "ConcurrencyMode"),
        "RunImmediatelyIfNeverRun" = COALESCE(p_runimmediatelyifneverrun, "RunImmediatelyIfNeverRun")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwScheduledJobs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateScheduledJob" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateScheduledJob" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ScheduledJob table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_scheduled_job"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_scheduled_job" ON __mj."ScheduledJob";

CREATE TRIGGER "trg_update_scheduled_job"
BEFORE UPDATE ON __mj."ScheduledJob"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_scheduled_job"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scheduled Jobs
-- Item: spDeleteScheduledJob
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ScheduledJob
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteScheduledJob'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledJob"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ScheduledJob"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledJob" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledJob" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_conversation_id"
    ON __mj."ConversationDetail" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_user_id"
    ON __mj."ConversationDetail" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_artifact_id"
    ON __mj."ConversationDetail" ("ArtifactID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_artifact_version_id"
    ON __mj."ConversationDetail" ("ArtifactVersionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_parent_id"
    ON __mj."ConversationDetail" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_agent_id"
    ON __mj."ConversationDetail" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_conversation_detail_test_run_id"
    ON __mj."ConversationDetail" ("TestRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: fnConversationDetailParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ConversationDetail.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_conversation_detail_parent_id_get_root_id"(
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
            __mj."ConversationDetail"
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
            __mj."ConversationDetail" c
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
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: vwConversationDetails
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Details
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetails"
AS
SELECT
    c.*,
    MJConversation_ConversationID."Name" AS "Conversation",
    MJUser_UserID."Name" AS "User",
    MJConversationArtifact_ArtifactID."Name" AS "Artifact",
    MJConversationArtifactVersion_ArtifactVersionID."ConversationArtifact" AS "ArtifactVersion",
    MJConversationDetail_ParentID."Message" AS "Parent",
    MJAIAgent_AgentID."Name" AS "Agent",
    MJTestRun_TestRunID."Test" AS "TestRun",
    root_ParentID.root_id AS "RootParentID"
FROM
    __mj."ConversationDetail" AS c
INNER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "c"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "c"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."ConversationArtifact" AS MJConversationArtifact_ArtifactID
  ON
    "c"."ArtifactID" = MJConversationArtifact_ArtifactID."ID"
LEFT OUTER JOIN
    __mj."vwConversationArtifactVersions" AS MJConversationArtifactVersion_ArtifactVersionID
  ON
    "c"."ArtifactVersionID" = MJConversationArtifactVersion_ArtifactVersionID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ParentID
  ON
    "c"."ParentID" = MJConversationDetail_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "c"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "c"."TestRunID" = MJTestRun_TestRunID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_conversation_detail_parent_id_get_root_id"(c."ID", c."ParentID") AS root_id
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
    AND tc.relname = 'vwConversationDetails'
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
    AND tc.relname = 'vwConversationDetails'
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
        AND tc.relname = 'vwConversationDetails'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwConversationDetails" CASCADE;
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
GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: spCreateConversationDetail
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ConversationDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateConversationDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetail"(
    p_id uuid DEFAULT NULL,
    p_conversationid uuid DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_message text DEFAULT NULL,
    p_error_clear boolean DEFAULT false,
    p_error text DEFAULT NULL,
    p_hiddentouser BOOLEAN DEFAULT NULL,
    p_userrating_clear boolean DEFAULT false,
    p_userrating integer DEFAULT NULL,
    p_userfeedback_clear boolean DEFAULT false,
    p_userfeedback text DEFAULT NULL,
    p_reflectioninsights_clear boolean DEFAULT false,
    p_reflectioninsights text DEFAULT NULL,
    p_summaryofearlierconversation_clear boolean DEFAULT false,
    p_summaryofearlierconversation text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_artifactid_clear boolean DEFAULT false,
    p_artifactid uuid DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid uuid DEFAULT NULL,
    p_completiontime_clear boolean DEFAULT false,
    p_completiontime bigint DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_suggestedresponses_clear boolean DEFAULT false,
    p_suggestedresponses text DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_responseform_clear boolean DEFAULT false,
    p_responseform text DEFAULT NULL,
    p_actionablecommands_clear boolean DEFAULT false,
    p_actionablecommands text DEFAULT NULL,
    p_automaticcommands_clear boolean DEFAULT false,
    p_automaticcommands text DEFAULT NULL,
    p_originalmessagechanged BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetails" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ConversationDetail"
        (
            "ID",
            "ConversationID",
                "ExternalID",
                "Role",
                "Message",
                "Error",
                "HiddenToUser",
                "UserRating",
                "UserFeedback",
                "ReflectionInsights",
                "SummaryOfEarlierConversation",
                "UserID",
                "ArtifactID",
                "ArtifactVersionID",
                "CompletionTime",
                "IsPinned",
                "ParentID",
                "AgentID",
                "Status",
                "SuggestedResponses",
                "TestRunID",
                "ResponseForm",
                "ActionableCommands",
                "AutomaticCommands",
                "OriginalMessageChanged"
        )
    VALUES
        (
            v_new_id,
            p_conversationid,
                CASE WHEN p_externalid_clear = true THEN NULL ELSE COALESCE(p_externalid, NULL) END,
                COALESCE(p_role, 'current_user'),
                p_message,
                CASE WHEN p_error_clear = true THEN NULL ELSE COALESCE(p_error, NULL) END,
                COALESCE(p_hiddentouser, FALSE),
                CASE WHEN p_userrating_clear = true THEN NULL ELSE COALESCE(p_userrating, NULL) END,
                CASE WHEN p_userfeedback_clear = true THEN NULL ELSE COALESCE(p_userfeedback, NULL) END,
                CASE WHEN p_reflectioninsights_clear = true THEN NULL ELSE COALESCE(p_reflectioninsights, NULL) END,
                CASE WHEN p_summaryofearlierconversation_clear = true THEN NULL ELSE COALESCE(p_summaryofearlierconversation, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_artifactid_clear = true THEN NULL ELSE COALESCE(p_artifactid, NULL) END,
                CASE WHEN p_artifactversionid_clear = true THEN NULL ELSE COALESCE(p_artifactversionid, NULL) END,
                CASE WHEN p_completiontime_clear = true THEN NULL ELSE COALESCE(p_completiontime, NULL) END,
                COALESCE(p_ispinned, FALSE),
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, NULL) END,
                COALESCE(p_status, 'Complete'),
                CASE WHEN p_suggestedresponses_clear = true THEN NULL ELSE COALESCE(p_suggestedresponses, NULL) END,
                CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, NULL) END,
                CASE WHEN p_responseform_clear = true THEN NULL ELSE COALESCE(p_responseform, NULL) END,
                CASE WHEN p_actionablecommands_clear = true THEN NULL ELSE COALESCE(p_actionablecommands, NULL) END,
                CASE WHEN p_automaticcommands_clear = true THEN NULL ELSE COALESCE(p_automaticcommands, NULL) END,
                COALESCE(p_originalmessagechanged, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: spUpdateConversationDetail
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ConversationDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateConversationDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetail"(
    p_id uuid,
    p_conversationid uuid DEFAULT NULL,
    p_externalid_clear boolean DEFAULT false,
    p_externalid text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_message text DEFAULT NULL,
    p_error_clear boolean DEFAULT false,
    p_error text DEFAULT NULL,
    p_hiddentouser BOOLEAN DEFAULT NULL,
    p_userrating_clear boolean DEFAULT false,
    p_userrating integer DEFAULT NULL,
    p_userfeedback_clear boolean DEFAULT false,
    p_userfeedback text DEFAULT NULL,
    p_reflectioninsights_clear boolean DEFAULT false,
    p_reflectioninsights text DEFAULT NULL,
    p_summaryofearlierconversation_clear boolean DEFAULT false,
    p_summaryofearlierconversation text DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_artifactid_clear boolean DEFAULT false,
    p_artifactid uuid DEFAULT NULL,
    p_artifactversionid_clear boolean DEFAULT false,
    p_artifactversionid uuid DEFAULT NULL,
    p_completiontime_clear boolean DEFAULT false,
    p_completiontime bigint DEFAULT NULL,
    p_ispinned BOOLEAN DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid uuid DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_suggestedresponses_clear boolean DEFAULT false,
    p_suggestedresponses text DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_responseform_clear boolean DEFAULT false,
    p_responseform text DEFAULT NULL,
    p_actionablecommands_clear boolean DEFAULT false,
    p_actionablecommands text DEFAULT NULL,
    p_automaticcommands_clear boolean DEFAULT false,
    p_automaticcommands text DEFAULT NULL,
    p_originalmessagechanged BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwConversationDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ConversationDetail"
    SET
        "ConversationID" = COALESCE(p_conversationid, "ConversationID"),
        "ExternalID" = CASE WHEN p_externalid_clear = true THEN NULL ELSE COALESCE(p_externalid, "ExternalID") END,
        "Role" = COALESCE(p_role, "Role"),
        "Message" = COALESCE(p_message, "Message"),
        "Error" = CASE WHEN p_error_clear = true THEN NULL ELSE COALESCE(p_error, "Error") END,
        "HiddenToUser" = COALESCE(p_hiddentouser, "HiddenToUser"),
        "UserRating" = CASE WHEN p_userrating_clear = true THEN NULL ELSE COALESCE(p_userrating, "UserRating") END,
        "UserFeedback" = CASE WHEN p_userfeedback_clear = true THEN NULL ELSE COALESCE(p_userfeedback, "UserFeedback") END,
        "ReflectionInsights" = CASE WHEN p_reflectioninsights_clear = true THEN NULL ELSE COALESCE(p_reflectioninsights, "ReflectionInsights") END,
        "SummaryOfEarlierConversation" = CASE WHEN p_summaryofearlierconversation_clear = true THEN NULL ELSE COALESCE(p_summaryofearlierconversation, "SummaryOfEarlierConversation") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "ArtifactID" = CASE WHEN p_artifactid_clear = true THEN NULL ELSE COALESCE(p_artifactid, "ArtifactID") END,
        "ArtifactVersionID" = CASE WHEN p_artifactversionid_clear = true THEN NULL ELSE COALESCE(p_artifactversionid, "ArtifactVersionID") END,
        "CompletionTime" = CASE WHEN p_completiontime_clear = true THEN NULL ELSE COALESCE(p_completiontime, "CompletionTime") END,
        "IsPinned" = COALESCE(p_ispinned, "IsPinned"),
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "AgentID" = CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, "AgentID") END,
        "Status" = COALESCE(p_status, "Status"),
        "SuggestedResponses" = CASE WHEN p_suggestedresponses_clear = true THEN NULL ELSE COALESCE(p_suggestedresponses, "SuggestedResponses") END,
        "TestRunID" = CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, "TestRunID") END,
        "ResponseForm" = CASE WHEN p_responseform_clear = true THEN NULL ELSE COALESCE(p_responseform, "ResponseForm") END,
        "ActionableCommands" = CASE WHEN p_actionablecommands_clear = true THEN NULL ELSE COALESCE(p_actionablecommands, "ActionableCommands") END,
        "AutomaticCommands" = CASE WHEN p_automaticcommands_clear = true THEN NULL ELSE COALESCE(p_automaticcommands, "AutomaticCommands") END,
        "OriginalMessageChanged" = COALESCE(p_originalmessagechanged, "OriginalMessageChanged")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_conversation_detail"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_conversation_detail" ON __mj."ConversationDetail";

CREATE TRIGGER "trg_update_conversation_detail"
BEFORE UPDATE ON __mj."ConversationDetail"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_conversation_detail"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Conversation Details
-- Item: spDeleteConversationDetail
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ConversationDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteConversationDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetail"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "SourceConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentExample"
        SET "SourceConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "SourceConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "SourceConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Artifacts records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetailArtifact"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationDetailArtifact"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Attachments records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetailAttachment"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationDetailAttachment"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Detail Ratings records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetailRating"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationDetailRating"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ConversationDetail"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Reports.ConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Report"
        WHERE "ConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Report"
        SET "ConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.ConversationDetailID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Task"
        WHERE "ConversationDetailID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Task"
        SET "ConversationDetailID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."ConversationDetail"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Integration";
