
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Autotagging Taxonomy Bridge: Schema changes for plugin architecture, entity-source rebuild,
-- tag taxonomy bridge, and tagged item weights.
--
-- Changes:
--   ContentSourceType: +DriverClass, +Configuration
--   ContentSource:     +Configuration, +EntityID (FK Entity), +EntityDocumentID (FK EntityDocument)
--   ContentType:       +Configuration
--   ContentItem:       +EntityRecordDocumentID (FK EntityRecordDocument)
--   ContentItemTag:    +TagID (FK Tag)
--   TaggedItem:        +Weight
--

----------------------------------------------------------------------
-- 1. DDL: ALTER TABLE statements
----------------------------------------------------------------------

-- ContentSourceType: add DriverClass and Configuration
ALTER TABLE __mj."ContentSourceType"
 ADD COLUMN "DriverClass" VARCHAR(255) NULL,
 ADD COLUMN "Configuration" TEXT NULL;

-- ContentSource: add Configuration, EntityID, EntityDocumentID
ALTER TABLE __mj."ContentSource"
 ADD COLUMN "Configuration" TEXT NULL,
 ADD COLUMN "EntityID" UUID NULL
            CONSTRAINT FK_ContentSource_Entity REFERENCES __mj."Entity"("ID"),
 ADD COLUMN "EntityDocumentID" UUID NULL
            CONSTRAINT FK_ContentSource_EntityDocument REFERENCES __mj."EntityDocument"("ID");

-- ContentType: add Configuration
ALTER TABLE __mj."ContentType"
 ADD COLUMN "Configuration" TEXT NULL;

-- ContentItem: add EntityRecordDocumentID
ALTER TABLE __mj."ContentItem"
 ADD COLUMN "EntityRecordDocumentID" UUID NULL
        CONSTRAINT FK_ContentItem_EntityRecordDocument REFERENCES __mj."EntityRecordDocument"("ID");

-- ContentItemTag: add TagID
ALTER TABLE __mj."ContentItemTag"
 ADD COLUMN "TagID" UUID NULL
        CONSTRAINT FK_ContentItemTag_Tag REFERENCES __mj."Tag"("ID");

-- TaggedItem: add Weight
ALTER TABLE __mj."TaggedItem"
 ADD COLUMN "Weight" NUMERIC(5, 4) NOT NULL CONSTRAINT DF_TaggedItem_Weight DEFAULT 1.0;

ALTER TABLE __mj."ContentProcessRun"
 ADD COLUMN "StartedByUserID" UUID NULL
        CONSTRAINT FK_ContentProcessRun_User REFERENCES __mj."User"("ID"),
 ADD COLUMN "TotalItemCount" INTEGER NULL,
 ADD COLUMN "LastProcessedOffset" INTEGER NULL CONSTRAINT DF_ContentProcessRun_LastProcessedOffset DEFAULT 0,
 ADD COLUMN "BatchSize" INTEGER NULL CONSTRAINT DF_ContentProcessRun_BatchSize DEFAULT 100,
 ADD COLUMN "ErrorCount" INTEGER NULL CONSTRAINT DF_ContentProcessRun_ErrorCount DEFAULT 0,
 ADD COLUMN "ErrorMessage" TEXT NULL,
 ADD COLUMN "CancellationRequested" BOOLEAN NOT NULL CONSTRAINT DF_ContentProcessRun_CancellationRequested DEFAULT FALSE,
 ADD COLUMN "Configuration" TEXT NULL;

CREATE TABLE __mj."ContentProcessRunDetail" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ContentProcessRunID" UUID NOT NULL,
 "ContentSourceID" UUID NOT NULL,
 "ContentSourceTypeID" UUID NOT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
 "ItemsProcessed" INTEGER NOT NULL DEFAULT 0,
 "ItemsTagged" INTEGER NOT NULL DEFAULT 0,
 "ItemsVectorized" INTEGER NOT NULL DEFAULT 0,
 "TagsCreated" INTEGER NOT NULL DEFAULT 0,
 "ErrorCount" INTEGER NOT NULL DEFAULT 0,
 "StartTime" TIMESTAMPTZ NULL,
 "EndTime" TIMESTAMPTZ NULL,
 "TotalTokensUsed" INTEGER NOT NULL DEFAULT 0,
 "TotalCost" DECIMAL(18, 6) NOT NULL DEFAULT 0,
 CONSTRAINT PK_ContentProcessRunDetail PRIMARY KEY ("ID"),
 CONSTRAINT FK_ContentProcessRunDetail_Run FOREIGN KEY ("ContentProcessRunID") REFERENCES __mj."ContentProcessRun"("ID"),
 CONSTRAINT FK_ContentProcessRunDetail_Source FOREIGN KEY ("ContentSourceID") REFERENCES __mj."ContentSource"("ID"),
 CONSTRAINT FK_ContentProcessRunDetail_SourceType FOREIGN KEY ("ContentSourceTypeID") REFERENCES __mj."ContentSourceType"("ID")
);

CREATE TABLE __mj."ContentProcessRunPromptRun" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ContentProcessRunDetailID" UUID NOT NULL,
 "AIPromptRunID" UUID NOT NULL,
 "RunType" VARCHAR(20) NOT NULL,
 CONSTRAINT PK_ContentProcessRunPromptRun PRIMARY KEY ("ID"),
 CONSTRAINT FK_ContentProcessRunPromptRun_Detail FOREIGN KEY ("ContentProcessRunDetailID") REFERENCES __mj."ContentProcessRunDetail"("ID"),
 CONSTRAINT FK_ContentProcessRunPromptRun_PromptRun FOREIGN KEY ("AIPromptRunID") REFERENCES __mj."AIPromptRun"("ID"),
 CONSTRAINT CK_ContentProcessRunPromptRun_RunType CHECK ("RunType" IN ('Tag', 'Embed'))
);

ALTER TABLE __mj."DuplicateRun"
 ADD COLUMN "TotalItemCount" INTEGER NULL,
 ADD COLUMN "ProcessedItemCount" INTEGER NULL CONSTRAINT DF_DuplicateRun_ProcessedItemCount DEFAULT 0,
 ADD COLUMN "LastProcessedOffset" INTEGER NULL CONSTRAINT DF_DuplicateRun_LastProcessedOffset DEFAULT 0,
 ADD COLUMN "BatchSize" INTEGER NULL CONSTRAINT DF_DuplicateRun_BatchSize DEFAULT 100,
 ADD COLUMN "CancellationRequested" BOOLEAN NOT NULL CONSTRAINT DF_DuplicateRun_CancellationRequested DEFAULT FALSE;

ALTER TABLE __mj."DuplicateRunDetail"
 ADD COLUMN "StartedAt" TIMESTAMPTZ NULL,
 ADD COLUMN "EndedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."Tag"
 ADD COLUMN "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 ADD COLUMN "MergedIntoTagID" UUID NULL;

-- ─────────────────────────────────────────────────
-- 2. TAXONOMY GOVERNANCE — Tag Audit Log
-- ─────────────────────────────────────────────────

CREATE TABLE __mj."TagAuditLog" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "TagID" UUID NOT NULL,
 "Action" VARCHAR(30) NOT NULL,
 "Details" TEXT NULL,
 "PerformedByUserID" UUID NOT NULL,
 "RelatedTagID" UUID NULL,
 CONSTRAINT PK_TagAuditLog PRIMARY KEY ("ID"),
 CONSTRAINT FK_TagAuditLog_Tag FOREIGN KEY ("TagID")
 REFERENCES __mj."Tag"("ID"),
 CONSTRAINT FK_TagAuditLog_User FOREIGN KEY ("PerformedByUserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT FK_TagAuditLog_RelatedTag FOREIGN KEY ("RelatedTagID")
 REFERENCES __mj."Tag"("ID"),
 CONSTRAINT CK_TagAuditLog_Action CHECK ("Action" IN (
 'Created', 'Renamed', 'Moved', 'Merged', 'Split',
 'Deprecated', 'Reactivated', 'Deleted', 'DescriptionChanged'
 ))
);

-- ─────────────────────────────────────────────────
-- 3. CONTENT DEDUPLICATION — Cross-Source Duplicates
-- ─────────────────────────────────────────────────

CREATE TABLE __mj."ContentItemDuplicate" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ContentItemAID" UUID NOT NULL,
 "ContentItemBID" UUID NOT NULL,
 "SimilarityScore" DECIMAL(5,4) NOT NULL,
 "DetectionMethod" VARCHAR(30) NOT NULL DEFAULT 'Checksum',
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
 "ResolvedByUserID" UUID NULL,
 "ResolvedAt" TIMESTAMPTZ NULL,
 "Resolution" VARCHAR(20) NULL,
 CONSTRAINT PK_ContentItemDuplicate PRIMARY KEY ("ID"),
 CONSTRAINT FK_ContentItemDuplicate_ItemA FOREIGN KEY ("ContentItemAID")
 REFERENCES __mj."ContentItem"("ID"),
 CONSTRAINT FK_ContentItemDuplicate_ItemB FOREIGN KEY ("ContentItemBID")
 REFERENCES __mj."ContentItem"("ID"),
 CONSTRAINT FK_ContentItemDuplicate_ResolvedBy FOREIGN KEY ("ResolvedByUserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT CK_ContentItemDuplicate_Method CHECK ("DetectionMethod" IN ('Checksum', 'Vector', 'Title', 'URL')),
 CONSTRAINT CK_ContentItemDuplicate_Status CHECK ("Status" IN ('Pending', 'Confirmed', 'Dismissed', 'Merged')),
 CONSTRAINT CK_ContentItemDuplicate_Resolution CHECK ("Resolution" IN ('KeepA', 'KeepB', 'MergeBoth', 'NotDuplicate')),
 CONSTRAINT UQ_ContentItemDuplicate_Pair UNIQUE ("ContentItemAID", "ContentItemBID")
);

-- ─────────────────────────────────────────────────
-- 4. TAG CO-OCCURRENCE — Materialized pair counts
-- ─────────────────────────────────────────────────

CREATE TABLE __mj."TagCoOccurrence" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "TagAID" UUID NOT NULL,
 "TagBID" UUID NOT NULL,
 "CoOccurrenceCount" INTEGER NOT NULL DEFAULT 0,
 "LastComputedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT PK_TagCoOccurrence PRIMARY KEY ("ID"),
 CONSTRAINT FK_TagCoOccurrence_TagA FOREIGN KEY ("TagAID")
 REFERENCES __mj."Tag"("ID"),
 CONSTRAINT FK_TagCoOccurrence_TagB FOREIGN KEY ("TagBID")
 REFERENCES __mj."Tag"("ID"),
 CONSTRAINT UQ_TagCoOccurrence_Pair UNIQUE ("TagAID", "TagBID")
);

-- ─────────────────────────────────────────────────
-- 5. SCHEDULED PIPELINE + CONTENT ITEM STATUS — ALTER existing tables
-- ─────────────────────────────────────────────────

-- ContentSource: link to scheduled pipeline action
ALTER TABLE __mj."ContentSource"
 ADD COLUMN "ScheduledActionID" UUID NULL;

-- ContentItem: embedding + tagging lifecycle tracking
ALTER TABLE __mj."ContentItem"
 ADD COLUMN "EmbeddingStatus"  VARCHAR(20) NOT NULL DEFAULT 'Pending',
 ADD COLUMN "LastEmbeddedAt"   TIMESTAMPTZ NULL,
 ADD COLUMN "EmbeddingModelID" UUID NULL,
 ADD COLUMN "TaggingStatus"    VARCHAR(20) NOT NULL DEFAULT 'Pending',
 ADD COLUMN "LastTaggedAt"     TIMESTAMPTZ NULL;

-- ─────────────────────────────────────────────────
-- 6. SEARCH ENHANCEMENT — Saved Searches
-- ─────────────────────────────────────────────────

CREATE TABLE __mj."KnowledgeHubSavedSearch" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "UserID" UUID NOT NULL,
 "Name" VARCHAR(255) NOT NULL,
 "Query" VARCHAR(1000) NOT NULL,
 "Filters" TEXT NULL,
 "MinScore" DECIMAL(3,2) NULL,
 "MaxResults" INTEGER NULL DEFAULT 50,
 "NotifyOnNewResults" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT PK_KnowledgeHubSavedSearch PRIMARY KEY ("ID"),
 CONSTRAINT FK_KnowledgeHubSavedSearch_User FOREIGN KEY ("UserID")
 REFERENCES __mj."User"("ID")
);

/* SQL text to add special date field __mj_CreatedAt to entity __mj."KnowledgeHubSavedSearch" */
ALTER TABLE __mj."KnowledgeHubSavedSearch"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."KnowledgeHubSavedSearch" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."KnowledgeHubSavedSearch" */

ALTER TABLE __mj."KnowledgeHubSavedSearch"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."KnowledgeHubSavedSearch" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentItemDuplicate" */

ALTER TABLE __mj."ContentItemDuplicate"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."ContentItemDuplicate" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentItemDuplicate" */

ALTER TABLE __mj."ContentItemDuplicate"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."ContentItemDuplicate" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentProcessRunPromptRun" */

ALTER TABLE __mj."ContentProcessRunPromptRun"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."ContentProcessRunPromptRun" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentProcessRunPromptRun" */

ALTER TABLE __mj."ContentProcessRunPromptRun"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."ContentProcessRunPromptRun" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagAuditLog" */

ALTER TABLE __mj."TagAuditLog"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."TagAuditLog" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagAuditLog" */

ALTER TABLE __mj."TagAuditLog"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."TagAuditLog" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagCoOccurrence" */

ALTER TABLE __mj."TagCoOccurrence"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."TagCoOccurrence" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagCoOccurrence" */

ALTER TABLE __mj."TagCoOccurrence"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."TagCoOccurrence" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentProcessRunDetail" */

ALTER TABLE __mj."ContentProcessRunDetail"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."ContentProcessRunDetail" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentProcessRunDetail" */

ALTER TABLE __mj."ContentProcessRunDetail"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItemDuplicate_ContentItemAID" ON __mj."ContentItemDuplicate" ("ContentItemAID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItemDuplicate_ContentItemBID" ON __mj."ContentItemDuplicate" ("ContentItemBID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItemDuplicate_ResolvedByUserID" ON __mj."ContentItemDuplicate" ("ResolvedByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItemTag_ItemID" ON __mj."ContentItemTag" ("ItemID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItemTag_TagID" ON __mj."ContentItemTag" ("TagID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceID" ON __mj."ContentItem" ("ContentSourceID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItem_ContentTypeID" ON __mj."ContentItem" ("ContentTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceTypeID" ON __mj."ContentItem" ("ContentSourceTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItem_ContentFileTypeID" ON __mj."ContentItem" ("ContentFileTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItem_EntityRecordDocumentID" ON __mj."ContentItem" ("EntityRecordDocumentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItem_EmbeddingModelID" ON __mj."ContentItem" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentProcessRunID" ON __mj."ContentProcessRunDetail" ("ContentProcessRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentSourceID" ON __mj."ContentProcessRunDetail" ("ContentSourceID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentSourceTypeID" ON __mj."ContentProcessRunDetail" ("ContentSourceTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentProcessRunPromptRun_ContentPro_5a2c2b61" ON __mj."ContentProcessRunPromptRun" ("ContentProcessRunDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentProcessRunPromptRun_AIPromptRunID" ON __mj."ContentProcessRunPromptRun" ("AIPromptRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentProcessRun_SourceID" ON __mj."ContentProcessRun" ("SourceID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentProcessRun_StartedByUserID" ON __mj."ContentProcessRun" ("StartedByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID" ON __mj."ContentSource" ("ContentTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID" ON __mj."ContentSource" ("ContentSourceTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID" ON __mj."ContentSource" ("ContentFileTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID" ON __mj."ContentSource" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID" ON __mj."ContentSource" ("VectorIndexID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_EntityID" ON __mj."ContentSource" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_EntityDocumentID" ON __mj."ContentSource" ("EntityDocumentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentSource_ScheduledActionID" ON __mj."ContentSource" ("ScheduledActionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentType_AIModelID" ON __mj."ContentType" ("AIModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentType_EmbeddingModelID" ON __mj."ContentType" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentType_VectorIndexID" ON __mj."ContentType" ("VectorIndexID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRunDetail_DuplicateRunID" ON __mj."DuplicateRunDetail" ("DuplicateRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID" ON __mj."DuplicateRun" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID" ON __mj."DuplicateRun" ("StartedByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID" ON __mj."DuplicateRun" ("SourceListID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID" ON __mj."DuplicateRun" ("ApprovedByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_KnowledgeHubSavedSearch_UserID" ON __mj."KnowledgeHubSavedSearch" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagAuditLog_TagID" ON __mj."TagAuditLog" ("TagID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagAuditLog_PerformedByUserID" ON __mj."TagAuditLog" ("PerformedByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagAuditLog_RelatedTagID" ON __mj."TagAuditLog" ("RelatedTagID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagCoOccurrence_TagAID" ON __mj."TagCoOccurrence" ("TagAID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TagCoOccurrence_TagBID" ON __mj."TagCoOccurrence" ("TagBID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TaggedItem_TagID" ON __mj."TaggedItem" ("TagID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TaggedItem_EntityID" ON __mj."TaggedItem" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Tag_ParentID" ON __mj."Tag" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Tag_MergedIntoTagID" ON __mj."Tag" ("MergedIntoTagID");


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
  v_target_name CONSTANT TEXT := 'vwContentItemDuplicates';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentItemDuplicates"
AS SELECT
    c.*,
    "MJContentItem_ContentItemAID"."Name" AS "ContentItemA",
    "MJContentItem_ContentItemBID"."Name" AS "ContentItemB",
    "MJUser_ResolvedByUserID"."Name" AS "ResolvedByUser"
FROM
    __mj."ContentItemDuplicate" AS c
INNER JOIN
    __mj."ContentItem" AS "MJContentItem_ContentItemAID"
  ON
    c."ContentItemAID" = "MJContentItem_ContentItemAID"."ID"
INNER JOIN
    __mj."ContentItem" AS "MJContentItem_ContentItemBID"
  ON
    c."ContentItemBID" = "MJContentItem_ContentItemBID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_ResolvedByUserID"
  ON
    c."ResolvedByUserID" = "MJUser_ResolvedByUserID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwContentItemTags';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentItemTags"
AS SELECT
    c.*,
    "MJContentItem_ItemID"."Name" AS "Item",
    "MJTag_TagID"."Name" AS "Tag_Virtual"
FROM
    __mj."ContentItemTag" AS c
INNER JOIN
    __mj."ContentItem" AS "MJContentItem_ItemID"
  ON
    c."ItemID" = "MJContentItem_ItemID"."ID"
LEFT OUTER JOIN
    __mj."Tag" AS "MJTag_TagID"
  ON
    c."TagID" = "MJTag_TagID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwContentProcessRunPromptRuns';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentProcessRunPromptRuns"
AS SELECT
    c.*,
    "MJAIPromptRun_AIPromptRunID"."RunName" AS "AIPromptRun"
FROM
    __mj."ContentProcessRunPromptRun" AS c
INNER JOIN
    __mj."AIPromptRun" AS "MJAIPromptRun_AIPromptRunID"
  ON
    c."AIPromptRunID" = "MJAIPromptRun_AIPromptRunID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwContentProcessRuns';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentProcessRuns"
AS SELECT
    c.*,
    "MJContentSource_SourceID"."Name" AS "Source",
    "MJUser_StartedByUserID"."Name" AS "StartedByUser"
FROM
    __mj."ContentProcessRun" AS c
INNER JOIN
    __mj."ContentSource" AS "MJContentSource_SourceID"
  ON
    c."SourceID" = "MJContentSource_SourceID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_StartedByUserID"
  ON
    c."StartedByUserID" = "MJUser_StartedByUserID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwContentItems';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentItems"
AS SELECT
    c.*,
    "MJContentSource_ContentSourceID"."Name" AS "ContentSource",
    "MJContentType_ContentTypeID"."Name" AS "ContentType",
    "MJContentSourceType_ContentSourceTypeID"."Name" AS "ContentSourceType",
    "MJContentFileType_ContentFileTypeID"."Name" AS "ContentFileType",
    "MJEntityRecordDocument_EntityRecordDocumentID"."RecordID" AS "EntityRecordDocument",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel"
FROM
    __mj."ContentItem" AS c
INNER JOIN
    __mj."ContentSource" AS "MJContentSource_ContentSourceID"
  ON
    c."ContentSourceID" = "MJContentSource_ContentSourceID"."ID"
INNER JOIN
    __mj."ContentType" AS "MJContentType_ContentTypeID"
  ON
    c."ContentTypeID" = "MJContentType_ContentTypeID"."ID"
INNER JOIN
    __mj."ContentSourceType" AS "MJContentSourceType_ContentSourceTypeID"
  ON
    c."ContentSourceTypeID" = "MJContentSourceType_ContentSourceTypeID"."ID"
INNER JOIN
    __mj."ContentFileType" AS "MJContentFileType_ContentFileTypeID"
  ON
    c."ContentFileTypeID" = "MJContentFileType_ContentFileTypeID"."ID"
LEFT OUTER JOIN
    __mj."EntityRecordDocument" AS "MJEntityRecordDocument_EntityRecordDocumentID"
  ON
    c."EntityRecordDocumentID" = "MJEntityRecordDocument_EntityRecordDocumentID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    c."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwContentSourceTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentSourceTypes"
AS SELECT
    c.*
FROM
    __mj."ContentSourceType" AS c$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwContentSources';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentSources"
AS SELECT
    c.*,
    "MJContentType_ContentTypeID"."Name" AS "ContentType",
    "MJContentSourceType_ContentSourceTypeID"."Name" AS "ContentSourceType",
    "MJContentFileType_ContentFileTypeID"."Name" AS "ContentFileType",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel",
    "MJVectorIndex_VectorIndexID"."Name" AS "VectorIndex",
    "MJEntity_EntityID"."Name" AS "Entity",
    "MJEntityDocument_EntityDocumentID"."Name" AS "EntityDocument",
    "MJScheduledAction_ScheduledActionID"."Name" AS "ScheduledAction"
FROM
    __mj."ContentSource" AS c
INNER JOIN
    __mj."ContentType" AS "MJContentType_ContentTypeID"
  ON
    c."ContentTypeID" = "MJContentType_ContentTypeID"."ID"
INNER JOIN
    __mj."ContentSourceType" AS "MJContentSourceType_ContentSourceTypeID"
  ON
    c."ContentSourceTypeID" = "MJContentSourceType_ContentSourceTypeID"."ID"
INNER JOIN
    __mj."ContentFileType" AS "MJContentFileType_ContentFileTypeID"
  ON
    c."ContentFileTypeID" = "MJContentFileType_ContentFileTypeID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    c."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS "MJVectorIndex_VectorIndexID"
  ON
    c."VectorIndexID" = "MJVectorIndex_VectorIndexID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    c."EntityID" = "MJEntity_EntityID"."ID"
LEFT OUTER JOIN
    __mj."EntityDocument" AS "MJEntityDocument_EntityDocumentID"
  ON
    c."EntityDocumentID" = "MJEntityDocument_EntityDocumentID"."ID"
LEFT OUTER JOIN
    __mj."ScheduledAction" AS "MJScheduledAction_ScheduledActionID"
  ON
    c."ScheduledActionID" = "MJScheduledAction_ScheduledActionID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwContentTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentTypes"
AS SELECT
    c.*,
    "MJAIModel_AIModelID"."Name" AS "AIModel",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel",
    "MJVectorIndex_VectorIndexID"."Name" AS "VectorIndex"
FROM
    __mj."ContentType" AS c
INNER JOIN
    __mj."AIModel" AS "MJAIModel_AIModelID"
  ON
    c."AIModelID" = "MJAIModel_AIModelID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    c."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS "MJVectorIndex_VectorIndexID"
  ON
    c."VectorIndexID" = "MJVectorIndex_VectorIndexID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwDuplicateRuns';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwDuplicateRuns"
AS SELECT
    d.*,
    "MJEntity_EntityID"."Name" AS "Entity",
    "MJUser_StartedByUserID"."Name" AS "StartedByUser",
    "MJList_SourceListID"."Name" AS "SourceList",
    "MJUser_ApprovedByUserID"."Name" AS "ApprovedByUser"
FROM
    __mj."DuplicateRun" AS d
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    d."EntityID" = "MJEntity_EntityID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_StartedByUserID"
  ON
    d."StartedByUserID" = "MJUser_StartedByUserID"."ID"
LEFT OUTER JOIN
    __mj."List" AS "MJList_SourceListID"
  ON
    d."SourceListID" = "MJList_SourceListID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_ApprovedByUserID"
  ON
    d."ApprovedByUserID" = "MJUser_ApprovedByUserID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwKnowledgeHubSavedSearches';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwKnowledgeHubSavedSearches"
AS SELECT
    k.*,
    "MJUser_UserID"."Name" AS "User"
FROM
    __mj."KnowledgeHubSavedSearch" AS k
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    k."UserID" = "MJUser_UserID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwTaggedItems';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwTaggedItems"
AS SELECT
    t.*,
    "MJTag_TagID"."Name" AS "Tag",
    "MJEntity_EntityID"."Name" AS "Entity"
FROM
    __mj."TaggedItem" AS t
INNER JOIN
    __mj."Tag" AS "MJTag_TagID"
  ON
    t."TagID" = "MJTag_TagID"."ID"
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    t."EntityID" = "MJEntity_EntityID"."ID"$vsql$;
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
LEFT JOIN LATERAL (SELECT * FROM __mj."fnTagParentID_GetRootID"(t."ID", t."ParentID")) AS "root_ParentID" ON TRUE
LEFT JOIN LATERAL (SELECT * FROM __mj."fnTagMergedIntoTagID_GetRootID"(t."ID", t."MergedIntoTagID")) AS "root_MergedIntoTagID" ON TRUE$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwTagCoOccurrences';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwTagCoOccurrences"
AS SELECT
    t.*,
    "MJTag_TagAID"."Name" AS "TagA",
    "MJTag_TagBID"."Name" AS "TagB"
FROM
    __mj."TagCoOccurrence" AS t
INNER JOIN
    __mj."Tag" AS "MJTag_TagAID"
  ON
    t."TagAID" = "MJTag_TagAID"."ID"
INNER JOIN
    __mj."Tag" AS "MJTag_TagBID"
  ON
    t."TagBID" = "MJTag_TagBID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwTagAuditLogs';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwTagAuditLogs"
AS SELECT
    t.*,
    "MJTag_TagID"."Name" AS "Tag",
    "MJUser_PerformedByUserID"."Name" AS "PerformedByUser",
    "MJTag_RelatedTagID"."Name" AS "RelatedTag"
FROM
    __mj."TagAuditLog" AS t
INNER JOIN
    __mj."Tag" AS "MJTag_TagID"
  ON
    t."TagID" = "MJTag_TagID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_PerformedByUserID"
  ON
    t."PerformedByUserID" = "MJUser_PerformedByUserID"."ID"
LEFT OUTER JOIN
    __mj."Tag" AS "MJTag_RelatedTagID"
  ON
    t."RelatedTagID" = "MJTag_RelatedTagID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwContentProcessRunDetails';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentProcessRunDetails"
AS SELECT
    c.*,
    "MJContentProcessRun_ContentProcessRunID"."Source" AS "ContentProcessRun",
    "MJContentSource_ContentSourceID"."Name" AS "ContentSource",
    "MJContentSourceType_ContentSourceTypeID"."Name" AS "ContentSourceType"
FROM
    __mj."ContentProcessRunDetail" AS c
INNER JOIN
    __mj."vwContentProcessRuns" AS "MJContentProcessRun_ContentProcessRunID"
  ON
    c."ContentProcessRunID" = "MJContentProcessRun_ContentProcessRunID"."ID"
INNER JOIN
    __mj."ContentSource" AS "MJContentSource_ContentSourceID"
  ON
    c."ContentSourceID" = "MJContentSource_ContentSourceID"."ID"
INNER JOIN
    __mj."ContentSourceType" AS "MJContentSourceType_ContentSourceTypeID"
  ON
    c."ContentSourceTypeID" = "MJContentSourceType_ContentSourceTypeID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwDuplicateRunDetails';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwDuplicateRunDetails"
AS SELECT
    d.*,
    "MJDuplicateRun_DuplicateRunID"."Entity" AS "DuplicateRun"
FROM
    __mj."DuplicateRunDetail" AS d
INNER JOIN
    __mj."vwDuplicateRuns" AS "MJDuplicateRun_DuplicateRunID"
  ON
    d."DuplicateRunID" = "MJDuplicateRun_DuplicateRunID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateContentItemDuplicate"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ContentItemAID UUID DEFAULT NULL,
    IN p_ContentItemBID UUID DEFAULT NULL,
    IN p_SimilarityScore NUMERIC(5,4) DEFAULT NULL,
    IN p_DetectionMethod VARCHAR(30) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ResolvedByUserID UUID DEFAULT NULL,
    IN p_ResolvedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Resolution VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwContentItemDuplicates" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentItemDuplicate"
            (
                "ID",
                "ContentItemAID",
                "ContentItemBID",
                "SimilarityScore",
                "DetectionMethod",
                "Status",
                "ResolvedByUserID",
                "ResolvedAt",
                "Resolution"
            )
        VALUES
            (
                p_ID,
                p_ContentItemAID,
                p_ContentItemBID,
                p_SimilarityScore,
                COALESCE(p_DetectionMethod, 'Checksum'),
                COALESCE(p_Status, 'Pending'),
                p_ResolvedByUserID,
                p_ResolvedAt,
                p_Resolution
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentItemDuplicate"
            (
                "ContentItemAID",
                "ContentItemBID",
                "SimilarityScore",
                "DetectionMethod",
                "Status",
                "ResolvedByUserID",
                "ResolvedAt",
                "Resolution"
            )
        VALUES
            (
                p_ContentItemAID,
                p_ContentItemBID,
                p_SimilarityScore,
                COALESCE(p_DetectionMethod, 'Checksum'),
                COALESCE(p_Status, 'Pending'),
                p_ResolvedByUserID,
                p_ResolvedAt,
                p_Resolution
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentItemDuplicates" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentItemDuplicate"(
    IN p_ID UUID,
    IN p_ContentItemAID UUID,
    IN p_ContentItemBID UUID,
    IN p_SimilarityScore NUMERIC(5,4),
    IN p_DetectionMethod VARCHAR(30),
    IN p_Status VARCHAR(20),
    IN p_ResolvedByUserID UUID,
    IN p_ResolvedAt TIMESTAMPTZ,
    IN p_Resolution VARCHAR(20)
)
RETURNS SETOF __mj."vwContentItemDuplicates" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentItemDuplicate"
    SET
        "ContentItemAID" = p_ContentItemAID,
        "ContentItemBID" = p_ContentItemBID,
        "SimilarityScore" = p_SimilarityScore,
        "DetectionMethod" = p_DetectionMethod,
        "Status" = p_Status,
        "ResolvedByUserID" = p_ResolvedByUserID,
        "ResolvedAt" = p_ResolvedAt,
        "Resolution" = p_Resolution
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentItemDuplicates" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentItemDuplicates" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentItemDuplicate"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentItemDuplicate"
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

CREATE OR REPLACE FUNCTION __mj."spCreateContentItemTag"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ItemID UUID DEFAULT NULL,
    IN p_Tag VARCHAR(200) DEFAULT NULL,
    IN p_Weight NUMERIC(5,4) DEFAULT NULL,
    IN p_TagID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwContentItemTags" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentItemTag"
            (
                "ID",
                "ItemID",
                "Tag",
                "Weight",
                "TagID"
            )
        VALUES
            (
                p_ID,
                p_ItemID,
                p_Tag,
                COALESCE(p_Weight, 1.0),
                p_TagID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentItemTag"
            (
                "ItemID",
                "Tag",
                "Weight",
                "TagID"
            )
        VALUES
            (
                p_ItemID,
                p_Tag,
                COALESCE(p_Weight, 1.0),
                p_TagID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentItemTags" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentItemTag"(
    IN p_ID UUID,
    IN p_ItemID UUID,
    IN p_Tag VARCHAR(200),
    IN p_Weight NUMERIC(5,4),
    IN p_TagID UUID
)
RETURNS SETOF __mj."vwContentItemTags" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentItemTag"
    SET
        "ItemID" = p_ItemID,
        "Tag" = p_Tag,
        "Weight" = p_Weight,
        "TagID" = p_TagID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentItemTags" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentItemTags" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentItemTag"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentItemTag"
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

CREATE OR REPLACE FUNCTION __mj."spCreateContentProcessRunPromptRun"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ContentProcessRunDetailID UUID DEFAULT NULL,
    IN p_AIPromptRunID UUID DEFAULT NULL,
    IN p_RunType VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwContentProcessRunPromptRuns" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentProcessRunPromptRun"
            (
                "ID",
                "ContentProcessRunDetailID",
                "AIPromptRunID",
                "RunType"
            )
        VALUES
            (
                p_ID,
                p_ContentProcessRunDetailID,
                p_AIPromptRunID,
                p_RunType
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentProcessRunPromptRun"
            (
                "ContentProcessRunDetailID",
                "AIPromptRunID",
                "RunType"
            )
        VALUES
            (
                p_ContentProcessRunDetailID,
                p_AIPromptRunID,
                p_RunType
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentProcessRunPromptRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentProcessRunPromptRun"(
    IN p_ID UUID,
    IN p_ContentProcessRunDetailID UUID,
    IN p_AIPromptRunID UUID,
    IN p_RunType VARCHAR(20)
)
RETURNS SETOF __mj."vwContentProcessRunPromptRuns" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentProcessRunPromptRun"
    SET
        "ContentProcessRunDetailID" = p_ContentProcessRunDetailID,
        "AIPromptRunID" = p_AIPromptRunID,
        "RunType" = p_RunType
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentProcessRunPromptRuns" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentProcessRunPromptRuns" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentProcessRunPromptRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentProcessRunPromptRun"
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

CREATE OR REPLACE FUNCTION __mj."spCreateContentProcessRun"(
    IN p_ID UUID DEFAULT NULL,
    IN p_SourceID UUID DEFAULT NULL,
    IN p_StartTime TIMESTAMPTZ DEFAULT NULL,
    IN p_EndTime TIMESTAMPTZ DEFAULT NULL,
    IN p_Status VARCHAR(100) DEFAULT NULL,
    IN p_ProcessedItems INTEGER DEFAULT NULL,
    IN p_StartedByUserID UUID DEFAULT NULL,
    IN p_TotalItemCount INTEGER DEFAULT NULL,
    IN p_LastProcessedOffset INTEGER DEFAULT NULL,
    IN p_BatchSize INTEGER DEFAULT NULL,
    IN p_ErrorCount INTEGER DEFAULT NULL,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_CancellationRequested BOOLEAN DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwContentProcessRuns" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentProcessRun"
            (
                "ID",
                "SourceID",
                "StartTime",
                "EndTime",
                "Status",
                "ProcessedItems",
                "StartedByUserID",
                "TotalItemCount",
                "LastProcessedOffset",
                "BatchSize",
                "ErrorCount",
                "ErrorMessage",
                "CancellationRequested",
                "Configuration"
            )
        VALUES
            (
                p_ID,
                p_SourceID,
                p_StartTime,
                p_EndTime,
                p_Status,
                p_ProcessedItems,
                p_StartedByUserID,
                p_TotalItemCount,
                p_LastProcessedOffset,
                p_BatchSize,
                p_ErrorCount,
                p_ErrorMessage,
                COALESCE(p_CancellationRequested, FALSE),
                p_Configuration
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentProcessRun"
            (
                "SourceID",
                "StartTime",
                "EndTime",
                "Status",
                "ProcessedItems",
                "StartedByUserID",
                "TotalItemCount",
                "LastProcessedOffset",
                "BatchSize",
                "ErrorCount",
                "ErrorMessage",
                "CancellationRequested",
                "Configuration"
            )
        VALUES
            (
                p_SourceID,
                p_StartTime,
                p_EndTime,
                p_Status,
                p_ProcessedItems,
                p_StartedByUserID,
                p_TotalItemCount,
                p_LastProcessedOffset,
                p_BatchSize,
                p_ErrorCount,
                p_ErrorMessage,
                COALESCE(p_CancellationRequested, FALSE),
                p_Configuration
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentProcessRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentProcessRun"(
    IN p_ID UUID,
    IN p_SourceID UUID,
    IN p_StartTime TIMESTAMPTZ,
    IN p_EndTime TIMESTAMPTZ,
    IN p_Status VARCHAR(100),
    IN p_ProcessedItems INTEGER,
    IN p_StartedByUserID UUID,
    IN p_TotalItemCount INTEGER,
    IN p_LastProcessedOffset INTEGER,
    IN p_BatchSize INTEGER,
    IN p_ErrorCount INTEGER,
    IN p_ErrorMessage TEXT,
    IN p_CancellationRequested BOOLEAN,
    IN p_Configuration TEXT
)
RETURNS SETOF __mj."vwContentProcessRuns" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentProcessRun"
    SET
        "SourceID" = p_SourceID,
        "StartTime" = p_StartTime,
        "EndTime" = p_EndTime,
        "Status" = p_Status,
        "ProcessedItems" = p_ProcessedItems,
        "StartedByUserID" = p_StartedByUserID,
        "TotalItemCount" = p_TotalItemCount,
        "LastProcessedOffset" = p_LastProcessedOffset,
        "BatchSize" = p_BatchSize,
        "ErrorCount" = p_ErrorCount,
        "ErrorMessage" = p_ErrorMessage,
        "CancellationRequested" = p_CancellationRequested,
        "Configuration" = p_Configuration
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentProcessRuns" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentProcessRuns" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentProcessRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentProcessRun"
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

CREATE OR REPLACE FUNCTION __mj."spCreateContentItem"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ContentSourceID UUID DEFAULT NULL,
    IN p_Name VARCHAR(250) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_ContentTypeID UUID DEFAULT NULL,
    IN p_ContentSourceTypeID UUID DEFAULT NULL,
    IN p_ContentFileTypeID UUID DEFAULT NULL,
    IN p_Checksum VARCHAR(100) DEFAULT NULL,
    IN p_URL VARCHAR(2000) DEFAULT NULL,
    IN p_Text TEXT DEFAULT NULL,
    IN p_EntityRecordDocumentID UUID DEFAULT NULL,
    IN p_EmbeddingStatus VARCHAR(20) DEFAULT NULL,
    IN p_LastEmbeddedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_TaggingStatus VARCHAR(20) DEFAULT NULL,
    IN p_LastTaggedAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF __mj."vwContentItems" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentItem"
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
                "LastTaggedAt"
            )
        VALUES
            (
                p_ID,
                p_ContentSourceID,
                p_Name,
                p_Description,
                p_ContentTypeID,
                p_ContentSourceTypeID,
                p_ContentFileTypeID,
                p_Checksum,
                p_URL,
                p_Text,
                p_EntityRecordDocumentID,
                COALESCE(p_EmbeddingStatus, 'Pending'),
                p_LastEmbeddedAt,
                p_EmbeddingModelID,
                COALESCE(p_TaggingStatus, 'Pending'),
                p_LastTaggedAt
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentItem"
            (
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
                "LastTaggedAt"
            )
        VALUES
            (
                p_ContentSourceID,
                p_Name,
                p_Description,
                p_ContentTypeID,
                p_ContentSourceTypeID,
                p_ContentFileTypeID,
                p_Checksum,
                p_URL,
                p_Text,
                p_EntityRecordDocumentID,
                COALESCE(p_EmbeddingStatus, 'Pending'),
                p_LastEmbeddedAt,
                p_EmbeddingModelID,
                COALESCE(p_TaggingStatus, 'Pending'),
                p_LastTaggedAt
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentItem"(
    IN p_ID UUID,
    IN p_ContentSourceID UUID,
    IN p_Name VARCHAR(250),
    IN p_Description TEXT,
    IN p_ContentTypeID UUID,
    IN p_ContentSourceTypeID UUID,
    IN p_ContentFileTypeID UUID,
    IN p_Checksum VARCHAR(100),
    IN p_URL VARCHAR(2000),
    IN p_Text TEXT,
    IN p_EntityRecordDocumentID UUID,
    IN p_EmbeddingStatus VARCHAR(20),
    IN p_LastEmbeddedAt TIMESTAMPTZ,
    IN p_EmbeddingModelID UUID,
    IN p_TaggingStatus VARCHAR(20),
    IN p_LastTaggedAt TIMESTAMPTZ
)
RETURNS SETOF __mj."vwContentItems" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentItem"
    SET
        "ContentSourceID" = p_ContentSourceID,
        "Name" = p_Name,
        "Description" = p_Description,
        "ContentTypeID" = p_ContentTypeID,
        "ContentSourceTypeID" = p_ContentSourceTypeID,
        "ContentFileTypeID" = p_ContentFileTypeID,
        "Checksum" = p_Checksum,
        "URL" = p_URL,
        "Text" = p_Text,
        "EntityRecordDocumentID" = p_EntityRecordDocumentID,
        "EmbeddingStatus" = p_EmbeddingStatus,
        "LastEmbeddedAt" = p_LastEmbeddedAt,
        "EmbeddingModelID" = p_EmbeddingModelID,
        "TaggingStatus" = p_TaggingStatus,
        "LastTaggedAt" = p_LastTaggedAt
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentItems" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentItems" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentItem"
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

CREATE OR REPLACE FUNCTION __mj."spCreateContentProcessRunDetail"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ContentProcessRunID UUID DEFAULT NULL,
    IN p_ContentSourceID UUID DEFAULT NULL,
    IN p_ContentSourceTypeID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ItemsProcessed INTEGER DEFAULT NULL,
    IN p_ItemsTagged INTEGER DEFAULT NULL,
    IN p_ItemsVectorized INTEGER DEFAULT NULL,
    IN p_TagsCreated INTEGER DEFAULT NULL,
    IN p_ErrorCount INTEGER DEFAULT NULL,
    IN p_StartTime TIMESTAMPTZ DEFAULT NULL,
    IN p_EndTime TIMESTAMPTZ DEFAULT NULL,
    IN p_TotalTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCost NUMERIC(18,6) DEFAULT NULL
)
RETURNS SETOF __mj."vwContentProcessRunDetails" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentProcessRunDetail"
            (
                "ID",
                "ContentProcessRunID",
                "ContentSourceID",
                "ContentSourceTypeID",
                "Status",
                "ItemsProcessed",
                "ItemsTagged",
                "ItemsVectorized",
                "TagsCreated",
                "ErrorCount",
                "StartTime",
                "EndTime",
                "TotalTokensUsed",
                "TotalCost"
            )
        VALUES
            (
                p_ID,
                p_ContentProcessRunID,
                p_ContentSourceID,
                p_ContentSourceTypeID,
                COALESCE(p_Status, 'Pending'),
                COALESCE(p_ItemsProcessed, 0),
                COALESCE(p_ItemsTagged, 0),
                COALESCE(p_ItemsVectorized, 0),
                COALESCE(p_TagsCreated, 0),
                COALESCE(p_ErrorCount, 0),
                p_StartTime,
                p_EndTime,
                COALESCE(p_TotalTokensUsed, 0),
                COALESCE(p_TotalCost, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentProcessRunDetail"
            (
                "ContentProcessRunID",
                "ContentSourceID",
                "ContentSourceTypeID",
                "Status",
                "ItemsProcessed",
                "ItemsTagged",
                "ItemsVectorized",
                "TagsCreated",
                "ErrorCount",
                "StartTime",
                "EndTime",
                "TotalTokensUsed",
                "TotalCost"
            )
        VALUES
            (
                p_ContentProcessRunID,
                p_ContentSourceID,
                p_ContentSourceTypeID,
                COALESCE(p_Status, 'Pending'),
                COALESCE(p_ItemsProcessed, 0),
                COALESCE(p_ItemsTagged, 0),
                COALESCE(p_ItemsVectorized, 0),
                COALESCE(p_TagsCreated, 0),
                COALESCE(p_ErrorCount, 0),
                p_StartTime,
                p_EndTime,
                COALESCE(p_TotalTokensUsed, 0),
                COALESCE(p_TotalCost, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentProcessRunDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentProcessRunDetail"(
    IN p_ID UUID,
    IN p_ContentProcessRunID UUID,
    IN p_ContentSourceID UUID,
    IN p_ContentSourceTypeID UUID,
    IN p_Status VARCHAR(20),
    IN p_ItemsProcessed INTEGER,
    IN p_ItemsTagged INTEGER,
    IN p_ItemsVectorized INTEGER,
    IN p_TagsCreated INTEGER,
    IN p_ErrorCount INTEGER,
    IN p_StartTime TIMESTAMPTZ,
    IN p_EndTime TIMESTAMPTZ,
    IN p_TotalTokensUsed INTEGER,
    IN p_TotalCost NUMERIC(18,6)
)
RETURNS SETOF __mj."vwContentProcessRunDetails" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentProcessRunDetail"
    SET
        "ContentProcessRunID" = p_ContentProcessRunID,
        "ContentSourceID" = p_ContentSourceID,
        "ContentSourceTypeID" = p_ContentSourceTypeID,
        "Status" = p_Status,
        "ItemsProcessed" = p_ItemsProcessed,
        "ItemsTagged" = p_ItemsTagged,
        "ItemsVectorized" = p_ItemsVectorized,
        "TagsCreated" = p_TagsCreated,
        "ErrorCount" = p_ErrorCount,
        "StartTime" = p_StartTime,
        "EndTime" = p_EndTime,
        "TotalTokensUsed" = p_TotalTokensUsed,
        "TotalCost" = p_TotalCost
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentProcessRunDetails" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentProcessRunDetails" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentProcessRunDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentProcessRunDetail"
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

CREATE OR REPLACE FUNCTION __mj."spCreateContentSourceType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description VARCHAR(1000) DEFAULT NULL,
    IN p_DriverClass VARCHAR(255) DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwContentSourceTypes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentSourceType"
            (
                "ID",
                "Name",
                "Description",
                "DriverClass",
                "Configuration"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_DriverClass,
                p_Configuration
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentSourceType"
            (
                "Name",
                "Description",
                "DriverClass",
                "Configuration"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_DriverClass,
                p_Configuration
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentSourceTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentSourceType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255),
    IN p_Description VARCHAR(1000),
    IN p_DriverClass VARCHAR(255),
    IN p_Configuration TEXT
)
RETURNS SETOF __mj."vwContentSourceTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentSourceType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DriverClass" = p_DriverClass,
        "Configuration" = p_Configuration
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentSourceTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentSourceTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentSourceType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentSourceType"
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

CREATE OR REPLACE FUNCTION __mj."spCreateContentSource"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_ContentTypeID UUID DEFAULT NULL,
    IN p_ContentSourceTypeID UUID DEFAULT NULL,
    IN p_ContentFileTypeID UUID DEFAULT NULL,
    IN p_URL VARCHAR(2000) DEFAULT NULL,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_VectorIndexID UUID DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_EntityDocumentID UUID DEFAULT NULL,
    IN p_ScheduledActionID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwContentSources" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentSource"
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
                "ScheduledActionID"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_ContentTypeID,
                p_ContentSourceTypeID,
                p_ContentFileTypeID,
                p_URL,
                p_EmbeddingModelID,
                p_VectorIndexID,
                p_Configuration,
                p_EntityID,
                p_EntityDocumentID,
                p_ScheduledActionID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentSource"
            (
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
                "ScheduledActionID"
            )
        VALUES
            (
                p_Name,
                p_ContentTypeID,
                p_ContentSourceTypeID,
                p_ContentFileTypeID,
                p_URL,
                p_EmbeddingModelID,
                p_VectorIndexID,
                p_Configuration,
                p_EntityID,
                p_EntityDocumentID,
                p_ScheduledActionID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentSources" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentSource"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255),
    IN p_ContentTypeID UUID,
    IN p_ContentSourceTypeID UUID,
    IN p_ContentFileTypeID UUID,
    IN p_URL VARCHAR(2000),
    IN p_EmbeddingModelID UUID,
    IN p_VectorIndexID UUID,
    IN p_Configuration TEXT,
    IN p_EntityID UUID,
    IN p_EntityDocumentID UUID,
    IN p_ScheduledActionID UUID
)
RETURNS SETOF __mj."vwContentSources" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentSource"
    SET
        "Name" = p_Name,
        "ContentTypeID" = p_ContentTypeID,
        "ContentSourceTypeID" = p_ContentSourceTypeID,
        "ContentFileTypeID" = p_ContentFileTypeID,
        "URL" = p_URL,
        "EmbeddingModelID" = p_EmbeddingModelID,
        "VectorIndexID" = p_VectorIndexID,
        "Configuration" = p_Configuration,
        "EntityID" = p_EntityID,
        "EntityDocumentID" = p_EntityDocumentID,
        "ScheduledActionID" = p_ScheduledActionID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentSources" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentSources" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentSource"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentSource"
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

CREATE OR REPLACE FUNCTION __mj."spCreateContentType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AIModelID UUID DEFAULT NULL,
    IN p_MinTags INTEGER DEFAULT NULL,
    IN p_MaxTags INTEGER DEFAULT NULL,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_VectorIndexID UUID DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwContentTypes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentType"
            (
                "ID",
                "Name",
                "Description",
                "AIModelID",
                "MinTags",
                "MaxTags",
                "EmbeddingModelID",
                "VectorIndexID",
                "Configuration"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_AIModelID,
                p_MinTags,
                p_MaxTags,
                p_EmbeddingModelID,
                p_VectorIndexID,
                p_Configuration
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentType"
            (
                "Name",
                "Description",
                "AIModelID",
                "MinTags",
                "MaxTags",
                "EmbeddingModelID",
                "VectorIndexID",
                "Configuration"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_AIModelID,
                p_MinTags,
                p_MaxTags,
                p_EmbeddingModelID,
                p_VectorIndexID,
                p_Configuration
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255),
    IN p_Description TEXT,
    IN p_AIModelID UUID,
    IN p_MinTags INTEGER,
    IN p_MaxTags INTEGER,
    IN p_EmbeddingModelID UUID,
    IN p_VectorIndexID UUID,
    IN p_Configuration TEXT
)
RETURNS SETOF __mj."vwContentTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "AIModelID" = p_AIModelID,
        "MinTags" = p_MinTags,
        "MaxTags" = p_MaxTags,
        "EmbeddingModelID" = p_EmbeddingModelID,
        "VectorIndexID" = p_VectorIndexID,
        "Configuration" = p_Configuration
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentType"
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

CREATE OR REPLACE FUNCTION __mj."spCreateDuplicateRunDetail"(
    IN p_ID UUID DEFAULT NULL,
    IN p_DuplicateRunID UUID DEFAULT NULL,
    IN p_RecordID VARCHAR(500) DEFAULT NULL,
    IN p_MatchStatus VARCHAR(20) DEFAULT NULL,
    IN p_SkippedReason TEXT DEFAULT NULL,
    IN p_MatchErrorMessage TEXT DEFAULT NULL,
    IN p_MergeStatus VARCHAR(20) DEFAULT NULL,
    IN p_MergeErrorMessage TEXT DEFAULT NULL,
    IN p_RecordMetadata TEXT DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndedAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF __mj."vwDuplicateRunDetails" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."DuplicateRunDetail"
            (
                "ID",
                "DuplicateRunID",
                "RecordID",
                "MatchStatus",
                "SkippedReason",
                "MatchErrorMessage",
                "MergeStatus",
                "MergeErrorMessage",
                "RecordMetadata",
                "StartedAt",
                "EndedAt"
            )
        VALUES
            (
                p_ID,
                p_DuplicateRunID,
                p_RecordID,
                COALESCE(p_MatchStatus, 'Pending'),
                p_SkippedReason,
                p_MatchErrorMessage,
                COALESCE(p_MergeStatus, 'Not Applicable'),
                p_MergeErrorMessage,
                p_RecordMetadata,
                p_StartedAt,
                p_EndedAt
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."DuplicateRunDetail"
            (
                "DuplicateRunID",
                "RecordID",
                "MatchStatus",
                "SkippedReason",
                "MatchErrorMessage",
                "MergeStatus",
                "MergeErrorMessage",
                "RecordMetadata",
                "StartedAt",
                "EndedAt"
            )
        VALUES
            (
                p_DuplicateRunID,
                p_RecordID,
                COALESCE(p_MatchStatus, 'Pending'),
                p_SkippedReason,
                p_MatchErrorMessage,
                COALESCE(p_MergeStatus, 'Not Applicable'),
                p_MergeErrorMessage,
                p_RecordMetadata,
                p_StartedAt,
                p_EndedAt
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDuplicateRunDetail"(
    IN p_ID UUID,
    IN p_DuplicateRunID UUID,
    IN p_RecordID VARCHAR(500),
    IN p_MatchStatus VARCHAR(20),
    IN p_SkippedReason TEXT,
    IN p_MatchErrorMessage TEXT,
    IN p_MergeStatus VARCHAR(20),
    IN p_MergeErrorMessage TEXT,
    IN p_RecordMetadata TEXT,
    IN p_StartedAt TIMESTAMPTZ,
    IN p_EndedAt TIMESTAMPTZ
)
RETURNS SETOF __mj."vwDuplicateRunDetails" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."DuplicateRunDetail"
    SET
        "DuplicateRunID" = p_DuplicateRunID,
        "RecordID" = p_RecordID,
        "MatchStatus" = p_MatchStatus,
        "SkippedReason" = p_SkippedReason,
        "MatchErrorMessage" = p_MatchErrorMessage,
        "MergeStatus" = p_MergeStatus,
        "MergeErrorMessage" = p_MergeErrorMessage,
        "RecordMetadata" = p_RecordMetadata,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetails" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetails" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDuplicateRun"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_StartedByUserID UUID DEFAULT NULL,
    IN p_SourceListID UUID DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ApprovalStatus VARCHAR(20) DEFAULT NULL,
    IN p_ApprovalComments TEXT DEFAULT NULL,
    IN p_ApprovedByUserID UUID DEFAULT NULL,
    IN p_ProcessingStatus VARCHAR(20) DEFAULT NULL,
    IN p_ProcessingErrorMessage TEXT DEFAULT NULL,
    IN p_TotalItemCount INTEGER DEFAULT NULL,
    IN p_ProcessedItemCount INTEGER DEFAULT NULL,
    IN p_LastProcessedOffset INTEGER DEFAULT NULL,
    IN p_BatchSize INTEGER DEFAULT NULL,
    IN p_CancellationRequested BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwDuplicateRuns" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."DuplicateRun"
            (
                "ID",
                "EntityID",
                "StartedByUserID",
                "SourceListID",
                "StartedAt",
                "EndedAt",
                "ApprovalStatus",
                "ApprovalComments",
                "ApprovedByUserID",
                "ProcessingStatus",
                "ProcessingErrorMessage",
                "TotalItemCount",
                "ProcessedItemCount",
                "LastProcessedOffset",
                "BatchSize",
                "CancellationRequested"
            )
        VALUES
            (
                p_ID,
                p_EntityID,
                p_StartedByUserID,
                p_SourceListID,
                COALESCE(p_StartedAt, NOW()),
                p_EndedAt,
                COALESCE(p_ApprovalStatus, 'Pending'),
                p_ApprovalComments,
                p_ApprovedByUserID,
                COALESCE(p_ProcessingStatus, 'Pending'),
                p_ProcessingErrorMessage,
                p_TotalItemCount,
                p_ProcessedItemCount,
                p_LastProcessedOffset,
                p_BatchSize,
                COALESCE(p_CancellationRequested, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."DuplicateRun"
            (
                "EntityID",
                "StartedByUserID",
                "SourceListID",
                "StartedAt",
                "EndedAt",
                "ApprovalStatus",
                "ApprovalComments",
                "ApprovedByUserID",
                "ProcessingStatus",
                "ProcessingErrorMessage",
                "TotalItemCount",
                "ProcessedItemCount",
                "LastProcessedOffset",
                "BatchSize",
                "CancellationRequested"
            )
        VALUES
            (
                p_EntityID,
                p_StartedByUserID,
                p_SourceListID,
                COALESCE(p_StartedAt, NOW()),
                p_EndedAt,
                COALESCE(p_ApprovalStatus, 'Pending'),
                p_ApprovalComments,
                p_ApprovedByUserID,
                COALESCE(p_ProcessingStatus, 'Pending'),
                p_ProcessingErrorMessage,
                p_TotalItemCount,
                p_ProcessedItemCount,
                p_LastProcessedOffset,
                p_BatchSize,
                COALESCE(p_CancellationRequested, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDuplicateRun"(
    IN p_ID UUID,
    IN p_EntityID UUID,
    IN p_StartedByUserID UUID,
    IN p_SourceListID UUID,
    IN p_StartedAt TIMESTAMPTZ,
    IN p_EndedAt TIMESTAMPTZ,
    IN p_ApprovalStatus VARCHAR(20),
    IN p_ApprovalComments TEXT,
    IN p_ApprovedByUserID UUID,
    IN p_ProcessingStatus VARCHAR(20),
    IN p_ProcessingErrorMessage TEXT,
    IN p_TotalItemCount INTEGER,
    IN p_ProcessedItemCount INTEGER,
    IN p_LastProcessedOffset INTEGER,
    IN p_BatchSize INTEGER,
    IN p_CancellationRequested BOOLEAN
)
RETURNS SETOF __mj."vwDuplicateRuns" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."DuplicateRun"
    SET
        "EntityID" = p_EntityID,
        "StartedByUserID" = p_StartedByUserID,
        "SourceListID" = p_SourceListID,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "ApprovalStatus" = p_ApprovalStatus,
        "ApprovalComments" = p_ApprovalComments,
        "ApprovedByUserID" = p_ApprovedByUserID,
        "ProcessingStatus" = p_ProcessingStatus,
        "ProcessingErrorMessage" = p_ProcessingErrorMessage,
        "TotalItemCount" = p_TotalItemCount,
        "ProcessedItemCount" = p_ProcessedItemCount,
        "LastProcessedOffset" = p_LastProcessedOffset,
        "BatchSize" = p_BatchSize,
        "CancellationRequested" = p_CancellationRequested
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRuns" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRuns" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDuplicateRunDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DuplicateRunDetail"
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

CREATE OR REPLACE FUNCTION __mj."spDeleteDuplicateRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DuplicateRun"
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

CREATE OR REPLACE FUNCTION __mj."spCreateKnowledgeHubSavedSearch"(
    IN p_ID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Query VARCHAR(1000) DEFAULT NULL,
    IN p_Filters TEXT DEFAULT NULL,
    IN p_MinScore NUMERIC(3,2) DEFAULT NULL,
    IN p_MaxResults INTEGER DEFAULT NULL,
    IN p_NotifyOnNewResults BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwKnowledgeHubSavedSearches" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."KnowledgeHubSavedSearch"
            (
                "ID",
                "UserID",
                "Name",
                "Query",
                "Filters",
                "MinScore",
                "MaxResults",
                "NotifyOnNewResults"
            )
        VALUES
            (
                p_ID,
                p_UserID,
                p_Name,
                p_Query,
                p_Filters,
                p_MinScore,
                p_MaxResults,
                COALESCE(p_NotifyOnNewResults, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."KnowledgeHubSavedSearch"
            (
                "UserID",
                "Name",
                "Query",
                "Filters",
                "MinScore",
                "MaxResults",
                "NotifyOnNewResults"
            )
        VALUES
            (
                p_UserID,
                p_Name,
                p_Query,
                p_Filters,
                p_MinScore,
                p_MaxResults,
                COALESCE(p_NotifyOnNewResults, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwKnowledgeHubSavedSearches" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateKnowledgeHubSavedSearch"(
    IN p_ID UUID,
    IN p_UserID UUID,
    IN p_Name VARCHAR(255),
    IN p_Query VARCHAR(1000),
    IN p_Filters TEXT,
    IN p_MinScore NUMERIC(3,2),
    IN p_MaxResults INTEGER,
    IN p_NotifyOnNewResults BOOLEAN
)
RETURNS SETOF __mj."vwKnowledgeHubSavedSearches" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."KnowledgeHubSavedSearch"
    SET
        "UserID" = p_UserID,
        "Name" = p_Name,
        "Query" = p_Query,
        "Filters" = p_Filters,
        "MinScore" = p_MinScore,
        "MaxResults" = p_MaxResults,
        "NotifyOnNewResults" = p_NotifyOnNewResults
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwKnowledgeHubSavedSearches" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwKnowledgeHubSavedSearches" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteKnowledgeHubSavedSearch"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."KnowledgeHubSavedSearch"
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

CREATE OR REPLACE FUNCTION __mj."spCreateTaggedItem"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TagID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID VARCHAR(450) DEFAULT NULL,
    IN p_Weight NUMERIC(5,4) DEFAULT NULL
)
RETURNS SETOF __mj."vwTaggedItems" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TaggedItem"
            (
                "ID",
                "TagID",
                "EntityID",
                "RecordID",
                "Weight"
            )
        VALUES
            (
                p_ID,
                p_TagID,
                p_EntityID,
                p_RecordID,
                COALESCE(p_Weight, 1.0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TaggedItem"
            (
                "TagID",
                "EntityID",
                "RecordID",
                "Weight"
            )
        VALUES
            (
                p_TagID,
                p_EntityID,
                p_RecordID,
                COALESCE(p_Weight, 1.0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTaggedItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTaggedItem"(
    IN p_ID UUID,
    IN p_TagID UUID,
    IN p_EntityID UUID,
    IN p_RecordID VARCHAR(450),
    IN p_Weight NUMERIC(5,4)
)
RETURNS SETOF __mj."vwTaggedItems" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TaggedItem"
    SET
        "TagID" = p_TagID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "Weight" = p_Weight
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTaggedItems" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTaggedItems" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTaggedItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TaggedItem"
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
    IN p_MergedIntoTagID UUID DEFAULT NULL
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
                "MergedIntoTagID"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_ParentID,
                p_DisplayName,
                p_Description,
                COALESCE(p_Status, 'Active'),
                p_MergedIntoTagID
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
                "MergedIntoTagID"
            )
        VALUES
            (
                p_Name,
                p_ParentID,
                p_DisplayName,
                p_Description,
                COALESCE(p_Status, 'Active'),
                p_MergedIntoTagID
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
    IN p_MergedIntoTagID UUID
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
        "MergedIntoTagID" = p_MergedIntoTagID
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

CREATE OR REPLACE FUNCTION __mj."spCreateTagCoOccurrence"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TagAID UUID DEFAULT NULL,
    IN p_TagBID UUID DEFAULT NULL,
    IN p_CoOccurrenceCount INTEGER DEFAULT NULL,
    IN p_LastComputedAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF __mj."vwTagCoOccurrences" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TagCoOccurrence"
            (
                "ID",
                "TagAID",
                "TagBID",
                "CoOccurrenceCount",
                "LastComputedAt"
            )
        VALUES
            (
                p_ID,
                p_TagAID,
                p_TagBID,
                COALESCE(p_CoOccurrenceCount, 0),
                COALESCE(p_LastComputedAt, NOW())
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TagCoOccurrence"
            (
                "TagAID",
                "TagBID",
                "CoOccurrenceCount",
                "LastComputedAt"
            )
        VALUES
            (
                p_TagAID,
                p_TagBID,
                COALESCE(p_CoOccurrenceCount, 0),
                COALESCE(p_LastComputedAt, NOW())
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTagCoOccurrences" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTagCoOccurrence"(
    IN p_ID UUID,
    IN p_TagAID UUID,
    IN p_TagBID UUID,
    IN p_CoOccurrenceCount INTEGER,
    IN p_LastComputedAt TIMESTAMPTZ
)
RETURNS SETOF __mj."vwTagCoOccurrences" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TagCoOccurrence"
    SET
        "TagAID" = p_TagAID,
        "TagBID" = p_TagBID,
        "CoOccurrenceCount" = p_CoOccurrenceCount,
        "LastComputedAt" = p_LastComputedAt
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTagCoOccurrences" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTagCoOccurrences" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTagCoOccurrence"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TagCoOccurrence"
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

CREATE OR REPLACE FUNCTION __mj."spCreateTagAuditLog"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TagID UUID DEFAULT NULL,
    IN p_Action VARCHAR(30) DEFAULT NULL,
    IN p_Details TEXT DEFAULT NULL,
    IN p_PerformedByUserID UUID DEFAULT NULL,
    IN p_RelatedTagID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwTagAuditLogs" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TagAuditLog"
            (
                "ID",
                "TagID",
                "Action",
                "Details",
                "PerformedByUserID",
                "RelatedTagID"
            )
        VALUES
            (
                p_ID,
                p_TagID,
                p_Action,
                p_Details,
                p_PerformedByUserID,
                p_RelatedTagID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TagAuditLog"
            (
                "TagID",
                "Action",
                "Details",
                "PerformedByUserID",
                "RelatedTagID"
            )
        VALUES
            (
                p_TagID,
                p_Action,
                p_Details,
                p_PerformedByUserID,
                p_RelatedTagID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTagAuditLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTagAuditLog"(
    IN p_ID UUID,
    IN p_TagID UUID,
    IN p_Action VARCHAR(30),
    IN p_Details TEXT,
    IN p_PerformedByUserID UUID,
    IN p_RelatedTagID UUID
)
RETURNS SETOF __mj."vwTagAuditLogs" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TagAuditLog"
    SET
        "TagID" = p_TagID,
        "Action" = p_Action,
        "Details" = p_Details,
        "PerformedByUserID" = p_PerformedByUserID,
        "RelatedTagID" = p_RelatedTagID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTagAuditLogs" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTagAuditLogs" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTagAuditLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TagAuditLog"
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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIPromptRunMedias_PromptRunIDID UUID;
    p_MJAIPromptRuns_ParentIDID UUID;
    p_MJAIPromptRuns_ParentID_PromptID UUID;
    p_MJAIPromptRuns_ParentID_ModelID UUID;
    p_MJAIPromptRuns_ParentID_VendorID UUID;
    p_MJAIPromptRuns_ParentID_AgentID UUID;
    p_MJAIPromptRuns_ParentID_ConfigurationID UUID;
    p_MJAIPromptRuns_ParentID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_ParentID_Messages TEXT;
    p_MJAIPromptRuns_ParentID_Result TEXT;
    p_MJAIPromptRuns_ParentID_TokensUsed INTEGER;
    p_MJAIPromptRuns_ParentID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_ParentID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_ParentID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_ParentID_Success BOOLEAN;
    p_MJAIPromptRuns_ParentID_ErrorMessage TEXT;
    p_MJAIPromptRuns_ParentID_ParentID UUID;
    p_MJAIPromptRuns_ParentID_RunType VARCHAR(20);
    p_MJAIPromptRuns_ParentID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_ParentID_AgentRunID UUID;
    p_MJAIPromptRuns_ParentID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_ParentID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_ParentID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_ParentID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_ParentID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_ParentID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_TopK INTEGER;
    p_MJAIPromptRuns_ParentID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_Seed INTEGER;
    p_MJAIPromptRuns_ParentID_StopSequences TEXT;
    p_MJAIPromptRuns_ParentID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_ParentID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_ParentID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_ParentID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_ParentID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_ParentID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_ParentID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_ParentID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_ParentID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_ParentID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_ParentID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_ParentID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_ParentID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_ParentID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_ParentID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_ParentID_ValidationSummary TEXT;
    p_MJAIPromptRuns_ParentID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_ParentID_FailoverErrors TEXT;
    p_MJAIPromptRuns_ParentID_FailoverDurations TEXT;
    p_MJAIPromptRuns_ParentID_OriginalModelID UUID;
    p_MJAIPromptRuns_ParentID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_ParentID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_ParentID_ModelSelection TEXT;
    p_MJAIPromptRuns_ParentID_Status VARCHAR(50);
    p_MJAIPromptRuns_ParentID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_ParentID_CancellationReason TEXT;
    p_MJAIPromptRuns_ParentID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_ParentID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_ParentID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_ParentID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_ParentID_JudgeID UUID;
    p_MJAIPromptRuns_ParentID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_ParentID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_ParentID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_ParentID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_ParentID_ErrorDetails TEXT;
    p_MJAIPromptRuns_ParentID_ChildPromptID UUID;
    p_MJAIPromptRuns_ParentID_QueueTime INTEGER;
    p_MJAIPromptRuns_ParentID_PromptTime INTEGER;
    p_MJAIPromptRuns_ParentID_CompletionTime INTEGER;
    p_MJAIPromptRuns_ParentID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_ParentID_EffortLevel INTEGER;
    p_MJAIPromptRuns_ParentID_RunName VARCHAR(255);
    p_MJAIPromptRuns_ParentID_Comments TEXT;
    p_MJAIPromptRuns_ParentID_TestRunID UUID;
    p_MJAIPromptRuns_ParentID_AssistantPrefill TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunIDID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_PromptID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_VendorID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_AgentID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_Messages TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_Result TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsed INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_RerunFromPromptRunID_Success BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ParentID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_RunType VARCHAR(20);
    p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_AgentRunID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_RerunFromPromptRunID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_TopK INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_Seed INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_StopSequences TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelSelection TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_Status VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_CancellationReason TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_RerunFromPromptRunID_JudgeID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_QueueTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_PromptTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_CompletionTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificRespon_874f7c TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_EffortLevel INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_RunName VARCHAR(255);
    p_MJAIPromptRuns_RerunFromPromptRunID_Comments TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_TestRunID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill TEXT;
    p_MJAIResultCache_PromptRunIDID UUID;
    p_MJAIResultCache_PromptRunID_AIPromptID UUID;
    p_MJAIResultCache_PromptRunID_AIModelID UUID;
    p_MJAIResultCache_PromptRunID_RunAt TIMESTAMPTZ;
    p_MJAIResultCache_PromptRunID_PromptText TEXT;
    p_MJAIResultCache_PromptRunID_ResultText TEXT;
    p_MJAIResultCache_PromptRunID_Status VARCHAR(50);
    p_MJAIResultCache_PromptRunID_ExpiredOn TIMESTAMPTZ;
    p_MJAIResultCache_PromptRunID_VendorID UUID;
    p_MJAIResultCache_PromptRunID_AgentID UUID;
    p_MJAIResultCache_PromptRunID_ConfigurationID UUID;
    p_MJAIResultCache_PromptRunID_PromptEmbedding BYTEA;
    p_MJAIResultCache_PromptRunID_PromptRunID UUID;
    p_MJContentProcessRunPromptRuns_AIPromptRunIDID UUID;
BEGIN
-- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptRunMedia" WHERE "PromptRunID" = p_ID
    LOOP
        p_MJAIPromptRunMedias_PromptRunIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptRunMedia"(p_MJAIPromptRunMedias_PromptRunIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "ParentID" = p_ID
    LOOP
        p_MJAIPromptRuns_ParentIDID := _rec."ID";
        p_MJAIPromptRuns_ParentID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_ParentID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_ParentID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_ParentID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_ParentID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_ParentID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_ParentID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_ParentID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_ParentID_Messages := _rec."Messages";
        p_MJAIPromptRuns_ParentID_Result := _rec."Result";
        p_MJAIPromptRuns_ParentID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_ParentID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_ParentID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_ParentID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_ParentID_Success := _rec."Success";
        p_MJAIPromptRuns_ParentID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_ParentID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_ParentID_RunType := _rec."RunType";
        p_MJAIPromptRuns_ParentID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_ParentID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_ParentID_Cost := _rec."Cost";
        p_MJAIPromptRuns_ParentID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_ParentID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_ParentID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_ParentID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_ParentID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_ParentID_TopP := _rec."TopP";
        p_MJAIPromptRuns_ParentID_TopK := _rec."TopK";
        p_MJAIPromptRuns_ParentID_MinP := _rec."MinP";
        p_MJAIPromptRuns_ParentID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_ParentID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_ParentID_Seed := _rec."Seed";
        p_MJAIPromptRuns_ParentID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_ParentID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_ParentID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_ParentID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_ParentID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_ParentID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_ParentID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_ParentID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_ParentID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_ParentID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_ParentID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_ParentID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_ParentID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_ParentID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_ParentID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_ParentID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_ParentID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_ParentID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_ParentID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_ParentID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_ParentID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_ParentID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_ParentID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_ParentID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_ParentID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_ParentID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_ParentID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_ParentID_Status := _rec."Status";
        p_MJAIPromptRuns_ParentID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_ParentID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_ParentID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_ParentID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_ParentID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_ParentID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_ParentID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_ParentID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_ParentID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_ParentID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_ParentID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_ParentID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_ParentID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_ParentID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_ParentID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_ParentID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_ParentID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_ParentID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_ParentID_RunName := _rec."RunName";
        p_MJAIPromptRuns_ParentID_Comments := _rec."Comments";
        p_MJAIPromptRuns_ParentID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_ParentID_AssistantPrefill := _rec."AssistantPrefill";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_MJAIPromptRuns_ParentIDID, p_MJAIPromptRuns_ParentID_PromptID, p_MJAIPromptRuns_ParentID_ModelID, p_MJAIPromptRuns_ParentID_VendorID, p_MJAIPromptRuns_ParentID_AgentID, p_MJAIPromptRuns_ParentID_ConfigurationID, p_MJAIPromptRuns_ParentID_RunAt, p_MJAIPromptRuns_ParentID_CompletedAt, p_MJAIPromptRuns_ParentID_ExecutionTimeMS, p_MJAIPromptRuns_ParentID_Messages, p_MJAIPromptRuns_ParentID_Result, p_MJAIPromptRuns_ParentID_TokensUsed, p_MJAIPromptRuns_ParentID_TokensPrompt, p_MJAIPromptRuns_ParentID_TokensCompletion, p_MJAIPromptRuns_ParentID_TotalCost, p_MJAIPromptRuns_ParentID_Success, p_MJAIPromptRuns_ParentID_ErrorMessage, p_MJAIPromptRuns_ParentID_ParentID, p_MJAIPromptRuns_ParentID_RunType, p_MJAIPromptRuns_ParentID_ExecutionOrder, p_MJAIPromptRuns_ParentID_AgentRunID, p_MJAIPromptRuns_ParentID_Cost, p_MJAIPromptRuns_ParentID_CostCurrency, p_MJAIPromptRuns_ParentID_TokensUsedRollup, p_MJAIPromptRuns_ParentID_TokensPromptRollup, p_MJAIPromptRuns_ParentID_TokensCompletionRollup, p_MJAIPromptRuns_ParentID_Temperature, p_MJAIPromptRuns_ParentID_TopP, p_MJAIPromptRuns_ParentID_TopK, p_MJAIPromptRuns_ParentID_MinP, p_MJAIPromptRuns_ParentID_FrequencyPenalty, p_MJAIPromptRuns_ParentID_PresencePenalty, p_MJAIPromptRuns_ParentID_Seed, p_MJAIPromptRuns_ParentID_StopSequences, p_MJAIPromptRuns_ParentID_ResponseFormat, p_MJAIPromptRuns_ParentID_LogProbs, p_MJAIPromptRuns_ParentID_TopLogProbs, p_MJAIPromptRuns_ParentID_DescendantCost, p_MJAIPromptRuns_ParentID_ValidationAttemptCount, p_MJAIPromptRuns_ParentID_SuccessfulValidationCount, p_MJAIPromptRuns_ParentID_FinalValidationPassed, p_MJAIPromptRuns_ParentID_ValidationBehavior, p_MJAIPromptRuns_ParentID_RetryStrategy, p_MJAIPromptRuns_ParentID_MaxRetriesConfigured, p_MJAIPromptRuns_ParentID_FinalValidationError, p_MJAIPromptRuns_ParentID_ValidationErrorCount, p_MJAIPromptRuns_ParentID_CommonValidationError, p_MJAIPromptRuns_ParentID_FirstAttemptAt, p_MJAIPromptRuns_ParentID_LastAttemptAt, p_MJAIPromptRuns_ParentID_TotalRetryDurationMS, p_MJAIPromptRuns_ParentID_ValidationAttempts, p_MJAIPromptRuns_ParentID_ValidationSummary, p_MJAIPromptRuns_ParentID_FailoverAttempts, p_MJAIPromptRuns_ParentID_FailoverErrors, p_MJAIPromptRuns_ParentID_FailoverDurations, p_MJAIPromptRuns_ParentID_OriginalModelID, p_MJAIPromptRuns_ParentID_OriginalRequestStartTime, p_MJAIPromptRuns_ParentID_TotalFailoverDuration, p_MJAIPromptRuns_ParentID_RerunFromPromptRunID, p_MJAIPromptRuns_ParentID_ModelSelection, p_MJAIPromptRuns_ParentID_Status, p_MJAIPromptRuns_ParentID_Cancelled, p_MJAIPromptRuns_ParentID_CancellationReason, p_MJAIPromptRuns_ParentID_ModelPowerRank, p_MJAIPromptRuns_ParentID_SelectionStrategy, p_MJAIPromptRuns_ParentID_CacheHit, p_MJAIPromptRuns_ParentID_CacheKey, p_MJAIPromptRuns_ParentID_JudgeID, p_MJAIPromptRuns_ParentID_JudgeScore, p_MJAIPromptRuns_ParentID_WasSelectedResult, p_MJAIPromptRuns_ParentID_StreamingEnabled, p_MJAIPromptRuns_ParentID_FirstTokenTime, p_MJAIPromptRuns_ParentID_ErrorDetails, p_MJAIPromptRuns_ParentID_ChildPromptID, p_MJAIPromptRuns_ParentID_QueueTime, p_MJAIPromptRuns_ParentID_PromptTime, p_MJAIPromptRuns_ParentID_CompletionTime, p_MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, p_MJAIPromptRuns_ParentID_EffortLevel, p_MJAIPromptRuns_ParentID_RunName, p_MJAIPromptRuns_ParentID_Comments, p_MJAIPromptRuns_ParentID_TestRunID, p_MJAIPromptRuns_ParentID_AssistantPrefill);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "RerunFromPromptRunID" = p_ID
    LOOP
        p_MJAIPromptRuns_RerunFromPromptRunIDID := _rec."ID";
        p_MJAIPromptRuns_RerunFromPromptRunID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_RerunFromPromptRunID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_RerunFromPromptRunID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_RerunFromPromptRunID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_RerunFromPromptRunID_Messages := _rec."Messages";
        p_MJAIPromptRuns_RerunFromPromptRunID_Result := _rec."Result";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_RerunFromPromptRunID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_RerunFromPromptRunID_Success := _rec."Success";
        p_MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_RerunFromPromptRunID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_RerunFromPromptRunID_RunType := _rec."RunType";
        p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_RerunFromPromptRunID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_RerunFromPromptRunID_Cost := _rec."Cost";
        p_MJAIPromptRuns_RerunFromPromptRunID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_RerunFromPromptRunID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_RerunFromPromptRunID_TopP := _rec."TopP";
        p_MJAIPromptRuns_RerunFromPromptRunID_TopK := _rec."TopK";
        p_MJAIPromptRuns_RerunFromPromptRunID_MinP := _rec."MinP";
        p_MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_RerunFromPromptRunID_Seed := _rec."Seed";
        p_MJAIPromptRuns_RerunFromPromptRunID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_RerunFromPromptRunID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_RerunFromPromptRunID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_RerunFromPromptRunID_Status := _rec."Status";
        p_MJAIPromptRuns_RerunFromPromptRunID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_RerunFromPromptRunID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_RerunFromPromptRunID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_RerunFromPromptRunID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_RerunFromPromptRunID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_RerunFromPromptRunID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_RerunFromPromptRunID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificRespon_874f7c := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_RerunFromPromptRunID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_RerunFromPromptRunID_RunName := _rec."RunName";
        p_MJAIPromptRuns_RerunFromPromptRunID_Comments := _rec."Comments";
        p_MJAIPromptRuns_RerunFromPromptRunID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill := _rec."AssistantPrefill";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_MJAIPromptRuns_RerunFromPromptRunIDID, p_MJAIPromptRuns_RerunFromPromptRunID_PromptID, p_MJAIPromptRuns_RerunFromPromptRunID_ModelID, p_MJAIPromptRuns_RerunFromPromptRunID_VendorID, p_MJAIPromptRuns_RerunFromPromptRunID_AgentID, p_MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, p_MJAIPromptRuns_RerunFromPromptRunID_RunAt, p_MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, p_MJAIPromptRuns_RerunFromPromptRunID_Messages, p_MJAIPromptRuns_RerunFromPromptRunID_Result, p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, p_MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, p_MJAIPromptRuns_RerunFromPromptRunID_TotalCost, p_MJAIPromptRuns_RerunFromPromptRunID_Success, p_MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, p_MJAIPromptRuns_RerunFromPromptRunID_ParentID, p_MJAIPromptRuns_RerunFromPromptRunID_RunType, p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, p_MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, p_MJAIPromptRuns_RerunFromPromptRunID_Cost, p_MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, p_MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, p_MJAIPromptRuns_RerunFromPromptRunID_Temperature, p_MJAIPromptRuns_RerunFromPromptRunID_TopP, p_MJAIPromptRuns_RerunFromPromptRunID_TopK, p_MJAIPromptRuns_RerunFromPromptRunID_MinP, p_MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, p_MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, p_MJAIPromptRuns_RerunFromPromptRunID_Seed, p_MJAIPromptRuns_RerunFromPromptRunID_StopSequences, p_MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, p_MJAIPromptRuns_RerunFromPromptRunID_LogProbs, p_MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, p_MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, p_MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, p_MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, p_MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, p_MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, p_MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, p_MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, p_MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, p_MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, p_MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, p_MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, p_MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, p_MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, p_MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, p_MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, p_MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, p_MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, p_MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, p_MJAIPromptRuns_RerunFromPromptRunID_Status, p_MJAIPromptRuns_RerunFromPromptRunID_Cancelled, p_MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, p_MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, p_MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, p_MJAIPromptRuns_RerunFromPromptRunID_CacheHit, p_MJAIPromptRuns_RerunFromPromptRunID_CacheKey, p_MJAIPromptRuns_RerunFromPromptRunID_JudgeID, p_MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, p_MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, p_MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, p_MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, p_MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, p_MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, p_MJAIPromptRuns_RerunFromPromptRunID_QueueTime, p_MJAIPromptRuns_RerunFromPromptRunID_PromptTime, p_MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, p_MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificRespon_874f7c, p_MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, p_MJAIPromptRuns_RerunFromPromptRunID_RunName, p_MJAIPromptRuns_RerunFromPromptRunID_Comments, p_MJAIPromptRuns_RerunFromPromptRunID_TestRunID, p_MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill);

    END LOOP;

    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache


    FOR _rec IN SELECT "ID", "AIPromptID", "AIModelID", "RunAt", "PromptText", "ResultText", "Status", "ExpiredOn", "VendorID", "AgentID", "ConfigurationID", "PromptEmbedding", "PromptRunID" FROM __mj."AIResultCache" WHERE "PromptRunID" = p_ID
    LOOP
        p_MJAIResultCache_PromptRunIDID := _rec."ID";
        p_MJAIResultCache_PromptRunID_AIPromptID := _rec."AIPromptID";
        p_MJAIResultCache_PromptRunID_AIModelID := _rec."AIModelID";
        p_MJAIResultCache_PromptRunID_RunAt := _rec."RunAt";
        p_MJAIResultCache_PromptRunID_PromptText := _rec."PromptText";
        p_MJAIResultCache_PromptRunID_ResultText := _rec."ResultText";
        p_MJAIResultCache_PromptRunID_Status := _rec."Status";
        p_MJAIResultCache_PromptRunID_ExpiredOn := _rec."ExpiredOn";
        p_MJAIResultCache_PromptRunID_VendorID := _rec."VendorID";
        p_MJAIResultCache_PromptRunID_AgentID := _rec."AgentID";
        p_MJAIResultCache_PromptRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIResultCache_PromptRunID_PromptEmbedding := _rec."PromptEmbedding";
        p_MJAIResultCache_PromptRunID_PromptRunID := _rec."PromptRunID";
        -- Set the FK field to NULL
        p_MJAIResultCache_PromptRunID_PromptRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIResultCache"(p_MJAIResultCache_PromptRunIDID, p_MJAIResultCache_PromptRunID_AIPromptID, p_MJAIResultCache_PromptRunID_AIModelID, p_MJAIResultCache_PromptRunID_RunAt, p_MJAIResultCache_PromptRunID_PromptText, p_MJAIResultCache_PromptRunID_ResultText, p_MJAIResultCache_PromptRunID_Status, p_MJAIResultCache_PromptRunID_ExpiredOn, p_MJAIResultCache_PromptRunID_VendorID, p_MJAIResultCache_PromptRunID_AgentID, p_MJAIResultCache_PromptRunID_ConfigurationID, p_MJAIResultCache_PromptRunID_PromptEmbedding, p_MJAIResultCache_PromptRunID_PromptRunID);

    END LOOP;

    
    -- Cascade delete from ContentProcessRunPromptRun using cursor to call spDeleteContentProcessRunPromptRun

    FOR _rec IN SELECT "ID" FROM __mj."ContentProcessRunPromptRun" WHERE "AIPromptRunID" = p_ID
    LOOP
        p_MJContentProcessRunPromptRuns_AIPromptRunIDID := _rec."ID";
        PERFORM __mj."spDeleteContentProcessRunPromptRun"(p_MJContentProcessRunPromptRuns_AIPromptRunIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."AIPromptRun"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentItemDuplicate_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentItemDuplicate" ON __mj."ContentItemDuplicate";
CREATE TRIGGER "trgUpdateContentItemDuplicate"
    BEFORE UPDATE ON __mj."ContentItemDuplicate"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentItemDuplicate_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentItemTag_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentItemTag" ON __mj."ContentItemTag";
CREATE TRIGGER "trgUpdateContentItemTag"
    BEFORE UPDATE ON __mj."ContentItemTag"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentItemTag_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentProcessRunPromptRun_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentProcessRunPromptRun" ON __mj."ContentProcessRunPromptRun";
CREATE TRIGGER "trgUpdateContentProcessRunPromptRun"
    BEFORE UPDATE ON __mj."ContentProcessRunPromptRun"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentProcessRunPromptRun_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentProcessRun_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentProcessRun" ON __mj."ContentProcessRun";
CREATE TRIGGER "trgUpdateContentProcessRun"
    BEFORE UPDATE ON __mj."ContentProcessRun"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentProcessRun_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentItem_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentItem" ON __mj."ContentItem";
CREATE TRIGGER "trgUpdateContentItem"
    BEFORE UPDATE ON __mj."ContentItem"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentItem_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentProcessRunDetail_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentProcessRunDetail" ON __mj."ContentProcessRunDetail";
CREATE TRIGGER "trgUpdateContentProcessRunDetail"
    BEFORE UPDATE ON __mj."ContentProcessRunDetail"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentProcessRunDetail_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentSourceType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentSourceType" ON __mj."ContentSourceType";
CREATE TRIGGER "trgUpdateContentSourceType"
    BEFORE UPDATE ON __mj."ContentSourceType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentSourceType_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentSource_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentSource" ON __mj."ContentSource";
CREATE TRIGGER "trgUpdateContentSource"
    BEFORE UPDATE ON __mj."ContentSource"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentSource_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentType" ON __mj."ContentType";
CREATE TRIGGER "trgUpdateContentType"
    BEFORE UPDATE ON __mj."ContentType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentType_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateDuplicateRunDetail_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateDuplicateRunDetail" ON __mj."DuplicateRunDetail";
CREATE TRIGGER "trgUpdateDuplicateRunDetail"
    BEFORE UPDATE ON __mj."DuplicateRunDetail"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateDuplicateRunDetail_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateDuplicateRun_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateDuplicateRun" ON __mj."DuplicateRun";
CREATE TRIGGER "trgUpdateDuplicateRun"
    BEFORE UPDATE ON __mj."DuplicateRun"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateDuplicateRun_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateKnowledgeHubSavedSearch_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateKnowledgeHubSavedSearch" ON __mj."KnowledgeHubSavedSearch";
CREATE TRIGGER "trgUpdateKnowledgeHubSavedSearch"
    BEFORE UPDATE ON __mj."KnowledgeHubSavedSearch"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateKnowledgeHubSavedSearch_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateTaggedItem_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTaggedItem" ON __mj."TaggedItem";
CREATE TRIGGER "trgUpdateTaggedItem"
    BEFORE UPDATE ON __mj."TaggedItem"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTaggedItem_func"();

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

CREATE OR REPLACE FUNCTION __mj."trgUpdateTagCoOccurrence_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTagCoOccurrence" ON __mj."TagCoOccurrence";
CREATE TRIGGER "trgUpdateTagCoOccurrence"
    BEFORE UPDATE ON __mj."TagCoOccurrence"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTagCoOccurrence_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateTagAuditLog_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTagAuditLog" ON __mj."TagAuditLog";
CREATE TRIGGER "trgUpdateTagAuditLog"
    BEFORE UPDATE ON __mj."TagAuditLog"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTagAuditLog_func"();


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
         "AllowUserSearchAPI"
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
         '30cb615e-d556-46de-9e15-ced108fcee84',
         'MJ: Tag Audit Logs',
         'Tag Audit Logs',
         'Immutable audit trail for all tag taxonomy changes. Each row records a single action with before/after details in JSON.',
         NULL,
         'TagAuditLog',
         'vwTagAuditLogs',
         '__mj',
         TRUE,
         FALSE
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
/* SQL generated to add new entity MJ: Tag Audit Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '30cb615e-d556-46de-9e15-ced108fcee84', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Audit Logs for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('30cb615e-d556-46de-9e15-ced108fcee84', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Audit Logs for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('30cb615e-d556-46de-9e15-ced108fcee84', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Audit Logs for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('30cb615e-d556-46de-9e15-ced108fcee84', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Content Item Duplicates */

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
         "AllowUserSearchAPI"
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
         '3c7e3ee9-beba-49b2-ab61-9bafa1b40ee5',
         'MJ: Content Item Duplicates',
         'Content Item Duplicates',
         'Detected duplicate or near-duplicate content items across sources. Each row represents a pair of items with similarity scoring and resolution tracking.',
         NULL,
         'ContentItemDuplicate',
         'vwContentItemDuplicates',
         '__mj',
         TRUE,
         FALSE
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
/* SQL generated to add new entity MJ: Content Item Duplicates to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3c7e3ee9-beba-49b2-ab61-9bafa1b40ee5', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Content Item Duplicates for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3c7e3ee9-beba-49b2-ab61-9bafa1b40ee5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Content Item Duplicates for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3c7e3ee9-beba-49b2-ab61-9bafa1b40ee5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Content Item Duplicates for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3c7e3ee9-beba-49b2-ab61-9bafa1b40ee5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Tag Co Occurrences */

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
         "AllowUserSearchAPI"
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
         'c353db72-de7c-4674-98d0-d4ddb9d41571',
         'MJ: Tag Co Occurrences',
         'Tag Co Occurrences',
         'Materialized co-occurrence counts for tag pairs. Records how many content items share both tags. Used for taxonomy health analysis, merge suggestions, and cross-entity intelligence. Recomputed periodically by the pipeline.',
         NULL,
         'TagCoOccurrence',
         'vwTagCoOccurrences',
         '__mj',
         TRUE,
         FALSE
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
/* SQL generated to add new entity MJ: Tag Co Occurrences to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c353db72-de7c-4674-98d0-d4ddb9d41571', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Co Occurrences for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c353db72-de7c-4674-98d0-d4ddb9d41571', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Co Occurrences for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c353db72-de7c-4674-98d0-d4ddb9d41571', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Tag Co Occurrences for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c353db72-de7c-4674-98d0-d4ddb9d41571', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Knowledge Hub Saved Searches */

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
         "AllowUserSearchAPI"
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
         'e5a86e2b-be0b-4344-8d45-32d6f0c850ea',
         'MJ: Knowledge Hub Saved Searches',
         'Knowledge Hub Saved Searches',
         'User-saved search queries for the Knowledge Hub. Stores query text, active filters (JSON), and score thresholds so searches can be recalled or run on a schedule.',
         NULL,
         'KnowledgeHubSavedSearch',
         'vwKnowledgeHubSavedSearches',
         '__mj',
         TRUE,
         FALSE
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
/* SQL generated to add new entity MJ: Knowledge Hub Saved Searches to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e5a86e2b-be0b-4344-8d45-32d6f0c850ea', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Knowledge Hub Saved Searches for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('e5a86e2b-be0b-4344-8d45-32d6f0c850ea', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Knowledge Hub Saved Searches for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('e5a86e2b-be0b-4344-8d45-32d6f0c850ea', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Knowledge Hub Saved Searches for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('e5a86e2b-be0b-4344-8d45-32d6f0c850ea', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Content Process Run Details */

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
         "AllowUserSearchAPI"
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
         '4a1ef567-f71f-44a3-9728-fb724062e619',
         'MJ: Content Process Run Details',
         'Content Process Run Details',
         'Per-content-source tracking within a pipeline run. Each source processed during a ContentProcessRun gets one detail record with item counts, timing, token usage, and cost rollups.',
         NULL,
         'ContentProcessRunDetail',
         'vwContentProcessRunDetails',
         '__mj',
         TRUE,
         FALSE
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
/* SQL generated to add new entity MJ: Content Process Run Details to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4a1ef567-f71f-44a3-9728-fb724062e619', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Content Process Run Details for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('4a1ef567-f71f-44a3-9728-fb724062e619', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Content Process Run Details for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('4a1ef567-f71f-44a3-9728-fb724062e619', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Content Process Run Details for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('4a1ef567-f71f-44a3-9728-fb724062e619', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: Content Process Run Prompt Runs */

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
         "AllowUserSearchAPI"
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
         '7ad7a0e4-0c8b-4131-9c6d-a7d90247cd15',
         'MJ: Content Process Run Prompt Runs',
         'Content Process Run Prompt Runs',
         'Links ContentProcessRunDetail records to their associated AIPromptRun records. Each LLM tagging call and embedding call creates an AIPromptRun, and this junction table provides the FK relationship for cost/token analytics.',
         NULL,
         'ContentProcessRunPromptRun',
         'vwContentProcessRunPromptRuns',
         '__mj',
         TRUE,
         FALSE
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
/* SQL generated to add new entity MJ: Content Process Run Prompt Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7ad7a0e4-0c8b-4131-9c6d-a7d90247cd15', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Content Process Run Prompt Runs for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('7ad7a0e4-0c8b-4131-9c6d-a7d90247cd15', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Content Process Run Prompt Runs for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('7ad7a0e4-0c8b-4131-9c6d-a7d90247cd15', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Content Process Run Prompt Runs for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('7ad7a0e4-0c8b-4131-9c6d-a7d90247cd15', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

UPDATE __mj."KnowledgeHubSavedSearch" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."KnowledgeHubSavedSearch" */

ALTER TABLE __mj."KnowledgeHubSavedSearch" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."KnowledgeHubSavedSearch" */

UPDATE __mj."KnowledgeHubSavedSearch" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."KnowledgeHubSavedSearch" */

ALTER TABLE __mj."KnowledgeHubSavedSearch" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."KnowledgeHubSavedSearch" */

UPDATE __mj."ContentItemDuplicate" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentItemDuplicate" */

ALTER TABLE __mj."ContentItemDuplicate" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentItemDuplicate" */

UPDATE __mj."ContentItemDuplicate" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentItemDuplicate" */

ALTER TABLE __mj."ContentItemDuplicate" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentItemDuplicate" */

UPDATE __mj."ContentProcessRunPromptRun" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentProcessRunPromptRun" */

ALTER TABLE __mj."ContentProcessRunPromptRun" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentProcessRunPromptRun" */

UPDATE __mj."ContentProcessRunPromptRun" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentProcessRunPromptRun" */

ALTER TABLE __mj."ContentProcessRunPromptRun" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentProcessRunPromptRun" */

UPDATE __mj."TagAuditLog" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagAuditLog" */

ALTER TABLE __mj."TagAuditLog" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagAuditLog" */

UPDATE __mj."TagAuditLog" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagAuditLog" */

ALTER TABLE __mj."TagAuditLog" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagAuditLog" */

UPDATE __mj."TagCoOccurrence" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagCoOccurrence" */

ALTER TABLE __mj."TagCoOccurrence" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagCoOccurrence" */

UPDATE __mj."TagCoOccurrence" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagCoOccurrence" */

ALTER TABLE __mj."TagCoOccurrence" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagCoOccurrence" */

UPDATE __mj."ContentProcessRunDetail" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentProcessRunDetail" */

ALTER TABLE __mj."ContentProcessRunDetail" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentProcessRunDetail" */

UPDATE __mj."ContentProcessRunDetail" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentProcessRunDetail" */

ALTER TABLE __mj."ContentProcessRunDetail" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentProcessRunDetail" */

ALTER TABLE __mj."ContentProcessRunDetail"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ef451377-bb03-44be-8847-1ad05dbbe35c' OR ("EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND "Name" = 'ID')
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
        'ef451377-bb03-44be-8847-1ad05dbbe35c',
        'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- "Entity": "MJ": "Knowledge" "Hub" "Saved" "Searches"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb748be8-f23a-4d4d-876e-f892973fbe00' OR ("EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND "Name" = 'UserID')
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
        'eb748be8-f23a-4d4d-876e-f892973fbe00',
        'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- "Entity": "MJ": "Knowledge" "Hub" "Saved" "Searches"
        100002,
        'UserID',
        'User ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '95b2ce20-2228-4b07-b973-aada70961477' OR ("EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND "Name" = 'Name')
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
        '95b2ce20-2228-4b07-b973-aada70961477',
        'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- "Entity": "MJ": "Knowledge" "Hub" "Saved" "Searches"
        100003,
        'Name',
        'Name',
        NULL,
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
        TRUE,
        TRUE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f759b7c5-13e2-4359-ab28-f16eef9be1f4' OR ("EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND "Name" = 'Query')
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
        'f759b7c5-13e2-4359-ab28-f16eef9be1f4',
        'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- "Entity": "MJ": "Knowledge" "Hub" "Saved" "Searches"
        100004,
        'Query',
        'Query',
        NULL,
        'TEXT',
        2000,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '906b2cc8-8a68-4a78-8c1a-16213d2efd9b' OR ("EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND "Name" = 'Filters')
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
        '906b2cc8-8a68-4a78-8c1a-16213d2efd9b',
        'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- "Entity": "MJ": "Knowledge" "Hub" "Saved" "Searches"
        100005,
        'Filters',
        'Filters',
        'JSON object with active filter selections. Keys are filter categories (Entity, Tags), values are arrays of selected option values.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1586777b-02ad-42cb-a253-ca9133845eca' OR ("EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND "Name" = 'MinScore')
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
        '1586777b-02ad-42cb-a253-ca9133845eca',
        'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- "Entity": "MJ": "Knowledge" "Hub" "Saved" "Searches"
        100006,
        'MinScore',
        'Min Score',
        NULL,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f25ba9c1-f392-4b50-9743-27b0a6a25c71' OR ("EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND "Name" = 'MaxResults')
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
        'f25ba9c1-f392-4b50-9743-27b0a6a25c71',
        'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- "Entity": "MJ": "Knowledge" "Hub" "Saved" "Searches"
        100007,
        'MaxResults',
        'Max Results',
        NULL,
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        '(50)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '332734cb-8e0a-4dab-8ee7-386fb4576862' OR ("EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND "Name" = 'NotifyOnNewResults')
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
        '332734cb-8e0a-4dab-8ee7-386fb4576862',
        'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- "Entity": "MJ": "Knowledge" "Hub" "Saved" "Searches"
        100008,
        'NotifyOnNewResults',
        'Notify On New Results',
        'When enabled, the system will notify the user when new results match this saved search (future capability).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8936a4fd-2e69-471c-b508-e3aa1f289612' OR ("EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND "Name" = '__mj_CreatedAt')
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
        '8936a4fd-2e69-471c-b508-e3aa1f289612',
        'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- "Entity": "MJ": "Knowledge" "Hub" "Saved" "Searches"
        100009,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2862182a-6190-44f4-a5a1-3a0fb2a3824f' OR ("EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND "Name" = '__mj_UpdatedAt')
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
        '2862182a-6190-44f4-a5a1-3a0fb2a3824f',
        'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- "Entity": "MJ": "Knowledge" "Hub" "Saved" "Searches"
        100010,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44b30122-35f7-4954-82aa-329f26486ed5' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Status')
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
        '44b30122-35f7-4954-82aa-329f26486ed5',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100017,
        'Status',
        'Status',
        'Lifecycle status of the tag: Active (in use), Merged (consolidated into another tag), Deprecated (no longer assigned but preserved), Deleted (soft-deleted).',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Active',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '23e00fa1-c0b5-4370-b526-78f65f2571d2' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'MergedIntoTagID')
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
        '23e00fa1-c0b5-4370-b526-78f65f2571d2',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100018,
        'MergedIntoTagID',
        'Merged Into Tag ID',
        'When Status is Merged, points to the surviving tag this tag was merged into. All TaggedItem and ContentItemTag references are re-pointed during merge.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a829129f-3ac3-4945-aca0-075a3cb6cb22' OR ("EntityID" = '0D248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Weight')
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
        'a829129f-3ac3-4945-aca0-075a3cb6cb22',
        '0D248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tagged" "Items"
        100015,
        'Weight',
        'Weight',
        'Relevance weight of this tag association (0.0 to 1.0). 1.0 indicates the tag is highly relevant or was manually applied. Lower values indicate decreasing relevance as determined by LLM autotagging. Default 1.0 for manually applied tags.',
        'numeric',
        5,
        5,
        4,
        FALSE,
        '(1.0)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2af32154-3b29-4138-8b1f-5e4441e1ece3' OR ("EntityID" = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'TotalItemCount')
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
        '2af32154-3b29-4138-8b1f-5e4441e1ece3',
        '30248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Duplicate" "Runs"
        100031,
        'TotalItemCount',
        'Total Item Count',
        'Total entity records to check for duplicates in this run.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'af9aaa70-8d37-40d7-b199-a8ce50280187' OR ("EntityID" = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ProcessedItemCount')
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
        'af9aaa70-8d37-40d7-b199-a8ce50280187',
        '30248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Duplicate" "Runs"
        100032,
        'ProcessedItemCount',
        'Processed Item Count',
        'Number of records checked so far. Used for progress percentage.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f5345c54-99d1-48e0-9fb4-e446becfc636' OR ("EntityID" = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'LastProcessedOffset')
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
        'f5345c54-99d1-48e0-9fb4-e446becfc636',
        '30248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Duplicate" "Runs"
        100033,
        'LastProcessedOffset',
        'Last Processed Offset',
        'Resume cursor for large-scale duplicate detection. Stores the offset of the last completed batch.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '81a0ae82-e71b-4cd1-bbee-e736e33e5021' OR ("EntityID" = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'BatchSize')
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
        '81a0ae82-e71b-4cd1-bbee-e736e33e5021',
        '30248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Duplicate" "Runs"
        100034,
        'BatchSize',
        'Batch Size',
        'Number of records processed per batch during duplicate detection.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        '(100)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '18316158-4d88-4c83-b3aa-8dda18fece5d' OR ("EntityID" = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'CancellationRequested')
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
        '18316158-4d88-4c83-b3aa-8dda18fece5d',
        '30248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Duplicate" "Runs"
        100035,
        'CancellationRequested',
        'Cancellation Requested',
        'When set to 1, duplicate detection stops after the current batch. Used for pause/cancel.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4507c2ec-b47e-4832-9caf-f26c8e0121cb' OR ("EntityID" = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'StartedAt')
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
        '4507c2ec-b47e-4832-9caf-f26c8e0121cb',
        '31248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Duplicate" "Run" "Details"
        100024,
        'StartedAt',
        'Started At',
        'When processing started for this specific record during duplicate detection.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dc89e545-1458-43b8-b0a9-c0a5063752be' OR ("EntityID" = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EndedAt')
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
        'dc89e545-1458-43b8-b0a9-c0a5063752be',
        '31248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Duplicate" "Run" "Details"
        100025,
        'EndedAt',
        'Ended At',
        'When processing completed for this specific record during duplicate detection.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a6384381-dd5e-4454-9cc6-120896ae4688' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'ID')
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
        'a6384381-dd5e-4454-9cc6-120896ae4688',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d4a467c-84b7-4a3e-9bd5-b7187a656194' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'ContentItemAID')
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
        '7d4a467c-84b7-4a3e-9bd5-b7187a656194',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100002,
        'ContentItemAID',
        'Content Item AID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '617f8d8a-c680-4fd6-83cc-f87ae7b4493c' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'ContentItemBID')
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
        '617f8d8a-c680-4fd6-83cc-f87ae7b4493c',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100003,
        'ContentItemBID',
        'Content Item BID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dd9010d3-5655-4437-8479-d697eed29e74' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'SimilarityScore')
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
        'dd9010d3-5655-4437-8479-d697eed29e74',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100004,
        'SimilarityScore',
        'Similarity Score',
        'Cosine similarity (for Vector) or exact match score (1.0 for Checksum/URL). Range 0.0-1.0.',
        'decimal',
        5,
        5,
        4,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c50db26e-dfb3-4175-8341-16bbe598a7e8' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'DetectionMethod')
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
        'c50db26e-dfb3-4175-8341-16bbe598a7e8',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100005,
        'DetectionMethod',
        'Detection Method',
        'How the duplicate was detected: Checksum (identical text hash), Vector (embedding similarity), Title (same title text), URL (same source URL).',
        'TEXT',
        60,
        0,
        0,
        FALSE,
        'Checksum',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c4ba647b-4eb5-48a8-832f-a5b02f55d4ad' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'Status')
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
        'c4ba647b-4eb5-48a8-832f-a5b02f55d4ad',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100006,
        'Status',
        'Status',
        'Current status: Pending (awaiting review), Confirmed (verified duplicate), Dismissed (not a duplicate), Merged (one item was removed).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0cfa6ce2-0ce9-4ce9-9365-f385b4907d21' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'ResolvedByUserID')
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
        '0cfa6ce2-0ce9-4ce9-9365-f385b4907d21',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100007,
        'ResolvedByUserID',
        'Resolved By User ID',
        NULL,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2cbf664d-7bf3-4e48-87ab-20827a225870' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'ResolvedAt')
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
        '2cbf664d-7bf3-4e48-87ab-20827a225870',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100008,
        'ResolvedAt',
        'Resolved At',
        NULL,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32d4867d-f445-4578-aabb-ce5ccd2e3f2f' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'Resolution')
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
        '32d4867d-f445-4578-aabb-ce5ccd2e3f2f',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100009,
        'Resolution',
        'Resolution',
        'How the duplicate was resolved: KeepA (keep first, remove second), KeepB (keep second, remove first), MergeBoth (combine into one), NotDuplicate (false positive).',
        'TEXT',
        40,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '284b7fc6-1f8e-4038-a496-c28741a65c75' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = '__mj_CreatedAt')
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
        '284b7fc6-1f8e-4038-a496-c28741a65c75',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100010,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d3bf8a8-4ea6-41f8-8f66-11af622f54e7' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = '__mj_UpdatedAt')
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
        '4d3bf8a8-4ea6-41f8-8f66-11af622f54e7',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100011,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3341bdde-4619-4a25-8be4-d88891362821' OR ("EntityID" = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND "Name" = 'ID')
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
        '3341bdde-4619-4a25-8be4-d88891362821',
        '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- "Entity": "MJ": "Content" "Process" "Run" "Prompt" "Runs"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0bebcc5a-2839-41f0-b8e1-765485da22a7' OR ("EntityID" = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND "Name" = 'ContentProcessRunDetailID')
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
        '0bebcc5a-2839-41f0-b8e1-765485da22a7',
        '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- "Entity": "MJ": "Content" "Process" "Run" "Prompt" "Runs"
        100002,
        'ContentProcessRunDetailID',
        'Content Process Run Detail ID',
        'The content process run detail record this prompt run is associated with.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '4A1EF567-F71F-44A3-9728-FB724062E619',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7eb9f962-577d-4fe2-ae00-4f402ce19bfa' OR ("EntityID" = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND "Name" = 'AIPromptRunID')
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
        '7eb9f962-577d-4fe2-ae00-4f402ce19bfa',
        '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- "Entity": "MJ": "Content" "Process" "Run" "Prompt" "Runs"
        100003,
        'AIPromptRunID',
        'AI Prompt Run ID',
        'The AI prompt run record containing token usage, cost, model, vendor, and execution details for this call.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '7C1C98D0-3978-4CE8-8E3F-C90301E59767',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2f6e688c-e0c4-458b-9e42-2b2bbf1ec8dc' OR ("EntityID" = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND "Name" = 'RunType')
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
        '2f6e688c-e0c4-458b-9e42-2b2bbf1ec8dc',
        '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- "Entity": "MJ": "Content" "Process" "Run" "Prompt" "Runs"
        100004,
        'RunType',
        'Run Type',
        'Whether this AIPromptRun was for LLM tagging (Tag) or text embedding (Embed).',
        'TEXT',
        40,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '798cba36-02e7-467e-aec9-88737953b466' OR ("EntityID" = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND "Name" = '__mj_CreatedAt')
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
        '798cba36-02e7-467e-aec9-88737953b466',
        '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- "Entity": "MJ": "Content" "Process" "Run" "Prompt" "Runs"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fb1a20a3-4de9-4760-86e2-b9f98f974b6a' OR ("EntityID" = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND "Name" = '__mj_UpdatedAt')
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
        'fb1a20a3-4de9-4760-86e2-b9f98f974b6a',
        '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- "Entity": "MJ": "Content" "Process" "Run" "Prompt" "Runs"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '21d1b5e7-1266-4f46-8f29-7de40725428a' OR ("EntityID" = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'StartedByUserID')
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
        '21d1b5e7-1266-4f46-8f29-7de40725428a',
        '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Process" "Runs"
        100018,
        'StartedByUserID',
        'Started By User ID',
        'The user who triggered this pipeline run. NULL for system-initiated runs.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f7f91b01-92fe-4eeb-be1b-edb4cfd3f056' OR ("EntityID" = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'TotalItemCount')
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
        'f7f91b01-92fe-4eeb-be1b-edb4cfd3f056',
        '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Process" "Runs"
        100019,
        'TotalItemCount',
        'Total Item Count',
        'Total number of content items to process in this run. Used for progress percentage calculation.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '514b02d3-eec7-4e9a-82c3-302b0cf363dd' OR ("EntityID" = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'LastProcessedOffset')
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
        '514b02d3-eec7-4e9a-82c3-302b0cf363dd',
        '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Process" "Runs"
        100020,
        'LastProcessedOffset',
        'Last Processed Offset',
        'StartRow offset of the last successfully completed batch. Used for resume-from-crash: next batch starts at this offset. Reset to 0 on new runs.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad6b86eb-82fc-45cf-a588-049b3ee24079' OR ("EntityID" = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'BatchSize')
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
        'ad6b86eb-82fc-45cf-a588-049b3ee24079',
        '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Process" "Runs"
        100021,
        'BatchSize',
        'Batch Size',
        'Number of content items processed per batch. Configurable per run, default 100.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        '(100)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2b5f5cf6-45c6-4025-bd44-0bea11d0bed1' OR ("EntityID" = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ErrorCount')
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
        '2b5f5cf6-45c6-4025-bd44-0bea11d0bed1',
        '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Process" "Runs"
        100022,
        'ErrorCount',
        'Error Count',
        'Running count of errors encountered during processing. Used by the circuit breaker to halt the pipeline if error rate exceeds the configured threshold.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aa318dcb-3d56-4361-9121-c02ada74bfdb' OR ("EntityID" = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ErrorMessage')
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
        'aa318dcb-3d56-4361-9121-c02ada74bfdb',
        '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Process" "Runs"
        100023,
        'ErrorMessage',
        'Error Message',
        'Error details if the run failed. Includes error messages, stack traces, or circuit breaker trigger reason.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ce6234bd-e9f5-41f4-838f-f415bee64b1a' OR ("EntityID" = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'CancellationRequested')
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
        'ce6234bd-e9f5-41f4-838f-f415bee64b1a',
        '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Process" "Runs"
        100024,
        'CancellationRequested',
        'Cancellation Requested',
        'When set to 1, the pipeline stops after completing the current batch. Used for pause and cancel operations. The Status column reflects the final state (Paused or Cancelled).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '16759e5c-8fa0-4816-867a-2504489c4ffd' OR ("EntityID" = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'Configuration')
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
        '16759e5c-8fa0-4816-867a-2504489c4ffd',
        '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Process" "Runs"
        100025,
        'Configuration',
        'Configuration',
        'JSON snapshot of the pipeline configuration used for this run. Conforms to the IContentProcessRunConfiguration interface. Includes batch size, rate limits, error thresholds, and duplicate detection settings.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3402501e-8128-40e0-bcf8-1bc2867c3931' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'Configuration')
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
        '3402501e-8128-40e0-bcf8-1bc2867c3931',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100026,
        'Configuration',
        'Configuration',
        'JSON configuration blob for source-instance settings. Conforms to the IContentSourceConfiguration interface. Includes tag taxonomy mode (constrained/auto-grow/free-flow), tag root ID, match threshold, LLM taxonomy sharing, and vectorization toggle.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3f8aec67-cbbb-47be-96c8-70795f10849c' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EntityID')
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
        '3f8aec67-cbbb-47be-96c8-70795f10849c',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100042, -- auto-bumped from 100027 (UQ_EntityField_EntityID_Sequence dedup),
        'EntityID',
        'Entity ID',
        'For Entity-type content sources, the MJ Entity to pull records from. NULL for non-entity sources (files, RSS, websites, etc.).',
        'UUID',
        16,
        0,
        0,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7bfd47b8-2b7b-4d5e-af0f-510b6da68faa' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EntityDocumentID')
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
        '7bfd47b8-2b7b-4d5e-af0f-510b6da68faa',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100043, -- auto-bumped from 100028 (UQ_EntityField_EntityID_Sequence dedup),
        'EntityDocumentID',
        'Entity Document ID',
        'For Entity-type content sources, the Entity Document template used to render entity records into text for autotagging. The template defines which fields to include, how to format them, and related record inclusion. NULL for non-entity sources.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '22248F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08929b56-9f28-4bb0-9f68-d783e68b8b27' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ScheduledActionID')
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
        '08929b56-9f28-4bb0-9f68-d783e68b8b27',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100029,
        'ScheduledActionID',
        'Scheduled Action ID',
        'Optional link to a MJ Scheduled Action that automatically runs the classification pipeline for this source on a cron schedule.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '12CD5A5D-A83B-EF11-86D4-0022481D1B23',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '77daca3c-60b0-426b-9dd8-98597f2c8ebb' OR ("EntityID" = 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'DriverClass')
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
        '77daca3c-60b0-426b-9dd8-98597f2c8ebb',
        'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Source" "Types"
        100011,
        'DriverClass',
        'Driver Class',
        'The registered class name used by ClassFactory to instantiate the provider for this source type (e.g., AutotagLocalFileSystem, AutotagEntity). Must match a @RegisterClass key on a class extending AutotagBase.',
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f6988131-fd6d-4e8c-aaaa-143d70f6ac1d' OR ("EntityID" = 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'Configuration')
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
        'f6988131-fd6d-4e8c-aaaa-143d70f6ac1d',
        'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Source" "Types"
        100012,
        'Configuration',
        'Configuration',
        'JSON configuration blob for type-level settings. Conforms to the IContentSourceTypeConfiguration interface. Reserved for future type-wide settings shared by all sources of this type.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '399cbc27-d03e-4230-9ae3-547e14651719' OR ("EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'Configuration')
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
        '399cbc27-d03e-4230-9ae3-547e14651719',
        'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Types"
        100025, -- auto-bumped from 100024 (UQ_EntityField_EntityID_Sequence dedup),
        'Configuration',
        'Configuration',
        'JSON configuration blob for content-type-level settings. Conforms to the IContentTypeConfiguration interface. Reserved for future type-wide settings such as default tag taxonomy rules and processing options.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b813e21c-9a7b-4de5-8577-7955a279cf7c' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EntityRecordDocumentID')
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
        'b813e21c-9a7b-4de5-8577-7955a279cf7c',
        'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Items"
        100029,
        'EntityRecordDocumentID',
        'Entity Record Document ID',
        'For entity-sourced content items, links to the Entity Record Document snapshot that was rendered for this item. Provides traceability back to the source entity record via ERD."EntityID" + ERD."RecordID". NULL for non-entity sources.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '21248F34-2837-EF11-86D4-6045BDEE16E6',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '41209810-b679-44c8-82a1-a5a6e5057616' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EmbeddingStatus')
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
        '41209810-b679-44c8-82a1-a5a6e5057616',
        'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Items"
        100030,
        'EmbeddingStatus',
        'Embedding Status',
        'Vectorization status: Pending (not yet embedded), Processing (currently being embedded), Complete (vector stored), Failed (embedding error), Skipped (excluded from vectorization).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6331b8ce-6fba-4095-b65d-8f647c494a19' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'LastEmbeddedAt')
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
        '6331b8ce-6fba-4095-b65d-8f647c494a19',
        'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Items"
        100031,
        'LastEmbeddedAt',
        'Last Embedded At',
        'Timestamp of the most recent successful embedding for this content item.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '38997a21-b71b-4a05-a8bb-68dc1cc12762' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EmbeddingModelID')
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
        '38997a21-b71b-4a05-a8bb-68dc1cc12762',
        'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Items"
        100032,
        'EmbeddingModelID',
        'Embedding Model ID',
        'The AI model used to generate the most recent embedding for this content item.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '65c6e744-d91c-4d0f-84f9-16fac676b498' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'TaggingStatus')
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
        '65c6e744-d91c-4d0f-84f9-16fac676b498',
        'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Items"
        100033,
        'TaggingStatus',
        'Tagging Status',
        'Autotagging status: Pending (not yet tagged), Processing (LLM is generating tags), Complete (tags assigned), Failed (LLM error), Skipped (excluded from tagging).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cc13ee1e-7485-4db3-af95-1014c36ee9d2' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'LastTaggedAt')
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
        'cc13ee1e-7485-4db3-af95-1014c36ee9d2',
        'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Items"
        100034,
        'LastTaggedAt',
        'Last Tagged At',
        'Timestamp of the most recent successful autotagging run for this content item.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5a074747-d77b-446c-8b10-204459643ff9' OR ("EntityID" = 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'TagID')
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
        '5a074747-d77b-446c-8b10-204459643ff9',
        'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Item" "Tags"
        100014,
        'TagID',
        'Tag ID',
        'Optional link to the formal MJ Tag taxonomy. When set, this free-text tag has been matched (via semantic similarity or exact match) to a curated Tag record. NULL means the tag is unmatched free text only.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6daf6ba0-0646-4cfb-8ad7-8a9e1e2bba42' OR ("EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND "Name" = 'ID')
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
        '6daf6ba0-0646-4cfb-8ad7-8a9e1e2bba42',
        '30CB615E-D556-46DE-9E15-CED108FCEE84', -- "Entity": "MJ": "Tag" "Audit" "Logs"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '46cd46ea-a20b-4a44-af88-083aab58d441' OR ("EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND "Name" = 'TagID')
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
        '46cd46ea-a20b-4a44-af88-083aab58d441',
        '30CB615E-D556-46DE-9E15-CED108FCEE84', -- "Entity": "MJ": "Tag" "Audit" "Logs"
        100002,
        'TagID',
        'Tag ID',
        'The tag that was acted upon.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7e245d79-0054-4c21-a585-dd7d9a786c02' OR ("EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND "Name" = 'Action')
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
        '7e245d79-0054-4c21-a585-dd7d9a786c02',
        '30CB615E-D556-46DE-9E15-CED108FCEE84', -- "Entity": "MJ": "Tag" "Audit" "Logs"
        100003,
        'Action',
        'Action',
        'The type of action performed: Created, Renamed, Moved (parent changed), Merged (into RelatedTagID), Split (from RelatedTagID), Deprecated, Reactivated, Deleted, DescriptionChanged.',
        'TEXT',
        60,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8552a352-55e9-4dac-b66c-6a8c6ab6dd6c' OR ("EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND "Name" = 'Details')
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
        '8552a352-55e9-4dac-b66c-6a8c6ab6dd6c',
        '30CB615E-D556-46DE-9E15-CED108FCEE84', -- "Entity": "MJ": "Tag" "Audit" "Logs"
        100004,
        'Details',
        'Details',
        'JSON object with action-specific details. For Renamed: {"OldName":"...","NewName":"..."}. For Moved: {"OldParentID":"...","NewParentID":"..."}. For Merged: {"ItemsMoved":42}.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f9c0fd7-6f54-4155-94b8-dd71d886d200' OR ("EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND "Name" = 'PerformedByUserID')
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
        '5f9c0fd7-6f54-4155-94b8-dd71d886d200',
        '30CB615E-D556-46DE-9E15-CED108FCEE84', -- "Entity": "MJ": "Tag" "Audit" "Logs"
        100005,
        'PerformedByUserID',
        'Performed By User ID',
        'User who performed the action.',
        'UUID',
        16,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1d390d4f-8cca-478a-b7d0-6086bec11c67' OR ("EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND "Name" = 'RelatedTagID')
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
        '1d390d4f-8cca-478a-b7d0-6086bec11c67',
        '30CB615E-D556-46DE-9E15-CED108FCEE84', -- "Entity": "MJ": "Tag" "Audit" "Logs"
        100006,
        'RelatedTagID',
        'Related Tag ID',
        'For Merged actions: the surviving tag. For Split actions: the source tag. NULL for other actions.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '496d6c09-87ef-4964-8ee2-697e9a7cda34' OR ("EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND "Name" = '__mj_CreatedAt')
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
        '496d6c09-87ef-4964-8ee2-697e9a7cda34',
        '30CB615E-D556-46DE-9E15-CED108FCEE84', -- "Entity": "MJ": "Tag" "Audit" "Logs"
        100007,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5991821a-3b5c-486c-88fa-2c9914130aa1' OR ("EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND "Name" = '__mj_UpdatedAt')
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
        '5991821a-3b5c-486c-88fa-2c9914130aa1',
        '30CB615E-D556-46DE-9E15-CED108FCEE84', -- "Entity": "MJ": "Tag" "Audit" "Logs"
        100008,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '52e92f58-d34c-4b58-9cdf-d6f85b80822f' OR ("EntityID" = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND "Name" = 'ID')
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
        '52e92f58-d34c-4b58-9cdf-d6f85b80822f',
        'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- "Entity": "MJ": "Tag" "Co" "Occurrences"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6d039b78-f386-439a-a952-240fd964a9ce' OR ("EntityID" = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND "Name" = 'TagAID')
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
        '6d039b78-f386-439a-a952-240fd964a9ce',
        'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- "Entity": "MJ": "Tag" "Co" "Occurrences"
        100002,
        'TagAID',
        'Tag AID',
        'First tag in the canonical pair (TagAID < TagBID ensures each pair is stored exactly once).',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '37eb7cdb-4e0a-48d2-bbb5-d84f61847df9' OR ("EntityID" = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND "Name" = 'TagBID')
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
        '37eb7cdb-4e0a-48d2-bbb5-d84f61847df9',
        'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- "Entity": "MJ": "Tag" "Co" "Occurrences"
        100003,
        'TagBID',
        'Tag BID',
        NULL,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a0bd8b24-d8f2-4005-98e1-ad4fc64b557a' OR ("EntityID" = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND "Name" = 'CoOccurrenceCount')
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
        'a0bd8b24-d8f2-4005-98e1-ad4fc64b557a',
        'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- "Entity": "MJ": "Tag" "Co" "Occurrences"
        100004,
        'CoOccurrenceCount',
        'Co Occurrence Count',
        'Number of content items (or entity records via TaggedItem) that are tagged with both TagA and TagB.',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'da798589-ecf6-406c-8d6d-0f2b3a4ead00' OR ("EntityID" = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND "Name" = 'LastComputedAt')
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
        'da798589-ecf6-406c-8d6d-0f2b3a4ead00',
        'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- "Entity": "MJ": "Tag" "Co" "Occurrences"
        100005,
        'LastComputedAt',
        'Last Computed At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1588428-a8b2-4aa1-9718-b2ab9efbf6e0' OR ("EntityID" = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND "Name" = '__mj_CreatedAt')
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
        'f1588428-a8b2-4aa1-9718-b2ab9efbf6e0',
        'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- "Entity": "MJ": "Tag" "Co" "Occurrences"
        100006,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb0bc32c-6196-41fd-8895-b3c7d2bae598' OR ("EntityID" = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND "Name" = '__mj_UpdatedAt')
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
        'eb0bc32c-6196-41fd-8895-b3c7d2bae598',
        'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- "Entity": "MJ": "Tag" "Co" "Occurrences"
        100007,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '276ab7de-ae79-4fa2-bfbe-fc5361943da5' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'ID')
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
        '276ab7de-ae79-4fa2-bfbe-fc5361943da5',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '31a3dcdc-b3b8-4e4b-8a3d-5e0f77ec117a' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'ContentProcessRunID')
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
        '31a3dcdc-b3b8-4e4b-8a3d-5e0f77ec117a',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100002,
        'ContentProcessRunID',
        'Content Process Run ID',
        'The parent pipeline run this detail belongs to.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '15955547-3bf7-4dff-9cc7-4a93b9646621' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'ContentSourceID')
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
        '15955547-3bf7-4dff-9cc7-4a93b9646621',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100003,
        'ContentSourceID',
        'Content Source ID',
        'The content source being processed in this detail record.',
        'UUID',
        16,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f50067fd-6424-4622-8f13-17ebf80b4c08' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'ContentSourceTypeID')
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
        'f50067fd-6424-4622-8f13-17ebf80b4c08',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100004,
        'ContentSourceTypeID',
        'Content Source Type ID',
        'The type of content source (RSS Feed, Entity, Website, Cloud Storage, etc.).',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b4932db4-9f18-4e5c-b517-58796f7ad33f' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'Status')
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
        'b4932db4-9f18-4e5c-b517-58796f7ad33f',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100005,
        'Status',
        'Status',
        'Processing status: Pending, Running, Completed, Failed, or Skipped.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e149d9ab-981f-4d11-b53e-e688d26ffc87' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'ItemsProcessed')
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
        'e149d9ab-981f-4d11-b53e-e688d26ffc87',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100006,
        'ItemsProcessed',
        'Items Processed',
        'Total content items processed for this source during the run.',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '97c3def2-adf2-4ae1-986d-dbd5ddb04a8a' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'ItemsTagged')
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
        '97c3def2-adf2-4ae1-986d-dbd5ddb04a8a',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100007,
        'ItemsTagged',
        'Items Tagged',
        'Number of content items successfully tagged by the LLM.',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fd72ba50-c857-493b-8155-ce5a73009a51' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'ItemsVectorized')
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
        'fd72ba50-c857-493b-8155-ce5a73009a51',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100008,
        'ItemsVectorized',
        'Items Vectorized',
        'Number of content items successfully embedded and upserted to the vector database.',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bf9a81ce-0f36-4253-ac49-1c8c7d6a5974' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'TagsCreated')
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
        'bf9a81ce-0f36-4253-ac49-1c8c7d6a5974',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100009,
        'TagsCreated',
        'Tags Created',
        'Number of new ContentItemTag records created during LLM tagging.',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '38677041-dcdb-44ce-93a7-f5ecbc4e501e' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'ErrorCount')
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
        '38677041-dcdb-44ce-93a7-f5ecbc4e501e',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100010,
        'ErrorCount',
        'Error Count',
        'Number of errors encountered while processing this source.',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd468c81a-9cbc-43fb-9dbb-c8b802f3a339' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'StartTime')
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
        'd468c81a-9cbc-43fb-9dbb-c8b802f3a339',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100011,
        'StartTime',
        'Start Time',
        'When processing started for this source within the pipeline run.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9f5b3407-5e25-44ab-91af-81384a0f4a0f' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'EndTime')
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
        '9f5b3407-5e25-44ab-91af-81384a0f4a0f',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100012,
        'EndTime',
        'End Time',
        'When processing completed for this source within the pipeline run.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b21adcec-e96f-4e01-b99c-22bc357dce53' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'TotalTokensUsed')
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
        'b21adcec-e96f-4e01-b99c-22bc357dce53',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100013,
        'TotalTokensUsed',
        'Total Tokens Used',
        'Rollup of all tokens used across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '710af907-8a83-46d4-b65c-1f3ba629adf0' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'TotalCost')
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
        '710af907-8a83-46d4-b65c-1f3ba629adf0',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100014,
        'TotalCost',
        'Total Cost',
        'Rollup of all costs across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.',
        'decimal',
        9,
        18,
        6,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0c8eb81f-825b-4029-8b5a-3d54719797d3' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = '__mj_CreatedAt')
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
        '0c8eb81f-825b-4029-8b5a-3d54719797d3',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4a719223-f165-44f6-a08e-cef24813af94' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = '__mj_UpdatedAt')
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
        '4a719223-f165-44f6-a08e-cef24813af94',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('788d5437-2b4c-4ea7-884d-075ac27bad60', '44B30122-35F7-4954-82AA-329F26486ED5', 1, 'Active', 'Active', NOW(), NOW());
/* SQL text to insert entity field value with ID 75b44aa0-1924-4d79-9943-c4110bfc8fb2 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('75b44aa0-1924-4d79-9943-c4110bfc8fb2', '44B30122-35F7-4954-82AA-329F26486ED5', 2, 'Deleted', 'Deleted', NOW(), NOW());
/* SQL text to insert entity field value with ID 29a93f14-2554-471e-8357-7c0fb9b04d69 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('29a93f14-2554-471e-8357-7c0fb9b04d69', '44B30122-35F7-4954-82AA-329F26486ED5', 3, 'Deprecated', 'Deprecated', NOW(), NOW());
/* SQL text to insert entity field value with ID 690822ed-575a-4005-8e79-aca2a247d8ac */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('690822ed-575a-4005-8e79-aca2a247d8ac', '44B30122-35F7-4954-82AA-329F26486ED5', 4, 'Merged', 'Merged', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 44B30122-35F7-4954-82AA-329F26486ED5 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='44B30122-35F7-4954-82AA-329F26486ED5';
/* SQL text to insert entity field value with ID 57a96049-4b97-4cd4-9dfe-9c1b2fe07025 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('57a96049-4b97-4cd4-9dfe-9c1b2fe07025', '7E245D79-0054-4C21-A585-DD7D9A786C02', 1, 'Created', 'Created', NOW(), NOW());
/* SQL text to insert entity field value with ID 633b8a1e-61cf-41c2-8ee5-f07563a53bb0 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('633b8a1e-61cf-41c2-8ee5-f07563a53bb0', '7E245D79-0054-4C21-A585-DD7D9A786C02', 2, 'Deleted', 'Deleted', NOW(), NOW());
/* SQL text to insert entity field value with ID 89d1d2dc-dc26-4d0f-85af-c6385642f510 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('89d1d2dc-dc26-4d0f-85af-c6385642f510', '7E245D79-0054-4C21-A585-DD7D9A786C02', 3, 'Deprecated', 'Deprecated', NOW(), NOW());
/* SQL text to insert entity field value with ID d94c10ac-a672-4347-b871-93001a8c1cd8 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d94c10ac-a672-4347-b871-93001a8c1cd8', '7E245D79-0054-4C21-A585-DD7D9A786C02', 4, 'DescriptionChanged', 'DescriptionChanged', NOW(), NOW());
/* SQL text to insert entity field value with ID a6af8737-b918-480c-9961-924a4f7c96c1 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('a6af8737-b918-480c-9961-924a4f7c96c1', '7E245D79-0054-4C21-A585-DD7D9A786C02', 5, 'Merged', 'Merged', NOW(), NOW());
/* SQL text to insert entity field value with ID eb339994-ee89-4fdf-9985-7c352faa23cc */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('eb339994-ee89-4fdf-9985-7c352faa23cc', '7E245D79-0054-4C21-A585-DD7D9A786C02', 6, 'Moved', 'Moved', NOW(), NOW());
/* SQL text to insert entity field value with ID 0bc81fba-2fd9-4aa2-a1d6-04568de135eb */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('0bc81fba-2fd9-4aa2-a1d6-04568de135eb', '7E245D79-0054-4C21-A585-DD7D9A786C02', 7, 'Reactivated', 'Reactivated', NOW(), NOW());
/* SQL text to insert entity field value with ID 17476c85-a9ba-47bf-893f-9e65eb4071b1 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('17476c85-a9ba-47bf-893f-9e65eb4071b1', '7E245D79-0054-4C21-A585-DD7D9A786C02', 8, 'Renamed', 'Renamed', NOW(), NOW());
/* SQL text to insert entity field value with ID 52c00ba5-6f10-40ee-aba8-d12195d3ddfe */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('52c00ba5-6f10-40ee-aba8-d12195d3ddfe', '7E245D79-0054-4C21-A585-DD7D9A786C02', 9, 'Split', 'Split', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 7E245D79-0054-4C21-A585-DD7D9A786C02 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='7E245D79-0054-4C21-A585-DD7D9A786C02';
/* SQL text to insert entity field value with ID 5753dd2a-93d7-404e-8e5a-2a9de1d935be */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('5753dd2a-93d7-404e-8e5a-2a9de1d935be', 'C50DB26E-DFB3-4175-8341-16BBE598A7E8', 1, 'Checksum', 'Checksum', NOW(), NOW());
/* SQL text to insert entity field value with ID 5dfbf9b1-a5c8-460c-ab75-3726c55742b1 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('5dfbf9b1-a5c8-460c-ab75-3726c55742b1', 'C50DB26E-DFB3-4175-8341-16BBE598A7E8', 2, 'Title', 'Title', NOW(), NOW());
/* SQL text to insert entity field value with ID 0c78ac5e-2514-400a-8924-00a54ee6e130 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('0c78ac5e-2514-400a-8924-00a54ee6e130', 'C50DB26E-DFB3-4175-8341-16BBE598A7E8', 3, 'URL', 'URL', NOW(), NOW());
/* SQL text to insert entity field value with ID 2fa6622e-50c7-4891-ae6b-70ea833f1350 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('2fa6622e-50c7-4891-ae6b-70ea833f1350', 'C50DB26E-DFB3-4175-8341-16BBE598A7E8', 4, 'Vector', 'Vector', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID C50DB26E-DFB3-4175-8341-16BBE598A7E8 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='C50DB26E-DFB3-4175-8341-16BBE598A7E8';
/* SQL text to insert entity field value with ID 297a58ff-026a-4ecf-8ef2-0149d656dd29 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('297a58ff-026a-4ecf-8ef2-0149d656dd29', 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD', 1, 'Confirmed', 'Confirmed', NOW(), NOW());
/* SQL text to insert entity field value with ID d47ae8ad-cb72-46d7-9ce8-1c91118878f1 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d47ae8ad-cb72-46d7-9ce8-1c91118878f1', 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD', 2, 'Dismissed', 'Dismissed', NOW(), NOW());
/* SQL text to insert entity field value with ID 599949d1-a4a2-44ad-84ad-7626738ee27e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('599949d1-a4a2-44ad-84ad-7626738ee27e', 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD', 3, 'Merged', 'Merged', NOW(), NOW());
/* SQL text to insert entity field value with ID ed69e575-73e6-41d7-b038-e9a383b1b97c */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ed69e575-73e6-41d7-b038-e9a383b1b97c', 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD', 4, 'Pending', 'Pending', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID C4BA647B-4EB5-48A8-832F-A5B02F55D4AD */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='C4BA647B-4EB5-48A8-832F-A5B02F55D4AD';
/* SQL text to insert entity field value with ID 93d17e97-7d78-4f8d-a72f-a48b079cf691 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('93d17e97-7d78-4f8d-a72f-a48b079cf691', '32D4867D-F445-4578-AABB-CE5CCD2E3F2F', 1, 'KeepA', 'KeepA', NOW(), NOW());
/* SQL text to insert entity field value with ID 5aeb067c-f49b-44c2-8a4c-09f7e8b1f194 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('5aeb067c-f49b-44c2-8a4c-09f7e8b1f194', '32D4867D-F445-4578-AABB-CE5CCD2E3F2F', 2, 'KeepB', 'KeepB', NOW(), NOW());
/* SQL text to insert entity field value with ID 1d468036-243d-43ca-a791-205f6b136329 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('1d468036-243d-43ca-a791-205f6b136329', '32D4867D-F445-4578-AABB-CE5CCD2E3F2F', 3, 'MergeBoth', 'MergeBoth', NOW(), NOW());
/* SQL text to insert entity field value with ID 1c4dae64-f5cb-4806-aa6e-b19871fec54a */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('1c4dae64-f5cb-4806-aa6e-b19871fec54a', '32D4867D-F445-4578-AABB-CE5CCD2E3F2F', 4, 'NotDuplicate', 'NotDuplicate', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 32D4867D-F445-4578-AABB-CE5CCD2E3F2F */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='32D4867D-F445-4578-AABB-CE5CCD2E3F2F';
/* SQL text to insert entity field value with ID 5ab34197-997f-4c3c-9854-34264a662cf4 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('5ab34197-997f-4c3c-9854-34264a662cf4', '41209810-B679-44C8-82A1-A5A6E5057616', 1, 'Complete', 'Complete', NOW(), NOW());
/* SQL text to insert entity field value with ID d8bd4640-b599-4366-b29a-501fe8aef307 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d8bd4640-b599-4366-b29a-501fe8aef307', '41209810-B679-44C8-82A1-A5A6E5057616', 2, 'Failed', 'Failed', NOW(), NOW());
/* SQL text to insert entity field value with ID 603bfeb8-11e7-4d60-8c59-47f60af071d9 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('603bfeb8-11e7-4d60-8c59-47f60af071d9', '41209810-B679-44C8-82A1-A5A6E5057616', 3, 'Pending', 'Pending', NOW(), NOW());
/* SQL text to insert entity field value with ID e34f46aa-1273-4e64-b876-322d1e3ffbd8 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e34f46aa-1273-4e64-b876-322d1e3ffbd8', '41209810-B679-44C8-82A1-A5A6E5057616', 4, 'Processing', 'Processing', NOW(), NOW());
/* SQL text to insert entity field value with ID 17027ba3-78f5-43d8-a6f5-5a8cebb016b2 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('17027ba3-78f5-43d8-a6f5-5a8cebb016b2', '41209810-B679-44C8-82A1-A5A6E5057616', 5, 'Skipped', 'Skipped', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 41209810-B679-44C8-82A1-A5A6E5057616 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='41209810-B679-44C8-82A1-A5A6E5057616';
/* SQL text to insert entity field value with ID 36f72413-b778-4788-bc28-051bb68872a8 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('36f72413-b778-4788-bc28-051bb68872a8', '65C6E744-D91C-4D0F-84F9-16FAC676B498', 1, 'Complete', 'Complete', NOW(), NOW());
/* SQL text to insert entity field value with ID 13930c72-1e2f-49e7-9e10-f01a23fd24f9 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('13930c72-1e2f-49e7-9e10-f01a23fd24f9', '65C6E744-D91C-4D0F-84F9-16FAC676B498', 2, 'Failed', 'Failed', NOW(), NOW());
/* SQL text to insert entity field value with ID 6d46aa9c-3065-4c8d-a43f-4dea858bfcc0 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('6d46aa9c-3065-4c8d-a43f-4dea858bfcc0', '65C6E744-D91C-4D0F-84F9-16FAC676B498', 3, 'Pending', 'Pending', NOW(), NOW());
/* SQL text to insert entity field value with ID 4bbf5f2f-b155-48eb-a1f7-aa9c96a00e4d */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('4bbf5f2f-b155-48eb-a1f7-aa9c96a00e4d', '65C6E744-D91C-4D0F-84F9-16FAC676B498', 4, 'Processing', 'Processing', NOW(), NOW());
/* SQL text to insert entity field value with ID 09debec2-8403-4343-98bc-14aacfd79d17 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('09debec2-8403-4343-98bc-14aacfd79d17', '65C6E744-D91C-4D0F-84F9-16FAC676B498', 5, 'Skipped', 'Skipped', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 65C6E744-D91C-4D0F-84F9-16FAC676B498 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='65C6E744-D91C-4D0F-84F9-16FAC676B498';
/* SQL text to insert entity field value with ID a05da636-3e57-4086-88be-200433d071d8 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('a05da636-3e57-4086-88be-200433d071d8', '2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC', 1, 'Embed', 'Embed', NOW(), NOW());
/* SQL text to insert entity field value with ID e8bee23b-b1db-4736-b9e8-83dac2653e28 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e8bee23b-b1db-4736-b9e8-83dac2653e28', '2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC', 2, 'Tag', 'Tag', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC';
/* Create Entity Relationship: MJ: Scheduled Actions -> MJ: Content Sources (One To Many via ScheduledActionID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ac136b2c-5712-4a81-b161-3bee00c81d5c'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('ac136b2c-5712-4a81-b161-3bee00c81d5c', '12CD5A5D-A83B-EF11-86D4-0022481D1B23', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ScheduledActionID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '08524788-1002-46d6-9e96-d9182fd38c39'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('08524788-1002-46d6-9e96-d9182fd38c39', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'EntityID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9b80413b-10d6-4a6b-a721-e452e0132718'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('9b80413b-10d6-4a6b-a721-e452e0132718', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '30CB615E-D556-46DE-9E15-CED108FCEE84', 'PerformedByUserID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c421ef7f-e5a7-44fd-8255-1339245421fb'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('c421ef7f-e5a7-44fd-8255-1339245421fb', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', 'ResolvedByUserID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bcb2b93b-17e9-4c13-9755-b7fbd64590ea'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('bcb2b93b-17e9-4c13-9755-b7fbd64590ea', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'StartedByUserID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bf769ee6-b21c-45d4-abcf-ff4553cf124c'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('bf769ee6-b21c-45d4-abcf-ff4553cf124c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', 'UserID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7919bd24-6b33-40f0-aa1d-eed986e39f5a'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('7919bd24-6b33-40f0-aa1d-eed986e39f5a', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'EmbeddingModelID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b81e8c3a-6e69-4561-a122-cba1a098a9ab'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('b81e8c3a-6e69-4561-a122-cba1a098a9ab', '0C248F34-2837-EF11-86D4-6045BDEE16E6', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'MergedIntoTagID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4cab35d6-87aa-4e70-8ab0-30cca85d4805'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('4cab35d6-87aa-4e70-8ab0-30cca85d4805', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'C353DB72-DE7C-4674-98D0-D4DDB9D41571', 'TagBID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '22bb01d0-8eae-47cc-b7a3-9963e4c6a71e'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('22bb01d0-8eae-47cc-b7a3-9963e4c6a71e', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'C353DB72-DE7C-4674-98D0-D4DDB9D41571', 'TagAID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e8d9b9ab-6aff-4be9-a1ba-7d167c2d7a52'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('e8d9b9ab-6aff-4be9-a1ba-7d167c2d7a52', '0C248F34-2837-EF11-86D4-6045BDEE16E6', '30CB615E-D556-46DE-9E15-CED108FCEE84', 'RelatedTagID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '336b7244-c104-45f3-9158-4d1bb2d3708c'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('336b7244-c104-45f3-9158-4d1bb2d3708c', '0C248F34-2837-EF11-86D4-6045BDEE16E6', '30CB615E-D556-46DE-9E15-CED108FCEE84', 'TagID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9c6f8d06-a309-473c-9d40-4bc2baa0da33'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('9c6f8d06-a309-473c-9d40-4bc2baa0da33', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'TagID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '80af0b4d-82e7-47c4-96a2-deebb5018ebe'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('80af0b4d-82e7-47c4-96a2-deebb5018ebe', '21248F34-2837-EF11-86D4-6045BDEE16E6', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'EntityRecordDocumentID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '99467f19-dba1-46ef-860c-a95744c119eb'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('99467f19-dba1-46ef-860c-a95744c119eb', '22248F34-2837-EF11-86D4-6045BDEE16E6', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'EntityDocumentID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd5eb47c4-8b0b-4360-8dd9-733de598f251'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('d5eb47c4-8b0b-4360-8dd9-733de598f251', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', '4A1EF567-F71F-44A3-9728-FB724062E619', 'ContentProcessRunID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '3d69087f-0f60-4cd9-8c72-5009f0382f23'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('3d69087f-0f60-4cd9-8c72-5009f0382f23', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', '4A1EF567-F71F-44A3-9728-FB724062E619', 'ContentSourceID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0df1a6ee-5a1e-4205-86cc-83dfd5585223'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('0df1a6ee-5a1e-4205-86cc-83dfd5585223', 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', '4A1EF567-F71F-44A3-9728-FB724062E619', 'ContentSourceTypeID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'fa23368f-0224-47ab-8798-1dee1e3ff69c'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('fa23368f-0224-47ab-8798-1dee1e3ff69c', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', 'ContentItemAID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0c588678-45d6-4373-8f27-34d0ca107019'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('0c588678-45d6-4373-8f27-34d0ca107019', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', 'ContentItemBID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7a6f309c-34d3-476f-9040-cf8fd592b113'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('7a6f309c-34d3-476f-9040-cf8fd592b113', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', 'AIPromptRunID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7d2a733e-cb89-45e8-8559-5174d8c234d7'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('7d2a733e-cb89-45e8-8559-5174d8c234d7', '4A1EF567-F71F-44A3-9728-FB724062E619', '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', 'ContentProcessRunDetailID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9888e302-447e-472a-a907-0f77dd49b1d7' OR ("EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND "Name" = 'User')
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
        '9888e302-447e-472a-a907-0f77dd49b1d7',
        'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- "Entity": "MJ": "Knowledge" "Hub" "Saved" "Searches"
        100021,
        'User',
        'User',
        NULL,
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fd942b17-cf54-41c5-b8b3-6a66bac2c41e' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'MergedIntoTag')
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
        'fd942b17-cf54-41c5-b8b3-6a66bac2c41e',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100022,
        'MergedIntoTag',
        'Merged Into Tag',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd47c8e2a-aaac-4c4d-992e-f595dc94877c' OR ("EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RootMergedIntoTagID')
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
        'd47c8e2a-aaac-4c4d-992e-f595dc94877c',
        '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Tags"
        100024,
        'RootMergedIntoTagID',
        'Root Merged Into Tag ID',
        NULL,
        'UUID',
        16,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f71ef762-c453-46c7-b254-fe5599a6bccc' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'ContentItemA')
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
        'f71ef762-c453-46c7-b254-fe5599a6bccc',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100023,
        'ContentItemA',
        'Content Item A',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a02b47f0-c3ae-432c-878b-29e318927e8b' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'ContentItemB')
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
        'a02b47f0-c3ae-432c-878b-29e318927e8b',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100024,
        'ContentItemB',
        'Content Item B',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '855e4e16-ca8d-400b-ad90-eb9da34f88c9' OR ("EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND "Name" = 'ResolvedByUser')
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
        '855e4e16-ca8d-400b-ad90-eb9da34f88c9',
        '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- "Entity": "MJ": "Content" "Item" "Duplicates"
        100025,
        'ResolvedByUser',
        'Resolved By User',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8771ec60-34b8-4b40-8dcc-0300371ec591' OR ("EntityID" = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND "Name" = 'AIPromptRun')
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
        '8771ec60-34b8-4b40-8dcc-0300371ec591',
        '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- "Entity": "MJ": "Content" "Process" "Run" "Prompt" "Runs"
        100013,
        'AIPromptRun',
        'AI Prompt Run',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a894d304-a15c-44c3-a8ea-add024a01f8c' OR ("EntityID" = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'StartedByUser')
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
        'a894d304-a15c-44c3-a8ea-add024a01f8c',
        '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Process" "Runs"
        100035,
        'StartedByUser',
        'Started By User',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e446a7b9-8f1c-47a4-8fba-53ff05049f2c' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'Entity')
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
        'e446a7b9-8f1c-47a4-8fba-53ff05049f2c',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100039,
        'Entity',
        'Entity',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '715bceb6-0b7d-49cb-ac91-3af520ef90d9' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EntityDocument')
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
        '715bceb6-0b7d-49cb-ac91-3af520ef90d9',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100040,
        'EntityDocument',
        'Entity Document',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70fcde3c-bd64-496c-8830-4c4d3786a5d6' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ScheduledAction')
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
        '70fcde3c-bd64-496c-8830-4c4d3786a5d6',
        'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Sources"
        100041,
        'ScheduledAction',
        'Scheduled Action',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '19ece70f-743d-482e-a487-7795c4946954' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EntityRecordDocument')
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
        '19ece70f-743d-482e-a487-7795c4946954',
        'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Items"
        100045,
        'EntityRecordDocument',
        'Entity Record Document',
        NULL,
        'TEXT',
        900,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '142e32d6-e2c2-4ec7-89b1-ae9ee4485993' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'EmbeddingModel')
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
        '142e32d6-e2c2-4ec7-89b1-ae9ee4485993',
        'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Items"
        100046,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '02a46354-0433-4ccf-abf3-9478711d2c5b' OR ("EntityID" = 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'Tag_Virtual')
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
        '02a46354-0433-4ccf-abf3-9478711d2c5b',
        'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Item" "Tags"
        100017,
        'Tag_Virtual',
        'Tag Virtual',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b932150b-d06e-4b7a-887c-63e686fd5eca' OR ("EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND "Name" = 'Tag')
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
        'b932150b-d06e-4b7a-887c-63e686fd5eca',
        '30CB615E-D556-46DE-9E15-CED108FCEE84', -- "Entity": "MJ": "Tag" "Audit" "Logs"
        100017,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1c62a127-1d05-485d-a736-125c10b812ab' OR ("EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND "Name" = 'PerformedByUser')
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
        '1c62a127-1d05-485d-a736-125c10b812ab',
        '30CB615E-D556-46DE-9E15-CED108FCEE84', -- "Entity": "MJ": "Tag" "Audit" "Logs"
        100018,
        'PerformedByUser',
        'Performed By User',
        NULL,
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6c659fc6-bc31-4fcf-be84-b409f9a442c7' OR ("EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND "Name" = 'RelatedTag')
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
        '6c659fc6-bc31-4fcf-be84-b409f9a442c7',
        '30CB615E-D556-46DE-9E15-CED108FCEE84', -- "Entity": "MJ": "Tag" "Audit" "Logs"
        100019,
        'RelatedTag',
        'Related Tag',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f1ba3be-62ef-4c78-a8af-9505e4dd2f81' OR ("EntityID" = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND "Name" = 'TagA')
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
        '5f1ba3be-62ef-4c78-a8af-9505e4dd2f81',
        'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- "Entity": "MJ": "Tag" "Co" "Occurrences"
        100015,
        'TagA',
        'Tag A',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1b87da36-8226-4cf5-96f7-211a16c7bef9' OR ("EntityID" = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND "Name" = 'TagB')
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
        '1b87da36-8226-4cf5-96f7-211a16c7bef9',
        'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- "Entity": "MJ": "Tag" "Co" "Occurrences"
        100016,
        'TagB',
        'Tag B',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '868f5319-6ddc-4302-be53-dd0ab3dfa7ef' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'ContentProcessRun')
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
        '868f5319-6ddc-4302-be53-dd0ab3dfa7ef',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100033,
        'ContentProcessRun',
        'Content Process Run',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08c081ef-64ec-4def-bd92-391918cc0229' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'ContentSource')
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
        '08c081ef-64ec-4def-bd92-391918cc0229',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100034,
        'ContentSource',
        'Content Source',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6d07f4e6-1501-482b-a394-514855e3912b' OR ("EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619' AND "Name" = 'ContentSourceType')
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
        '6d07f4e6-1501-482b-a394-514855e3912b',
        '4A1EF567-F71F-44A3-9728-FB724062E619', -- "Entity": "MJ": "Content" "Process" "Run" "Details"
        100035,
        'ContentSourceType',
        'Content Source Type',
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
               SET "DefaultInView" = TRUE
               WHERE "ID" = '02A46354-0433-4CCF-ABF3-9478711D2C5B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '02A46354-0433-4CCF-ABF3-9478711D2C5B'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '798CBA36-02E7-467E-AEC9-88737953B466'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '8771EC60-34B8-4B40-8DCC-0300371EC591'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '8771EC60-34B8-4B40-8DCC-0300371EC591'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B4932DB4-9F18-4E5C-B517-58796F7AD33F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E149D9AB-981F-4D11-B53E-E688D26FFC87'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '38677041-DCDB-44CE-93A7-F5ECBC4E501E'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D468C81A-9CBC-43FB-9DBB-C8B802F3A339'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '710AF907-8A83-46D4-B65C-1F3BA629ADF0'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '868F5319-6DDC-4302-BE53-DD0AB3DFA7EF'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '08C081EF-64EC-4DEF-BD92-391918CC0229'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'B4932DB4-9F18-4E5C-B517-58796F7AD33F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '868F5319-6DDC-4302-BE53-DD0AB3DFA7EF'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '08C081EF-64EC-4DEF-BD92-391918CC0229'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '6D07F4E6-1501-482B-A394-514855E3912B'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'DD9010D3-5655-4437-8479-D697EED29E74'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C50DB26E-DFB3-4175-8341-16BBE598A7E8'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F71EF762-C453-46C7-B254-FE5599A6BCCC'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A02B47F0-C3AE-432C-878B-29E318927E8B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'C50DB26E-DFB3-4175-8341-16BBE598A7E8'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '32D4867D-F445-4578-AABB-CE5CCD2E3F2F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'F71EF762-C453-46C7-B254-FE5599A6BCCC'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'A02B47F0-C3AE-432C-878B-29E318927E8B'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '855E4E16-CA8D-400B-AD90-EB9DA34F88C9'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F7B8433E-F36B-1410-867F-007B559E242F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '41209810-B679-44C8-82A1-A5A6E5057616'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '65C6E744-D91C-4D0F-84F9-16FAC676B498'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'CDB8433E-F36B-1410-867F-007B559E242F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'EBB8433E-F36B-1410-867F-007B559E242F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '0BD076E0-A5D2-4AF8-B9A7-646D342DBEF4'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '064AA602-A3D4-4192-88C4-6F96EFDF0F18'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'E13CB38F-1FB7-439C-A962-ED7F91DE0BFF'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 24 fields */
-- UPDATE Entity Field Category Info MJ: Content Items."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BBB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."ContentSourceID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C1B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."ContentSource"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0BD076E0-A5D2-4AF8-B9A7-646D342DBEF4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."ContentSourceTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D9B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."ContentSourceType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EFA43D7E-C671-48A6-8733-8B75CA8B3CC1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."ContentFileTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DFB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."ContentFileType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E13CB38F-1FB7-439C-A962-ED7F91DE0BFF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."URL"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = 'EBB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."Checksum"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E5B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."EntityRecordDocumentID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B813E21C-9A7B-4DE5-8577-7955A279CF7C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."EntityRecordDocument"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '19ECE70F-743D-482E-A487-7795C4946954' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Content Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C7B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Content Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CDB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."ContentTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Content Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D3B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."ContentType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '064AA602-A3D4-4192-88C4-6F96EFDF0F18' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."Text"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Content Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F1B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."EmbeddingStatus"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Vectorization',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '41209810-B679-44C8-82A1-A5A6E5057616' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."LastEmbeddedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Vectorization',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6331B8CE-6FBA-4095-B65D-8F647C494A19' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."EmbeddingModelID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Vectorization',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '38997A21-B71B-4A05-A8BB-68DC1CC12762' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."EmbeddingModel"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Vectorization',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '142E32D6-E2C2-4EC7-89B1-AE9EE4485993' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."TaggingStatus"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Vectorization',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '65C6E744-D91C-4D0F-84F9-16FAC676B498' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items."LastTaggedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'AI & Vectorization',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CC13EE1E-7485-4DB3-AF95-1014C36EE9D2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F7B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Items.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FDB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('d759a2ff-83d2-4f17-af70-99775b626848', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"AI & Vectorization":{"icon":"fa fa-robot","description":"Status and metadata for AI processing, including vector embeddings and automated tagging."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', NOW(), NOW());
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"AI & Vectorization":"fa fa-robot","System Metadata":"fa fa-cog"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryIcons';
/* Set categories for 14 fields */
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A6384381-DD5E-4454-9CC6-120896AE4688' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."ContentItemAID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Comparison Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Item A ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7D4A467C-84B7-4A3E-9BD5-B7187A656194' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."ContentItemA"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Comparison Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F71EF762-C453-46C7-B254-FE5599A6BCCC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."ContentItemBID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Comparison Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Item B ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '617F8D8A-C680-4FD6-83CC-F87AE7B4493C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."ContentItemB"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Comparison Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A02B47F0-C3AE-432C-878B-29E318927E8B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."SimilarityScore"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Comparison Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DD9010D3-5655-4437-8479-D697EED29E74' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."DetectionMethod"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Comparison Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C50DB26E-DFB3-4175-8341-16BBE598A7E8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Tracking',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."Resolution"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Tracking',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '32D4867D-F445-4578-AABB-CE5CCD2E3F2F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."ResolvedByUserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Tracking',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0CFA6CE2-0CE9-4CE9-9365-F385B4907D21' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."ResolvedByUser"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Tracking',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '855E4E16-CA8D-400B-AD90-EB9DA34F88C9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates."ResolvedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Tracking',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2CBF664D-7BF3-4E48-87AB-20827A225870' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '284B7FC6-1F8E-4038-A496-C28741A65C75' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D3BF8A8-4EA6-41F8-8F66-11AF622F54E7' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-copy */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-copy', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('c1e8c11b-7299-4f8b-aea1-4d74e3bce481', '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', 'FieldCategoryInfo', '{"Comparison Details":{"icon":"fa fa-balance-scale","description":"Technical details regarding the similarity between content items and the method of detection."},"Resolution Tracking":{"icon":"fa fa-tasks","description":"Workflow information tracking how and when the duplicate was reviewed and resolved."},"System Metadata":{"icon":"fa fa-database","description":"System-managed identifiers and audit timestamps for record management."}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('fac321aa-34ef-4b3e-bcc1-67e131543db7', '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', 'FieldCategoryIcons', '{"Comparison Details":"fa fa-balance-scale","Resolution Tracking":"fa fa-tasks","System Metadata":"fa fa-database"}', NOW(), NOW());
/* Set DefaultForNewUser=1 for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5';
/* Set categories for 19 fields */
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '276AB7DE-AE79-4FA2-BFBE-FC5361943DA5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."ContentProcessRunID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Process Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '31A3DCDC-B3B8-4E4B-8A3D-5E0F77EC117A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."ContentSourceID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Source',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '15955547-3BF7-4DFF-9CC7-4A93B9646621' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."ContentSourceTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Source Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F50067FD-6424-4622-8F13-17EBF80B4C08' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Context',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B4932DB4-9F18-4E5C-B517-58796F7AD33F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."ContentProcessRun"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Process Run Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '868F5319-6DDC-4302-BE53-DD0AB3DFA7EF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."ContentSource"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Source Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '08C081EF-64EC-4DEF-BD92-391918CC0229' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."ContentSourceType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source Type Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6D07F4E6-1501-482B-A394-514855E3912B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."ItemsProcessed"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Metrics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E149D9AB-981F-4D11-B53E-E688D26FFC87' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."ItemsTagged"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Metrics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '97C3DEF2-ADF2-4AE1-986D-DBD5DDB04A8A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."ItemsVectorized"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Metrics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD72BA50-C857-493B-8155-CE5A73009A51' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."TagsCreated"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Metrics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BF9A81CE-0F36-4253-AC49-1C8C7D6A5974' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."ErrorCount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Metrics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '38677041-DCDB-44CE-93A7-F5ECBC4E501E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."StartTime"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Usage and Timeline',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D468C81A-9CBC-43FB-9DBB-C8B802F3A339' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."EndTime"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Usage and Timeline',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9F5B3407-5E25-44AB-91AF-81384A0F4A0F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."TotalTokensUsed"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Usage and Timeline',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B21ADCEC-E96F-4E01-B99C-22BC357DCE53' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details."TotalCost"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Usage and Timeline',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '710AF907-8A83-46D4-B65C-1F3BA629ADF0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0C8EB81F-825B-4029-8B5A-3D54719797D3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Details.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4A719223-F165-44F6-A08E-CEF24813AF94' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-tasks */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-tasks', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '4A1EF567-F71F-44A3-9728-FB724062E619';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('b2fe928e-3912-4eba-a3b9-c13ab350e4ac', '4A1EF567-F71F-44A3-9728-FB724062E619', 'FieldCategoryInfo', '{"Run Context":{"icon":"fa fa-info-circle","description":"Identification and status of the specific content source being processed within the pipeline"},"Processing Metrics":{"icon":"fa fa-chart-bar","description":"Quantitative results of tagging, vectorization, and error tracking for this source"},"Usage and Timeline":{"icon":"fa fa-clock","description":"Temporal data and resource consumption including token usage and financial costs"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('6fbb1391-f863-474d-914f-04c89f765de3', '4A1EF567-F71F-44A3-9728-FB724062E619', 'FieldCategoryIcons', '{"Run Context":"fa fa-info-circle","Processing Metrics":"fa fa-chart-bar","Usage and Timeline":"fa fa-clock","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '4A1EF567-F71F-44A3-9728-FB724062E619';
/* Set categories for 9 fields */
-- UPDATE Entity Field Category Info MJ: Content Item Tags."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '27B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Tags.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '39B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Tags.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3FB9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Tags."ItemID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Item',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2DB9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Tags."Item"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Item Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8D73962B-3D7D-489E-837F-732C90578325' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Tags."Tag"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '33B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Tags."TagID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Association',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tag Reference',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5A074747-D77B-446C-8B10-204459643FF9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Tags."Weight"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2EF1276A-D856-4408-A72A-BE0907ABCA75' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Item Tags."Tag_Virtual"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Association',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tag (Virtual)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '02A46354-0433-4CCF-ABF3-9478711D2C5B' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 7 fields */
-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs."ContentProcessRunDetailID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Prompt Execution Links',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Content Process Run Detail',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0BEBCC5A-2839-41F0-B8E1-765485DA22A7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs."AIPromptRunID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Prompt Execution Links',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'AI Prompt Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7EB9F962-577D-4FE2-AE00-4F402CE19BFA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs."AIPromptRun"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Prompt Execution Links',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Prompt Run Label',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8771EC60-34B8-4B40-8DCC-0300371EC591' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs."RunType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Prompt Execution Links',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3341BDDE-4619-4A25-8BE4-D88891362821' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '798CBA36-02E7-467E-AEC9-88737953B466' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FB1A20A3-4DE9-4760-86E2-B9F98F974B6A' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-robot */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-robot', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('55b30e21-addb-44d2-8920-0e1f08dda917', '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', 'FieldCategoryInfo', '{"Prompt Execution Links":{"icon":"fa fa-link","description":"Associations between content processing steps and their corresponding AI model executions"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('8888d77d-b00e-4929-9030-0f06a9b71ecd', '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', 'FieldCategoryIcons', '{"Prompt Execution Links":"fa fa-link","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: junction, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15';
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '77DACA3C-60B0-426B-9DD8-98597F2C8EBB'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '01B8433E-F36B-1410-867F-007B559E242F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '77DACA3C-60B0-426B-9DD8-98597F2C8EBB'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'E446A7B9-8F1C-47A4-8FBA-53FF05049F2C'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '8FB7433E-F36B-1410-867F-007B559E242F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F7F91B01-92FE-4EEB-BE1B-EDB4CFD3F056'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A894D304-A15C-44C3-A8EA-ADD024A01F8C'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '89B7433E-F36B-1410-867F-007B559E242F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'A894D304-A15C-44C3-A8EA-ADD024A01F8C'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4507C2EC-B47E-4832-9CAF-F26C8E0121CB'
               AND "AutoUpdateDefaultInView" = TRUE;
/* Set categories for 7 fields */
-- UPDATE Entity Field Category Info MJ: Content Source Types."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F5B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Source Types."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Type Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FBB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Source Types."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Type Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '01B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Source Types."DriverClass"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Type Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '77DACA3C-60B0-426B-9DD8-98597F2C8EBB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Source Types."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Type Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'F6988131-FD6D-4E8C-AAAA-143D70F6AC1D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Source Types.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '07B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Source Types.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0DB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('03ca98ce-59c0-459c-9d15-27ef97ff8dda', 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"Source Type Details":{"icon":"fa fa-info-circle","description":"Core identification, descriptive information, and technical implementation details for the content source type."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps used for tracking and internal operations."}}', NOW(), NOW());
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Source Type Details":"fa fa-info-circle","System Metadata":"fa fa-cog"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryIcons';
/* Set categories for 22 fields */
-- UPDATE Entity Field Category Info MJ: Content Sources."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A1B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C5B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CBB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A7B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentSourceTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B3B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentSourceType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FBB09B21-50A3-4CCE-A114-44B0C9835251' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."URL"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = 'BFB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ADB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8E282AD9-2695-4F04-AC1F-79A5380D4E4D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentFileTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B9B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ContentFileType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ABA84E45-FDE6-4FD0-ACC9-BDA83A8CDE17' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."EmbeddingModelID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '045043FD-61A9-477F-82A7-72A7FC615A3C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."EmbeddingModel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '12DE0FA4-7538-42BE-9C11-7638B15B2D78' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."VectorIndexID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '11091434-73BD-4006-8C65-8639EA9AF1F3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."VectorIndex"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9CA2DC63-66EC-405B-9974-81FD5129B693' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing & Automation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '3402501E-8128-40E0-BCF8-1BC2867C3931' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."EntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing & Automation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3F8AEC67-CBBB-47BE-96C8-70795F10849C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."Entity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing & Automation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E446A7B9-8F1C-47A4-8FBA-53FF05049F2C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."EntityDocumentID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing & Automation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Document',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7BFD47B8-2B7B-4D5E-AF0F-510B6DA68FAA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."EntityDocument"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing & Automation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '715BCEB6-0B7D-49CB-AC91-3AF520EF90D9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ScheduledActionID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing & Automation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Scheduled Action',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '08929B56-9F28-4BB0-9F68-D783E68B8B27' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Sources."ScheduledAction"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing & Automation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '70FCDE3C-BD64-496C-8830-4C4D3786A5D6' AND "AutoUpdateCategory" = TRUE;
/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Processing & Automation":{"icon":"fa fa-cogs","description":"Configuration for source processing, entity mapping, and automated synchronization schedules."}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryInfo';
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Processing & Automation":"fa fa-cogs"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryIcons';
/* Set categories for 14 fields */
-- UPDATE Entity Field Category Info MJ: Content Types."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '43B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '49B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4FB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."AIModelID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '55B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."AIModel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ADDF8AC9-BF3A-4ECB-AF21-5C04DA27C396' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."EmbeddingModelID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0706EBD4-7D99-4F16-99DF-0E398E319AA3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."EmbeddingModel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BAAB3CB5-ACCB-4594-BC69-8031EDBF0AA7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."VectorIndexID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93D4F3C4-3110-41CD-85FD-7A6A2C28B2A4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."VectorIndex"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3C4FEC28-2617-418E-B476-09722B4A0858' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."MinTags"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5BB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."MaxTags"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '61B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Advanced Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '399CBC27-D03E-4230-9AE3-547E14651719' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '67B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Types.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6DB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Advanced Configuration":{"icon":"fa fa-tools","description":"Technical JSON settings and processing rules for advanced content management"}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryInfo';
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Advanced Configuration":"fa fa-tools"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryIcons';
/* Set categories for 14 fields */
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '354417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."DuplicateRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '364417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."RecordID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Record',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '374417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."RecordMetadata"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'D0181D15-798A-4AA1-82F5-D880ADAFFAC4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."DuplicateRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '87C64C19-39F4-46BC-B95C-265113B019DE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."MatchStatus"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '384417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."SkippedReason"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '394417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."MatchErrorMessage"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3A4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."MergeStatus"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."MergeErrorMessage"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3C4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."StartedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Outcomes',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4507C2EC-B47E-4832-9CAF-F26C8E0121CB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details."EndedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Outcomes',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DC89E545-1458-43B8-B0A9-C0A5063752BE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '835817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '845817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 18 fields */
-- UPDATE Entity Field Category Info MJ: Content Process Runs."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '71B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."SourceID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '77B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."Source"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B012AEB-14BF-4AD2-99CF-DF6732F55D70' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '89B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '16759E5C-8FA0-4816-867A-2504489C4FFD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."CancellationRequested"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CE6234BD-E9F5-41F4-838F-F415BEE64B1A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."StartTime"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7DB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."EndTime"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '83B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."StartedByUserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '21D1B5E7-1266-4F46-8F29-7DE40725428A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."StartedByUser"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A894D304-A15C-44C3-A8EA-ADD024A01F8C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."ProcessedItems"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8FB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."TotalItemCount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F7F91B01-92FE-4EEB-BE1B-EDB4CFD3F056' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."LastProcessedOffset"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '514B02D3-EEC7-4E9A-82C3-302B0CF363DD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."BatchSize"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AD6B86EB-82FC-45CF-A588-049B3EE24079' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."ErrorCount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2B5F5CF6-45C6-4025-BD44-0BEA11D0BED1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs."ErrorMessage"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AA318DCB-3D56-4361-9121-C02ADA74BFDB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '95B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Content Process Runs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9BB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Execution Details":{"icon":"fa fa-tachometer-alt","description":"Timing, metrics, and progress tracking for the content processing workflow execution."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps."}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryInfo';
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Execution Details":"fa fa-tachometer-alt","System Metadata":"fa fa-cog"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryIcons';
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F759B7C5-13E2-4359-AB28-F16EEF9BE1F4'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '332734CB-8E0A-4DAB-8EE7-386FB4576862'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '8936A4FD-2E69-471C-B508-E3AA1F289612'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '9888E302-447E-472A-A907-0F77DD49B1D7'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'F759B7C5-13E2-4359-AB28-F16EEF9BE1F4'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '9888E302-447E-472A-A907-0F77DD49B1D7'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A829129F-3AC3-4945-ACA0-075A3CB6CB22'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '334317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '684317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'FF4E17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '2AF32154-3B29-4138-8B1F-5E4441E1ECE3'
               AND "AutoUpdateDefaultInView" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '7E245D79-0054-4C21-A585-DD7D9A786C02'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '496D6C09-87EF-4964-8EE2-697E9A7CDA34'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B932150B-D06E-4B7A-887C-63E686FD5ECA'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '1C62A127-1D05-485D-A736-125C10B812AB'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '6C659FC6-BC31-4FCF-BE84-B409F9A442C7'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '7E245D79-0054-4C21-A585-DD7D9A786C02'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'B932150B-D06E-4B7A-887C-63E686FD5ECA'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '1C62A127-1D05-485D-A736-125C10B812AB'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '6C659FC6-BC31-4FCF-BE84-B409F9A442C7'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A0BD8B24-D8F2-4005-98E1-AD4FC64B557A'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'DA798589-ECF6-406C-8D6D-0F2B3A4EAD00'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5F1BA3BE-62EF-4C78-A8AF-9505E4DD2F81'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '1B87DA36-8226-4CF5-96F7-211A16C7BEF9'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '5F1BA3BE-62EF-4C78-A8AF-9505E4DD2F81'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '1B87DA36-8226-4CF5-96F7-211A16C7BEF9'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 9 fields */
-- UPDATE Entity Field Category Info MJ: Tagged Items."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '304317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tagged Items."TagID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '314317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tagged Items."Tag"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '684317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tagged Items."Weight"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A829129F-3AC3-4945-ACA0-075A3CB6CB22' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tagged Items."EntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '324317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tagged Items."RecordID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '334317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tagged Items."Entity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FF4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tagged Items.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BC5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tagged Items.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BD5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 9 fields */
-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences."TagA"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Pair Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5F1BA3BE-62EF-4C78-A8AF-9505E4DD2F81' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences."TagB"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Pair Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1B87DA36-8226-4CF5-96F7-211A16C7BEF9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences."TagAID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Pair Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tag A ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6D039B78-F386-439A-A952-240FD964A9CE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences."TagBID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Pair Information',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tag B ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '37EB7CDB-4E0A-48D2-BBB5-D84F61847DF9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences."CoOccurrenceCount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Co-Occurrence Metrics',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Co-Occurrence Count',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A0BD8B24-D8F2-4005-98E1-AD4FC64B557A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences."LastComputedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Co-Occurrence Metrics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DA798589-ECF6-406C-8D6D-0F2B3A4EAD00' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '52E92F58-D34C-4B58-9CDF-D6F85B80822F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F1588428-A8B2-4AA1-9718-B2AB9EFBF6E0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EB0BC32C-6196-41FD-8895-B3C7D2BAE598' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-project-diagram */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-project-diagram', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('4e30103a-2d09-4a31-9ed5-ab9186ec462e', 'C353DB72-DE7C-4674-98D0-D4DDB9D41571', 'FieldCategoryInfo', '{"Tag Pair Information":{"icon":"fa fa-tags","description":"Identifiers and names for the specific pair of tags being analyzed"},"Co-Occurrence Metrics":{"icon":"fa fa-chart-bar","description":"Calculated statistical data and processing timestamps for tag relationships"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps used for data maintenance"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('37fbaf3c-234b-4478-9591-58183ccb4c36', 'C353DB72-DE7C-4674-98D0-D4DDB9D41571', 'FieldCategoryIcons', '{"Tag Pair Information":"fa fa-tags","Co-Occurrence Metrics":"fa fa-chart-bar","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571';
/* Set categories for 22 fields */
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '334F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."EntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '344F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."Entity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3F4417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."StartedByUserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Started By',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '354F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."StartedByUser"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '404417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."SourceListID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3D4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."SourceList"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source List Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '424417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."StartedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '364F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."EndedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '374F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."ApprovalStatus"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '384F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."ApprovalComments"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '394F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."ApprovedByUserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Approved By',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3A4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."ApprovedByUser"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '414417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."ProcessingStatus"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3B4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."ProcessingErrorMessage"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3C4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."TotalItemCount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2AF32154-3B29-4138-8B1F-5E4441E1ECE3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."ProcessedItemCount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AF9AAA70-8D37-40D7-B199-A8CE50280187' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."LastProcessedOffset"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F5345C54-99D1-48E0-9FB4-E446BECFC636' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."BatchSize"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '81A0AE82-E71B-4CD1-BBEE-E736E33E5021' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs."CancellationRequested"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Processing Status',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '18316158-4D88-4C83-B3AA-8DDA18FECE5D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '815817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Duplicate Runs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '825817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 11 fields */
-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EF451377-BB03-44BE-8847-1AD05DBBE35C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches."UserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Ownership',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EB748BE8-F23A-4D4D-876E-F892973FBE00' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Criteria',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '95B2CE20-2228-4B07-B973-AADA70961477' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches."Query"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Criteria',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F759B7C5-13E2-4359-AB28-F16EEF9BE1F4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches."Filters"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Search Criteria',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '906B2CC8-8A68-4A78-8C1A-16213D2EFD9B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches."MinScore"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Results and Notifications',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Minimum Score',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1586777B-02AD-42CB-A253-CA9133845ECA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches."MaxResults"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Results and Notifications',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Maximum Results',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F25BA9C1-F392-4B50-9743-27B0A6A25C71' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches."NotifyOnNewResults"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Results and Notifications',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '332734CB-8E0A-4DAB-8EE7-386FB4576862' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8936A4FD-2E69-471C-B508-E3AA1F289612' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2862182A-6190-44F4-A5A1-3A0FB2A3824F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches."User"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Ownership',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9888E302-447E-472A-A907-0F77DD49B1D7' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-search-plus */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-search-plus', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('5fe1c472-812e-49fa-882d-6f5f7d67e6a2', 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', 'FieldCategoryInfo', '{"Search Criteria":{"icon":"fa fa-search","description":"Core parameters including the search query text and specific filters applied to the search."},"Results and Notifications":{"icon":"fa fa-bell","description":"Settings for result limits, scoring thresholds, and automated notification preferences."},"Ownership":{"icon":"fa fa-user-tag","description":"Information identifying the user who created and manages this saved search."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit timestamps and unique identifiers."}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('c7003ed5-902b-47a7-8cf2-c555e8b21c93', 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', 'FieldCategoryIcons', '{"Search Criteria":"fa fa-search","Results and Notifications":"fa fa-bell","Ownership":"fa fa-user-tag","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=1 for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA';
/* Set categories for 11 fields */
-- UPDATE Entity Field Category Info MJ: Tag Audit Logs."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6DAF6BA0-0646-4CFB-8AD7-8A9E1E2BBA42' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Audit Logs."TagID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Affected Tags',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tag',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '46CD46EA-A20B-4A44-AF88-083AAB58D441' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Audit Logs."Action"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Audit Event',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7E245D79-0054-4C21-A585-DD7D9A786C02' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Audit Logs."Details"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Audit Event',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Action Details',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '8552A352-55E9-4DAC-B66C-6A8C6AB6DD6C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Audit Logs."PerformedByUserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Audit Event',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Performed By User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5F9C0FD7-6F54-4155-94B8-DD71D886D200' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Audit Logs."RelatedTagID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Affected Tags',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Tag',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1D390D4F-8CCA-478A-B7D0-6086BEC11C67' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '496D6C09-87EF-4964-8EE2-697E9A7CDA34' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5991821A-3B5C-486C-88FA-2C9914130AA1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Audit Logs."Tag"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Affected Tags',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tag Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B932150B-D06E-4B7A-887C-63E686FD5ECA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Audit Logs."PerformedByUser"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Audit Event',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1C62A127-1D05-485D-A736-125C10B812AB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tag Audit Logs."RelatedTag"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Affected Tags',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Related Tag Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C659FC6-BC31-4FCF-BE84-B409F9A442C7' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-history */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-history', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '30CB615E-D556-46DE-9E15-CED108FCEE84';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('22f9ceae-4e15-462f-b056-b345de443378', '30CB615E-D556-46DE-9E15-CED108FCEE84', 'FieldCategoryInfo', '{"Audit Event":{"icon":"fa fa-clipboard-list","description":"Core information about the action performed and the user responsible for the change"},"Affected Tags":{"icon":"fa fa-tags","description":"Information regarding the primary and related tags involved in the taxonomy change"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('e07509d4-23b2-43dc-8d5d-9a4c9da9ae84', '30CB615E-D556-46DE-9E15-CED108FCEE84', 'FieldCategoryIcons', '{"Audit Event":"fa fa-clipboard-list","Affected Tags":"fa fa-tags","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '30CB615E-D556-46DE-9E15-CED108FCEE84';
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '2E4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '44B30122-35F7-4954-82AA-329F26486ED5'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '2E4317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '674317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 13 fields */
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
-- UPDATE Entity Field Category Info MJ: Tags."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Lifecycle',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '44B30122-35F7-4954-82AA-329F26486ED5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."MergedIntoTagID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Lifecycle',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Merged Into Tag',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '23E00FA1-C0B5-4370-B526-78F65F2571D2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."MergedIntoTag"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Lifecycle',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Merged Into Tag Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD942B17-CF54-41C5-B8B3-6A66BAC2C41E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."RootMergedIntoTagID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Lifecycle',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Merged Into Tag',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D47C8E2A-AAAC-4C4D-992E-F595DC94877C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."ParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."Parent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '674317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Tags."RootParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '55C353F4-3F77-4BE6-B931-AA23603CF3CA' AND "AutoUpdateCategory" = TRUE;
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
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('71ec68f8-7753-4807-ac51-94da8a4f0415', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Tag Lifecycle":{"icon":"fa fa-sync-alt","description":"Fields managing the operational state and consolidation history of the tag"}}', NOW(), NOW());
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Tag Lifecycle":"fa fa-sync-alt"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryIcons';
/* Generated Validation Functions for MJ: Tag Co Occurrences */
-- CHECK constraint for MJ: Tag Co Occurrences @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', NOW(), 'TypeScript','Approved', '([TagAID]<[TagBID])', 'public ValidateTagAIDLessThanTagBID(result: ValidationResult) {
	if (this."TagAID" != null && this."TagBID" != null && this."TagAID" >= this."TagBID") {
		result."Errors".push(new ValidationErrorInfo(
			"TagAID",
			"Tag A must be ordered before Tag B to ensure a consistent ordering of tag pairs.",
			this."TagAID",
			ValidationErrorType."Failure"
		));
	}
}', 'Tag A must be ordered before Tag B to ensure that each pair of tags is stored consistently and to prevent duplicate entries for the same combination.', 'ValidateTagAIDLessThanTagBID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C353DB72-DE7C-4674-98D0-D4DDB9D41571');


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."Tag"
 ADD CONSTRAINT "CK_Tag_Status" CHECK ("Status" IN ('Active', 'Merged', 'Deprecated', 'Deleted')),
 ADD CONSTRAINT "FK_Tag_MergedIntoTag" FOREIGN KEY ("MergedIntoTagID")
            REFERENCES __mj."Tag"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."ContentSource"
 ADD CONSTRAINT "FK_ContentSource_ScheduledAction" FOREIGN KEY ("ScheduledActionID")
        REFERENCES __mj."ScheduledAction"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."ContentItem"
 ADD CONSTRAINT "CK_ContentItem_EmbeddingStatus" CHECK ("EmbeddingStatus" IN ('Pending', 'Processing', 'Complete', 'Failed', 'Skipped')),
 ADD CONSTRAINT "CK_ContentItem_TaggingStatus" CHECK ("TaggingStatus" IN ('Pending', 'Processing', 'Complete', 'Failed', 'Skipped')),
 ADD CONSTRAINT "FK_ContentItem_EmbeddingModel" FOREIGN KEY ("EmbeddingModelID")
            REFERENCES __mj."AIModel"("ID") DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwContentItemDuplicates" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Item Duplicates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Duplicates
-- Item: Permissions for vwContentItemDuplicates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentItemDuplicates" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Item Duplicates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Duplicates
-- Item: spCreateContentItemDuplicate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemDuplicate
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemDuplicate" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Item Duplicates */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemDuplicate" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Item Duplicates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Duplicates
-- Item: spUpdateContentItemDuplicate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemDuplicate
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemDuplicate" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemDuplicate" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Item Duplicates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Duplicates
-- Item: spDeleteContentItemDuplicate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemDuplicate
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemDuplicate" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Item Duplicates */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemDuplicate" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for ContentItemTag */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ItemID in table ContentItemTag;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentItemTags" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: Permissions for vwContentItemTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentItemTags" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spCreateContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemTag
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemTag" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Item Tags */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemTag" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spUpdateContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemTag
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemTag" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemTag" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spDeleteContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemTag
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemTag" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Item Tags */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemTag" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 15955547-3BF7-4DFF-9CC7-4A93B9646621 */

DO $$ BEGIN GRANT SELECT ON __mj."vwContentProcessRunPromptRuns" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: Permissions for vwContentProcessRunPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentProcessRunPromptRuns" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: spCreateContentProcessRunPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentProcessRunPromptRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentProcessRunPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Process Run Prompt Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentProcessRunPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: spUpdateContentProcessRunPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentProcessRunPromptRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentProcessRunPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentProcessRunPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: spDeleteContentProcessRunPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentProcessRunPromptRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRunPromptRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Process Run Prompt Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRunPromptRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: vwContentProcessRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Process Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentProcessRun
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentProcessRuns" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: Permissions for vwContentProcessRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentProcessRuns" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: spCreateContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentProcessRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Process Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentProcessRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: spUpdateContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentProcessRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentProcessRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: spDeleteContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Process Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: vwContentItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Items
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentItem
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentItems" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: Permissions for vwContentItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentItems" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: spCreateContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: spUpdateContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItem" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: spDeleteContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID F50067FD-6424-4622-8F13-17EBF80B4C08 */

DO $$ BEGIN GRANT SELECT ON __mj."vwContentProcessRunDetails" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: Permissions for vwContentProcessRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentProcessRunDetails" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: spCreateContentProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentProcessRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentProcessRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Process Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentProcessRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: spUpdateContentProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentProcessRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentProcessRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentProcessRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: spDeleteContentProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentProcessRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Process Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for ContentSourceType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for ContentSource */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentTypeID in table ContentSource;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentSourceTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: Permissions for vwContentSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentSourceTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: spCreateContentSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Source Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: spUpdateContentSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: spDeleteContentSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSourceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Source Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSourceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 7BFD47B8-2B7B-4D5E-AF0F-510B6DA68FAA */

DO $$ BEGIN GRANT SELECT ON __mj."vwContentSources" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Permissions for vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentSources" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spCreateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Sources */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spUpdateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentSource" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spDeleteContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSource" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Sources */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSource" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for ContentType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AIModelID in table ContentType;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: Permissions for vwContentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwContentTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spCreateContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spUpdateContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spDeleteContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for DuplicateRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DuplicateRunID in table DuplicateRunDetail;

DO $$ BEGIN GRANT SELECT ON __mj."vwDuplicateRunDetails" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: Permissions for vwDuplicateRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwDuplicateRunDetails" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spCreateDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateDuplicateRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Duplicate Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateDuplicateRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spUpdateDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateDuplicateRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateDuplicateRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Duplicate Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  DuplicateRun
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwDuplicateRuns" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: Permissions for vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwDuplicateRuns" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spCreateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateDuplicateRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Duplicate Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateDuplicateRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spUpdateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateDuplicateRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateDuplicateRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spDeleteDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Duplicate Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spDeleteDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Duplicate Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for KnowledgeHubSavedSearch */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table KnowledgeHubSavedSearch;

DO $$ BEGIN GRANT SELECT ON __mj."vwKnowledgeHubSavedSearches" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Knowledge Hub Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: Permissions for vwKnowledgeHubSavedSearches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwKnowledgeHubSavedSearches" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Knowledge Hub Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: spCreateKnowledgeHubSavedSearch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR KnowledgeHubSavedSearch
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateKnowledgeHubSavedSearch" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Knowledge Hub Saved Searches */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateKnowledgeHubSavedSearch" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Knowledge Hub Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: spUpdateKnowledgeHubSavedSearch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR KnowledgeHubSavedSearch
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateKnowledgeHubSavedSearch" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateKnowledgeHubSavedSearch" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Knowledge Hub Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: spDeleteKnowledgeHubSavedSearch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR KnowledgeHubSavedSearch
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteKnowledgeHubSavedSearch" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Knowledge Hub Saved Searches */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteKnowledgeHubSavedSearch" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for TagAuditLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TagID in table TagAuditLog;

DO $$ BEGIN GRANT SELECT ON __mj."vwTaggedItems" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: Permissions for vwTaggedItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwTaggedItems" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: spCreateTaggedItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TaggedItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTaggedItem" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Tagged Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTaggedItem" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: spUpdateTaggedItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TaggedItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTaggedItem" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTaggedItem" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: spDeleteTaggedItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaggedItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaggedItem" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tagged Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaggedItem" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* Root ID Function SQL for MJ: Tags."ParentID" */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: fnTagParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: "Tag"."ParentID"
------------------------------------------------------------;

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
/* SQL text to update entity field related entity name field map for entity field ID 5F9C0FD7-6F54-4155-94B8-DD71D886D200 */

DO $$ BEGIN GRANT SELECT ON __mj."vwTagCoOccurrences" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Tag Co Occurrences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Co Occurrences
-- Item: Permissions for vwTagCoOccurrences
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwTagCoOccurrences" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Tag Co Occurrences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Co Occurrences
-- Item: spCreateTagCoOccurrence
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TagCoOccurrence
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTagCoOccurrence" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Tag Co Occurrences */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTagCoOccurrence" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Tag Co Occurrences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Co Occurrences
-- Item: spUpdateTagCoOccurrence
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TagCoOccurrence
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTagCoOccurrence" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTagCoOccurrence" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tag Co Occurrences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Co Occurrences
-- Item: spDeleteTagCoOccurrence
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagCoOccurrence
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagCoOccurrence" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tag Co Occurrences */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagCoOccurrence" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Tag Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: vwTagAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tag Audit Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  TagAuditLog
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwTagAuditLogs" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Tag Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: Permissions for vwTagAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwTagAuditLogs" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Tag Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: spCreateTagAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TagAuditLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTagAuditLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Tag Audit Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTagAuditLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Tag Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: spUpdateTagAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TagAuditLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTagAuditLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTagAuditLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tag Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: spDeleteTagAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagAuditLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagAuditLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tag Audit Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagAuditLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Prompt Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."ContentSourceType"."DriverClass" IS 'The registered class name used by ClassFactory to instantiate the provider for this source type (e.g., AutotagLocalFileSystem, AutotagEntity). Must match a @RegisterClass key on a class extending AutotagBase.';

COMMENT ON COLUMN __mj."ContentSourceType"."Configuration" IS 'JSON configuration blob for type-level settings. Conforms to the IContentSourceTypeConfiguration interface. Reserved for future type-wide settings shared by all sources of this type.';

COMMENT ON COLUMN __mj."ContentSource"."Configuration" IS 'JSON configuration blob for source-instance settings. Conforms to the IContentSourceConfiguration interface. Includes tag taxonomy mode (constrained/auto-grow/free-flow), tag root ID, match threshold, LLM taxonomy sharing, and vectorization toggle.';

COMMENT ON COLUMN __mj."ContentSource"."EntityID" IS 'For Entity-type content sources, the MJ Entity to pull records from. NULL for non-entity sources (files, RSS, websites, etc.).';

COMMENT ON COLUMN __mj."ContentSource"."EntityDocumentID" IS 'For Entity-type content sources, the Entity Document template used to render entity records into text for autotagging. The template defines which fields to include, how to format them, and related record inclusion. NULL for non-entity sources.';

COMMENT ON COLUMN __mj."ContentType"."Configuration" IS 'JSON configuration blob for content-type-level settings. Conforms to the IContentTypeConfiguration interface. Reserved for future type-wide settings such as default tag taxonomy rules and processing options.';

COMMENT ON COLUMN __mj."ContentItem"."EntityRecordDocumentID" IS 'For entity-sourced content items, links to the Entity Record Document snapshot that was rendered for this item. Provides traceability back to the source entity record via ERD."EntityID" + ERD."RecordID". NULL for non-entity sources.';

COMMENT ON COLUMN __mj."ContentItemTag"."TagID" IS 'Optional link to the formal MJ Tag taxonomy. When set, this free-text tag has been matched (via semantic similarity or exact match) to a curated Tag record. NULL means the tag is unmatched free text only.';

COMMENT ON COLUMN __mj."TaggedItem"."Weight" IS 'Relevance weight of this tag association (0.0 to 1.0). 1.0 indicates the tag is highly relevant or was manually applied. Lower values indicate decreasing relevance as determined by LLM autotagging. Default 1.0 for manually applied tags.';

COMMENT ON COLUMN __mj."ContentProcessRun"."StartedByUserID" IS 'The user who triggered this pipeline run. NULL for system-initiated runs.';

COMMENT ON COLUMN __mj."ContentProcessRun"."TotalItemCount" IS 'Total number of content items to process in this run. Used for progress percentage calculation.';

COMMENT ON COLUMN __mj."ContentProcessRun"."LastProcessedOffset" IS 'StartRow offset of the last successfully completed batch. Used for resume-from-crash: next batch starts at this offset. Reset to 0 on new runs.';

COMMENT ON COLUMN __mj."ContentProcessRun"."BatchSize" IS 'Number of content items processed per batch. Configurable per run, default 100.';

COMMENT ON COLUMN __mj."ContentProcessRun"."ErrorCount" IS 'Running count of errors encountered during processing. Used by the circuit breaker to halt the pipeline if error rate exceeds the configured threshold.';

COMMENT ON COLUMN __mj."ContentProcessRun"."ErrorMessage" IS 'Error details if the run failed. Includes error messages, stack traces, or circuit breaker trigger reason.';

COMMENT ON COLUMN __mj."ContentProcessRun"."CancellationRequested" IS 'When set to 1, the pipeline stops after completing the current batch. Used for pause and cancel operations. The Status column reflects the final state (Paused or Cancelled).';

COMMENT ON COLUMN __mj."ContentProcessRun"."Configuration" IS 'JSON snapshot of the pipeline configuration used for this run. Conforms to the IContentProcessRunConfiguration interface. Includes batch size, rate limits, error thresholds, and duplicate detection settings.';

COMMENT ON TABLE __mj."ContentProcessRunDetail" IS 'Per-content-source tracking within a pipeline run. Each source processed during a ContentProcessRun gets one detail record with item counts, timing, token usage, and cost rollups.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."ContentProcessRunID" IS 'The parent pipeline run this detail belongs to.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."ContentSourceID" IS 'The content source being processed in this detail record.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."ContentSourceTypeID" IS 'The type of content source (RSS Feed, Entity, Website, Cloud Storage, etc.).';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."Status" IS 'Processing status: Pending, Running, Completed, Failed, or Skipped.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."ItemsProcessed" IS 'Total content items processed for this source during the run.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."ItemsTagged" IS 'Number of content items successfully tagged by the LLM.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."ItemsVectorized" IS 'Number of content items successfully embedded and upserted to the vector database.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."TagsCreated" IS 'Number of new ContentItemTag records created during LLM tagging.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."ErrorCount" IS 'Number of errors encountered while processing this source.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."StartTime" IS 'When processing started for this source within the pipeline run.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."EndTime" IS 'When processing completed for this source within the pipeline run.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."TotalTokensUsed" IS 'Rollup of all tokens used across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.';

COMMENT ON COLUMN __mj."ContentProcessRunDetail"."TotalCost" IS 'Rollup of all costs across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.';

COMMENT ON TABLE __mj."ContentProcessRunPromptRun" IS 'Links ContentProcessRunDetail records to their associated AIPromptRun records. Each LLM tagging call and embedding call creates an AIPromptRun, and this junction table provides the FK relationship for cost/token analytics.';

COMMENT ON COLUMN __mj."ContentProcessRunPromptRun"."ContentProcessRunDetailID" IS 'The content process run detail record this prompt run is associated with.';

COMMENT ON COLUMN __mj."ContentProcessRunPromptRun"."AIPromptRunID" IS 'The AI prompt run record containing token usage, cost, model, vendor, and execution details for this call.';

COMMENT ON COLUMN __mj."ContentProcessRunPromptRun"."RunType" IS 'Whether this AIPromptRun was for LLM tagging (Tag) or text embedding (Embed).';

COMMENT ON COLUMN __mj."DuplicateRun"."TotalItemCount" IS 'Total entity records to check for duplicates in this run.';

COMMENT ON COLUMN __mj."DuplicateRun"."ProcessedItemCount" IS 'Number of records checked so far. Used for progress percentage.';

COMMENT ON COLUMN __mj."DuplicateRun"."LastProcessedOffset" IS 'Resume cursor for large-scale duplicate detection. Stores the offset of the last completed batch.';

COMMENT ON COLUMN __mj."DuplicateRun"."BatchSize" IS 'Number of records processed per batch during duplicate detection.';

COMMENT ON COLUMN __mj."DuplicateRun"."CancellationRequested" IS 'When set to 1, duplicate detection stops after the current batch. Used for pause/cancel.';

COMMENT ON COLUMN __mj."DuplicateRunDetail"."StartedAt" IS 'When processing started for this specific record during duplicate detection.';

COMMENT ON COLUMN __mj."DuplicateRunDetail"."EndedAt" IS 'When processing completed for this specific record during duplicate detection.';

COMMENT ON COLUMN __mj."Tag"."Status" IS 'Lifecycle status of the tag: Active (in use), Merged (consolidated into another tag), Deprecated (no longer assigned but preserved), Deleted (soft-deleted).';

COMMENT ON COLUMN __mj."Tag"."MergedIntoTagID" IS 'When Status is Merged, points to the surviving tag this tag was merged into. All TaggedItem and ContentItemTag references are re-pointed during merge.';

COMMENT ON TABLE __mj."TagAuditLog" IS 'Immutable audit trail for all tag taxonomy changes. Each row records a single action with before/after details in JSON.';

COMMENT ON COLUMN __mj."TagAuditLog"."TagID" IS 'The tag that was acted upon.';

COMMENT ON COLUMN __mj."TagAuditLog"."Action" IS 'The type of action performed: Created, Renamed, Moved (parent changed), Merged (into RelatedTagID), Split (from RelatedTagID), Deprecated, Reactivated, Deleted, DescriptionChanged.';

COMMENT ON COLUMN __mj."TagAuditLog"."Details" IS 'JSON object with action-specific details. For Renamed: {"OldName":"...","NewName":"..."}. For Moved: {"OldParentID":"...","NewParentID":"..."}. For Merged: {"ItemsMoved":42}.';

COMMENT ON COLUMN __mj."TagAuditLog"."PerformedByUserID" IS 'User who performed the action.';

COMMENT ON COLUMN __mj."TagAuditLog"."RelatedTagID" IS 'For Merged actions: the surviving tag. For Split actions: the source tag. NULL for other actions.';

COMMENT ON TABLE __mj."ContentItemDuplicate" IS 'Detected duplicate or near-duplicate content items across sources. Each row represents a pair of items with similarity scoring and resolution tracking.';

COMMENT ON COLUMN __mj."ContentItemDuplicate"."SimilarityScore" IS 'Cosine similarity (for Vector) or exact match score (1.0 for Checksum/URL). Range 0.0-1.0.';

COMMENT ON COLUMN __mj."ContentItemDuplicate"."DetectionMethod" IS 'How the duplicate was detected: Checksum (identical text hash), Vector (embedding similarity), Title (same title text), URL (same source URL).';

COMMENT ON COLUMN __mj."ContentItemDuplicate"."Status" IS 'Current status: Pending (awaiting review), Confirmed (verified duplicate), Dismissed (not a duplicate), Merged (one item was removed).';

COMMENT ON COLUMN __mj."ContentItemDuplicate"."Resolution" IS 'How the duplicate was resolved: KeepA (keep first, remove second), KeepB (keep second, remove first), MergeBoth (combine into one), NotDuplicate (false positive).';

COMMENT ON TABLE __mj."TagCoOccurrence" IS 'Materialized co-occurrence counts for tag pairs. Records how many content items share both tags. Used for taxonomy health analysis, merge suggestions, and cross-entity intelligence. Recomputed periodically by the pipeline.';

COMMENT ON COLUMN __mj."TagCoOccurrence"."CoOccurrenceCount" IS 'Number of content items (or entity records via TaggedItem) that are tagged with both TagA and TagB.';

COMMENT ON COLUMN __mj."TagCoOccurrence"."TagAID" IS 'First tag in the canonical pair (TagAID < TagBID ensures each pair is stored exactly once).';

COMMENT ON COLUMN __mj."ContentSource"."ScheduledActionID" IS 'Optional link to a MJ Scheduled Action that automatically runs the classification pipeline for this source on a cron schedule.';

COMMENT ON COLUMN __mj."ContentItem"."EmbeddingStatus" IS 'Vectorization status: Pending (not yet embedded), Processing (currently being embedded), Complete (vector stored), Failed (embedding error), Skipped (excluded from vectorization).';

COMMENT ON COLUMN __mj."ContentItem"."LastEmbeddedAt" IS 'Timestamp of the most recent successful embedding for this content item.';

COMMENT ON COLUMN __mj."ContentItem"."EmbeddingModelID" IS 'The AI model used to generate the most recent embedding for this content item.';

COMMENT ON COLUMN __mj."ContentItem"."TaggingStatus" IS 'Autotagging status: Pending (not yet tagged), Processing (LLM is generating tags), Complete (tags assigned), Failed (LLM error), Skipped (excluded from tagging).';

COMMENT ON COLUMN __mj."ContentItem"."LastTaggedAt" IS 'Timestamp of the most recent successful autotagging run for this content item.';

COMMENT ON TABLE __mj."KnowledgeHubSavedSearch" IS 'User-saved search queries for the Knowledge Hub. Stores query text, active filters (JSON), and score thresholds so searches can be recalled or run on a schedule.';

COMMENT ON COLUMN __mj."KnowledgeHubSavedSearch"."Filters" IS 'JSON object with active filter selections. Keys are filter categories (Entity, Tags), values are arrays of selected option values.';

COMMENT ON COLUMN __mj."KnowledgeHubSavedSearch"."NotifyOnNewResults" IS 'When enabled, the system will notify the user when new results match this saved search (future capability).';


-- ===================== Other =====================

----------------------------------------------------------------------
-- 2. Extended Properties
----------------------------------------------------------------------

-- ContentSourceType."DriverClass"

-- Extended Properties

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — Summary of changes:
--
--  Tag:                     +Status, +MergedIntoTagID (1 ALTER TABLE + 1 constraints)
--  TagAuditLog:             NEW TABLE (immutable audit trail)
--  ContentItemDuplicate:    NEW TABLE (cross-source dedup)
--  TagCoOccurrence:         NEW TABLE (materialized pair counts)
--  ContentSource:           +ScheduledActionID (1 ALTER TABLE + 1 FK)
--  ContentItem:             +EmbeddingStatus, +LastEmbeddedAt, +EmbeddingModelID,
--                           +TaggingStatus, +LastTaggedAt (1 ALTER TABLE + 1 constraints)
--  KnowledgeHubSavedSearch: NEW TABLE (user saved queries)
-- ═══════════════════════════════════════════════════════════════════════════════


-- REFRESH METADATA AND RECOMPILE OBJECTS BEFORE RUNNING CODE GEN'S EMITTED OUTPUT

/* SQL text to recompile all views */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."KnowledgeHubSavedSearch" */

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."KnowledgeHubSavedSearch" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentItemDuplicate" */

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentItemDuplicate" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentProcessRunPromptRun" */

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentProcessRunPromptRun" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagAuditLog" */

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagAuditLog" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TagCoOccurrence" */

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TagCoOccurrence" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."ContentProcessRunDetail" */

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."ContentProcessRunDetail" */

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Content Item Duplicates */

/* spUpdate Permissions for MJ: Content Item Tags */

/* spUpdate Permissions for MJ: Content Process Run Prompt Runs */

/* spUpdate Permissions for MJ: Content Process Runs */

/* spUpdate Permissions for MJ: Content Items */

/* spUpdate Permissions for MJ: Content Process Run Details */

/* spUpdate Permissions for MJ: Content Source Types */

/* spUpdate Permissions for MJ: Content Sources */

/* spUpdate Permissions for MJ: Content Types */

/* spUpdate Permissions for MJ: Duplicate Run Details */

/* spUpdate Permissions for MJ: Duplicate Runs */

/* spUpdate Permissions for MJ: Knowledge Hub Saved Searches */

/* spUpdate Permissions for MJ: Tagged Items */

/* spUpdate Permissions for MJ: Tags */

/* spUpdate Permissions for MJ: Tag Co Occurrences */

/* spUpdate Permissions for MJ: Tag Audit Logs */
