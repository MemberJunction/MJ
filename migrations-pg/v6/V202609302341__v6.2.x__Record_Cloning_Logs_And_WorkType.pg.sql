-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609302341__v6.2.x__Record_Cloning_Logs_And_WorkType.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ===================================================================================== */
/* Record Cloning: Clone Log Entities and Record Process WorkType */
/* ===================================================================================== */
/* Introduces core infrastructure for Phase 1.4 of the Record Cloning Architecture: */
/* 1. RecordCloneLog: Header entity logging every clone execution plan, status, and outcome */
/* 2. RecordCloneLogItem: Item entity detailing per-node traversal, actions, and field changes */
/* 3. RecordProcess.WorkType: Adds 'Clone' to allow batch record cloning via Record Processes */
/* Design plan: plans/record-cloning/README.md §10.5, §11.3 */
/* The JSONType of RecordCloneLog.PlanJSON (IClonePlan) is set by metadata, not here: */
/* metadata/entities/.entity-field-jsontype-record-clone-plan.json, applied by */
/* `mj sync push`. Until then CodeGen treats the column as plain text. */
/* ===================================================================================== */
CREATE TABLE __mj."RecordCloneLog" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "RootEntityID" UUID NOT NULL,
  "RootSourceRecordID" VARCHAR(750) NOT NULL,
  "RootTargetRecordID" VARCHAR(750) NULL,
  "InitiatedByUserID" UUID NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Planned'
  ),
  "StartedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  "EndedAt" TIMESTAMPTZ NULL,
  "PlanHash" VARCHAR(64) NOT NULL,
  "PlanJSON" TEXT NOT NULL,
  "OptionsJSON" TEXT NULL,
  "ResultJSON" TEXT NULL,
  "Reason" TEXT NULL,
  "ErrorMessage" TEXT NULL,
  "ProcessRunID" UUID NULL,
  "CreatedCount" INT NOT NULL DEFAULT (
    0
  ),
  "ReferencedCount" INT NOT NULL DEFAULT (
    0
  ),
  "SkippedCount" INT NOT NULL DEFAULT (
    0
  ),
  CONSTRAINT "PK_RecordCloneLog" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RecordCloneLog_RootEntity" FOREIGN KEY ("RootEntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_RecordCloneLog_InitiatedByUser" FOREIGN KEY ("InitiatedByUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_RecordCloneLog_ProcessRun" FOREIGN KEY ("ProcessRunID") REFERENCES __mj."ProcessRun" (
    "ID"
  ),
  CONSTRAINT "CK_RecordCloneLog_Status" CHECK ("Status" IN ('Planned', 'Running', 'Complete', 'Error', 'Cancelled'))
);

CREATE TABLE __mj."RecordCloneLogItem" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "RecordCloneLogID" UUID NOT NULL,
  "EntityID" UUID NOT NULL,
  "SourceRecordID" VARCHAR(750) NOT NULL,
  "TargetRecordID" VARCHAR(750) NULL,
  "Depth" INT NOT NULL DEFAULT (
    0
  ),
  "Route" VARCHAR(20) NOT NULL,
  "Status" VARCHAR(20) NOT NULL,
  "Sequence" INT NOT NULL DEFAULT (
    0
  ),
  "Reason" TEXT NULL,
  "FieldChangesJSON" TEXT NULL,
  CONSTRAINT "PK_RecordCloneLogItem" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RecordCloneLogItem_Log" FOREIGN KEY ("RecordCloneLogID") REFERENCES __mj."RecordCloneLog" (
    "ID"
  ),
  CONSTRAINT "FK_RecordCloneLogItem_Entity" FOREIGN KEY ("EntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "CK_RecordCloneLogItem_Route" CHECK ("Route" IN ('RootSave', 'Collection', 'Embedded', 'IsAChain', 'Sidecar')),
  CONSTRAINT "CK_RecordCloneLogItem_Status" CHECK ("Status" IN ('Created', 'Referenced', 'Skipped', 'Failed'))
);

ALTER TABLE __mj."RecordProcess"
DROP CONSTRAINT IF EXISTS "CK_RecordProcess_WorkType" /* ------------------------------------------------------------------------------------- */ /* Extend RecordProcess.WorkType to include 'Clone' */ /* ------------------------------------------------------------------------------------- */;
ALTER TABLE __mj."RecordProcess"
  ADD CONSTRAINT "CK_RecordProcess_WorkType" CHECK ("WorkType" IN ('Action', 'Agent', 'Infer', 'FieldRules', 'ML Model', 'Clone'));

COMMENT ON TABLE __mj."RecordCloneLog" IS 'Audit and coordination header entity for record cloning operations. Captures plan, execution status, counts, and outcome.';

COMMENT ON COLUMN __mj."RecordCloneLog"."ID" IS 'Unique identifier for the record clone log header record.';

COMMENT ON COLUMN __mj."RecordCloneLog"."RootEntityID" IS 'Foreign key to the Entity being cloned as the root of the clone record graph.';

COMMENT ON COLUMN __mj."RecordCloneLog"."RootSourceRecordID" IS 'Source root record identifier, encoded as a compact URL segment.';

COMMENT ON COLUMN __mj."RecordCloneLog"."RootTargetRecordID" IS 'Target root record identifier resulting from the clone, encoded as a compact URL segment. Null while in progress or if failed.';

COMMENT ON COLUMN __mj."RecordCloneLog"."InitiatedByUserID" IS 'Foreign key to the User who initiated this clone operation.';

COMMENT ON COLUMN __mj."RecordCloneLog"."Status" IS 'Current operational status of the clone execution (Planned, Running, Complete, Error, Cancelled).';

COMMENT ON COLUMN __mj."RecordCloneLog"."StartedAt" IS 'Timestamp (UTC with offset) when the clone operation started.';

COMMENT ON COLUMN __mj."RecordCloneLog"."EndedAt" IS 'Timestamp (UTC with offset) when the clone operation concluded.';

COMMENT ON COLUMN __mj."RecordCloneLog"."PlanHash" IS 'SHA-256 hash of the execution plan used for concurrency validation and provenance.';

COMMENT ON COLUMN __mj."RecordCloneLog"."PlanJSON" IS 'Serialized JSON execution plan detailing all graph nodes, edges, actions, and options.';

COMMENT ON COLUMN __mj."RecordCloneLog"."OptionsJSON" IS 'JSON request options supplied by the user or client for this clone execution.';

COMMENT ON COLUMN __mj."RecordCloneLog"."ResultJSON" IS 'Summary result JSON payload containing counts, timings, and created record mappings.';

COMMENT ON COLUMN __mj."RecordCloneLog"."Reason" IS 'Optional business justification or user-provided explanation for this clone operation.';

COMMENT ON COLUMN __mj."RecordCloneLog"."ErrorMessage" IS 'Error message and diagnostic details if the clone operation failed.';

COMMENT ON COLUMN __mj."RecordCloneLog"."ProcessRunID" IS 'Foreign key to the parent ProcessRun when this clone was executed via a batch RecordProcess.';

COMMENT ON COLUMN __mj."RecordCloneLog"."CreatedCount" IS 'Total count of new records successfully created during this clone operation.';

COMMENT ON COLUMN __mj."RecordCloneLog"."ReferencedCount" IS 'Total count of existing records linked or referenced by foreign key rather than copied.';

COMMENT ON COLUMN __mj."RecordCloneLog"."SkippedCount" IS 'Total count of records intentionally skipped based on relationship or entity clone policies.';

COMMENT ON TABLE __mj."RecordCloneLogItem" IS 'Item-level detail for each node in a record clone operation, capturing traversal route, action, status, and field changes.';

COMMENT ON COLUMN __mj."RecordCloneLogItem"."ID" IS 'Unique identifier for the record clone log item record.';

COMMENT ON COLUMN __mj."RecordCloneLogItem"."RecordCloneLogID" IS 'Foreign key to the parent RecordCloneLog header record coordinating this clone execution.';

COMMENT ON COLUMN __mj."RecordCloneLogItem"."EntityID" IS 'Foreign key to the Entity type of this individual cloned record.';

COMMENT ON COLUMN __mj."RecordCloneLogItem"."SourceRecordID" IS 'Source record key identifier, encoded as a compact URL segment.';

COMMENT ON COLUMN __mj."RecordCloneLogItem"."TargetRecordID" IS 'Target record key identifier resulting from the clone, encoded as a compact URL segment. Null if skipped or failed.';

COMMENT ON COLUMN __mj."RecordCloneLogItem"."Depth" IS 'Distance from the root node in the clone record graph (0 for root).';

COMMENT ON COLUMN __mj."RecordCloneLogItem"."Route" IS 'Relationship route traversed to reach this record (RootSave, Collection, Embedded, IsAChain, Sidecar).';

COMMENT ON COLUMN __mj."RecordCloneLogItem"."Status" IS 'Execution outcome status for this node (Created, Referenced, Skipped, Failed).';

COMMENT ON COLUMN __mj."RecordCloneLogItem"."Sequence" IS 'Execution sequence order within the clone transaction.';

COMMENT ON COLUMN __mj."RecordCloneLogItem"."Reason" IS 'Diagnostic explanation or reason for the action taken (e.g., skip reason or failure details).';

COMMENT ON COLUMN __mj."RecordCloneLogItem"."FieldChangesJSON" IS 'Serialized JSON array of field-level modifications, copies, transforms, resets, and remaps applied to this record.';

/* ============================================================================= */
/* GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND */
/* ============================================================================= */
/* SQL generated to create new entity MJ: Record Clone Logs */
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
    'f8f2154d-d37f-4ee4-a573-ebbd5ed595f7',
    'MJ: Record Clone Logs',
    'Record Clone Logs',
    'Audit and coordination header entity for record cloning operations. Captures plan, execution status, counts, and outcome.',
    NULL,
    'RecordCloneLog',
    'vwRecordCloneLogs',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    FALSE,
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
/* SQL generated to add new entity MJ: Record Clone Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'f8f2154d-d37f-4ee4-a573-ebbd5ed595f7',
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
/* SQL generated to add new permission for entity MJ: Record Clone Logs for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Record Clone Logs for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Record Clone Logs for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Record Clone Log Items */
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
    '92c4e132-983c-465e-970e-4fde6bbb1799',
    'MJ: Record Clone Log Items',
    'Record Clone Log Items',
    'Item-level detail for each node in a record clone operation, capturing traversal route, action, status, and field changes.',
    NULL,
    'RecordCloneLogItem',
    'vwRecordCloneLogItems',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    FALSE,
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
/* SQL generated to add new entity MJ: Record Clone Log Items to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '92c4e132-983c-465e-970e-4fde6bbb1799',
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
/* SQL generated to add new permission for entity MJ: Record Clone Log Items for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Record Clone Log Items for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Record Clone Log Items for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."RecordCloneLogItem"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RecordCloneLogItem */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RecordCloneLogItem */
UPDATE __mj."RecordCloneLogItem" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RecordCloneLogItem' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RecordCloneLogItem" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordCloneLogItem" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RecordCloneLogItem"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RecordCloneLogItem */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RecordCloneLogItem */
UPDATE __mj."RecordCloneLogItem" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RecordCloneLogItem' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RecordCloneLogItem" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordCloneLogItem" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RecordCloneLog"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RecordCloneLog */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RecordCloneLog */
UPDATE __mj."RecordCloneLog" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RecordCloneLog' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RecordCloneLog" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordCloneLog" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RecordCloneLog"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RecordCloneLog */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RecordCloneLog */
UPDATE __mj."RecordCloneLog" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RecordCloneLog' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RecordCloneLog" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordCloneLog" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f0cdb4d5-6a7b-4a0a-96c9-1c839d8afa12' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f0cdb4d5-6a7b-4a0a-96c9-1c839d8afa12', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'ID', 'ID', 'Unique identifier for the record clone log item record.', 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3221cf63-5522-4473-a99a-cc566d37500f' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'RecordCloneLogID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3221cf63-5522-4473-a99a-cc566d37500f', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'RecordCloneLogID', 'Record Clone Log ID', 'Foreign key to the parent RecordCloneLog header record coordinating this clone execution.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'adde9665-c1f5-4bb2-9dac-76cfb3779370' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('adde9665-c1f5-4bb2-9dac-76cfb3779370', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'EntityID', 'Entity ID', 'Foreign key to the Entity type of this individual cloned record.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '90e2f4bc-fdd9-41a3-94dd-64086b27517a' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'SourceRecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('90e2f4bc-fdd9-41a3-94dd-64086b27517a', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'SourceRecordID', 'Source Record ID', 'Source record key identifier, encoded as a compact URL segment.', 'nvarchar', 1500, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'abad0121-03a0-4a1c-96f9-1f8d2f1ef203' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'TargetRecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('abad0121-03a0-4a1c-96f9-1f8d2f1ef203', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'TargetRecordID', 'Target Record ID', 'Target record key identifier resulting from the clone, encoded as a compact URL segment. Null if skipped or failed.', 'nvarchar', 1500, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7e332914-27f1-4479-9b95-086265206ea1' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'Depth')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7e332914-27f1-4479-9b95-086265206ea1', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'Depth', 'Depth', 'Distance from the root node in the clone record graph (0 for root).', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd6b70085-b758-40b8-8ff6-919b73cc4a22' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'Route')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d6b70085-b758-40b8-8ff6-919b73cc4a22', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'Route', 'Route', 'Relationship route traversed to reach this record (RootSave, Collection, Embedded, IsAChain, Sidecar).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b99174de-be9a-4e36-a6a4-d03b7f8835f3' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b99174de-be9a-4e36-a6a4-d03b7f8835f3', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'Status', 'Status', 'Execution outcome status for this node (Created, Referenced, Skipped, Failed).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3423f051-1375-49e7-af72-012997200529' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3423f051-1375-49e7-af72-012997200529', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'Sequence', 'Sequence', 'Execution sequence order within the clone transaction.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cfbb8a27-eb9c-480b-81b6-ff79e19466ae' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'Reason')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cfbb8a27-eb9c-480b-81b6-ff79e19466ae', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'Reason', 'Reason', 'Diagnostic explanation or reason for the action taken (e.g., skip reason or failure details).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bfec803b-5524-43af-ba8c-ff51b5f5f424' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'FieldChangesJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bfec803b-5524-43af-ba8c-ff51b5f5f424', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'FieldChangesJSON', 'Field Changes JSON', 'Serialized JSON array of field-level modifications, copies, transforms, resets, and remaps applied to this record.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bdff371d-c6e8-4ccd-ae0f-1165d21b8784' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bdff371d-c6e8-4ccd-ae0f-1165d21b8784', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fd4b31c5-da2a-433f-9d35-8954236483c2' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fd4b31c5-da2a-433f-9d35-8954236483c2', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6259924c-9bfe-4fba-9e4b-f785033b6bb8' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6259924c-9bfe-4fba-9e4b-f785033b6bb8', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'ID', 'ID', 'Unique identifier for the record clone log header record.', 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a80ccd12-73d9-49c5-a14b-17f91c08cb16' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'RootEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a80ccd12-73d9-49c5-a14b-17f91c08cb16', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'RootEntityID', 'Root Entity ID', 'Foreign key to the Entity being cloned as the root of the clone record graph.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8b29429d-587e-4229-8882-beb1dfe7bc2a' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'RootSourceRecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8b29429d-587e-4229-8882-beb1dfe7bc2a', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'RootSourceRecordID', 'Root Source Record ID', 'Source root record identifier, encoded as a compact URL segment.', 'nvarchar', 1500, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '96eeeed2-dfa7-4f11-a7f0-d1cb27593cbf' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'RootTargetRecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('96eeeed2-dfa7-4f11-a7f0-d1cb27593cbf', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'RootTargetRecordID', 'Root Target Record ID', 'Target root record identifier resulting from the clone, encoded as a compact URL segment. Null while in progress or if failed.', 'nvarchar', 1500, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8fbccca0-a6cc-4fae-aa41-1cc13d37bcde' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'InitiatedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8fbccca0-a6cc-4fae-aa41-1cc13d37bcde', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'InitiatedByUserID', 'Initiated By User ID', 'Foreign key to the User who initiated this clone operation.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9c328256-b943-4359-9169-8a43719f7183' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9c328256-b943-4359-9169-8a43719f7183', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'Status', 'Status', 'Current operational status of the clone execution (Planned, Running, Complete, Error, Cancelled).', 'nvarchar', 40, 0, 0, FALSE, 'Planned', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70532031-6126-40d1-a751-95653a5b5dda' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'StartedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('70532031-6126-40d1-a751-95653a5b5dda', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'StartedAt', 'Started At', 'Timestamp (UTC with offset) when the clone operation started.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8d6d28a1-cb9d-45be-9aaf-b2cd3475ac18' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'EndedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8d6d28a1-cb9d-45be-9aaf-b2cd3475ac18', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'EndedAt', 'Ended At', 'Timestamp (UTC with offset) when the clone operation concluded.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '614815db-2050-4672-953f-e3c67804a9b2' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'PlanHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('614815db-2050-4672-953f-e3c67804a9b2', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'PlanHash', 'Plan Hash', 'SHA-256 hash of the execution plan used for concurrency validation and provenance.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c02ef3a4-1973-4a1f-add1-51b3e6c4ac09' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'PlanJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c02ef3a4-1973-4a1f-add1-51b3e6c4ac09', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'PlanJSON', 'Plan JSON', 'Serialized JSON execution plan detailing all graph nodes, edges, actions, and options.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd4f7308e-b155-4a79-9d77-0ff125e23c9e' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'OptionsJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d4f7308e-b155-4a79-9d77-0ff125e23c9e', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'OptionsJSON', 'Options JSON', 'JSON request options supplied by the user or client for this clone execution.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f2f31a62-1d55-4556-9764-b52f9156cc21' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'ResultJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f2f31a62-1d55-4556-9764-b52f9156cc21', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'ResultJSON', 'Result JSON', 'Summary result JSON payload containing counts, timings, and created record mappings.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd7abb88-8674-446d-bb40-f6ca8876902c' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'Reason')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cd7abb88-8674-446d-bb40-f6ca8876902c', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'Reason', 'Reason', 'Optional business justification or user-provided explanation for this clone operation.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8c06b4d5-ba4e-4684-b93e-55e225fc2ad0' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'ErrorMessage')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8c06b4d5-ba4e-4684-b93e-55e225fc2ad0', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'ErrorMessage', 'Error Message', 'Error message and diagnostic details if the clone operation failed.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '42430da2-df5c-481b-b2eb-09ee1c4aa8e5' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'ProcessRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('42430da2-df5c-481b-b2eb-09ee1c4aa8e5', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'ProcessRunID', 'Process Run ID', 'Foreign key to the parent ProcessRun when this clone was executed via a batch RecordProcess.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '9989A9A4-5546-4552-A765-B27EE399BFEA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c29d948b-714e-42d5-bb53-59c86773b1f5' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'CreatedCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c29d948b-714e-42d5-bb53-59c86773b1f5', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'CreatedCount', 'Created Count', 'Total count of new records successfully created during this clone operation.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '42468489-1002-4c3a-8800-0114c4f7ebc4' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'ReferencedCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('42468489-1002-4c3a-8800-0114c4f7ebc4', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'ReferencedCount', 'Referenced Count', 'Total count of existing records linked or referenced by foreign key rather than copied.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e935b625-a12a-427b-b1cd-282f2e65ffd4' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'SkippedCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e935b625-a12a-427b-b1cd-282f2e65ffd4', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'SkippedCount', 'Skipped Count', 'Total count of records intentionally skipped based on relationship or entity clone policies.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3d9c9ee7-ec06-4476-984d-7fda0c75596f' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3d9c9ee7-ec06-4476-984d-7fda0c75596f', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3ca0e3b8-358f-4aa5-9236-39c2dcc6c8f1' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3ca0e3b8-358f-4aa5-9236-39c2dcc6c8f1', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID f5a5017c-42c1-4efc-931d-18be8b6a6650 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f5a5017c-42c1-4efc-931d-18be8b6a6650',
    '9C328256-B943-4359-9169-8A43719F7183',
    1,
    'Cancelled',
    'Cancelled',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 9f536c7d-f558-4064-ad31-6eefef95d29f */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9f536c7d-f558-4064-ad31-6eefef95d29f',
    '9C328256-B943-4359-9169-8A43719F7183',
    2,
    'Complete',
    'Complete',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID dbe4ae0e-393b-4741-b54b-8dbefb1cae36 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'dbe4ae0e-393b-4741-b54b-8dbefb1cae36',
    '9C328256-B943-4359-9169-8A43719F7183',
    3,
    'Error',
    'Error',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID fb796f2e-24fb-4a25-800a-008987000df5 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'fb796f2e-24fb-4a25-800a-008987000df5',
    '9C328256-B943-4359-9169-8A43719F7183',
    4,
    'Planned',
    'Planned',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 1f8a23f5-9a1c-4d1d-b2c3-07ee2f8168d8 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1f8a23f5-9a1c-4d1d-b2c3-07ee2f8168d8',
    '9C328256-B943-4359-9169-8A43719F7183',
    5,
    'Running',
    'Running',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 9C328256-B943-4359-9169-8A43719F7183 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '9C328256-B943-4359-9169-8A43719F7183';
/* SQL text to insert entity field value with ID 883e3814-efb0-444f-af57-65ecfb910b06 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '883e3814-efb0-444f-af57-65ecfb910b06',
    'D6B70085-B758-40B8-8FF6-919B73CC4A22',
    1,
    'Collection',
    'Collection',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID e9e0d618-264c-4148-9614-e43d3abc2673 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e9e0d618-264c-4148-9614-e43d3abc2673',
    'D6B70085-B758-40B8-8FF6-919B73CC4A22',
    2,
    'Embedded',
    'Embedded',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 22242ee5-a169-4770-9fa9-a0c541cc42f2 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '22242ee5-a169-4770-9fa9-a0c541cc42f2',
    'D6B70085-B758-40B8-8FF6-919B73CC4A22',
    3,
    'IsAChain',
    'IsAChain',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 3b8bbdfa-46c0-4878-a07c-624f7dd1b08a */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '3b8bbdfa-46c0-4878-a07c-624f7dd1b08a',
    'D6B70085-B758-40B8-8FF6-919B73CC4A22',
    4,
    'RootSave',
    'RootSave',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 80d2793e-22b2-47a5-a454-eacfb4ba6420 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '80d2793e-22b2-47a5-a454-eacfb4ba6420',
    'D6B70085-B758-40B8-8FF6-919B73CC4A22',
    5,
    'Sidecar',
    'Sidecar',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID D6B70085-B758-40B8-8FF6-919B73CC4A22 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'D6B70085-B758-40B8-8FF6-919B73CC4A22';
/* SQL text to insert entity field value with ID 30971927-652b-409e-a06d-30493fe8a480 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '30971927-652b-409e-a06d-30493fe8a480',
    'B99174DE-BE9A-4E36-A6A4-D03B7F8835F3',
    1,
    'Created',
    'Created',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 2a971349-e7d6-4919-ada1-5070036b4aa6 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '2a971349-e7d6-4919-ada1-5070036b4aa6',
    'B99174DE-BE9A-4E36-A6A4-D03B7F8835F3',
    2,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5d91a24e-000b-4b39-8e25-23e228a879c9 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5d91a24e-000b-4b39-8e25-23e228a879c9',
    'B99174DE-BE9A-4E36-A6A4-D03B7F8835F3',
    3,
    'Referenced',
    'Referenced',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID dd6e00ca-60c7-4ea9-a012-9ce7cd314b27 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'dd6e00ca-60c7-4ea9-a012-9ce7cd314b27',
    'B99174DE-BE9A-4E36-A6A4-D03B7F8835F3',
    4,
    'Skipped',
    'Skipped',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID B99174DE-BE9A-4E36-A6A4-D03B7F8835F3 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'B99174DE-BE9A-4E36-A6A4-D03B7F8835F3';
/* SQL text to insert entity field value with ID 5f10449d-491c-4fdf-9b3c-0d4ae3183541 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5f10449d-491c-4fdf-9b3c-0d4ae3183541',
    '58345D95-711E-470F-BD28-1AA4AD8214D2',
    3,
    'Clone',
    'Clone',
    NOW(),
    NOW()
  );
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 4
WHERE
  "ID" = 'D355DD72-601D-4CEB-A7E3-709C2C8B2E98';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 5
WHERE
  "ID" = '17B04C7F-47ED-49ED-B92E-C069F2ED620E';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 6
WHERE
  "ID" = '444187B1-4C04-4FF3-98E9-B98499A068FB';
/* Create Entity Relationship: MJ: Entities -> MJ: Record Clone Log Items (One To Many via EntityID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '94d852f2-9350-4ec4-a9a6-fdf5a0be7021') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('94d852f2-9350-4ec4-a9a6-fdf5a0be7021', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '92C4E132-983C-465E-970E-4FDE6BBB1799', 'EntityID', 'One To Many', TRUE, TRUE, 79, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2b11c581-1072-4aae-b6ec-50b821791276') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2b11c581-1072-4aae-b6ec-50b821791276', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', 'RootEntityID', 'One To Many', TRUE, TRUE, 80, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ad4e8092-eb0f-4758-a90f-29ea7ffac179') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad4e8092-eb0f-4758-a90f-29ea7ffac179', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', 'InitiatedByUserID', 'One To Many', TRUE, TRUE, 106, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'df7e27c2-5291-4a94-b852-ed8188baed9b') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('df7e27c2-5291-4a94-b852-ed8188baed9b', '9989A9A4-5546-4552-A765-B27EE399BFEA', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', 'ProcessRunID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5d36f79a-dd07-43d1-8eda-f65272ab3cbc') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5d36f79a-dd07-43d1-8eda-f65272ab3cbc', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', '92C4E132-983C-465E-970E-4FDE6BBB1799', 'RecordCloneLogID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2478eeb0-1160-4a43-87dc-4403b97276ce' OR ("EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND "Name" = 'Entity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2478eeb0-1160-4a43-87dc-4403b97276ce', '92C4E132-983C-465E-970E-4FDE6BBB1799' /* Entity: MJ: Record Clone Log Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '92C4E132-983C-465E-970E-4FDE6BBB1799'), 'Entity', 'Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '653c536c-edf5-4496-aa0e-cd2af08bee89' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'RootEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('653c536c-edf5-4496-aa0e-cd2af08bee89', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'RootEntity', 'Root Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd15a10e8-de3b-4386-ba0f-654a62621ea9' OR ("EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND "Name" = 'InitiatedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d15a10e8-de3b-4386-ba0f-654a62621ea9', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' /* Entity: MJ: Record Clone Logs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'), 'InitiatedByUser', 'Initiated By User', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Log Items
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_clone_log_item_record_clone_log_id"
    ON "__mj"."RecordCloneLogItem" ("RecordCloneLogID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_clone_log_item_entity_id"
    ON "__mj"."RecordCloneLogItem" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Log Items
-- Item: vwRecordCloneLogItems
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Clone Log Items
-----               SCHEMA:      __mj
-----               BASE TABLE:  RecordCloneLogItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRecordCloneLogItems"
AS
SELECT
    r.*,
    MJEntity_EntityID."Name" AS "Entity"
FROM
    "__mj"."RecordCloneLogItem" AS r
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "r"."EntityID" = MJEntity_EntityID."ID"
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
        AND tc.relname = 'vwRecordCloneLogItems'
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
                           AND tc.relname = 'vwRecordCloneLogItems'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRecordCloneLogItems" CASCADE;
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
GRANT SELECT ON "__mj"."vwRecordCloneLogItems" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRecordCloneLogItems" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRecordCloneLogItems" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Log Items
-- Item: spCreateRecordCloneLogItem
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RecordCloneLogItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecordCloneLogItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRecordCloneLogItem"(
    p_id UUID DEFAULT NULL,
    p_recordclonelogid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_sourcerecordid varchar(750) DEFAULT NULL,
    p_targetrecordid_clear boolean DEFAULT false,
    p_targetrecordid varchar(750) DEFAULT NULL,
    p_depth int DEFAULT NULL,
    p_route varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_fieldchangesjson_clear boolean DEFAULT false,
    p_fieldchangesjson TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordCloneLogItems" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RecordCloneLogItem"
        (
            "ID",
            "RecordCloneLogID",
                "EntityID",
                "SourceRecordID",
                "TargetRecordID",
                "Depth",
                "Route",
                "Status",
                "Sequence",
                "Reason",
                "FieldChangesJSON"
        )
    VALUES
        (
            v_new_id,
            p_recordclonelogid,
                p_entityid,
                p_sourcerecordid,
                CASE WHEN p_targetrecordid_clear = true THEN NULL ELSE COALESCE(p_targetrecordid, NULL) END,
                COALESCE(p_depth, 0),
                p_route,
                p_status,
                COALESCE(p_sequence, 0),
                CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, NULL) END,
                CASE WHEN p_fieldchangesjson_clear = true THEN NULL ELSE COALESCE(p_fieldchangesjson, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordCloneLogItems"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordCloneLogItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordCloneLogItem" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Log Items
-- Item: spUpdateRecordCloneLogItem
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RecordCloneLogItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecordCloneLogItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRecordCloneLogItem"(
    p_id UUID,
    p_recordclonelogid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_sourcerecordid varchar(750) DEFAULT NULL,
    p_targetrecordid_clear boolean DEFAULT false,
    p_targetrecordid varchar(750) DEFAULT NULL,
    p_depth int DEFAULT NULL,
    p_route varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_fieldchangesjson_clear boolean DEFAULT false,
    p_fieldchangesjson TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordCloneLogItems" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RecordCloneLogItem"
    SET
        "RecordCloneLogID" = COALESCE(p_recordclonelogid, "RecordCloneLogID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "SourceRecordID" = COALESCE(p_sourcerecordid, "SourceRecordID"),
        "TargetRecordID" = CASE WHEN p_targetrecordid_clear = true THEN NULL ELSE COALESCE(p_targetrecordid, "TargetRecordID") END,
        "Depth" = COALESCE(p_depth, "Depth"),
        "Route" = COALESCE(p_route, "Route"),
        "Status" = COALESCE(p_status, "Status"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Reason" = CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, "Reason") END,
        "FieldChangesJSON" = CASE WHEN p_fieldchangesjson_clear = true THEN NULL ELSE COALESCE(p_fieldchangesjson, "FieldChangesJSON") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordCloneLogItems"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRecordCloneLogItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRecordCloneLogItem" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordCloneLogItem table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_record_clone_log_item"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_record_clone_log_item" ON "__mj"."RecordCloneLogItem";

CREATE TRIGGER "trg_update_record_clone_log_item"
BEFORE UPDATE ON "__mj"."RecordCloneLogItem"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_record_clone_log_item"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Log Items
-- Item: spDeleteRecordCloneLogItem
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RecordCloneLogItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRecordCloneLogItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRecordCloneLogItem"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RecordCloneLogItem"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRecordCloneLogItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRecordCloneLogItem" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Logs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_clone_log_root_entity_id"
    ON "__mj"."RecordCloneLog" ("RootEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_clone_log_initiated_by_user_id"
    ON "__mj"."RecordCloneLog" ("InitiatedByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_clone_log_process_run_id"
    ON "__mj"."RecordCloneLog" ("ProcessRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Logs
-- Item: vwRecordCloneLogs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Clone Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  RecordCloneLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRecordCloneLogs"
AS
SELECT
    r.*,
    MJEntity_RootEntityID."Name" AS "RootEntity",
    MJUser_InitiatedByUserID."Name" AS "InitiatedByUser"
FROM
    "__mj"."RecordCloneLog" AS r
INNER JOIN
    "__mj"."Entity" AS MJEntity_RootEntityID
  ON
    "r"."RootEntityID" = MJEntity_RootEntityID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_InitiatedByUserID
  ON
    "r"."InitiatedByUserID" = MJUser_InitiatedByUserID."ID"
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
        AND tc.relname = 'vwRecordCloneLogs'
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
                           AND tc.relname = 'vwRecordCloneLogs'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRecordCloneLogs" CASCADE;
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
GRANT SELECT ON "__mj"."vwRecordCloneLogs" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRecordCloneLogs" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRecordCloneLogs" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Logs
-- Item: spCreateRecordCloneLog
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RecordCloneLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecordCloneLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRecordCloneLog"(
    p_id UUID DEFAULT NULL,
    p_rootentityid UUID DEFAULT NULL,
    p_rootsourcerecordid varchar(750) DEFAULT NULL,
    p_roottargetrecordid_clear boolean DEFAULT false,
    p_roottargetrecordid varchar(750) DEFAULT NULL,
    p_initiatedbyuserid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_planhash varchar(64) DEFAULT NULL,
    p_planjson TEXT DEFAULT NULL,
    p_optionsjson_clear boolean DEFAULT false,
    p_optionsjson TEXT DEFAULT NULL,
    p_resultjson_clear boolean DEFAULT false,
    p_resultjson TEXT DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_processrunid_clear boolean DEFAULT false,
    p_processrunid UUID DEFAULT NULL,
    p_createdcount int DEFAULT NULL,
    p_referencedcount int DEFAULT NULL,
    p_skippedcount int DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordCloneLogs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RecordCloneLog"
        (
            "ID",
            "RootEntityID",
                "RootSourceRecordID",
                "RootTargetRecordID",
                "InitiatedByUserID",
                "Status",
                "StartedAt",
                "EndedAt",
                "PlanHash",
                "PlanJSON",
                "OptionsJSON",
                "ResultJSON",
                "Reason",
                "ErrorMessage",
                "ProcessRunID",
                "CreatedCount",
                "ReferencedCount",
                "SkippedCount"
        )
    VALUES
        (
            v_new_id,
            p_rootentityid,
                p_rootsourcerecordid,
                CASE WHEN p_roottargetrecordid_clear = true THEN NULL ELSE COALESCE(p_roottargetrecordid, NULL) END,
                p_initiatedbyuserid,
                COALESCE(p_status, 'Planned'),
                COALESCE(p_startedat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END,
                p_planhash,
                p_planjson,
                CASE WHEN p_optionsjson_clear = true THEN NULL ELSE COALESCE(p_optionsjson, NULL) END,
                CASE WHEN p_resultjson_clear = true THEN NULL ELSE COALESCE(p_resultjson, NULL) END,
                CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_processrunid_clear = true THEN NULL ELSE COALESCE(p_processrunid, NULL) END,
                COALESCE(p_createdcount, 0),
                COALESCE(p_referencedcount, 0),
                COALESCE(p_skippedcount, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordCloneLogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordCloneLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordCloneLog" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Logs
-- Item: spUpdateRecordCloneLog
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RecordCloneLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecordCloneLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRecordCloneLog"(
    p_id UUID,
    p_rootentityid UUID DEFAULT NULL,
    p_rootsourcerecordid varchar(750) DEFAULT NULL,
    p_roottargetrecordid_clear boolean DEFAULT false,
    p_roottargetrecordid varchar(750) DEFAULT NULL,
    p_initiatedbyuserid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_planhash varchar(64) DEFAULT NULL,
    p_planjson TEXT DEFAULT NULL,
    p_optionsjson_clear boolean DEFAULT false,
    p_optionsjson TEXT DEFAULT NULL,
    p_resultjson_clear boolean DEFAULT false,
    p_resultjson TEXT DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_processrunid_clear boolean DEFAULT false,
    p_processrunid UUID DEFAULT NULL,
    p_createdcount int DEFAULT NULL,
    p_referencedcount int DEFAULT NULL,
    p_skippedcount int DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordCloneLogs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RecordCloneLog"
    SET
        "RootEntityID" = COALESCE(p_rootentityid, "RootEntityID"),
        "RootSourceRecordID" = COALESCE(p_rootsourcerecordid, "RootSourceRecordID"),
        "RootTargetRecordID" = CASE WHEN p_roottargetrecordid_clear = true THEN NULL ELSE COALESCE(p_roottargetrecordid, "RootTargetRecordID") END,
        "InitiatedByUserID" = COALESCE(p_initiatedbyuserid, "InitiatedByUserID"),
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "PlanHash" = COALESCE(p_planhash, "PlanHash"),
        "PlanJSON" = COALESCE(p_planjson, "PlanJSON"),
        "OptionsJSON" = CASE WHEN p_optionsjson_clear = true THEN NULL ELSE COALESCE(p_optionsjson, "OptionsJSON") END,
        "ResultJSON" = CASE WHEN p_resultjson_clear = true THEN NULL ELSE COALESCE(p_resultjson, "ResultJSON") END,
        "Reason" = CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, "Reason") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "ProcessRunID" = CASE WHEN p_processrunid_clear = true THEN NULL ELSE COALESCE(p_processrunid, "ProcessRunID") END,
        "CreatedCount" = COALESCE(p_createdcount, "CreatedCount"),
        "ReferencedCount" = COALESCE(p_referencedcount, "ReferencedCount"),
        "SkippedCount" = COALESCE(p_skippedcount, "SkippedCount")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordCloneLogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRecordCloneLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRecordCloneLog" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordCloneLog table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_record_clone_log"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_record_clone_log" ON "__mj"."RecordCloneLog";

CREATE TRIGGER "trg_update_record_clone_log"
BEFORE UPDATE ON "__mj"."RecordCloneLog"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_record_clone_log"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Logs
-- Item: spDeleteRecordCloneLog
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RecordCloneLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRecordCloneLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRecordCloneLog"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RecordCloneLog"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRecordCloneLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRecordCloneLog" TO "cdp_Integration";
