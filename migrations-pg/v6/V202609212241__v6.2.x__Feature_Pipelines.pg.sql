-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609212241__v6.2.x__Feature_Pipelines.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ── Resolved conversion gap (12 T-SQL statements with no PostgreSQL counterpart) ──
-- The T-SQL source runs CodeGen's "drop whatever default constraint exists on
-- __mj_CreatedAt / __mj_UpdatedAt" dance (DECLARE @constraintName / SELECT FROM
-- sys.default_constraints / EXEC('ALTER TABLE … DROP CONSTRAINT …')) for FeatureValue and
-- FeatureValueCache before re-adding DEFAULT GETUTCDATE(). PostgreSQL has no named default
-- constraints: the ALTER COLUMN … SET DEFAULT NOW() statements below replace any existing
-- default outright. CodeGen for the four affected entities is baked inline below (the
-- EntityDocument change cascades a drop of its CRUD functions, which are re-created here).

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
    WHERE tc.relname = 'EntityDocument' AND a.attname = 'VectorDatabaseID'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."EntityDocument" ALTER COLUMN "VectorDatabaseID" TYPE UUID, ALTER COLUMN "VectorDatabaseID" DROP NOT NULL;

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
    WHERE tc.relname = 'EntityDocument' AND a.attname = 'AIModelID'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."EntityDocument" ALTER COLUMN "AIModelID" TYPE UUID, ALTER COLUMN "AIModelID" DROP NOT NULL;

/* ------------------------------------------------------------------------------------- */
/* 2. FeatureValueCache — Explicit dedup dictionary */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."FeatureValueCache" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "RecordProcessID" UUID NULL,
  "PromptID" UUID NOT NULL,
  "PromptVersionHash" VARCHAR(64) NOT NULL,
  "ConstraintHash" VARCHAR(64) NOT NULL,
  "KeyHash" VARCHAR(64) NOT NULL,
  "KeyDisplay" VARCHAR(500) NULL,
  "KeyJSON" TEXT NOT NULL,
  "OutputsJSON" TEXT NOT NULL,
  "Reasoning" TEXT NULL,
  "AIPromptRunID" UUID NULL,
  "HitCount" INT NOT NULL DEFAULT (
    0
  ),
  "LastHitAt" TIMESTAMPTZ NULL,
  "ComputedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  "ExpiresAt" TIMESTAMPTZ NULL,
  "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  CONSTRAINT "PK_FeatureValueCache" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FeatureValueCache_RecordProcess" FOREIGN KEY ("RecordProcessID") REFERENCES __mj."RecordProcess" (
    "ID"
  ),
  CONSTRAINT "FK_FeatureValueCache_Prompt" FOREIGN KEY ("PromptID") REFERENCES __mj."AIPrompt" (
    "ID"
  )
);

CREATE UNIQUE INDEX "UQ_FeatureValueCache_Scoped" ON __mj."FeatureValueCache"("RecordProcessID", "PromptID", "PromptVersionHash", "ConstraintHash", "KeyHash")
WHERE
  NOT "RecordProcessID" IS NULL;

CREATE UNIQUE INDEX "UQ_FeatureValueCache_PromptScoped" ON __mj."FeatureValueCache"("PromptID", "PromptVersionHash", "ConstraintHash", "KeyHash")
WHERE
  "RecordProcessID" IS NULL;

/* ------------------------------------------------------------------------------------- */
/* 3. FeatureValue — Full historical audit table */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."FeatureValue" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "RecordProcessID" UUID NOT NULL,
  "EntityID" UUID NOT NULL,
  "RecordID" VARCHAR(900) NOT NULL,
  "FeatureName" VARCHAR(255) NOT NULL,
  "ValueText" TEXT NULL,
  "ValueNumeric" DOUBLE PRECISION NULL,
  "ValueDate" TIMESTAMPTZ NULL,
  "ValueBoolean" BOOLEAN NULL,
  "ValueJSON" TEXT NULL,
  "Reasoning" TEXT NULL,
  "Confidence" DOUBLE PRECISION NULL,
  "PromptID" UUID NULL,
  "PromptVersionHash" VARCHAR(64) NULL,
  "ConstraintHash" VARCHAR(64) NULL,
  "ProcessRunID" UUID NULL,
  "ProcessRunDetailID" UUID NULL,
  "AIPromptRunID" UUID NULL,
  "FeatureValueCacheID" UUID NULL,
  "ComputedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  CONSTRAINT "PK_FeatureValue" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FeatureValue_RecordProcess" FOREIGN KEY ("RecordProcessID") REFERENCES __mj."RecordProcess" (
    "ID"
  ),
  CONSTRAINT "FK_FeatureValue_Entity" FOREIGN KEY ("EntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_FeatureValue_Prompt" FOREIGN KEY ("PromptID") REFERENCES __mj."AIPrompt" (
    "ID"
  ),
  CONSTRAINT "FK_FeatureValue_ProcessRun" FOREIGN KEY ("ProcessRunID") REFERENCES __mj."ProcessRun" (
    "ID"
  ),
  CONSTRAINT "FK_FeatureValue_ProcessRunDetail" FOREIGN KEY ("ProcessRunDetailID") REFERENCES __mj."ProcessRunDetail" (
    "ID"
  ),
  CONSTRAINT "FK_FeatureValue_FeatureValueCache" FOREIGN KEY ("FeatureValueCacheID") REFERENCES __mj."FeatureValueCache" (
    "ID"
  )
);

CREATE INDEX "IX_FeatureValue_Entity_Record_Feature_ComputedAt" ON __mj."FeatureValue"("EntityID", "RecordID", "FeatureName", "ComputedAt" DESC NULLS LAST);

CREATE INDEX "IX_FeatureValue_RecordProcess_ComputedAt" ON __mj."FeatureValue"("RecordProcessID", "ComputedAt" DESC NULLS LAST);

COMMENT ON TABLE __mj."FeatureValueCache" IS 'Dedup dictionary table for Feature Pipelines. Caches computed outputs by canonical input key hash, prompt version, and constraint hash. Distinct input strings (e.g. unique job titles) are computed once and reused across all matching records.';

COMMENT ON COLUMN __mj."FeatureValueCache"."ID" IS 'Unique identifier for this feature value cache entry.';

COMMENT ON COLUMN __mj."FeatureValueCache"."RecordProcessID" IS 'Optional reference to the RecordProcess that produced this cache entry. When NULL, the cached result is scoped by PromptID only and shared across pipelines using the same prompt.';

COMMENT ON COLUMN __mj."FeatureValueCache"."PromptID" IS 'Reference to the AI Prompt used to compute this cached entry.';

COMMENT ON COLUMN __mj."FeatureValueCache"."PromptVersionHash" IS 'SHA-256 content hash of the rendered prompt template, output schema, and constraint instructions at execution time.';

COMMENT ON COLUMN __mj."FeatureValueCache"."ConstraintHash" IS 'SHA-256 hash of the output value constraint definitions. Changes to allowed enum values or ranges invalidate cached results.';

COMMENT ON COLUMN __mj."FeatureValueCache"."KeyHash" IS 'SHA-256 hash over the canonicalized JSON key field values. The primary lookup key.';

COMMENT ON COLUMN __mj."FeatureValueCache"."KeyDisplay" IS 'Human-readable plain text display of the key (e.g. "Senior Director, Field Marketing"). Makes this table legible as reference data.';

COMMENT ON COLUMN __mj."FeatureValueCache"."KeyJSON" IS 'Full JSON representation of the input key fields and their values.';

COMMENT ON COLUMN __mj."FeatureValueCache"."OutputsJSON" IS 'Cached computed outputs JSON fragment. Stored directly so archival of AI Prompt Runs does not lose cached values.';

COMMENT ON COLUMN __mj."FeatureValueCache"."Reasoning" IS 'Optional model reasoning or rationale captured from the prompt execution.';

COMMENT ON COLUMN __mj."FeatureValueCache"."AIPromptRunID" IS 'Soft reference to the AI Prompt Run that first computed and populated this cached result.';

COMMENT ON COLUMN __mj."FeatureValueCache"."HitCount" IS 'Total number of times this cached result has been served to skip an LLM invocation.';

COMMENT ON COLUMN __mj."FeatureValueCache"."LastHitAt" IS 'Timestamp when this cached entry was last read and served.';

COMMENT ON COLUMN __mj."FeatureValueCache"."ComputedAt" IS 'Timestamp when this cached entry was originally computed.';

COMMENT ON COLUMN __mj."FeatureValueCache"."ExpiresAt" IS 'Optional expiration timestamp for time-to-live invalidation. NULL means no expiration.';

COMMENT ON COLUMN __mj."FeatureValueCache"."__mj_CreatedAt" IS 'Timestamp when this record was created.';

COMMENT ON COLUMN __mj."FeatureValueCache"."__mj_UpdatedAt" IS 'Timestamp when this record was last updated.';

COMMENT ON TABLE __mj."FeatureValue" IS 'Complete historical audit table for Feature Pipelines. Records every feature value ever computed per entity record, with full provenance, model reasoning, and run back-links.';

COMMENT ON COLUMN __mj."FeatureValue"."ID" IS 'Unique identifier for this feature value history record.';

COMMENT ON COLUMN __mj."FeatureValue"."RecordProcessID" IS 'The Record Process (Feature Pipeline) that computed this feature value.';

COMMENT ON COLUMN __mj."FeatureValue"."EntityID" IS 'The entity of the record this feature was computed for.';

COMMENT ON COLUMN __mj."FeatureValue"."RecordID" IS 'Serialized primary key of the record this feature was computed for. Matches ProcessRunDetail.RecordID.';

COMMENT ON COLUMN __mj."FeatureValue"."FeatureName" IS 'Name of the feature, matching DataFeatureOutput.Name.';

COMMENT ON COLUMN __mj."FeatureValue"."ValueText" IS 'Computed value as text, for text and categorical features.';

COMMENT ON COLUMN __mj."FeatureValue"."ValueNumeric" IS 'Computed value as floating-point numeric, for numeric and score features.';

COMMENT ON COLUMN __mj."FeatureValue"."ValueDate" IS 'Computed value as datetimeoffset, for date and timestamp features.';

COMMENT ON COLUMN __mj."FeatureValue"."ValueBoolean" IS 'Computed value as boolean bit flag.';

COMMENT ON COLUMN __mj."FeatureValue"."ValueJSON" IS 'Computed value as raw JSON string, for array or complex object features.';

COMMENT ON COLUMN __mj."FeatureValue"."Reasoning" IS 'Optional model reasoning or rationale captured from the prompt execution.';

COMMENT ON COLUMN __mj."FeatureValue"."Confidence" IS 'Optional confidence score associated with this computed value.';

COMMENT ON COLUMN __mj."FeatureValue"."PromptID" IS 'Reference to the AI Prompt used to compute this feature value.';

COMMENT ON COLUMN __mj."FeatureValue"."PromptVersionHash" IS 'SHA-256 content hash of the rendered prompt template and instructions at execution time.';

COMMENT ON COLUMN __mj."FeatureValue"."ConstraintHash" IS 'SHA-256 hash of the value constraint definitions in effect when this feature was computed.';

COMMENT ON COLUMN __mj."FeatureValue"."ProcessRunID" IS 'Reference to the Process Run during which this feature was computed.';

COMMENT ON COLUMN __mj."FeatureValue"."ProcessRunDetailID" IS 'Reference to the specific Process Run Detail row for this record execution.';

COMMENT ON COLUMN __mj."FeatureValue"."AIPromptRunID" IS 'Soft reference to the AI Prompt Run that computed this value.';

COMMENT ON COLUMN __mj."FeatureValue"."FeatureValueCacheID" IS 'Optional reference to the FeatureValueCache entry if this value was served from cache.';

COMMENT ON COLUMN __mj."FeatureValue"."ComputedAt" IS 'Timestamp when this feature value was computed.';

COMMENT ON COLUMN __mj."FeatureValue"."__mj_CreatedAt" IS 'Timestamp when this record was created.';

COMMENT ON COLUMN __mj."FeatureValue"."__mj_UpdatedAt" IS 'Timestamp when this record was last updated.';

/* ============================================================================= */
/* GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND */
/* ============================================================================= */
/* Everything below this block was produced by MemberJunction CodeGen after */
/* the hand-written DDL above. It contains: */
/*   * Entity records for FeatureValue and FeatureValueCache */
/*   * ApplicationEntity & EntityPermission grants */
/*   * EntityField records (apply-time dynamic Sequence) */
/*   * Auto-generated foreign key indexes */
/*   * Generated CRUD stored procedures (spCreate/spUpdate/spDelete) and update triggers */
/*   * Base views (vwFeatureValues, vwFeatureValueCaches) */
/* ============================================================================= */
/* SQL generated to create new entity MJ: Feature Value Caches */
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
    'e1bac2ab-dad6-40d7-9ade-c5fe2b405a79',
    'MJ: Feature Value Caches',
    'Feature Value Caches',
    'Dedup dictionary table for Feature Pipelines. Caches computed outputs by canonical input key hash, prompt version, and constraint hash. Distinct input strings (e.g. unique job titles) are computed once and reused across all matching records.',
    NULL,
    'FeatureValueCache',
    'vwFeatureValueCaches',
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
/* SQL generated to add new entity MJ: Feature Value Caches to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'e1bac2ab-dad6-40d7-9ade-c5fe2b405a79',
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
/* SQL generated to add new permission for entity MJ: Feature Value Caches for role UI */
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
  CAST('e1bac2ab-dad6-40d7-9ade-c5fe2b405a79' AS UUID),
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
      "EntityID" = CAST('e1bac2ab-dad6-40d7-9ade-c5fe2b405a79' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Feature Value Caches for role Developer */
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
  CAST('e1bac2ab-dad6-40d7-9ade-c5fe2b405a79' AS UUID),
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
      "EntityID" = CAST('e1bac2ab-dad6-40d7-9ade-c5fe2b405a79' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Feature Value Caches for role Integration */
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
  CAST('e1bac2ab-dad6-40d7-9ade-c5fe2b405a79' AS UUID),
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
      "EntityID" = CAST('e1bac2ab-dad6-40d7-9ade-c5fe2b405a79' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Feature Values */
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
    '3bed585d-b150-4899-ab06-8a19624ea9be',
    'MJ: Feature Values',
    'Feature Values',
    'Complete historical audit table for Feature Pipelines. Records every feature value ever computed per entity record, with full provenance, model reasoning, and run back-links.',
    NULL,
    'FeatureValue',
    'vwFeatureValues',
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
/* SQL generated to add new entity MJ: Feature Values to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '3bed585d-b150-4899-ab06-8a19624ea9be',
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
/* SQL generated to add new permission for entity MJ: Feature Values for role UI */
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
  CAST('3bed585d-b150-4899-ab06-8a19624ea9be' AS UUID),
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
      "EntityID" = CAST('3bed585d-b150-4899-ab06-8a19624ea9be' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Feature Values for role Developer */
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
  CAST('3bed585d-b150-4899-ab06-8a19624ea9be' AS UUID),
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
      "EntityID" = CAST('3bed585d-b150-4899-ab06-8a19624ea9be' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Feature Values for role Integration */
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
  CAST('3bed585d-b150-4899-ab06-8a19624ea9be' AS UUID),
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
      "EntityID" = CAST('3bed585d-b150-4899-ab06-8a19624ea9be' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."FeatureValue" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
ALTER TABLE __mj."FeatureValue" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
ALTER TABLE __mj."FeatureValueCache" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
ALTER TABLE __mj."FeatureValueCache" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to insert 39 new entity field(s) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '69e45345-94c3-4cb3-9804-2877fa34abc2' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('69e45345-94c3-4cb3-9804-2877fa34abc2', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ID', 'ID', 'Unique identifier for this feature value history record.', 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44353b97-5344-4e12-a6e1-84d3955c8b4b' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'RecordProcessID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('44353b97-5344-4e12-a6e1-84d3955c8b4b', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'RecordProcessID', 'Record Process ID', 'The Record Process (Feature Pipeline) that computed this feature value.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a2d8b251-1bb7-4ad5-bcd6-ea123b3ec13e' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a2d8b251-1bb7-4ad5-bcd6-ea123b3ec13e', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'EntityID', 'Entity ID', 'The entity of the record this feature was computed for.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b549a0ff-0842-4033-a112-024824ecf963' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'RecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b549a0ff-0842-4033-a112-024824ecf963', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'RecordID', 'Record ID', 'Serialized primary key of the record this feature was computed for. Matches ProcessRunDetail.RecordID.', 'nvarchar', 1800, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0415b0b9-1ce7-40bd-bac6-a1c6698db467' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'FeatureName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0415b0b9-1ce7-40bd-bac6-a1c6698db467', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'FeatureName', 'Feature Name', 'Name of the feature, matching DataFeatureOutput.Name.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'abac91e2-3a3a-4d12-bb46-7d015127f089' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ValueText')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('abac91e2-3a3a-4d12-bb46-7d015127f089', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ValueText', 'Value Text', 'Computed value as text, for text and categorical features.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a3ce4052-7c24-403b-9cba-645c029f614f' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ValueNumeric')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a3ce4052-7c24-403b-9cba-645c029f614f', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ValueNumeric', 'Value Numeric', 'Computed value as floating-point numeric, for numeric and score features.', 'float', 8, 53, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '02db7801-cc15-4dee-a275-994e9531a777' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ValueDate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('02db7801-cc15-4dee-a275-994e9531a777', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ValueDate', 'Value Date', 'Computed value as datetimeoffset, for date and timestamp features.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70a1cdfb-9833-4180-8d98-e20910d8b2dd' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ValueBoolean')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('70a1cdfb-9833-4180-8d98-e20910d8b2dd', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ValueBoolean', 'Value Boolean', 'Computed value as boolean bit flag.', 'bit', 1, 1, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0bf4ffa3-b243-4979-9353-cff7c3bbe45f' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ValueJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0bf4ffa3-b243-4979-9353-cff7c3bbe45f', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ValueJSON', 'Value JSON', 'Computed value as raw JSON string, for array or complex object features.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b0f49558-1c28-4a77-82e4-c2bdfe03a904' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'Reasoning')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b0f49558-1c28-4a77-82e4-c2bdfe03a904', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'Reasoning', 'Reasoning', 'Optional model reasoning or rationale captured from the prompt execution.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '440f67fe-e7dd-4c95-884e-2ed1c7333b03' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'Confidence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('440f67fe-e7dd-4c95-884e-2ed1c7333b03', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'Confidence', 'Confidence', 'Optional confidence score associated with this computed value.', 'float', 8, 53, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f4a13111-ebe0-4b82-9431-0d8fdac1fd65' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'PromptID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f4a13111-ebe0-4b82-9431-0d8fdac1fd65', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'PromptID', 'Prompt ID', 'Reference to the AI Prompt used to compute this feature value.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '73AD0238-8B56-EF11-991A-6045BDEBA539', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1814827f-b012-4981-8402-23e8f2321797' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'PromptVersionHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1814827f-b012-4981-8402-23e8f2321797', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'PromptVersionHash', 'Prompt Version Hash', 'SHA-256 content hash of the rendered prompt template and instructions at execution time.', 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd2646c7b-79cf-40f8-91a1-6ff618888fc1' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ConstraintHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d2646c7b-79cf-40f8-91a1-6ff618888fc1', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ConstraintHash', 'Constraint Hash', 'SHA-256 hash of the value constraint definitions in effect when this feature was computed.', 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '81b0c2e5-d03e-471f-9428-853161c54664' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ProcessRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('81b0c2e5-d03e-471f-9428-853161c54664', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ProcessRunID', 'Process Run ID', 'Reference to the Process Run during which this feature was computed.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '9989A9A4-5546-4552-A765-B27EE399BFEA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1bc3610-a272-44ea-af39-9caf014bc8ab' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ProcessRunDetailID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f1bc3610-a272-44ea-af39-9caf014bc8ab', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ProcessRunDetailID', 'Process Run Detail ID', 'Reference to the specific Process Run Detail row for this record execution.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ba693570-ea51-4226-9cf8-6c1d82e0d8b0' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'AIPromptRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ba693570-ea51-4226-9cf8-6c1d82e0d8b0', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'AIPromptRunID', 'AI Prompt Run ID', 'Soft reference to the AI Prompt Run that computed this value.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '83e95083-ae41-428b-82bd-787e1262ec89' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'FeatureValueCacheID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('83e95083-ae41-428b-82bd-787e1262ec89', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'FeatureValueCacheID', 'Feature Value Cache ID', 'Optional reference to the FeatureValueCache entry if this value was served from cache.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '333e156a-343e-4b5e-9665-a296b31a258b' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ComputedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('333e156a-343e-4b5e-9665-a296b31a258b', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ComputedAt', 'Computed At', 'Timestamp when this feature value was computed.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6e15b084-1f76-4c84-80e2-d5b6c7ccf4ec' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6e15b084-1f76-4c84-80e2-d5b6c7ccf4ec', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), '__mj_CreatedAt', 'Created At', 'Timestamp when this record was created.', 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '76fc63a7-5f8d-4deb-aa71-a3f3c2d609da' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('76fc63a7-5f8d-4deb-aa71-a3f3c2d609da', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), '__mj_UpdatedAt', 'Updated At', 'Timestamp when this record was last updated.', 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b218f712-d047-44b9-b4d8-21bc9102e168' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b218f712-d047-44b9-b4d8-21bc9102e168', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'ID', 'ID', 'Unique identifier for this feature value cache entry.', 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '49a6b9a0-ef63-48c8-ab61-0e890db3770e' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'RecordProcessID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('49a6b9a0-ef63-48c8-ab61-0e890db3770e', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'RecordProcessID', 'Record Process ID', 'Optional reference to the RecordProcess that produced this cache entry. When NULL, the cached result is scoped by PromptID only and shared across pipelines using the same prompt.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd051aefa-15f0-4a59-9fb5-e6fa2e9f9e36' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'PromptID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d051aefa-15f0-4a59-9fb5-e6fa2e9f9e36', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'PromptID', 'Prompt ID', 'Reference to the AI Prompt used to compute this cached entry.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '73AD0238-8B56-EF11-991A-6045BDEBA539', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '214f8d31-0cce-4371-aca1-2875784c463f' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'PromptVersionHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('214f8d31-0cce-4371-aca1-2875784c463f', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'PromptVersionHash', 'Prompt Version Hash', 'SHA-256 content hash of the rendered prompt template, output schema, and constraint instructions at execution time.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c4865ef9-bc58-4af7-a323-6558bbbb9530' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'ConstraintHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c4865ef9-bc58-4af7-a323-6558bbbb9530', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'ConstraintHash', 'Constraint Hash', 'SHA-256 hash of the output value constraint definitions. Changes to allowed enum values or ranges invalidate cached results.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '43292220-2ed5-4d99-a2a6-5f4f576182ed' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'KeyHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('43292220-2ed5-4d99-a2a6-5f4f576182ed', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'KeyHash', 'Key Hash', 'SHA-256 hash over the canonicalized JSON key field values. The primary lookup key.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '84f8b247-99fb-4f5f-bd5d-dd8b59eb0ae4' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'KeyDisplay')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('84f8b247-99fb-4f5f-bd5d-dd8b59eb0ae4', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'KeyDisplay', 'Key Display', 'Human-readable plain text display of the key (e.g. "Senior Director, Field Marketing"). Makes this table legible as reference data.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f7306931-4ac9-487f-872e-10ad488efcae' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'KeyJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f7306931-4ac9-487f-872e-10ad488efcae', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'KeyJSON', 'Key JSON', 'Full JSON representation of the input key fields and their values.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a5363ac9-e8d9-455f-9b83-f4322ba5c758' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'OutputsJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a5363ac9-e8d9-455f-9b83-f4322ba5c758', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'OutputsJSON', 'Outputs JSON', 'Cached computed outputs JSON fragment. Stored directly so archival of AI Prompt Runs does not lose cached values.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9eaf5846-c884-40af-83bf-4ec6ece3cc6f' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'Reasoning')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9eaf5846-c884-40af-83bf-4ec6ece3cc6f', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'Reasoning', 'Reasoning', 'Optional model reasoning or rationale captured from the prompt execution.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bca67898-c9a2-4c5a-8d42-af0b659f73c5' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'AIPromptRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bca67898-c9a2-4c5a-8d42-af0b659f73c5', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'AIPromptRunID', 'AI Prompt Run ID', 'Soft reference to the AI Prompt Run that first computed and populated this cached result.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5713c2eb-c4e7-4081-970a-0eeed83845a2' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'HitCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5713c2eb-c4e7-4081-970a-0eeed83845a2', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'HitCount', 'Hit Count', 'Total number of times this cached result has been served to skip an LLM invocation.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '63de05e4-65d1-47fc-a233-2cd88ebef262' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'LastHitAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('63de05e4-65d1-47fc-a233-2cd88ebef262', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'LastHitAt', 'Last Hit At', 'Timestamp when this cached entry was last read and served.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2f929aa8-9666-43a3-935f-66ee5ccc3907' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'ComputedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2f929aa8-9666-43a3-935f-66ee5ccc3907', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'ComputedAt', 'Computed At', 'Timestamp when this cached entry was originally computed.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0e64f244-ffa0-431c-9ba1-008e2c8d5f74' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'ExpiresAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0e64f244-ffa0-431c-9ba1-008e2c8d5f74', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'ExpiresAt', 'Expires At', 'Optional expiration timestamp for time-to-live invalidation. NULL means no expiration.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '48c897cb-bb35-4707-a3f7-ddd0747784c9' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('48c897cb-bb35-4707-a3f7-ddd0747784c9', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), '__mj_CreatedAt', 'Created At', 'Timestamp when this record was created.', 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '077ea6cb-f952-46e9-bee1-dba49aeb3fd0' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('077ea6cb-f952-46e9-bee1-dba49aeb3fd0', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), '__mj_UpdatedAt', 'Updated At', 'Timestamp when this record was last updated.', 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b44a32f7-4cca-4d5a-a5b9-0ec797cd1560') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b44a32f7-4cca-4d5a-a5b9-0ec797cd1560', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'ProcessRunDetailID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '80ce13a7-ef07-430d-bd48-d2cc184430b3') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('80ce13a7-ef07-430d-bd48-d2cc184430b3', '73AD0238-8B56-EF11-991A-6045BDEBA539', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'PromptID', 'One To Many', TRUE, TRUE, 23, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b488ae81-9ddb-4609-893f-e415d64003e2') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b488ae81-9ddb-4609-893f-e415d64003e2', '73AD0238-8B56-EF11-991A-6045BDEBA539', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', 'PromptID', 'One To Many', TRUE, TRUE, 24, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0c4ffb4b-d2d0-4afe-a233-b12aa9d9dd0e') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0c4ffb4b-d2d0-4afe-a233-b12aa9d9dd0e', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'EntityID', 'One To Many', TRUE, TRUE, 101, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '85e20375-0c0e-4140-aa64-dfaf4eef0934') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('85e20375-0c0e-4140-aa64-dfaf4eef0934', '9989A9A4-5546-4552-A765-B27EE399BFEA', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'ProcessRunID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a40878fe-1deb-44a1-b2ef-2d028bc75316') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a40878fe-1deb-44a1-b2ef-2d028bc75316', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'FeatureValueCacheID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'dcf10df1-cb32-42aa-8d3a-05b027196d93') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dcf10df1-cb32-42aa-8d3a-05b027196d93', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'RecordProcessID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c2734d8e-77e6-423a-8e6b-b10027ac48eb') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c2734d8e-77e6-423a-8e6b-b10027ac48eb', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', 'RecordProcessID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6fb9cc06-9e1a-4309-a119-20d5a6dfbecc' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'RecordProcess')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6fb9cc06-9e1a-4309-a119-20d5a6dfbecc', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'RecordProcess', 'Record Process', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0e527a97-32cc-495b-9722-cbad72f46295' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'Entity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0e527a97-32cc-495b-9722-cbad72f46295', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'Entity', 'Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08959bea-b466-439c-863b-6055c5136b93' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'Prompt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('08959bea-b466-439c-863b-6055c5136b93', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'Prompt', 'Prompt', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '51e37373-e360-4b21-979c-7bc5e0a9a4be' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ProcessRunDetail')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('51e37373-e360-4b21-979c-7bc5e0a9a4be', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ProcessRunDetail', 'Process Run Detail', NULL, 'nvarchar', 900, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e19389d0-97a5-4e9e-8d26-7fa0c3ea2b1b' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'FeatureValueCache')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e19389d0-97a5-4e9e-8d26-7fa0c3ea2b1b', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'FeatureValueCache', 'Feature Value Cache', NULL, 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '58ee5f88-ec28-4234-85f0-ad6e52220670' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'RecordProcess')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58ee5f88-ec28-4234-85f0-ad6e52220670', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'RecordProcess', 'Record Process', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8723d43b-388d-4e3f-963e-46de903ea9ad' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'Prompt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8723d43b-388d-4e3f-963e-46de903ea9ad', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'Prompt', 'Prompt', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '0415B0B9-1CE7-40BD-BAC6-A1C6698DB467' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '440F67FE-E7DD-4C95-884E-2ED1C7333B03' AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '333E156A-343E-4B5E-9665-A296B31A258B' AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '84F8B247-99FB-4F5F-BD5D-DD8B59EB0AE4' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '84F8B247-99FB-4F5F-BD5D-DD8B59EB0AE4' AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '5713C2EB-C4E7-4081-970A-0EEED83845A2' AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '63DE05E4-65D1-47FC-A233-2CD88EBEF262' AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '2F929AA8-9666-43A3-935F-66EE5CCC3907' AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '8723D43B-388D-4E3F-963E-46DE903EA9AD' AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 19 fields */
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B218F712-D047-44B9-B4D8-21BC9102E168';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.RecordProcessID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Record Process'
WHERE
  "ID" = '49A6B9A0-EF63-48C8-AB61-0E890DB3770E';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.PromptID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt'
WHERE
  "ID" = 'D051AEFA-15F0-4A59-9FB5-E6FA2E9F9E36';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.PromptVersionHash */
UPDATE __mj."EntityField" SET "Category" = 'Hash Fingerprints', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '214F8D31-0CCE-4371-ACA1-2875784C463F';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.ConstraintHash */
UPDATE __mj."EntityField" SET "Category" = 'Hash Fingerprints', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C4865EF9-BC58-4AF7-A323-6558BBBB9530';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.KeyHash */
UPDATE __mj."EntityField" SET "Category" = 'Hash Fingerprints', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '43292220-2ED5-4D99-A2A6-5F4F576182ED';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.KeyDisplay */
UPDATE __mj."EntityField" SET "Category" = 'Cache Data', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '84F8B247-99FB-4F5F-BD5D-DD8B59EB0AE4';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.KeyJSON */
UPDATE __mj."EntityField" SET "Category" = 'Cache Data', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'F7306931-4AC9-487F-872E-10AD488EFCAE';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.OutputsJSON */
UPDATE __mj."EntityField" SET "Category" = 'Cache Data', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'A5363AC9-E8D9-455F-9B83-F4322BA5C758';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.Reasoning */
UPDATE __mj."EntityField" SET "Category" = 'Cache Data', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9EAF5846-C884-40AF-83BF-4EC6ECE3CC6F';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.AIPromptRunID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'AI Prompt Run'
WHERE
  "ID" = 'BCA67898-C9A2-4C5A-8D42-AF0B659F73C5';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.HitCount */
UPDATE __mj."EntityField" SET "Category" = 'Performance Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5713C2EB-C4E7-4081-970A-0EEED83845A2';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.LastHitAt */
UPDATE __mj."EntityField" SET "Category" = 'Performance Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '63DE05E4-65D1-47FC-A233-2CD88EBEF262';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.ComputedAt */
UPDATE __mj."EntityField" SET "Category" = 'Performance Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2F929AA8-9666-43A3-935F-66EE5CCC3907';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.ExpiresAt */
UPDATE __mj."EntityField" SET "Category" = 'Performance Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0E64F244-FFA0-431C-9BA1-008E2C8D5F74';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '48C897CB-BB35-4707-A3F7-DDD0747784C9';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '077EA6CB-F952-46E9-BEE1-DBA49AEB3FD0';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.RecordProcess */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Record Process Name'
WHERE
  "ID" = '58EE5F88-EC28-4234-85F0-AD6E52220670';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.Prompt */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt Name'
WHERE
  "ID" = '8723D43B-388D-4E3F-963E-46DE903EA9AD';

/* Set entity icon to fa fa-database */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-database', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('89870f1a-a58f-5ccf-8065-56d1c95d4dc3', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', 'FieldCategoryInfo', '{
  "Cache Data": {
    "description": "The actual input and output content stored in the cache",
    "icon": "fa fa-box-open"
  },
  "Execution Context": {
    "description": "References to the prompt runs and processes that generated the cached data",
    "icon": "fa fa-terminal"
  },
  "Hash Fingerprints": {
    "description": "Unique SHA-256 hashes used for cache lookup and validation",
    "icon": "fa fa-fingerprint"
  },
  "Performance Metrics": {
    "description": "Usage statistics and lifecycle timestamps for cache entries",
    "icon": "fa fa-tachometer-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('417b5aea-1f2e-5b0f-8e60-7341f7ae2ebd', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', 'FieldCategoryIcons', '{
  "Cache Data": "fa fa-box-open",
  "Execution Context": "fa fa-terminal",
  "Hash Fingerprints": "fa fa-fingerprint",
  "Performance Metrics": "fa fa-tachometer-alt",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79';

/* Set categories for 26 fields */
/* UPDATE Entity Field Category Info MJ: Feature Values.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '69E45345-94C3-4CB3-9804-2877FA34ABC2';
/* UPDATE Entity Field Category Info MJ: Feature Values.RecordProcessID */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Record Process'
WHERE
  "ID" = '44353B97-5344-4E12-A6E1-84D3955C8B4B';
/* UPDATE Entity Field Category Info MJ: Feature Values.EntityID */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity'
WHERE
  "ID" = 'A2D8B251-1BB7-4AD5-BCD6-EA123B3EC13E';
/* UPDATE Entity Field Category Info MJ: Feature Values.RecordID */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B549A0FF-0842-4033-A112-024824ECF963';
/* UPDATE Entity Field Category Info MJ: Feature Values.FeatureName */
UPDATE __mj."EntityField" SET "Category" = 'Feature Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0415B0B9-1CE7-40BD-BAC6-A1C6698DB467';
/* UPDATE Entity Field Category Info MJ: Feature Values.ValueText */
UPDATE __mj."EntityField" SET "Category" = 'Feature Values', "GeneratedFormSection" = 'Category', "DisplayName" = 'Value (Text)'
WHERE
  "ID" = 'ABAC91E2-3A3A-4D12-BB46-7D015127F089';
/* UPDATE Entity Field Category Info MJ: Feature Values.ValueNumeric */
UPDATE __mj."EntityField" SET "Category" = 'Feature Values', "GeneratedFormSection" = 'Category', "DisplayName" = 'Value (Numeric)'
WHERE
  "ID" = 'A3CE4052-7C24-403B-9CBA-645C029F614F';
/* UPDATE Entity Field Category Info MJ: Feature Values.ValueDate */
UPDATE __mj."EntityField" SET "Category" = 'Feature Values', "GeneratedFormSection" = 'Category', "DisplayName" = 'Value (Date)'
WHERE
  "ID" = '02DB7801-CC15-4DEE-A275-994E9531A777';
/* UPDATE Entity Field Category Info MJ: Feature Values.ValueBoolean */
UPDATE __mj."EntityField" SET "Category" = 'Feature Values', "GeneratedFormSection" = 'Category', "DisplayName" = 'Value (Boolean)'
WHERE
  "ID" = '70A1CDFB-9833-4180-8D98-E20910D8B2DD';
/* UPDATE Entity Field Category Info MJ: Feature Values.ValueJSON */
UPDATE __mj."EntityField" SET "Category" = 'Feature Values', "GeneratedFormSection" = 'Category', "DisplayName" = 'Value (JSON)', "ExtendedType" = 'JSON'
WHERE
  "ID" = '0BF4FFA3-B243-4979-9353-CFF7C3BBE45F';
/* UPDATE Entity Field Category Info MJ: Feature Values.Reasoning */
UPDATE __mj."EntityField" SET "Category" = 'AI Insights', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Markdown'
WHERE
  "ID" = 'B0F49558-1C28-4A77-82E4-C2BDFE03A904';
/* UPDATE Entity Field Category Info MJ: Feature Values.Confidence */
UPDATE __mj."EntityField" SET "Category" = 'AI Insights', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '440F67FE-E7DD-4C95-884E-2ED1C7333B03';
/* UPDATE Entity Field Category Info MJ: Feature Values.PromptID */
UPDATE __mj."EntityField" SET "Category" = 'AI Insights', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt'
WHERE
  "ID" = 'F4A13111-EBE0-4B82-9431-0D8FDAC1FD65';
/* UPDATE Entity Field Category Info MJ: Feature Values.PromptVersionHash */
UPDATE __mj."EntityField" SET "Category" = 'AI Insights', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1814827F-B012-4981-8402-23E8F2321797';
/* UPDATE Entity Field Category Info MJ: Feature Values.ConstraintHash */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D2646C7B-79CF-40F8-91A1-6FF618888FC1';
/* UPDATE Entity Field Category Info MJ: Feature Values.ProcessRunID */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Process Run'
WHERE
  "ID" = '81B0C2E5-D03E-471F-9428-853161C54664';
/* UPDATE Entity Field Category Info MJ: Feature Values.ProcessRunDetailID */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Process Run Detail'
WHERE
  "ID" = 'F1BC3610-A272-44EA-AF39-9CAF014BC8AB';
/* UPDATE Entity Field Category Info MJ: Feature Values.AIPromptRunID */
UPDATE __mj."EntityField" SET "Category" = 'AI Insights', "GeneratedFormSection" = 'Category', "DisplayName" = 'AI Prompt Run'
WHERE
  "ID" = 'BA693570-EA51-4226-9CF8-6C1D82E0D8B0';
/* UPDATE Entity Field Category Info MJ: Feature Values.FeatureValueCacheID */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Feature Value Cache'
WHERE
  "ID" = '83E95083-AE41-428B-82BD-787E1262EC89';
/* UPDATE Entity Field Category Info MJ: Feature Values.FeatureValueCache */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E19389D0-97A5-4E9E-8D26-7FA0C3EA2B1B';
/* UPDATE Entity Field Category Info MJ: Feature Values.ComputedAt */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '333E156A-343E-4B5E-9665-A296B31A258B';
/* UPDATE Entity Field Category Info MJ: Feature Values.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6E15B084-1F76-4C84-80E2-D5B6C7CCF4EC';
/* UPDATE Entity Field Category Info MJ: Feature Values.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '76FC63A7-5F8D-4DEB-AA71-A3F3C2D609DA';
/* UPDATE Entity Field Category Info MJ: Feature Values.RecordProcess */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6FB9CC06-9E1A-4309-A119-20D5A6DFBECC';
/* UPDATE Entity Field Category Info MJ: Feature Values.Entity */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0E527A97-32CC-495B-9722-CBAD72F46295';
/* UPDATE Entity Field Category Info MJ: Feature Values.Prompt */
UPDATE __mj."EntityField" SET "Category" = 'AI Insights', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '08959BEA-B466-439C-863B-6055C5136B93';
/* UPDATE Entity Field Category Info MJ: Feature Values.ProcessRunDetail */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '51E37373-E360-4B21-979C-7BC5E0A9A4BE';

/* Set entity icon to fa fa-history */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-history', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '3BED585D-B150-4899-AB06-8A19624EA9BE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a854f247-3c1a-5047-9a26-f63ddee59620', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'FieldCategoryInfo', '{
  "AI Insights": {
    "description": "AI-specific metadata including model reasoning, confidence, and prompt tracking.",
    "icon": "fa fa-robot"
  },
  "Feature Details": {
    "description": "Metadata identifying the specific feature being tracked.",
    "icon": "fa fa-tag"
  },
  "Feature Values": {
    "description": "The actual computed values stored in various formats.",
    "icon": "fa fa-calculator"
  },
  "Pipeline Provenance": {
    "description": "Technical lineage and run details for how the feature was computed.",
    "icon": "fa fa-project-diagram"
  },
  "Record Context": {
    "description": "Information identifying the specific record and entity the feature belongs to.",
    "icon": "fa fa-database"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields.",
    "icon": "fa fa-cog"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('400ca86c-35cb-5da4-a70e-a4abcb3e757f', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'FieldCategoryIcons', '{
  "AI Insights": "fa fa-robot",
  "Feature Details": "fa fa-tag",
  "Feature Values": "fa fa-calculator",
  "Pipeline Provenance": "fa fa-project-diagram",
  "Record Context": "fa fa-database",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_type_id"
    ON "__mj"."EntityDocument" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_entity_id"
    ON "__mj"."EntityDocument" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_vector_database_id"
    ON "__mj"."EntityDocument" ("VectorDatabaseID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_template_id"
    ON "__mj"."EntityDocument" ("TemplateID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_ai_model_id"
    ON "__mj"."EntityDocument" ("AIModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_vector_index_id"
    ON "__mj"."EntityDocument" ("VectorIndexID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_reasoning_prompt_id"
    ON "__mj"."EntityDocument" ("ReasoningPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_reasoning_agent_id"
    ON "__mj"."EntityDocument" ("ReasoningAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: vwEntityDocuments
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Documents
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityDocument
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwEntityDocuments"
AS
SELECT
    e.*,
    MJEntityDocumentType_TypeID."Name" AS "Type",
    MJEntity_EntityID."Name" AS "Entity",
    MJVectorDatabase_VectorDatabaseID."Name" AS "VectorDatabase",
    MJTemplate_TemplateID."Name" AS "Template",
    MJAIModel_AIModelID."Name" AS "AIModel",
    MJVectorIndex_VectorIndexID."Name" AS "VectorIndex",
    MJAIPrompt_ReasoningPromptID."Name" AS "ReasoningPrompt",
    MJAIAgent_ReasoningAgentID."Name" AS "ReasoningAgent"
FROM
    "__mj"."EntityDocument" AS e
INNER JOIN
    "__mj"."EntityDocumentType" AS MJEntityDocumentType_TypeID
  ON
    "e"."TypeID" = MJEntityDocumentType_TypeID."ID"
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "e"."EntityID" = MJEntity_EntityID."ID"
INNER JOIN
    "__mj"."VectorDatabase" AS MJVectorDatabase_VectorDatabaseID
  ON
    "e"."VectorDatabaseID" = MJVectorDatabase_VectorDatabaseID."ID"
INNER JOIN
    "__mj"."Template" AS MJTemplate_TemplateID
  ON
    "e"."TemplateID" = MJTemplate_TemplateID."ID"
INNER JOIN
    "__mj"."AIModel" AS MJAIModel_AIModelID
  ON
    "e"."AIModelID" = MJAIModel_AIModelID."ID"
LEFT OUTER JOIN
    "__mj"."VectorIndex" AS MJVectorIndex_VectorIndexID
  ON
    "e"."VectorIndexID" = MJVectorIndex_VectorIndexID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ReasoningPromptID
  ON
    "e"."ReasoningPromptID" = MJAIPrompt_ReasoningPromptID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_ReasoningAgentID
  ON
    "e"."ReasoningAgentID" = MJAIAgent_ReasoningAgentID."ID"
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
    AND tc.relname = 'vwEntityDocuments'
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
    AND tc.relname = 'vwEntityDocuments'
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
        AND tc.relname = 'vwEntityDocuments'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwEntityDocuments" CASCADE;
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
GRANT SELECT ON "__mj"."vwEntityDocuments" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwEntityDocuments" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwEntityDocuments" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: spCreateEntityDocument
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityDocument"(
    p_id UUID DEFAULT NULL,
    p_name varchar(250) DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_vectordatabaseid UUID DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_aimodelid UUID DEFAULT NULL,
    p_potentialmatchthreshold numeric(12, 11) DEFAULT NULL,
    p_absolutematchthreshold numeric(12, 11) DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_enablellmreasoning BOOLEAN DEFAULT NULL,
    p_reasoningmode varchar(20) DEFAULT NULL,
    p_reasoningthreshold_clear boolean DEFAULT false,
    p_reasoningthreshold numeric(12, 11) DEFAULT NULL,
    p_reasoningpromptid_clear boolean DEFAULT false,
    p_reasoningpromptid UUID DEFAULT NULL,
    p_reasoningagentid_clear boolean DEFAULT false,
    p_reasoningagentid UUID DEFAULT NULL,
    p_automationlevel varchar(30) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityDocuments" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityDocument"
        (
            "ID",
            "Name",
                "TypeID",
                "EntityID",
                "VectorDatabaseID",
                "Status",
                "TemplateID",
                "AIModelID",
                "PotentialMatchThreshold",
                "AbsoluteMatchThreshold",
                "VectorIndexID",
                "Configuration",
                "EnableLLMReasoning",
                "ReasoningMode",
                "ReasoningThreshold",
                "ReasoningPromptID",
                "ReasoningAgentID",
                "AutomationLevel"
        )
    VALUES
        (
            v_new_id,
            p_name,
                p_typeid,
                p_entityid,
                p_vectordatabaseid,
                COALESCE(p_status, 'Active'),
                p_templateid,
                p_aimodelid,
                COALESCE(p_potentialmatchthreshold, 0.7),
                COALESCE(p_absolutematchthreshold, 0.95),
                CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                COALESCE(p_enablellmreasoning, FALSE),
                COALESCE(p_reasoningmode, 'Prompt'),
                CASE WHEN p_reasoningthreshold_clear = true THEN NULL ELSE COALESCE(p_reasoningthreshold, NULL) END,
                CASE WHEN p_reasoningpromptid_clear = true THEN NULL ELSE COALESCE(p_reasoningpromptid, NULL) END,
                CASE WHEN p_reasoningagentid_clear = true THEN NULL ELSE COALESCE(p_reasoningagentid, NULL) END,
                COALESCE(p_automationlevel, 'ReviewAll')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityDocuments"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityDocument" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityDocument" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: spUpdateEntityDocument
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityDocument"(
    p_id UUID,
    p_name varchar(250) DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_vectordatabaseid UUID DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_aimodelid UUID DEFAULT NULL,
    p_potentialmatchthreshold numeric(12, 11) DEFAULT NULL,
    p_absolutematchthreshold numeric(12, 11) DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_enablellmreasoning BOOLEAN DEFAULT NULL,
    p_reasoningmode varchar(20) DEFAULT NULL,
    p_reasoningthreshold_clear boolean DEFAULT false,
    p_reasoningthreshold numeric(12, 11) DEFAULT NULL,
    p_reasoningpromptid_clear boolean DEFAULT false,
    p_reasoningpromptid UUID DEFAULT NULL,
    p_reasoningagentid_clear boolean DEFAULT false,
    p_reasoningagentid UUID DEFAULT NULL,
    p_automationlevel varchar(30) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityDocuments" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityDocument"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "VectorDatabaseID" = COALESCE(p_vectordatabaseid, "VectorDatabaseID"),
        "Status" = COALESCE(p_status, "Status"),
        "TemplateID" = COALESCE(p_templateid, "TemplateID"),
        "AIModelID" = COALESCE(p_aimodelid, "AIModelID"),
        "PotentialMatchThreshold" = COALESCE(p_potentialmatchthreshold, "PotentialMatchThreshold"),
        "AbsoluteMatchThreshold" = COALESCE(p_absolutematchthreshold, "AbsoluteMatchThreshold"),
        "VectorIndexID" = CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, "VectorIndexID") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "EnableLLMReasoning" = COALESCE(p_enablellmreasoning, "EnableLLMReasoning"),
        "ReasoningMode" = COALESCE(p_reasoningmode, "ReasoningMode"),
        "ReasoningThreshold" = CASE WHEN p_reasoningthreshold_clear = true THEN NULL ELSE COALESCE(p_reasoningthreshold, "ReasoningThreshold") END,
        "ReasoningPromptID" = CASE WHEN p_reasoningpromptid_clear = true THEN NULL ELSE COALESCE(p_reasoningpromptid, "ReasoningPromptID") END,
        "ReasoningAgentID" = CASE WHEN p_reasoningagentid_clear = true THEN NULL ELSE COALESCE(p_reasoningagentid, "ReasoningAgentID") END,
        "AutomationLevel" = COALESCE(p_automationlevel, "AutomationLevel")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityDocuments"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityDocument" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityDocument" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityDocument table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_document"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_document" ON "__mj"."EntityDocument";

CREATE TRIGGER "trg_update_entity_document"
BEFORE UPDATE ON "__mj"."EntityDocument"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_document"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: spDeleteEntityDocument
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityDocument"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Content Sources.EntityDocumentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentSource"
        WHERE "EntityDocumentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ContentSource"
        SET "EntityDocumentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Entity Document Runs records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityDocumentRun"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteEntityDocumentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Entity Document Settings records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityDocumentSetting"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteEntityDocumentSetting"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Entity Record Documents records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityRecordDocument"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteEntityRecordDocument"(v_rec."ID");
    END LOOP;

    
    DELETE FROM "__mj"."EntityDocument"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityDocument" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityDocument" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Value Caches
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_cache_record_process_id"
    ON "__mj"."FeatureValueCache" ("RecordProcessID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_cache_prompt_id"
    ON "__mj"."FeatureValueCache" ("PromptID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Value Caches
-- Item: vwFeatureValueCaches
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Feature Value Caches
-----               SCHEMA:      __mj
-----               BASE TABLE:  FeatureValueCache
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwFeatureValueCaches"
AS
SELECT
    f.*,
    MJRecordProcess_RecordProcessID."Name" AS "RecordProcess",
    MJAIPrompt_PromptID."Name" AS "Prompt"
FROM
    "__mj"."FeatureValueCache" AS f
LEFT OUTER JOIN
    "__mj"."RecordProcess" AS MJRecordProcess_RecordProcessID
  ON
    "f"."RecordProcessID" = MJRecordProcess_RecordProcessID."ID"
INNER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "f"."PromptID" = MJAIPrompt_PromptID."ID"
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
    AND tc.relname = 'vwFeatureValueCaches'
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
    AND tc.relname = 'vwFeatureValueCaches'
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
        AND tc.relname = 'vwFeatureValueCaches'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwFeatureValueCaches" CASCADE;
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
GRANT SELECT ON "__mj"."vwFeatureValueCaches" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwFeatureValueCaches" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwFeatureValueCaches" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Value Caches
-- Item: spCreateFeatureValueCache
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR FeatureValueCache
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateFeatureValueCache'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateFeatureValueCache"(
    p_id UUID DEFAULT NULL,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_promptid UUID DEFAULT NULL,
    p_promptversionhash varchar(64) DEFAULT NULL,
    p_constrainthash varchar(64) DEFAULT NULL,
    p_keyhash varchar(64) DEFAULT NULL,
    p_keydisplay_clear boolean DEFAULT false,
    p_keydisplay varchar(500) DEFAULT NULL,
    p_keyjson TEXT DEFAULT NULL,
    p_outputsjson TEXT DEFAULT NULL,
    p_reasoning_clear boolean DEFAULT false,
    p_reasoning TEXT DEFAULT NULL,
    p_aipromptrunid_clear boolean DEFAULT false,
    p_aipromptrunid UUID DEFAULT NULL,
    p_hitcount int DEFAULT NULL,
    p_lasthitat_clear boolean DEFAULT false,
    p_lasthitat TIMESTAMPTZ DEFAULT NULL,
    p_computedat TIMESTAMPTZ DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwFeatureValueCaches" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."FeatureValueCache"
        (
            "ID",
            "RecordProcessID",
                "PromptID",
                "PromptVersionHash",
                "ConstraintHash",
                "KeyHash",
                "KeyDisplay",
                "KeyJSON",
                "OutputsJSON",
                "Reasoning",
                "AIPromptRunID",
                "HitCount",
                "LastHitAt",
                "ComputedAt",
                "ExpiresAt"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, NULL) END,
                p_promptid,
                p_promptversionhash,
                p_constrainthash,
                p_keyhash,
                CASE WHEN p_keydisplay_clear = true THEN NULL ELSE COALESCE(p_keydisplay, NULL) END,
                p_keyjson,
                p_outputsjson,
                CASE WHEN p_reasoning_clear = true THEN NULL ELSE COALESCE(p_reasoning, NULL) END,
                CASE WHEN p_aipromptrunid_clear = true THEN NULL ELSE COALESCE(p_aipromptrunid, NULL) END,
                COALESCE(p_hitcount, 0),
                CASE WHEN p_lasthitat_clear = true THEN NULL ELSE COALESCE(p_lasthitat, NULL) END,
                COALESCE(p_computedat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwFeatureValueCaches"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFeatureValueCache" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFeatureValueCache" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Value Caches
-- Item: spUpdateFeatureValueCache
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR FeatureValueCache
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateFeatureValueCache'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateFeatureValueCache"(
    p_id UUID,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_promptid UUID DEFAULT NULL,
    p_promptversionhash varchar(64) DEFAULT NULL,
    p_constrainthash varchar(64) DEFAULT NULL,
    p_keyhash varchar(64) DEFAULT NULL,
    p_keydisplay_clear boolean DEFAULT false,
    p_keydisplay varchar(500) DEFAULT NULL,
    p_keyjson TEXT DEFAULT NULL,
    p_outputsjson TEXT DEFAULT NULL,
    p_reasoning_clear boolean DEFAULT false,
    p_reasoning TEXT DEFAULT NULL,
    p_aipromptrunid_clear boolean DEFAULT false,
    p_aipromptrunid UUID DEFAULT NULL,
    p_hitcount int DEFAULT NULL,
    p_lasthitat_clear boolean DEFAULT false,
    p_lasthitat TIMESTAMPTZ DEFAULT NULL,
    p_computedat TIMESTAMPTZ DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwFeatureValueCaches" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."FeatureValueCache"
    SET
        "RecordProcessID" = CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, "RecordProcessID") END,
        "PromptID" = COALESCE(p_promptid, "PromptID"),
        "PromptVersionHash" = COALESCE(p_promptversionhash, "PromptVersionHash"),
        "ConstraintHash" = COALESCE(p_constrainthash, "ConstraintHash"),
        "KeyHash" = COALESCE(p_keyhash, "KeyHash"),
        "KeyDisplay" = CASE WHEN p_keydisplay_clear = true THEN NULL ELSE COALESCE(p_keydisplay, "KeyDisplay") END,
        "KeyJSON" = COALESCE(p_keyjson, "KeyJSON"),
        "OutputsJSON" = COALESCE(p_outputsjson, "OutputsJSON"),
        "Reasoning" = CASE WHEN p_reasoning_clear = true THEN NULL ELSE COALESCE(p_reasoning, "Reasoning") END,
        "AIPromptRunID" = CASE WHEN p_aipromptrunid_clear = true THEN NULL ELSE COALESCE(p_aipromptrunid, "AIPromptRunID") END,
        "HitCount" = COALESCE(p_hitcount, "HitCount"),
        "LastHitAt" = CASE WHEN p_lasthitat_clear = true THEN NULL ELSE COALESCE(p_lasthitat, "LastHitAt") END,
        "ComputedAt" = COALESCE(p_computedat, "ComputedAt"),
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
    SELECT * FROM "__mj"."vwFeatureValueCaches"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFeatureValueCache" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFeatureValueCache" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FeatureValueCache table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_feature_value_cache"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_feature_value_cache" ON "__mj"."FeatureValueCache";

CREATE TRIGGER "trg_update_feature_value_cache"
BEFORE UPDATE ON "__mj"."FeatureValueCache"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_feature_value_cache"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Value Caches
-- Item: spDeleteFeatureValueCache
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR FeatureValueCache
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteFeatureValueCache'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteFeatureValueCache"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."FeatureValueCache"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFeatureValueCache" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFeatureValueCache" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Values
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_record_process_id"
    ON "__mj"."FeatureValue" ("RecordProcessID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_entity_id"
    ON "__mj"."FeatureValue" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_prompt_id"
    ON "__mj"."FeatureValue" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_process_run_id"
    ON "__mj"."FeatureValue" ("ProcessRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_process_run_detail_id"
    ON "__mj"."FeatureValue" ("ProcessRunDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_feature_value_cache_id"
    ON "__mj"."FeatureValue" ("FeatureValueCacheID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Values
-- Item: vwFeatureValues
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Feature Values
-----               SCHEMA:      __mj
-----               BASE TABLE:  FeatureValue
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwFeatureValues"
AS
SELECT
    f.*,
    MJRecordProcess_RecordProcessID."Name" AS "RecordProcess",
    MJEntity_EntityID."Name" AS "Entity",
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJProcessRunDetail_ProcessRunDetailID."RecordID" AS "ProcessRunDetail",
    MJFeatureValueCache_FeatureValueCacheID."KeyDisplay" AS "FeatureValueCache"
FROM
    "__mj"."FeatureValue" AS f
INNER JOIN
    "__mj"."RecordProcess" AS MJRecordProcess_RecordProcessID
  ON
    "f"."RecordProcessID" = MJRecordProcess_RecordProcessID."ID"
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "f"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "f"."PromptID" = MJAIPrompt_PromptID."ID"
LEFT OUTER JOIN
    "__mj"."ProcessRunDetail" AS MJProcessRunDetail_ProcessRunDetailID
  ON
    "f"."ProcessRunDetailID" = MJProcessRunDetail_ProcessRunDetailID."ID"
LEFT OUTER JOIN
    "__mj"."FeatureValueCache" AS MJFeatureValueCache_FeatureValueCacheID
  ON
    "f"."FeatureValueCacheID" = MJFeatureValueCache_FeatureValueCacheID."ID"
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
    AND tc.relname = 'vwFeatureValues'
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
    AND tc.relname = 'vwFeatureValues'
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
        AND tc.relname = 'vwFeatureValues'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwFeatureValues" CASCADE;
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
GRANT SELECT ON "__mj"."vwFeatureValues" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwFeatureValues" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwFeatureValues" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Values
-- Item: spCreateFeatureValue
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR FeatureValue
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateFeatureValue'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateFeatureValue"(
    p_id UUID DEFAULT NULL,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(900) DEFAULT NULL,
    p_featurename varchar(255) DEFAULT NULL,
    p_valuetext_clear boolean DEFAULT false,
    p_valuetext TEXT DEFAULT NULL,
    p_valuenumeric_clear boolean DEFAULT false,
    p_valuenumeric float(53) DEFAULT NULL,
    p_valuedate_clear boolean DEFAULT false,
    p_valuedate TIMESTAMPTZ DEFAULT NULL,
    p_valueboolean_clear boolean DEFAULT false,
    p_valueboolean BOOLEAN DEFAULT NULL,
    p_valuejson_clear boolean DEFAULT false,
    p_valuejson TEXT DEFAULT NULL,
    p_reasoning_clear boolean DEFAULT false,
    p_reasoning TEXT DEFAULT NULL,
    p_confidence_clear boolean DEFAULT false,
    p_confidence float(53) DEFAULT NULL,
    p_promptid_clear boolean DEFAULT false,
    p_promptid UUID DEFAULT NULL,
    p_promptversionhash_clear boolean DEFAULT false,
    p_promptversionhash varchar(64) DEFAULT NULL,
    p_constrainthash_clear boolean DEFAULT false,
    p_constrainthash varchar(64) DEFAULT NULL,
    p_processrunid_clear boolean DEFAULT false,
    p_processrunid UUID DEFAULT NULL,
    p_processrundetailid_clear boolean DEFAULT false,
    p_processrundetailid UUID DEFAULT NULL,
    p_aipromptrunid_clear boolean DEFAULT false,
    p_aipromptrunid UUID DEFAULT NULL,
    p_featurevaluecacheid_clear boolean DEFAULT false,
    p_featurevaluecacheid UUID DEFAULT NULL,
    p_computedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwFeatureValues" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."FeatureValue"
        (
            "ID",
            "RecordProcessID",
                "EntityID",
                "RecordID",
                "FeatureName",
                "ValueText",
                "ValueNumeric",
                "ValueDate",
                "ValueBoolean",
                "ValueJSON",
                "Reasoning",
                "Confidence",
                "PromptID",
                "PromptVersionHash",
                "ConstraintHash",
                "ProcessRunID",
                "ProcessRunDetailID",
                "AIPromptRunID",
                "FeatureValueCacheID",
                "ComputedAt"
        )
    VALUES
        (
            v_new_id,
            p_recordprocessid,
                p_entityid,
                p_recordid,
                p_featurename,
                CASE WHEN p_valuetext_clear = true THEN NULL ELSE COALESCE(p_valuetext, NULL) END,
                CASE WHEN p_valuenumeric_clear = true THEN NULL ELSE COALESCE(p_valuenumeric, NULL) END,
                CASE WHEN p_valuedate_clear = true THEN NULL ELSE COALESCE(p_valuedate, NULL) END,
                CASE WHEN p_valueboolean_clear = true THEN NULL ELSE COALESCE(p_valueboolean, NULL) END,
                CASE WHEN p_valuejson_clear = true THEN NULL ELSE COALESCE(p_valuejson, NULL) END,
                CASE WHEN p_reasoning_clear = true THEN NULL ELSE COALESCE(p_reasoning, NULL) END,
                CASE WHEN p_confidence_clear = true THEN NULL ELSE COALESCE(p_confidence, NULL) END,
                CASE WHEN p_promptid_clear = true THEN NULL ELSE COALESCE(p_promptid, NULL) END,
                CASE WHEN p_promptversionhash_clear = true THEN NULL ELSE COALESCE(p_promptversionhash, NULL) END,
                CASE WHEN p_constrainthash_clear = true THEN NULL ELSE COALESCE(p_constrainthash, NULL) END,
                CASE WHEN p_processrunid_clear = true THEN NULL ELSE COALESCE(p_processrunid, NULL) END,
                CASE WHEN p_processrundetailid_clear = true THEN NULL ELSE COALESCE(p_processrundetailid, NULL) END,
                CASE WHEN p_aipromptrunid_clear = true THEN NULL ELSE COALESCE(p_aipromptrunid, NULL) END,
                CASE WHEN p_featurevaluecacheid_clear = true THEN NULL ELSE COALESCE(p_featurevaluecacheid, NULL) END,
                COALESCE(p_computedat, NOW() AT TIME ZONE 'UTC')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwFeatureValues"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFeatureValue" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFeatureValue" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Values
-- Item: spUpdateFeatureValue
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR FeatureValue
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateFeatureValue'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateFeatureValue"(
    p_id UUID,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(900) DEFAULT NULL,
    p_featurename varchar(255) DEFAULT NULL,
    p_valuetext_clear boolean DEFAULT false,
    p_valuetext TEXT DEFAULT NULL,
    p_valuenumeric_clear boolean DEFAULT false,
    p_valuenumeric float(53) DEFAULT NULL,
    p_valuedate_clear boolean DEFAULT false,
    p_valuedate TIMESTAMPTZ DEFAULT NULL,
    p_valueboolean_clear boolean DEFAULT false,
    p_valueboolean BOOLEAN DEFAULT NULL,
    p_valuejson_clear boolean DEFAULT false,
    p_valuejson TEXT DEFAULT NULL,
    p_reasoning_clear boolean DEFAULT false,
    p_reasoning TEXT DEFAULT NULL,
    p_confidence_clear boolean DEFAULT false,
    p_confidence float(53) DEFAULT NULL,
    p_promptid_clear boolean DEFAULT false,
    p_promptid UUID DEFAULT NULL,
    p_promptversionhash_clear boolean DEFAULT false,
    p_promptversionhash varchar(64) DEFAULT NULL,
    p_constrainthash_clear boolean DEFAULT false,
    p_constrainthash varchar(64) DEFAULT NULL,
    p_processrunid_clear boolean DEFAULT false,
    p_processrunid UUID DEFAULT NULL,
    p_processrundetailid_clear boolean DEFAULT false,
    p_processrundetailid UUID DEFAULT NULL,
    p_aipromptrunid_clear boolean DEFAULT false,
    p_aipromptrunid UUID DEFAULT NULL,
    p_featurevaluecacheid_clear boolean DEFAULT false,
    p_featurevaluecacheid UUID DEFAULT NULL,
    p_computedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwFeatureValues" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."FeatureValue"
    SET
        "RecordProcessID" = COALESCE(p_recordprocessid, "RecordProcessID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "FeatureName" = COALESCE(p_featurename, "FeatureName"),
        "ValueText" = CASE WHEN p_valuetext_clear = true THEN NULL ELSE COALESCE(p_valuetext, "ValueText") END,
        "ValueNumeric" = CASE WHEN p_valuenumeric_clear = true THEN NULL ELSE COALESCE(p_valuenumeric, "ValueNumeric") END,
        "ValueDate" = CASE WHEN p_valuedate_clear = true THEN NULL ELSE COALESCE(p_valuedate, "ValueDate") END,
        "ValueBoolean" = CASE WHEN p_valueboolean_clear = true THEN NULL ELSE COALESCE(p_valueboolean, "ValueBoolean") END,
        "ValueJSON" = CASE WHEN p_valuejson_clear = true THEN NULL ELSE COALESCE(p_valuejson, "ValueJSON") END,
        "Reasoning" = CASE WHEN p_reasoning_clear = true THEN NULL ELSE COALESCE(p_reasoning, "Reasoning") END,
        "Confidence" = CASE WHEN p_confidence_clear = true THEN NULL ELSE COALESCE(p_confidence, "Confidence") END,
        "PromptID" = CASE WHEN p_promptid_clear = true THEN NULL ELSE COALESCE(p_promptid, "PromptID") END,
        "PromptVersionHash" = CASE WHEN p_promptversionhash_clear = true THEN NULL ELSE COALESCE(p_promptversionhash, "PromptVersionHash") END,
        "ConstraintHash" = CASE WHEN p_constrainthash_clear = true THEN NULL ELSE COALESCE(p_constrainthash, "ConstraintHash") END,
        "ProcessRunID" = CASE WHEN p_processrunid_clear = true THEN NULL ELSE COALESCE(p_processrunid, "ProcessRunID") END,
        "ProcessRunDetailID" = CASE WHEN p_processrundetailid_clear = true THEN NULL ELSE COALESCE(p_processrundetailid, "ProcessRunDetailID") END,
        "AIPromptRunID" = CASE WHEN p_aipromptrunid_clear = true THEN NULL ELSE COALESCE(p_aipromptrunid, "AIPromptRunID") END,
        "FeatureValueCacheID" = CASE WHEN p_featurevaluecacheid_clear = true THEN NULL ELSE COALESCE(p_featurevaluecacheid, "FeatureValueCacheID") END,
        "ComputedAt" = COALESCE(p_computedat, "ComputedAt")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwFeatureValues"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFeatureValue" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFeatureValue" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FeatureValue table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_feature_value"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_feature_value" ON "__mj"."FeatureValue";

CREATE TRIGGER "trg_update_feature_value"
BEFORE UPDATE ON "__mj"."FeatureValue"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_feature_value"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Values
-- Item: spDeleteFeatureValue
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR FeatureValue
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteFeatureValue'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteFeatureValue"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."FeatureValue"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFeatureValue" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFeatureValue" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_template_id"
    ON "__mj"."AIPrompt" ("TemplateID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_category_id"
    ON "__mj"."AIPrompt" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_type_id"
    ON "__mj"."AIPrompt" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_ai_model_type_id"
    ON "__mj"."AIPrompt" ("AIModelTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_result_selector_prompt_id"
    ON "__mj"."AIPrompt" ("ResultSelectorPromptID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: vwAIPrompts
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompts
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIPrompts"
AS
SELECT
    a.*,
    MJTemplate_TemplateID."Name" AS "Template",
    MJAIPromptCategory_CategoryID."Name" AS "Category",
    MJAIPromptType_TypeID."Name" AS "Type",
    MJAIModelType_AIModelTypeID."Name" AS "AIModelType",
    MJAIPrompt_ResultSelectorPromptID."Name" AS "ResultSelectorPrompt"
FROM
    "__mj"."AIPrompt" AS a
INNER JOIN
    "__mj"."Template" AS MJTemplate_TemplateID
  ON
    "a"."TemplateID" = MJTemplate_TemplateID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptCategory" AS MJAIPromptCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIPromptCategory_CategoryID."ID"
INNER JOIN
    "__mj"."AIPromptType" AS MJAIPromptType_TypeID
  ON
    "a"."TypeID" = MJAIPromptType_TypeID."ID"
LEFT OUTER JOIN
    "__mj"."AIModelType" AS MJAIModelType_AIModelTypeID
  ON
    "a"."AIModelTypeID" = MJAIModelType_AIModelTypeID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ResultSelectorPromptID
  ON
    "a"."ResultSelectorPromptID" = MJAIPrompt_ResultSelectorPromptID."ID"
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
    AND tc.relname = 'vwAIPrompts'
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
    AND tc.relname = 'vwAIPrompts'
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
        AND tc.relname = 'vwAIPrompts'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwAIPrompts" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIPrompts" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwAIPrompts" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIPrompts" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spCreateAIPrompt
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIPrompt"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_responseformat varchar(20) DEFAULT NULL,
    p_modelspecificresponseformat_clear boolean DEFAULT false,
    p_modelspecificresponseformat TEXT DEFAULT NULL,
    p_aimodeltypeid_clear boolean DEFAULT false,
    p_aimodeltypeid UUID DEFAULT NULL,
    p_minpowerrank_clear boolean DEFAULT false,
    p_minpowerrank int DEFAULT NULL,
    p_selectionstrategy varchar(20) DEFAULT NULL,
    p_powerpreference varchar(20) DEFAULT NULL,
    p_parallelizationmode varchar(20) DEFAULT NULL,
    p_parallelcount_clear boolean DEFAULT false,
    p_parallelcount int DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam varchar(100) DEFAULT NULL,
    p_outputtype varchar(50) DEFAULT NULL,
    p_outputexample_clear boolean DEFAULT false,
    p_outputexample TEXT DEFAULT NULL,
    p_validationbehavior varchar(50) DEFAULT NULL,
    p_maxretries int DEFAULT NULL,
    p_retrydelayms int DEFAULT NULL,
    p_retrystrategy varchar(20) DEFAULT NULL,
    p_resultselectorpromptid_clear boolean DEFAULT false,
    p_resultselectorpromptid UUID DEFAULT NULL,
    p_enablecaching BOOLEAN DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_cachematchtype varchar(20) DEFAULT NULL,
    p_cachesimilaritythreshold_clear boolean DEFAULT false,
    p_cachesimilaritythreshold float(53) DEFAULT NULL,
    p_cachemustmatchmodel BOOLEAN DEFAULT NULL,
    p_cachemustmatchvendor BOOLEAN DEFAULT NULL,
    p_cachemustmatchagent BOOLEAN DEFAULT NULL,
    p_cachemustmatchconfig BOOLEAN DEFAULT NULL,
    p_promptrole varchar(20) DEFAULT NULL,
    p_promptposition varchar(20) DEFAULT NULL,
    p_temperature_clear boolean DEFAULT false,
    p_temperature decimal(3, 2) DEFAULT NULL,
    p_topp_clear boolean DEFAULT false,
    p_topp decimal(3, 2) DEFAULT NULL,
    p_topk_clear boolean DEFAULT false,
    p_topk int DEFAULT NULL,
    p_minp_clear boolean DEFAULT false,
    p_minp decimal(3, 2) DEFAULT NULL,
    p_frequencypenalty_clear boolean DEFAULT false,
    p_frequencypenalty decimal(3, 2) DEFAULT NULL,
    p_presencepenalty_clear boolean DEFAULT false,
    p_presencepenalty decimal(3, 2) DEFAULT NULL,
    p_seed_clear boolean DEFAULT false,
    p_seed int DEFAULT NULL,
    p_stopsequences_clear boolean DEFAULT false,
    p_stopsequences varchar(1000) DEFAULT NULL,
    p_includelogprobs_clear boolean DEFAULT false,
    p_includelogprobs BOOLEAN DEFAULT NULL,
    p_toplogprobs_clear boolean DEFAULT false,
    p_toplogprobs int DEFAULT NULL,
    p_failoverstrategy varchar(50) DEFAULT NULL,
    p_failovermaxattempts_clear boolean DEFAULT false,
    p_failovermaxattempts int DEFAULT NULL,
    p_failoverdelayseconds_clear boolean DEFAULT false,
    p_failoverdelayseconds int DEFAULT NULL,
    p_failovermodelstrategy varchar(50) DEFAULT NULL,
    p_failovererrorscope varchar(50) DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel int DEFAULT NULL,
    p_assistantprefill_clear boolean DEFAULT false,
    p_assistantprefill TEXT DEFAULT NULL,
    p_prefillfallbackmode varchar(20) DEFAULT NULL,
    p_requirespecificmodels BOOLEAN DEFAULT NULL,
    p_promptconfiguration_clear boolean DEFAULT false,
    p_promptconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIPrompts" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIPrompt"
        (
            "ID",
            "Name",
                "Description",
                "TemplateID",
                "CategoryID",
                "TypeID",
                "Status",
                "ResponseFormat",
                "ModelSpecificResponseFormat",
                "AIModelTypeID",
                "MinPowerRank",
                "SelectionStrategy",
                "PowerPreference",
                "ParallelizationMode",
                "ParallelCount",
                "ParallelConfigParam",
                "OutputType",
                "OutputExample",
                "ValidationBehavior",
                "MaxRetries",
                "RetryDelayMS",
                "RetryStrategy",
                "ResultSelectorPromptID",
                "EnableCaching",
                "CacheTTLSeconds",
                "CacheMatchType",
                "CacheSimilarityThreshold",
                "CacheMustMatchModel",
                "CacheMustMatchVendor",
                "CacheMustMatchAgent",
                "CacheMustMatchConfig",
                "PromptRole",
                "PromptPosition",
                "Temperature",
                "TopP",
                "TopK",
                "MinP",
                "FrequencyPenalty",
                "PresencePenalty",
                "Seed",
                "StopSequences",
                "IncludeLogProbs",
                "TopLogProbs",
                "FailoverStrategy",
                "FailoverMaxAttempts",
                "FailoverDelaySeconds",
                "FailoverModelStrategy",
                "FailoverErrorScope",
                "EffortLevel",
                "AssistantPrefill",
                "PrefillFallbackMode",
                "RequireSpecificModels",
                "PromptConfiguration"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_templateid,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                p_typeid,
                p_status,
                COALESCE(p_responseformat, 'Any'),
                CASE WHEN p_modelspecificresponseformat_clear = true THEN NULL ELSE COALESCE(p_modelspecificresponseformat, NULL) END,
                CASE WHEN p_aimodeltypeid_clear = true THEN NULL ELSE COALESCE(p_aimodeltypeid, NULL) END,
                CASE WHEN p_minpowerrank_clear = true THEN NULL ELSE COALESCE(p_minpowerrank, 0) END,
                COALESCE(p_selectionstrategy, 'Default'),
                COALESCE(p_powerpreference, 'Highest'),
                COALESCE(p_parallelizationmode, 'None'),
                CASE WHEN p_parallelcount_clear = true THEN NULL ELSE COALESCE(p_parallelcount, NULL) END,
                CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, NULL) END,
                COALESCE(p_outputtype, 'string'),
                CASE WHEN p_outputexample_clear = true THEN NULL ELSE COALESCE(p_outputexample, NULL) END,
                COALESCE(p_validationbehavior, 'Warn'),
                COALESCE(p_maxretries, 0),
                COALESCE(p_retrydelayms, 0),
                COALESCE(p_retrystrategy, 'Fixed'),
                CASE WHEN p_resultselectorpromptid_clear = true THEN NULL ELSE COALESCE(p_resultselectorpromptid, NULL) END,
                COALESCE(p_enablecaching, FALSE),
                CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, NULL) END,
                COALESCE(p_cachematchtype, 'Exact'),
                CASE WHEN p_cachesimilaritythreshold_clear = true THEN NULL ELSE COALESCE(p_cachesimilaritythreshold, NULL) END,
                COALESCE(p_cachemustmatchmodel, TRUE),
                COALESCE(p_cachemustmatchvendor, TRUE),
                COALESCE(p_cachemustmatchagent, FALSE),
                COALESCE(p_cachemustmatchconfig, FALSE),
                COALESCE(p_promptrole, 'System'),
                COALESCE(p_promptposition, 'First'),
                CASE WHEN p_temperature_clear = true THEN NULL ELSE COALESCE(p_temperature, NULL) END,
                CASE WHEN p_topp_clear = true THEN NULL ELSE COALESCE(p_topp, NULL) END,
                CASE WHEN p_topk_clear = true THEN NULL ELSE COALESCE(p_topk, NULL) END,
                CASE WHEN p_minp_clear = true THEN NULL ELSE COALESCE(p_minp, NULL) END,
                CASE WHEN p_frequencypenalty_clear = true THEN NULL ELSE COALESCE(p_frequencypenalty, NULL) END,
                CASE WHEN p_presencepenalty_clear = true THEN NULL ELSE COALESCE(p_presencepenalty, NULL) END,
                CASE WHEN p_seed_clear = true THEN NULL ELSE COALESCE(p_seed, NULL) END,
                CASE WHEN p_stopsequences_clear = true THEN NULL ELSE COALESCE(p_stopsequences, NULL) END,
                CASE WHEN p_includelogprobs_clear = true THEN NULL ELSE COALESCE(p_includelogprobs, FALSE) END,
                CASE WHEN p_toplogprobs_clear = true THEN NULL ELSE COALESCE(p_toplogprobs, NULL) END,
                COALESCE(p_failoverstrategy, 'SameModelDifferentVendor'),
                CASE WHEN p_failovermaxattempts_clear = true THEN NULL ELSE COALESCE(p_failovermaxattempts, 3) END,
                CASE WHEN p_failoverdelayseconds_clear = true THEN NULL ELSE COALESCE(p_failoverdelayseconds, 5) END,
                COALESCE(p_failovermodelstrategy, 'PreferSameModel'),
                COALESCE(p_failovererrorscope, 'All'),
                CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, NULL) END,
                CASE WHEN p_assistantprefill_clear = true THEN NULL ELSE COALESCE(p_assistantprefill, NULL) END,
                COALESCE(p_prefillfallbackmode, 'Ignore'),
                COALESCE(p_requirespecificmodels, FALSE),
                CASE WHEN p_promptconfiguration_clear = true THEN NULL ELSE COALESCE(p_promptconfiguration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPrompts"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPrompt" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spUpdateAIPrompt
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIPrompt"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_responseformat varchar(20) DEFAULT NULL,
    p_modelspecificresponseformat_clear boolean DEFAULT false,
    p_modelspecificresponseformat TEXT DEFAULT NULL,
    p_aimodeltypeid_clear boolean DEFAULT false,
    p_aimodeltypeid UUID DEFAULT NULL,
    p_minpowerrank_clear boolean DEFAULT false,
    p_minpowerrank int DEFAULT NULL,
    p_selectionstrategy varchar(20) DEFAULT NULL,
    p_powerpreference varchar(20) DEFAULT NULL,
    p_parallelizationmode varchar(20) DEFAULT NULL,
    p_parallelcount_clear boolean DEFAULT false,
    p_parallelcount int DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam varchar(100) DEFAULT NULL,
    p_outputtype varchar(50) DEFAULT NULL,
    p_outputexample_clear boolean DEFAULT false,
    p_outputexample TEXT DEFAULT NULL,
    p_validationbehavior varchar(50) DEFAULT NULL,
    p_maxretries int DEFAULT NULL,
    p_retrydelayms int DEFAULT NULL,
    p_retrystrategy varchar(20) DEFAULT NULL,
    p_resultselectorpromptid_clear boolean DEFAULT false,
    p_resultselectorpromptid UUID DEFAULT NULL,
    p_enablecaching BOOLEAN DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_cachematchtype varchar(20) DEFAULT NULL,
    p_cachesimilaritythreshold_clear boolean DEFAULT false,
    p_cachesimilaritythreshold float(53) DEFAULT NULL,
    p_cachemustmatchmodel BOOLEAN DEFAULT NULL,
    p_cachemustmatchvendor BOOLEAN DEFAULT NULL,
    p_cachemustmatchagent BOOLEAN DEFAULT NULL,
    p_cachemustmatchconfig BOOLEAN DEFAULT NULL,
    p_promptrole varchar(20) DEFAULT NULL,
    p_promptposition varchar(20) DEFAULT NULL,
    p_temperature_clear boolean DEFAULT false,
    p_temperature decimal(3, 2) DEFAULT NULL,
    p_topp_clear boolean DEFAULT false,
    p_topp decimal(3, 2) DEFAULT NULL,
    p_topk_clear boolean DEFAULT false,
    p_topk int DEFAULT NULL,
    p_minp_clear boolean DEFAULT false,
    p_minp decimal(3, 2) DEFAULT NULL,
    p_frequencypenalty_clear boolean DEFAULT false,
    p_frequencypenalty decimal(3, 2) DEFAULT NULL,
    p_presencepenalty_clear boolean DEFAULT false,
    p_presencepenalty decimal(3, 2) DEFAULT NULL,
    p_seed_clear boolean DEFAULT false,
    p_seed int DEFAULT NULL,
    p_stopsequences_clear boolean DEFAULT false,
    p_stopsequences varchar(1000) DEFAULT NULL,
    p_includelogprobs_clear boolean DEFAULT false,
    p_includelogprobs BOOLEAN DEFAULT NULL,
    p_toplogprobs_clear boolean DEFAULT false,
    p_toplogprobs int DEFAULT NULL,
    p_failoverstrategy varchar(50) DEFAULT NULL,
    p_failovermaxattempts_clear boolean DEFAULT false,
    p_failovermaxattempts int DEFAULT NULL,
    p_failoverdelayseconds_clear boolean DEFAULT false,
    p_failoverdelayseconds int DEFAULT NULL,
    p_failovermodelstrategy varchar(50) DEFAULT NULL,
    p_failovererrorscope varchar(50) DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel int DEFAULT NULL,
    p_assistantprefill_clear boolean DEFAULT false,
    p_assistantprefill TEXT DEFAULT NULL,
    p_prefillfallbackmode varchar(20) DEFAULT NULL,
    p_requirespecificmodels BOOLEAN DEFAULT NULL,
    p_promptconfiguration_clear boolean DEFAULT false,
    p_promptconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIPrompts" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIPrompt"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "TemplateID" = COALESCE(p_templateid, "TemplateID"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "Status" = COALESCE(p_status, "Status"),
        "ResponseFormat" = COALESCE(p_responseformat, "ResponseFormat"),
        "ModelSpecificResponseFormat" = CASE WHEN p_modelspecificresponseformat_clear = true THEN NULL ELSE COALESCE(p_modelspecificresponseformat, "ModelSpecificResponseFormat") END,
        "AIModelTypeID" = CASE WHEN p_aimodeltypeid_clear = true THEN NULL ELSE COALESCE(p_aimodeltypeid, "AIModelTypeID") END,
        "MinPowerRank" = CASE WHEN p_minpowerrank_clear = true THEN NULL ELSE COALESCE(p_minpowerrank, "MinPowerRank") END,
        "SelectionStrategy" = COALESCE(p_selectionstrategy, "SelectionStrategy"),
        "PowerPreference" = COALESCE(p_powerpreference, "PowerPreference"),
        "ParallelizationMode" = COALESCE(p_parallelizationmode, "ParallelizationMode"),
        "ParallelCount" = CASE WHEN p_parallelcount_clear = true THEN NULL ELSE COALESCE(p_parallelcount, "ParallelCount") END,
        "ParallelConfigParam" = CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, "ParallelConfigParam") END,
        "OutputType" = COALESCE(p_outputtype, "OutputType"),
        "OutputExample" = CASE WHEN p_outputexample_clear = true THEN NULL ELSE COALESCE(p_outputexample, "OutputExample") END,
        "ValidationBehavior" = COALESCE(p_validationbehavior, "ValidationBehavior"),
        "MaxRetries" = COALESCE(p_maxretries, "MaxRetries"),
        "RetryDelayMS" = COALESCE(p_retrydelayms, "RetryDelayMS"),
        "RetryStrategy" = COALESCE(p_retrystrategy, "RetryStrategy"),
        "ResultSelectorPromptID" = CASE WHEN p_resultselectorpromptid_clear = true THEN NULL ELSE COALESCE(p_resultselectorpromptid, "ResultSelectorPromptID") END,
        "EnableCaching" = COALESCE(p_enablecaching, "EnableCaching"),
        "CacheTTLSeconds" = CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, "CacheTTLSeconds") END,
        "CacheMatchType" = COALESCE(p_cachematchtype, "CacheMatchType"),
        "CacheSimilarityThreshold" = CASE WHEN p_cachesimilaritythreshold_clear = true THEN NULL ELSE COALESCE(p_cachesimilaritythreshold, "CacheSimilarityThreshold") END,
        "CacheMustMatchModel" = COALESCE(p_cachemustmatchmodel, "CacheMustMatchModel"),
        "CacheMustMatchVendor" = COALESCE(p_cachemustmatchvendor, "CacheMustMatchVendor"),
        "CacheMustMatchAgent" = COALESCE(p_cachemustmatchagent, "CacheMustMatchAgent"),
        "CacheMustMatchConfig" = COALESCE(p_cachemustmatchconfig, "CacheMustMatchConfig"),
        "PromptRole" = COALESCE(p_promptrole, "PromptRole"),
        "PromptPosition" = COALESCE(p_promptposition, "PromptPosition"),
        "Temperature" = CASE WHEN p_temperature_clear = true THEN NULL ELSE COALESCE(p_temperature, "Temperature") END,
        "TopP" = CASE WHEN p_topp_clear = true THEN NULL ELSE COALESCE(p_topp, "TopP") END,
        "TopK" = CASE WHEN p_topk_clear = true THEN NULL ELSE COALESCE(p_topk, "TopK") END,
        "MinP" = CASE WHEN p_minp_clear = true THEN NULL ELSE COALESCE(p_minp, "MinP") END,
        "FrequencyPenalty" = CASE WHEN p_frequencypenalty_clear = true THEN NULL ELSE COALESCE(p_frequencypenalty, "FrequencyPenalty") END,
        "PresencePenalty" = CASE WHEN p_presencepenalty_clear = true THEN NULL ELSE COALESCE(p_presencepenalty, "PresencePenalty") END,
        "Seed" = CASE WHEN p_seed_clear = true THEN NULL ELSE COALESCE(p_seed, "Seed") END,
        "StopSequences" = CASE WHEN p_stopsequences_clear = true THEN NULL ELSE COALESCE(p_stopsequences, "StopSequences") END,
        "IncludeLogProbs" = CASE WHEN p_includelogprobs_clear = true THEN NULL ELSE COALESCE(p_includelogprobs, "IncludeLogProbs") END,
        "TopLogProbs" = CASE WHEN p_toplogprobs_clear = true THEN NULL ELSE COALESCE(p_toplogprobs, "TopLogProbs") END,
        "FailoverStrategy" = COALESCE(p_failoverstrategy, "FailoverStrategy"),
        "FailoverMaxAttempts" = CASE WHEN p_failovermaxattempts_clear = true THEN NULL ELSE COALESCE(p_failovermaxattempts, "FailoverMaxAttempts") END,
        "FailoverDelaySeconds" = CASE WHEN p_failoverdelayseconds_clear = true THEN NULL ELSE COALESCE(p_failoverdelayseconds, "FailoverDelaySeconds") END,
        "FailoverModelStrategy" = COALESCE(p_failovermodelstrategy, "FailoverModelStrategy"),
        "FailoverErrorScope" = COALESCE(p_failovererrorscope, "FailoverErrorScope"),
        "EffortLevel" = CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, "EffortLevel") END,
        "AssistantPrefill" = CASE WHEN p_assistantprefill_clear = true THEN NULL ELSE COALESCE(p_assistantprefill, "AssistantPrefill") END,
        "PrefillFallbackMode" = COALESCE(p_prefillfallbackmode, "PrefillFallbackMode"),
        "RequireSpecificModels" = COALESCE(p_requirespecificmodels, "RequireSpecificModels"),
        "PromptConfiguration" = CASE WHEN p_promptconfiguration_clear = true THEN NULL ELSE COALESCE(p_promptconfiguration, "PromptConfiguration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPrompts"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPrompt" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_prompt"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt" ON "__mj"."AIPrompt";

CREATE TRIGGER "trg_update_ai_prompt"
BEFORE UPDATE ON "__mj"."AIPrompt"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_prompt"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
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

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIPrompt"(
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
        FROM "__mj"."AIAgentAction"
        WHERE "CompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentAction"
        SET "CompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPrompt"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentStep"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentStep"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.SystemPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentType"
        WHERE "SystemPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentType"
        SET "SystemPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.ContextCompressionPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentType"
        WHERE "ContextCompressionPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentType"
        SET "ContextCompressionPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.ConversationSummaryPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentType"
        WHERE "ConversationSummaryPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentType"
        SET "ConversationSummaryPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ContextCompressionPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "ContextCompressionPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "ContextCompressionPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ConversationSummaryPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "ConversationSummaryPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "ConversationSummaryPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextCompressionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIConfiguration"
        WHERE "DefaultPromptForContextCompressionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIConfiguration"
        SET "DefaultPromptForContextCompressionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextSummarizationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIConfiguration"
        WHERE "DefaultPromptForContextSummarizationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIConfiguration"
        SET "DefaultPromptForContextSummarizationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Models records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptModel"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptModel"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Runs records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.JudgeID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "JudgeID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "JudgeID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ChildPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "ChildPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "ChildPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompts.ResultSelectorPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPrompt"
        WHERE "ResultSelectorPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPrompt"
        SET "ResultSelectorPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Result Cache records via AIPromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "AIPromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIResultCache"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Actions.DefaultCompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Action"
        WHERE "DefaultCompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Action"
        SET "DefaultCompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Entity Documents.ReasoningPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityDocument"
        WHERE "ReasoningPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."EntityDocument"
        SET "ReasoningPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Feature Value Caches records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."FeatureValueCache"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteFeatureValueCache"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Feature Values.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."FeatureValue"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."FeatureValue"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RecordProcess"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RecordProcess"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Scoped Prompt Configs records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ScopedPromptConfig"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteScopedPromptConfig"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Scoped Prompt Parts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ScopedPromptPart"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteScopedPromptPart"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Tasks.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIPrompt"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPrompt" TO "cdp_Developer";
