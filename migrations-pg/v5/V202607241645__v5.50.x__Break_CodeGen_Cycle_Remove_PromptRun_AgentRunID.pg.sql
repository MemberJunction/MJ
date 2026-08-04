-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202607241645__v5.50.x__Break_CodeGen_Cycle_Remove_PromptRun_AgentRunID.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — resolve before relying on this migration ══╗
-- UNHANDLED BY THE AST TRANSPILER (4 statement(s)):
--   [1] (IF-EXISTS-BEGIN) IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ConversationDetail_Su
--   [2] (IF-EXISTS-BEGIN) IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation
--   [3] (IF-EXISTS-BEGIN) IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_AIPromptRun_AgentRunI
--   [4] (IF-EXISTS-BEGIN) IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_
--   Each statement above was REPORTED, not silently dropped — port it manually.
-- ╚════════════════════════════════════════════════════════════════╝

/* ******************************************************************************
 * Break CodeGen FK Cycle: AI Agent Runs ↔ AI Prompt Runs ↔ Conversation Details
 *
 * CodeGen detected a cycle:
 *   AIAgentRun.ConversationDetailID → ConversationDetail
 *   ConversationDetail.SummaryPromptRunID → AIPromptRun
 *   AIPromptRun.AgentRunID → AIAgentRun
 *
 * This migration breaks the cycle by:
 *   1. Moving SummaryPromptRunID out of ConversationDetail into a dedicated
 *      ConversationCompactionRun join table (audit-only, 1:1).
 *   2. Dropping AgentRunID from AIPromptRun entirely — the relationship is
 *      derivable through AIAgentRunStep.TargetLogID for prompt-type steps,
 *      and callers will use a cached helper instead of the denormalized FK.
 ***************************************************************************** */
/* ============================================================================ */
/* PART 1: Create ConversationCompactionRun table and migrate data */
/* ============================================================================ */
CREATE TABLE __mj."ConversationCompactionRun" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "ConversationDetailID" UUID NOT NULL,
  "PromptRunID" UUID NOT NULL,
  CONSTRAINT "PK_ConversationCompactionRun" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_ConversationCompactionRun_ConversationDetail" FOREIGN KEY ("ConversationDetailID") REFERENCES __mj."ConversationDetail" (
    "ID"
  ),
  CONSTRAINT "FK_ConversationCompactionRun_PromptRun" FOREIGN KEY ("PromptRunID") REFERENCES __mj."AIPromptRun" (
    "ID"
  ),
  CONSTRAINT "UQ_ConversationCompactionRun_ConversationDetail" UNIQUE (
    "ConversationDetailID"
  )
);

/* Migrate existing data before dropping the column */
INSERT INTO __mj."ConversationCompactionRun" (
  "ConversationDetailID",
  "PromptRunID"
)
SELECT
  "ID",
  "SummaryPromptRunID"
FROM __mj."ConversationDetail"
WHERE
  NOT "SummaryPromptRunID" IS NULL;

/* Hand-authored: the T-SQL `IF EXISTS (SELECT 1 FROM sys.foreign_keys/sys.indexes)`
   guards have no PostgreSQL equivalent, so the transpiler dropped both statements
   entirely (conversion gaps [1] and [2] -- they appear in the header list but were
   absent from the body). PostgreSQL needs no guard: IF EXISTS is built into the DDL. */
ALTER TABLE __mj."ConversationDetail" DROP CONSTRAINT IF EXISTS "FK_ConversationDetail_SummaryPromptRun";
DROP INDEX IF EXISTS __mj."IDX_AUTO_MJ_FKEY_ConversationDetail_SummaryPromptRunID";

/* Hand-authored: PostgreSQL holds a HARD dependency from a view to the columns it
   selects, so DROP COLUMN fails while the base view exists ("cannot drop column X
   because other objects depend on it"). SQL Server allows it because its views are
   not schema-bound. CASCADE also removes the CRUD functions that depend on the view
   type. The inline CodeGen bake later in this migration recreates the view and its
   functions from the post-drop schema. */
DROP VIEW IF EXISTS __mj."vwConversationDetails" CASCADE;

ALTER TABLE __mj."ConversationDetail"
DROP COLUMN "SummaryPromptRunID" /* Drop the column itself */;

/* Clean up EntityField and EntityRelationship metadata for the dropped columns. */
/* Normally spDeleteUnneededEntityFields handles EntityField cleanup, but it runs */
/* in R__RefreshMetadata.sql which recompiles views first — views that still */
/* reference these dropped columns. Deleting the metadata here breaks the cycle */
/* so CodeGen regenerates correct views/procs without the dropped columns. */
/* SummaryPromptRunID EntityField on ConversationDetail */
DELETE FROM __mj."EntityField"
WHERE
  "ID" = '3cdfa3a7-9e68-42ca-845d-de71b0f29988';

/* SummaryPromptRunID EntityRelationship */
DELETE FROM __mj."EntityRelationship"
WHERE
  "ID" = '02b70fe0-9d31-4d66-b8c4-a1ee87403c7f';

/* Hand-authored: also drop the DENORMALISED NAME fields for the two dropped FKs.
   CodeGen exposes a related-record name column alongside every FK ("SummaryPromptRun"
   for SummaryPromptRunID, "AgentRun" for AgentRunID). Dropping the FK removes those
   columns from the regenerated base views, but their EntityField rows survive -- the
   SQL Server side clears them through its own CodeGen path, which this conversion does
   not carry. Left behind, RunView emits SELECT "AgentRun" against a view that no longer
   has the column and every read of MJ: AI Prompt Runs / MJ: Conversation Details fails
   with `column "AgentRun" does not exist`. Matched by name rather than by hardcoded ID
   because these rows are generated per-database. */
DELETE FROM __mj."EntityField" ef
USING __mj."Entity" e
WHERE ef."EntityID" = e."ID"
  AND e."Name" = 'MJ: Conversation Details'
  AND ef."Name" = 'SummaryPromptRun';

DELETE FROM __mj."EntityField" ef
USING __mj."Entity" e
WHERE ef."EntityID" = e."ID"
  AND e."Name" = 'MJ: AI Prompt Runs'
  AND ef."Name" = 'AgentRun';

/* AgentRunID EntityField on AIPromptRun */
DELETE FROM __mj."EntityField"
WHERE
  "ID" = '3527B188-23DD-4C21-8716-BD17A5E05BB5';

/* AgentRunID EntityRelationship */
DELETE FROM __mj."EntityRelationship"
WHERE
  "ID" = '5D3C8533-DE96-4139-BDB9-86F122C940EB';

/* Hand-authored: same IF-EXISTS guard removal as above (conversion gaps [3] and [4]). */
ALTER TABLE __mj."AIPromptRun" DROP CONSTRAINT IF EXISTS "FK_AIPromptRun_AgentRunID";
DROP INDEX IF EXISTS __mj."IDX_AUTO_MJ_FKEY_AIPromptRun_AgentRunID";

/* Hand-authored: same view-dependency removal as above, for AIPromptRun. */
DROP VIEW IF EXISTS __mj."vwAIPromptRuns" CASCADE;

ALTER TABLE __mj."AIPromptRun"
DROP COLUMN "AgentRunID" /* Drop the column */;

COMMENT ON TABLE __mj."ConversationCompactionRun" IS 'Links a conversation detail boundary row to the AI Prompt Run that produced its compaction summary. Audit-only join table replacing the former ConversationDetail.SummaryPromptRunID FK to break the CodeGen cycle.';

COMMENT ON COLUMN __mj."ConversationCompactionRun"."ConversationDetailID" IS 'The conversation detail row whose SummaryOfEarlierConversation was produced by this compaction run.';

COMMENT ON COLUMN __mj."ConversationCompactionRun"."PromptRunID" IS 'The AI Prompt Run that generated the compaction summary (model, tokens, cost, prompt version).';

/* ******************************************************************************
 * EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * It contains:
 *   - New Entity registration (MJ: Conversation Compaction Runs)
 *   - EntityField inserts for new/modified entities
 *   - Regenerated views (vwAIPromptRuns, vwConversationDetails, vwConversationCompactionRuns)
 *   - Regenerated stored procedures (spCreate/spUpdate/spDelete for affected entities)
 *   - Permission grants
 *   - Extended properties
 *
 * DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen
 * and replace this entire section.
 ***************************************************************************** */
/* SQL generated to create new entity MJ: Conversation Compaction Runs */
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
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '08794d87-cfbf-480e-aa91-b2e76a4fc8a2',
    'MJ: Conversation Compaction Runs',
    'Conversation Compaction Runs',
    'Links a conversation detail boundary row to the AI Prompt Run that produced its compaction summary. Audit-only join table replacing the former ConversationDetail.SummaryPromptRunID FK to break the CodeGen cycle.',
    NULL,
    'ConversationCompactionRun',
    'vwConversationCompactionRuns',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Conversation Compaction Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '08794d87-cfbf-480e-aa91-b2e76a4fc8a2',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Conversation Compaction Runs for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '08794d87-cfbf-480e-aa91-b2e76a4fc8a2',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Conversation Compaction Runs for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '08794d87-cfbf-480e-aa91-b2e76a4fc8a2',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Conversation Compaction Runs for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '08794d87-cfbf-480e-aa91-b2e76a4fc8a2',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
ALTER TABLE __mj."ConversationCompactionRun"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.ConversationCompactionRun */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ConversationCompactionRun */
UPDATE __mj."ConversationCompactionRun" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'ConversationCompactionRun' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ConversationCompactionRun" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ConversationCompactionRun" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ConversationCompactionRun"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.ConversationCompactionRun */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ConversationCompactionRun */
UPDATE __mj."ConversationCompactionRun" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'ConversationCompactionRun' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ConversationCompactionRun" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ConversationCompactionRun" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5ea9373f-bab9-4935-837f-8eda1b7406ea' OR ("EntityID" = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5ea9373f-bab9-4935-837f-8eda1b7406ea', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' /* Entity: MJ: Conversation Compaction Runs */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b65d6fe8-b3f5-4bf9-b4b7-cfe536d50d93' OR ("EntityID" = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND "Name" = 'ConversationDetailID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b65d6fe8-b3f5-4bf9-b4b7-cfe536d50d93', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' /* Entity: MJ: Conversation Compaction Runs */, 100002, 'ConversationDetailID', 'Conversation Detail ID', 'The conversation detail row whose SummaryOfEarlierConversation was produced by this compaction run.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '12248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '91226f06-c330-4876-a609-22df823b12e3' OR ("EntityID" = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND "Name" = 'PromptRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('91226f06-c330-4876-a609-22df823b12e3', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' /* Entity: MJ: Conversation Compaction Runs */, 100003, 'PromptRunID', 'Prompt Run ID', 'The AI Prompt Run that generated the compaction summary (model, tokens, cost, prompt version).', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '18910db4-523e-448f-a70f-36ddaf311049' OR ("EntityID" = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('18910db4-523e-448f-a70f-36ddaf311049', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' /* Entity: MJ: Conversation Compaction Runs */, 100004, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '129d7129-ef0f-42aa-9abb-02256527d3d2' OR ("EntityID" = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('129d7129-ef0f-42aa-9abb-02256527d3d2', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' /* Entity: MJ: Conversation Compaction Runs */, 100005, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '93892e5b-ff6b-41ef-8f29-5e8c2ac123e2') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('93892e5b-ff6b-41ef-8f29-5e8c2ac123e2', '12248F34-2837-EF11-86D4-6045BDEE16E6', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', 'ConversationDetailID', 'One To Many', TRUE, TRUE, 10, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b04cc697-83f9-413a-9fe8-80d70eb57b43') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b04cc697-83f9-413a-9fe8-80d70eb57b43', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', 'PromptRunID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '05f93498-5ca0-4489-8158-9912462b216b' OR ("EntityID" = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND "Name" = 'ConversationDetail')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('05f93498-5ca0-4489-8158-9912462b216b', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' /* Entity: MJ: Conversation Compaction Runs */, 200011, 'ConversationDetail', 'Conversation Detail', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad330717-a88f-44be-b066-88246522554e' OR ("EntityID" = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' AND "Name" = 'PromptRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad330717-a88f-44be-b066-88246522554e', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2' /* Entity: MJ: Conversation Compaction Runs */, 200012, 'PromptRun', 'Prompt Run', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '18910DB4-523E-448F-A70F-36DDAF311049'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '05F93498-5CA0-4489-8158-9912462B216B'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'AD330717-A88F-44BE-B066-88246522554E'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '05F93498-5CA0-4489-8158-9912462B216B'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'AD330717-A88F-44BE-B066-88246522554E'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

/* Set categories for 7 fields */
/* UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5EA9373F-BAB9-4935-837F-8EDA1B7406EA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.ConversationDetailID */
UPDATE __mj."EntityField" SET "Category" = 'Relationship Mapping', "GeneratedFormSection" = 'Category', "DisplayName" = 'Conversation Detail', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B65D6FE8-B3F5-4BF9-B4B7-CFE536D50D93' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.PromptRunID */
UPDATE __mj."EntityField" SET "Category" = 'Relationship Mapping', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt Run', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '91226F06-C330-4876-A609-22DF823B12E3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.ConversationDetail */
UPDATE __mj."EntityField" SET "Category" = 'Relationship Mapping', "GeneratedFormSection" = 'Category', "DisplayName" = 'Conversation Detail Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '05F93498-5CA0-4489-8158-9912462B216B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.PromptRun */
UPDATE __mj."EntityField" SET "Category" = 'Relationship Mapping', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt Run Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AD330717-A88F-44BE-B066-88246522554E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '18910DB4-523E-448F-A70F-36DDAF311049' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Conversation Compaction Runs.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '129D7129-EF0F-42AA-9ABB-02256527D3D2' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-link */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-link', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '41794bdb-1bdd-409d-8398-0333a2abd8ef',
    '08794D87-CFBF-480E-AA91-B2E76A4FC8A2',
    'FieldCategoryInfo',
    '{"Relationship Mapping":{"icon":"fa fa-link","description":"Links between conversation details and their AI compaction prompt runs"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '564866a2-b157-46b5-a6c3-b829b537aec0',
    '08794D87-CFBF-480E-AA91-B2E76A4FC8A2',
    'FieldCategoryIcons',
    '{"Relationship Mapping":"fa fa-link","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '08794D87-CFBF-480E-AA91-B2E76A4FC8A2';


/* ============================================================================ */
/* CodeGen (native PG, baked) -- hand-captured                                  */
/*                                                                             */
/* The --split converter halted on this migration's IF-EXISTS gaps and never   */
/* reached its CodeGen bake, so the views + CRUD functions for the three        */
/* entities this migration reshapes were missing. `mj migrate rebake` refuses   */
/* the file ("transpile gap -- committed preserved"), so the objects below were */
/* captured from a PostgreSQL database advanced through this migration and      */
/* regenerated by native `mj codegen`. Views come first: spCreate/spUpdate      */
/* RETURN the view type, so the functions cannot be created before it exists.   */
/* ============================================================================ */

/* ---------- VIEW vwAIPromptRuns ---------- */
CREATE OR REPLACE VIEW __mj."vwAIPromptRuns" AS
 SELECT a."ID",
    a."PromptID",
    a."ModelID",
    a."VendorID",
    a."AgentID",
    a."ConfigurationID",
    a."RunAt",
    a."CompletedAt",
    a."ExecutionTimeMS",
    a."Messages",
    a."Result",
    a."TokensUsed",
    a."TokensPrompt",
    a."TokensCompletion",
    a."TotalCost",
    a."Success",
    a."ErrorMessage",
    a."__mj_CreatedAt",
    a."__mj_UpdatedAt",
    a."ParentID",
    a."RunType",
    a."ExecutionOrder",
    a."Cost",
    a."CostCurrency",
    a."TokensUsedRollup",
    a."TokensPromptRollup",
    a."TokensCompletionRollup",
    a."Temperature",
    a."TopP",
    a."TopK",
    a."MinP",
    a."FrequencyPenalty",
    a."PresencePenalty",
    a."Seed",
    a."StopSequences",
    a."ResponseFormat",
    a."LogProbs",
    a."TopLogProbs",
    a."DescendantCost",
    a."ValidationAttemptCount",
    a."SuccessfulValidationCount",
    a."FinalValidationPassed",
    a."ValidationBehavior",
    a."RetryStrategy",
    a."MaxRetriesConfigured",
    a."FinalValidationError",
    a."ValidationErrorCount",
    a."CommonValidationError",
    a."FirstAttemptAt",
    a."LastAttemptAt",
    a."TotalRetryDurationMS",
    a."ValidationAttempts",
    a."ValidationSummary",
    a."FailoverAttempts",
    a."FailoverErrors",
    a."FailoverDurations",
    a."OriginalModelID",
    a."OriginalRequestStartTime",
    a."TotalFailoverDuration",
    a."RerunFromPromptRunID",
    a."ModelSelection",
    a."Status",
    a."Cancelled",
    a."CancellationReason",
    a."ModelPowerRank",
    a."SelectionStrategy",
    a."CacheHit",
    a."CacheKey",
    a."JudgeID",
    a."JudgeScore",
    a."WasSelectedResult",
    a."StreamingEnabled",
    a."FirstTokenTime",
    a."ErrorDetails",
    a."ChildPromptID",
    a."QueueTime",
    a."PromptTime",
    a."CompletionTime",
    a."ModelSpecificResponseDetails",
    a."EffortLevel",
    a."RunName",
    a."Comments",
    a."TestRunID",
    a."AssistantPrefill",
    a."TokensCacheRead",
    a."TokensCacheWrite",
    a."TokensCacheReadRollup",
    a."TokensCacheWriteRollup",
    mjaiprompt_promptid."Name" AS "Prompt",
    mjaimodel_modelid."Name" AS "Model",
    mjaivendor_vendorid."Name" AS "Vendor",
    mjaiagent_agentid."Name" AS "Agent",
    mjaiconfiguration_configurationid."Name" AS "Configuration",
    mjaipromptrun_parentid."RunName" AS "Parent",
    mjaimodel_originalmodelid."Name" AS "OriginalModel",
    mjaipromptrun_rerunfrompromptrunid."RunName" AS "RerunFromPromptRun",
    mjaiprompt_judgeid."Name" AS "Judge",
    mjaiprompt_childpromptid."Name" AS "ChildPrompt",
    mjtestrun_testrunid."Test" AS "TestRun",
    root_parentid.root_id AS "RootParentID",
    root_rerunfrompromptrunid.root_id AS "RootRerunFromPromptRunID"
   FROM __mj."AIPromptRun" a
     JOIN __mj."AIPrompt" mjaiprompt_promptid ON a."PromptID" = mjaiprompt_promptid."ID"
     JOIN __mj."AIModel" mjaimodel_modelid ON a."ModelID" = mjaimodel_modelid."ID"
     JOIN __mj."AIVendor" mjaivendor_vendorid ON a."VendorID" = mjaivendor_vendorid."ID"
     LEFT JOIN __mj."AIAgent" mjaiagent_agentid ON a."AgentID" = mjaiagent_agentid."ID"
     LEFT JOIN __mj."AIConfiguration" mjaiconfiguration_configurationid ON a."ConfigurationID" = mjaiconfiguration_configurationid."ID"
     LEFT JOIN __mj."AIPromptRun" mjaipromptrun_parentid ON a."ParentID" = mjaipromptrun_parentid."ID"
     LEFT JOIN __mj."AIModel" mjaimodel_originalmodelid ON a."OriginalModelID" = mjaimodel_originalmodelid."ID"
     LEFT JOIN __mj."AIPromptRun" mjaipromptrun_rerunfrompromptrunid ON a."RerunFromPromptRunID" = mjaipromptrun_rerunfrompromptrunid."ID"
     LEFT JOIN __mj."AIPrompt" mjaiprompt_judgeid ON a."JudgeID" = mjaiprompt_judgeid."ID"
     LEFT JOIN __mj."AIPrompt" mjaiprompt_childpromptid ON a."ChildPromptID" = mjaiprompt_childpromptid."ID"
     LEFT JOIN __mj."vwTestRuns" mjtestrun_testrunid ON a."TestRunID" = mjtestrun_testrunid."ID"
     LEFT JOIN LATERAL ( SELECT __mj.fn_ai_prompt_run_parent_id_get_root_id(a."ID", a."ParentID") AS root_id) root_parentid ON true
     LEFT JOIN LATERAL ( SELECT __mj.fn_ai_prompt_run_rerun_from_prompt_run_id_get_root_id(a."ID", a."RerunFromPromptRunID") AS root_id) root_rerunfrompromptrunid ON true;

GRANT SELECT ON __mj."vwAIPromptRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIPromptRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIPromptRuns" TO "cdp_Integration";

/* ---------- VIEW vwConversationCompactionRuns ---------- */
CREATE OR REPLACE VIEW __mj."vwConversationCompactionRuns" AS
 SELECT c."ID",
    c."ConversationDetailID",
    c."PromptRunID",
    c."__mj_CreatedAt",
    c."__mj_UpdatedAt",
    mjconversationdetail_conversationdetailid."ExternalID" AS "ConversationDetail",
    mjaipromptrun_promptrunid."RunName" AS "PromptRun"
   FROM __mj."ConversationCompactionRun" c
     JOIN __mj."ConversationDetail" mjconversationdetail_conversationdetailid ON c."ConversationDetailID" = mjconversationdetail_conversationdetailid."ID"
     JOIN __mj."AIPromptRun" mjaipromptrun_promptrunid ON c."PromptRunID" = mjaipromptrun_promptrunid."ID";

GRANT SELECT ON __mj."vwConversationCompactionRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversationCompactionRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversationCompactionRuns" TO "cdp_Integration";

/* ---------- VIEW vwConversationDetails ---------- */
CREATE OR REPLACE VIEW __mj."vwConversationDetails" AS
 SELECT c."ID",
    c."ConversationID",
    c."ExternalID",
    c."Role",
    c."Message",
    c."Error",
    c."HiddenToUser",
    c."__mj_CreatedAt",
    c."__mj_UpdatedAt",
    c."UserRating",
    c."UserFeedback",
    c."ReflectionInsights",
    c."SummaryOfEarlierConversation",
    c."UserID",
    c."ArtifactID",
    c."ArtifactVersionID",
    c."CompletionTime",
    c."IsPinned",
    c."ParentID",
    c."AgentID",
    c."Status",
    c."SuggestedResponses",
    c."TestRunID",
    c."ResponseForm",
    c."ActionableCommands",
    c."AutomaticCommands",
    c."OriginalMessageChanged",
    c."AgentSessionID",
    c."TurnEndedAt",
    c."UtteranceStartMs",
    c."UtteranceEndMs",
    c."MediaType",
    c."Sequence",
    mjconversation_conversationid."Name" AS "Conversation",
    mjuser_userid."Name" AS "User",
    mjconversationartifact_artifactid."Name" AS "Artifact",
    mjconversationartifactversion_artifactversionid."ConversationArtifact" AS "ArtifactVersion",
    mjconversationdetail_parentid."ExternalID" AS "Parent",
    mjaiagent_agentid."Name" AS "Agent",
    mjtestrun_testrunid."Test" AS "TestRun",
    root_parentid.root_id AS "RootParentID"
   FROM __mj."ConversationDetail" c
     JOIN __mj."Conversation" mjconversation_conversationid ON c."ConversationID" = mjconversation_conversationid."ID"
     LEFT JOIN __mj."User" mjuser_userid ON c."UserID" = mjuser_userid."ID"
     LEFT JOIN __mj."ConversationArtifact" mjconversationartifact_artifactid ON c."ArtifactID" = mjconversationartifact_artifactid."ID"
     LEFT JOIN __mj."vwConversationArtifactVersions" mjconversationartifactversion_artifactversionid ON c."ArtifactVersionID" = mjconversationartifactversion_artifactversionid."ID"
     LEFT JOIN __mj."ConversationDetail" mjconversationdetail_parentid ON c."ParentID" = mjconversationdetail_parentid."ID"
     LEFT JOIN __mj."AIAgent" mjaiagent_agentid ON c."AgentID" = mjaiagent_agentid."ID"
     LEFT JOIN __mj."vwTestRuns" mjtestrun_testrunid ON c."TestRunID" = mjtestrun_testrunid."ID"
     LEFT JOIN LATERAL ( SELECT __mj.fn_conversation_detail_parent_id_get_root_id(c."ID", c."ParentID") AS root_id) root_parentid ON true;

GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_UI";
GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_Developer";
GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_Integration";

/* ---------- FUNCTION spCreateAIPromptRun ---------- */
CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptRun"(p_data jsonb)
 RETURNS SETOF __mj."vwAIPromptRuns"
 LANGUAGE plpgsql
AS $function$
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
    FOREACH v_field_name IN ARRAY ARRAY['PromptID', 'ModelID', 'VendorID', 'AgentID', 'ConfigurationID', 'RunAt', 'CompletedAt', 'ExecutionTimeMS', 'Messages', 'Result', 'TokensUsed', 'TokensPrompt', 'TokensCompletion', 'TotalCost', 'Success', 'ErrorMessage', 'ParentID', 'RunType', 'ExecutionOrder', 'Cost', 'CostCurrency', 'TokensUsedRollup', 'TokensPromptRollup', 'TokensCompletionRollup', 'Temperature', 'TopP', 'TopK', 'MinP', 'FrequencyPenalty', 'PresencePenalty', 'Seed', 'StopSequences', 'ResponseFormat', 'LogProbs', 'TopLogProbs', 'DescendantCost', 'ValidationAttemptCount', 'SuccessfulValidationCount', 'FinalValidationPassed', 'ValidationBehavior', 'RetryStrategy', 'MaxRetriesConfigured', 'FinalValidationError', 'ValidationErrorCount', 'CommonValidationError', 'FirstAttemptAt', 'LastAttemptAt', 'TotalRetryDurationMS', 'ValidationAttempts', 'ValidationSummary', 'FailoverAttempts', 'FailoverErrors', 'FailoverDurations', 'OriginalModelID', 'OriginalRequestStartTime', 'TotalFailoverDuration', 'RerunFromPromptRunID', 'ModelSelection', 'Status', 'Cancelled', 'CancellationReason', 'ModelPowerRank', 'SelectionStrategy', 'CacheHit', 'CacheKey', 'JudgeID', 'JudgeScore', 'WasSelectedResult', 'StreamingEnabled', 'FirstTokenTime', 'ErrorDetails', 'ChildPromptID', 'QueueTime', 'PromptTime', 'CompletionTime', 'ModelSpecificResponseDetails', 'EffortLevel', 'RunName', 'Comments', 'TestRunID', 'AssistantPrefill', 'TokensCacheRead', 'TokensCacheWrite', 'TokensCacheReadRollup', 'TokensCacheWriteRollup']
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
        WHEN 'ExecutionTimeMS' THEN '($1->>''ExecutionTimeMS'')::INT'
        WHEN 'Messages' THEN '($1->>''Messages'')'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'TokensUsed' THEN '($1->>''TokensUsed'')::INT'
        WHEN 'TokensPrompt' THEN '($1->>''TokensPrompt'')::INT'
        WHEN 'TokensCompletion' THEN '($1->>''TokensCompletion'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'Success' THEN 'COALESCE(($1->>''Success'')::BOOLEAN, FALSE)'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'RunType' THEN 'COALESCE(($1->>''RunType''), ''Single'')'
        WHEN 'ExecutionOrder' THEN '($1->>''ExecutionOrder'')::INT'
        WHEN 'Cost' THEN '($1->>''Cost'')::DECIMAL(19, 8)'
        WHEN 'CostCurrency' THEN '($1->>''CostCurrency'')'
        WHEN 'TokensUsedRollup' THEN '($1->>''TokensUsedRollup'')::INT'
        WHEN 'TokensPromptRollup' THEN '($1->>''TokensPromptRollup'')::INT'
        WHEN 'TokensCompletionRollup' THEN '($1->>''TokensCompletionRollup'')::INT'
        WHEN 'Temperature' THEN '($1->>''Temperature'')::DECIMAL(3, 2)'
        WHEN 'TopP' THEN '($1->>''TopP'')::DECIMAL(3, 2)'
        WHEN 'TopK' THEN '($1->>''TopK'')::INT'
        WHEN 'MinP' THEN '($1->>''MinP'')::DECIMAL(3, 2)'
        WHEN 'FrequencyPenalty' THEN '($1->>''FrequencyPenalty'')::DECIMAL(3, 2)'
        WHEN 'PresencePenalty' THEN '($1->>''PresencePenalty'')::DECIMAL(3, 2)'
        WHEN 'Seed' THEN '($1->>''Seed'')::INT'
        WHEN 'StopSequences' THEN '($1->>''StopSequences'')'
        WHEN 'ResponseFormat' THEN '($1->>''ResponseFormat'')'
        WHEN 'LogProbs' THEN '($1->>''LogProbs'')::BOOLEAN'
        WHEN 'TopLogProbs' THEN '($1->>''TopLogProbs'')::INT'
        WHEN 'DescendantCost' THEN '($1->>''DescendantCost'')::DECIMAL(18, 6)'
        WHEN 'ValidationAttemptCount' THEN '($1->>''ValidationAttemptCount'')::INT'
        WHEN 'SuccessfulValidationCount' THEN '($1->>''SuccessfulValidationCount'')::INT'
        WHEN 'FinalValidationPassed' THEN '($1->>''FinalValidationPassed'')::BOOLEAN'
        WHEN 'ValidationBehavior' THEN '($1->>''ValidationBehavior'')'
        WHEN 'RetryStrategy' THEN '($1->>''RetryStrategy'')'
        WHEN 'MaxRetriesConfigured' THEN '($1->>''MaxRetriesConfigured'')::INT'
        WHEN 'FinalValidationError' THEN '($1->>''FinalValidationError'')'
        WHEN 'ValidationErrorCount' THEN '($1->>''ValidationErrorCount'')::INT'
        WHEN 'CommonValidationError' THEN '($1->>''CommonValidationError'')'
        WHEN 'FirstAttemptAt' THEN '($1->>''FirstAttemptAt'')::TIMESTAMPTZ'
        WHEN 'LastAttemptAt' THEN '($1->>''LastAttemptAt'')::TIMESTAMPTZ'
        WHEN 'TotalRetryDurationMS' THEN '($1->>''TotalRetryDurationMS'')::INT'
        WHEN 'ValidationAttempts' THEN '($1->>''ValidationAttempts'')'
        WHEN 'ValidationSummary' THEN '($1->>''ValidationSummary'')'
        WHEN 'FailoverAttempts' THEN '($1->>''FailoverAttempts'')::INT'
        WHEN 'FailoverErrors' THEN '($1->>''FailoverErrors'')'
        WHEN 'FailoverDurations' THEN '($1->>''FailoverDurations'')'
        WHEN 'OriginalModelID' THEN '($1->>''OriginalModelID'')::UUID'
        WHEN 'OriginalRequestStartTime' THEN '($1->>''OriginalRequestStartTime'')::TIMESTAMPTZ'
        WHEN 'TotalFailoverDuration' THEN '($1->>''TotalFailoverDuration'')::INT'
        WHEN 'RerunFromPromptRunID' THEN '($1->>''RerunFromPromptRunID'')::UUID'
        WHEN 'ModelSelection' THEN '($1->>''ModelSelection'')'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'Cancelled' THEN 'COALESCE(($1->>''Cancelled'')::BOOLEAN, FALSE)'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'ModelPowerRank' THEN '($1->>''ModelPowerRank'')::INT'
        WHEN 'SelectionStrategy' THEN '($1->>''SelectionStrategy'')'
        WHEN 'CacheHit' THEN 'COALESCE(($1->>''CacheHit'')::BOOLEAN, FALSE)'
        WHEN 'CacheKey' THEN '($1->>''CacheKey'')'
        WHEN 'JudgeID' THEN '($1->>''JudgeID'')::UUID'
        WHEN 'JudgeScore' THEN '($1->>''JudgeScore'')::FLOAT(53)'
        WHEN 'WasSelectedResult' THEN 'COALESCE(($1->>''WasSelectedResult'')::BOOLEAN, FALSE)'
        WHEN 'StreamingEnabled' THEN 'COALESCE(($1->>''StreamingEnabled'')::BOOLEAN, FALSE)'
        WHEN 'FirstTokenTime' THEN '($1->>''FirstTokenTime'')::INT'
        WHEN 'ErrorDetails' THEN '($1->>''ErrorDetails'')'
        WHEN 'ChildPromptID' THEN '($1->>''ChildPromptID'')::UUID'
        WHEN 'QueueTime' THEN '($1->>''QueueTime'')::INT'
        WHEN 'PromptTime' THEN '($1->>''PromptTime'')::INT'
        WHEN 'CompletionTime' THEN '($1->>''CompletionTime'')::INT'
        WHEN 'ModelSpecificResponseDetails' THEN '($1->>''ModelSpecificResponseDetails'')'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'AssistantPrefill' THEN '($1->>''AssistantPrefill'')'
        WHEN 'TokensCacheRead' THEN '($1->>''TokensCacheRead'')::INT'
        WHEN 'TokensCacheWrite' THEN '($1->>''TokensCacheWrite'')::INT'
        WHEN 'TokensCacheReadRollup' THEN '($1->>''TokensCacheReadRollup'')::INT'
        WHEN 'TokensCacheWriteRollup' THEN '($1->>''TokensCacheWriteRollup'')::INT'
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
$function$
;

GRANT EXECUTE ON FUNCTION __mj."spCreateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIPromptRun" TO "cdp_Integration";

/* ---------- FUNCTION spCreateConversationCompactionRun ---------- */
CREATE OR REPLACE FUNCTION __mj."spCreateConversationCompactionRun"(p_id uuid DEFAULT NULL::uuid, p_conversationdetailid uuid DEFAULT NULL::uuid, p_promptrunid uuid DEFAULT NULL::uuid)
 RETURNS SETOF __mj."vwConversationCompactionRuns"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ConversationCompactionRun"
        (
            "ID",
            "ConversationDetailID",
                "PromptRunID"
        )
    VALUES
        (
            v_new_id,
            p_conversationdetailid,
                p_promptrunid
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversationCompactionRuns"
    WHERE "ID" = v_new_id;
END;
$function$
;

GRANT EXECUTE ON FUNCTION __mj."spCreateConversationCompactionRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationCompactionRun" TO "cdp_Integration";

/* ---------- FUNCTION spCreateConversationDetail ---------- */
CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetail"(p_id uuid DEFAULT NULL::uuid, p_conversationid uuid DEFAULT NULL::uuid, p_externalid_clear boolean DEFAULT false, p_externalid character varying DEFAULT NULL::character varying, p_role character varying DEFAULT NULL::character varying, p_message text DEFAULT NULL::text, p_error_clear boolean DEFAULT false, p_error text DEFAULT NULL::text, p_hiddentouser boolean DEFAULT NULL::boolean, p_userrating_clear boolean DEFAULT false, p_userrating integer DEFAULT NULL::integer, p_userfeedback_clear boolean DEFAULT false, p_userfeedback text DEFAULT NULL::text, p_reflectioninsights_clear boolean DEFAULT false, p_reflectioninsights text DEFAULT NULL::text, p_summaryofearlierconversation_clear boolean DEFAULT false, p_summaryofearlierconversation text DEFAULT NULL::text, p_userid_clear boolean DEFAULT false, p_userid uuid DEFAULT NULL::uuid, p_artifactid_clear boolean DEFAULT false, p_artifactid uuid DEFAULT NULL::uuid, p_artifactversionid_clear boolean DEFAULT false, p_artifactversionid uuid DEFAULT NULL::uuid, p_completiontime_clear boolean DEFAULT false, p_completiontime bigint DEFAULT NULL::bigint, p_ispinned boolean DEFAULT NULL::boolean, p_parentid_clear boolean DEFAULT false, p_parentid uuid DEFAULT NULL::uuid, p_agentid_clear boolean DEFAULT false, p_agentid uuid DEFAULT NULL::uuid, p_status character varying DEFAULT NULL::character varying, p_suggestedresponses_clear boolean DEFAULT false, p_suggestedresponses text DEFAULT NULL::text, p_testrunid_clear boolean DEFAULT false, p_testrunid uuid DEFAULT NULL::uuid, p_responseform_clear boolean DEFAULT false, p_responseform text DEFAULT NULL::text, p_actionablecommands_clear boolean DEFAULT false, p_actionablecommands text DEFAULT NULL::text, p_automaticcommands_clear boolean DEFAULT false, p_automaticcommands text DEFAULT NULL::text, p_originalmessagechanged boolean DEFAULT NULL::boolean, p_agentsessionid_clear boolean DEFAULT false, p_agentsessionid uuid DEFAULT NULL::uuid, p_turnendedat_clear boolean DEFAULT false, p_turnendedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_utterancestartms_clear boolean DEFAULT false, p_utterancestartms integer DEFAULT NULL::integer, p_utteranceendms_clear boolean DEFAULT false, p_utteranceendms integer DEFAULT NULL::integer, p_mediatype_clear boolean DEFAULT false, p_mediatype character varying DEFAULT NULL::character varying)
 RETURNS SETOF __mj."vwConversationDetails"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
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
                "OriginalMessageChanged",
                "AgentSessionID",
                "TurnEndedAt",
                "UtteranceStartMs",
                "UtteranceEndMs",
                "MediaType"
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
                COALESCE(p_originalmessagechanged, FALSE),
                CASE WHEN p_agentsessionid_clear = true THEN NULL ELSE COALESCE(p_agentsessionid, NULL) END,
                CASE WHEN p_turnendedat_clear = true THEN NULL ELSE COALESCE(p_turnendedat, NULL) END,
                CASE WHEN p_utterancestartms_clear = true THEN NULL ELSE COALESCE(p_utterancestartms, NULL) END,
                CASE WHEN p_utteranceendms_clear = true THEN NULL ELSE COALESCE(p_utteranceendms, NULL) END,
                CASE WHEN p_mediatype_clear = true THEN NULL ELSE COALESCE(p_mediatype, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwConversationDetails"
    WHERE "ID" = v_new_id;
END;
$function$
;

GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_Integration";

/* ---------- FUNCTION spUpdateAIPromptRun ---------- */
CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptRun"(p_data jsonb)
 RETURNS SETOF __mj."vwAIPromptRuns"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
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
        "ExecutionTimeMS" = CASE WHEN p_data ? 'ExecutionTimeMS' THEN (p_data->>'ExecutionTimeMS')::INT ELSE "ExecutionTimeMS" END,
        "Messages" = CASE WHEN p_data ? 'Messages' THEN (p_data->>'Messages') ELSE "Messages" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "TokensUsed" = CASE WHEN p_data ? 'TokensUsed' THEN (p_data->>'TokensUsed')::INT ELSE "TokensUsed" END,
        "TokensPrompt" = CASE WHEN p_data ? 'TokensPrompt' THEN (p_data->>'TokensPrompt')::INT ELSE "TokensPrompt" END,
        "TokensCompletion" = CASE WHEN p_data ? 'TokensCompletion' THEN (p_data->>'TokensCompletion')::INT ELSE "TokensCompletion" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "RunType" = CASE WHEN p_data ? 'RunType' THEN (p_data->>'RunType') ELSE "RunType" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INT ELSE "ExecutionOrder" END,
        "Cost" = CASE WHEN p_data ? 'Cost' THEN (p_data->>'Cost')::DECIMAL(19, 8) ELSE "Cost" END,
        "CostCurrency" = CASE WHEN p_data ? 'CostCurrency' THEN (p_data->>'CostCurrency') ELSE "CostCurrency" END,
        "TokensUsedRollup" = CASE WHEN p_data ? 'TokensUsedRollup' THEN (p_data->>'TokensUsedRollup')::INT ELSE "TokensUsedRollup" END,
        "TokensPromptRollup" = CASE WHEN p_data ? 'TokensPromptRollup' THEN (p_data->>'TokensPromptRollup')::INT ELSE "TokensPromptRollup" END,
        "TokensCompletionRollup" = CASE WHEN p_data ? 'TokensCompletionRollup' THEN (p_data->>'TokensCompletionRollup')::INT ELSE "TokensCompletionRollup" END,
        "Temperature" = CASE WHEN p_data ? 'Temperature' THEN (p_data->>'Temperature')::DECIMAL(3, 2) ELSE "Temperature" END,
        "TopP" = CASE WHEN p_data ? 'TopP' THEN (p_data->>'TopP')::DECIMAL(3, 2) ELSE "TopP" END,
        "TopK" = CASE WHEN p_data ? 'TopK' THEN (p_data->>'TopK')::INT ELSE "TopK" END,
        "MinP" = CASE WHEN p_data ? 'MinP' THEN (p_data->>'MinP')::DECIMAL(3, 2) ELSE "MinP" END,
        "FrequencyPenalty" = CASE WHEN p_data ? 'FrequencyPenalty' THEN (p_data->>'FrequencyPenalty')::DECIMAL(3, 2) ELSE "FrequencyPenalty" END,
        "PresencePenalty" = CASE WHEN p_data ? 'PresencePenalty' THEN (p_data->>'PresencePenalty')::DECIMAL(3, 2) ELSE "PresencePenalty" END,
        "Seed" = CASE WHEN p_data ? 'Seed' THEN (p_data->>'Seed')::INT ELSE "Seed" END,
        "StopSequences" = CASE WHEN p_data ? 'StopSequences' THEN (p_data->>'StopSequences') ELSE "StopSequences" END,
        "ResponseFormat" = CASE WHEN p_data ? 'ResponseFormat' THEN (p_data->>'ResponseFormat') ELSE "ResponseFormat" END,
        "LogProbs" = CASE WHEN p_data ? 'LogProbs' THEN (p_data->>'LogProbs')::BOOLEAN ELSE "LogProbs" END,
        "TopLogProbs" = CASE WHEN p_data ? 'TopLogProbs' THEN (p_data->>'TopLogProbs')::INT ELSE "TopLogProbs" END,
        "DescendantCost" = CASE WHEN p_data ? 'DescendantCost' THEN (p_data->>'DescendantCost')::DECIMAL(18, 6) ELSE "DescendantCost" END,
        "ValidationAttemptCount" = CASE WHEN p_data ? 'ValidationAttemptCount' THEN (p_data->>'ValidationAttemptCount')::INT ELSE "ValidationAttemptCount" END,
        "SuccessfulValidationCount" = CASE WHEN p_data ? 'SuccessfulValidationCount' THEN (p_data->>'SuccessfulValidationCount')::INT ELSE "SuccessfulValidationCount" END,
        "FinalValidationPassed" = CASE WHEN p_data ? 'FinalValidationPassed' THEN (p_data->>'FinalValidationPassed')::BOOLEAN ELSE "FinalValidationPassed" END,
        "ValidationBehavior" = CASE WHEN p_data ? 'ValidationBehavior' THEN (p_data->>'ValidationBehavior') ELSE "ValidationBehavior" END,
        "RetryStrategy" = CASE WHEN p_data ? 'RetryStrategy' THEN (p_data->>'RetryStrategy') ELSE "RetryStrategy" END,
        "MaxRetriesConfigured" = CASE WHEN p_data ? 'MaxRetriesConfigured' THEN (p_data->>'MaxRetriesConfigured')::INT ELSE "MaxRetriesConfigured" END,
        "FinalValidationError" = CASE WHEN p_data ? 'FinalValidationError' THEN (p_data->>'FinalValidationError') ELSE "FinalValidationError" END,
        "ValidationErrorCount" = CASE WHEN p_data ? 'ValidationErrorCount' THEN (p_data->>'ValidationErrorCount')::INT ELSE "ValidationErrorCount" END,
        "CommonValidationError" = CASE WHEN p_data ? 'CommonValidationError' THEN (p_data->>'CommonValidationError') ELSE "CommonValidationError" END,
        "FirstAttemptAt" = CASE WHEN p_data ? 'FirstAttemptAt' THEN (p_data->>'FirstAttemptAt')::TIMESTAMPTZ ELSE "FirstAttemptAt" END,
        "LastAttemptAt" = CASE WHEN p_data ? 'LastAttemptAt' THEN (p_data->>'LastAttemptAt')::TIMESTAMPTZ ELSE "LastAttemptAt" END,
        "TotalRetryDurationMS" = CASE WHEN p_data ? 'TotalRetryDurationMS' THEN (p_data->>'TotalRetryDurationMS')::INT ELSE "TotalRetryDurationMS" END,
        "ValidationAttempts" = CASE WHEN p_data ? 'ValidationAttempts' THEN (p_data->>'ValidationAttempts') ELSE "ValidationAttempts" END,
        "ValidationSummary" = CASE WHEN p_data ? 'ValidationSummary' THEN (p_data->>'ValidationSummary') ELSE "ValidationSummary" END,
        "FailoverAttempts" = CASE WHEN p_data ? 'FailoverAttempts' THEN (p_data->>'FailoverAttempts')::INT ELSE "FailoverAttempts" END,
        "FailoverErrors" = CASE WHEN p_data ? 'FailoverErrors' THEN (p_data->>'FailoverErrors') ELSE "FailoverErrors" END,
        "FailoverDurations" = CASE WHEN p_data ? 'FailoverDurations' THEN (p_data->>'FailoverDurations') ELSE "FailoverDurations" END,
        "OriginalModelID" = CASE WHEN p_data ? 'OriginalModelID' THEN (p_data->>'OriginalModelID')::UUID ELSE "OriginalModelID" END,
        "OriginalRequestStartTime" = CASE WHEN p_data ? 'OriginalRequestStartTime' THEN (p_data->>'OriginalRequestStartTime')::TIMESTAMPTZ ELSE "OriginalRequestStartTime" END,
        "TotalFailoverDuration" = CASE WHEN p_data ? 'TotalFailoverDuration' THEN (p_data->>'TotalFailoverDuration')::INT ELSE "TotalFailoverDuration" END,
        "RerunFromPromptRunID" = CASE WHEN p_data ? 'RerunFromPromptRunID' THEN (p_data->>'RerunFromPromptRunID')::UUID ELSE "RerunFromPromptRunID" END,
        "ModelSelection" = CASE WHEN p_data ? 'ModelSelection' THEN (p_data->>'ModelSelection') ELSE "ModelSelection" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "Cancelled" = CASE WHEN p_data ? 'Cancelled' THEN (p_data->>'Cancelled')::BOOLEAN ELSE "Cancelled" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "ModelPowerRank" = CASE WHEN p_data ? 'ModelPowerRank' THEN (p_data->>'ModelPowerRank')::INT ELSE "ModelPowerRank" END,
        "SelectionStrategy" = CASE WHEN p_data ? 'SelectionStrategy' THEN (p_data->>'SelectionStrategy') ELSE "SelectionStrategy" END,
        "CacheHit" = CASE WHEN p_data ? 'CacheHit' THEN (p_data->>'CacheHit')::BOOLEAN ELSE "CacheHit" END,
        "CacheKey" = CASE WHEN p_data ? 'CacheKey' THEN (p_data->>'CacheKey') ELSE "CacheKey" END,
        "JudgeID" = CASE WHEN p_data ? 'JudgeID' THEN (p_data->>'JudgeID')::UUID ELSE "JudgeID" END,
        "JudgeScore" = CASE WHEN p_data ? 'JudgeScore' THEN (p_data->>'JudgeScore')::FLOAT(53) ELSE "JudgeScore" END,
        "WasSelectedResult" = CASE WHEN p_data ? 'WasSelectedResult' THEN (p_data->>'WasSelectedResult')::BOOLEAN ELSE "WasSelectedResult" END,
        "StreamingEnabled" = CASE WHEN p_data ? 'StreamingEnabled' THEN (p_data->>'StreamingEnabled')::BOOLEAN ELSE "StreamingEnabled" END,
        "FirstTokenTime" = CASE WHEN p_data ? 'FirstTokenTime' THEN (p_data->>'FirstTokenTime')::INT ELSE "FirstTokenTime" END,
        "ErrorDetails" = CASE WHEN p_data ? 'ErrorDetails' THEN (p_data->>'ErrorDetails') ELSE "ErrorDetails" END,
        "ChildPromptID" = CASE WHEN p_data ? 'ChildPromptID' THEN (p_data->>'ChildPromptID')::UUID ELSE "ChildPromptID" END,
        "QueueTime" = CASE WHEN p_data ? 'QueueTime' THEN (p_data->>'QueueTime')::INT ELSE "QueueTime" END,
        "PromptTime" = CASE WHEN p_data ? 'PromptTime' THEN (p_data->>'PromptTime')::INT ELSE "PromptTime" END,
        "CompletionTime" = CASE WHEN p_data ? 'CompletionTime' THEN (p_data->>'CompletionTime')::INT ELSE "CompletionTime" END,
        "ModelSpecificResponseDetails" = CASE WHEN p_data ? 'ModelSpecificResponseDetails' THEN (p_data->>'ModelSpecificResponseDetails') ELSE "ModelSpecificResponseDetails" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "AssistantPrefill" = CASE WHEN p_data ? 'AssistantPrefill' THEN (p_data->>'AssistantPrefill') ELSE "AssistantPrefill" END,
        "TokensCacheRead" = CASE WHEN p_data ? 'TokensCacheRead' THEN (p_data->>'TokensCacheRead')::INT ELSE "TokensCacheRead" END,
        "TokensCacheWrite" = CASE WHEN p_data ? 'TokensCacheWrite' THEN (p_data->>'TokensCacheWrite')::INT ELSE "TokensCacheWrite" END,
        "TokensCacheReadRollup" = CASE WHEN p_data ? 'TokensCacheReadRollup' THEN (p_data->>'TokensCacheReadRollup')::INT ELSE "TokensCacheReadRollup" END,
        "TokensCacheWriteRollup" = CASE WHEN p_data ? 'TokensCacheWriteRollup' THEN (p_data->>'TokensCacheWriteRollup')::INT ELSE "TokensCacheWriteRollup" END,
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
$function$
;

GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun" TO "cdp_Integration";

/* ---------- FUNCTION spUpdateConversationCompactionRun ---------- */
CREATE OR REPLACE FUNCTION __mj."spUpdateConversationCompactionRun"(p_id uuid, p_conversationdetailid uuid DEFAULT NULL::uuid, p_promptrunid uuid DEFAULT NULL::uuid)
 RETURNS SETOF __mj."vwConversationCompactionRuns"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ConversationCompactionRun"
    SET
        "ConversationDetailID" = COALESCE(p_conversationdetailid, "ConversationDetailID"),
        "PromptRunID" = COALESCE(p_promptrunid, "PromptRunID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwConversationCompactionRuns"
    WHERE "ID" = p_id;
END;
$function$
;

GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationCompactionRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationCompactionRun" TO "cdp_Integration";

/* ---------- FUNCTION spUpdateConversationDetail ---------- */
CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetail"(p_id uuid, p_conversationid uuid DEFAULT NULL::uuid, p_externalid_clear boolean DEFAULT false, p_externalid character varying DEFAULT NULL::character varying, p_role character varying DEFAULT NULL::character varying, p_message text DEFAULT NULL::text, p_error_clear boolean DEFAULT false, p_error text DEFAULT NULL::text, p_hiddentouser boolean DEFAULT NULL::boolean, p_userrating_clear boolean DEFAULT false, p_userrating integer DEFAULT NULL::integer, p_userfeedback_clear boolean DEFAULT false, p_userfeedback text DEFAULT NULL::text, p_reflectioninsights_clear boolean DEFAULT false, p_reflectioninsights text DEFAULT NULL::text, p_summaryofearlierconversation_clear boolean DEFAULT false, p_summaryofearlierconversation text DEFAULT NULL::text, p_userid_clear boolean DEFAULT false, p_userid uuid DEFAULT NULL::uuid, p_artifactid_clear boolean DEFAULT false, p_artifactid uuid DEFAULT NULL::uuid, p_artifactversionid_clear boolean DEFAULT false, p_artifactversionid uuid DEFAULT NULL::uuid, p_completiontime_clear boolean DEFAULT false, p_completiontime bigint DEFAULT NULL::bigint, p_ispinned boolean DEFAULT NULL::boolean, p_parentid_clear boolean DEFAULT false, p_parentid uuid DEFAULT NULL::uuid, p_agentid_clear boolean DEFAULT false, p_agentid uuid DEFAULT NULL::uuid, p_status character varying DEFAULT NULL::character varying, p_suggestedresponses_clear boolean DEFAULT false, p_suggestedresponses text DEFAULT NULL::text, p_testrunid_clear boolean DEFAULT false, p_testrunid uuid DEFAULT NULL::uuid, p_responseform_clear boolean DEFAULT false, p_responseform text DEFAULT NULL::text, p_actionablecommands_clear boolean DEFAULT false, p_actionablecommands text DEFAULT NULL::text, p_automaticcommands_clear boolean DEFAULT false, p_automaticcommands text DEFAULT NULL::text, p_originalmessagechanged boolean DEFAULT NULL::boolean, p_agentsessionid_clear boolean DEFAULT false, p_agentsessionid uuid DEFAULT NULL::uuid, p_turnendedat_clear boolean DEFAULT false, p_turnendedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_utterancestartms_clear boolean DEFAULT false, p_utterancestartms integer DEFAULT NULL::integer, p_utteranceendms_clear boolean DEFAULT false, p_utteranceendms integer DEFAULT NULL::integer, p_mediatype_clear boolean DEFAULT false, p_mediatype character varying DEFAULT NULL::character varying)
 RETURNS SETOF __mj."vwConversationDetails"
 LANGUAGE plpgsql
AS $function$
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
        "OriginalMessageChanged" = COALESCE(p_originalmessagechanged, "OriginalMessageChanged"),
        "AgentSessionID" = CASE WHEN p_agentsessionid_clear = true THEN NULL ELSE COALESCE(p_agentsessionid, "AgentSessionID") END,
        "TurnEndedAt" = CASE WHEN p_turnendedat_clear = true THEN NULL ELSE COALESCE(p_turnendedat, "TurnEndedAt") END,
        "UtteranceStartMs" = CASE WHEN p_utterancestartms_clear = true THEN NULL ELSE COALESCE(p_utterancestartms, "UtteranceStartMs") END,
        "UtteranceEndMs" = CASE WHEN p_utteranceendms_clear = true THEN NULL ELSE COALESCE(p_utteranceendms, "UtteranceEndMs") END,
        "MediaType" = CASE WHEN p_mediatype_clear = true THEN NULL ELSE COALESCE(p_mediatype, "MediaType") END
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
$function$
;

GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_Integration";

/* ---------- FUNCTION spDeleteAIPromptRun ---------- */
CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptRun"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
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

        -- Cascade: Delete MJ: Conversation Compaction Runs records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationCompactionRun"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationCompactionRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."DuplicateRunDetailMatch"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."DuplicateRunDetailMatch"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."UserRoutineRun"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."UserRoutineRun"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIPromptRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Integration";

/* ---------- FUNCTION spDeleteConversationCompactionRun ---------- */
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationCompactionRun"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ConversationCompactionRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationCompactionRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationCompactionRun" TO "cdp_Integration";

/* ---------- FUNCTION spDeleteConversationDetail ---------- */
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetail"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
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

        -- Cascade: Delete MJ: Conversation Compaction Runs records via ConversationDetailID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationCompactionRun"
        WHERE "ConversationDetailID" = p_id
    LOOP
        PERFORM __mj."spDeleteConversationCompactionRun"(v_rec."ID");
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
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Integration";

/* ---------- TRIGGER FUNCTION fn_trg_update_conversation_compaction_run ---------- */
CREATE OR REPLACE FUNCTION __mj.fn_trg_update_conversation_compaction_run()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;

/* ---------- TRIGGER trg_update_conversation_compaction_run ---------- */
DROP TRIGGER IF EXISTS trg_update_conversation_compaction_run ON __mj."ConversationCompactionRun";
CREATE TRIGGER trg_update_conversation_compaction_run BEFORE UPDATE ON __mj."ConversationCompactionRun" FOR EACH ROW EXECUTE FUNCTION __mj.fn_trg_update_conversation_compaction_run();

