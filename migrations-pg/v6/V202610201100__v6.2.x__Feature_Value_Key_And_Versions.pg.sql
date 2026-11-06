-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610201100__v6.2.x__Feature_Value_Key_And_Versions.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================
-- HAND-CORRECTED after conversion: the AST transpiler emits T-SQL's `DROP INDEX <name> ON <table>`
-- unchanged for UQ_FeatureValueCache_Scoped and UQ_FeatureValueCache_PromptScoped, which PostgreSQL
-- rejects ("syntax error at or near ON"). PostgreSQL drops an index by schema-qualified name, so both
-- are written as `DROP INDEX IF EXISTS __mj."<name>";`. Nothing else in this file was edited by hand.
-- Re-running `mj migrate rebake` over this file re-transpiles it and undoes this correction.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."FeatureValue"
  ADD COLUMN "PipelineVersion" INT NULL,
  ADD COLUMN "AIModelID" UUID NULL,
  ADD COLUMN "ParametersHash" VARCHAR(64) NULL,
  ADD COLUMN "InputHash" VARCHAR(64) NULL,
  ADD COLUMN "ValueKeyHash" VARCHAR(64) NULL,
  ADD COLUMN "Source" VARCHAR(20) NOT NULL DEFAULT (
    'Pipeline'
  )
 /* ===================================================================================== */ /* Feature Pipelines: Feature Value key, value source, run summary and version registry */ /* 1. FeatureValue: the FeatureValueKey columns and their hash (ValueKeyHash, unique per pipeline), and Source. */ /* 2. FeatureValueCache: AIModelID and ParametersHash join the cache key; its two unique indexes are rebuilt. */ /* 3. ProcessRun.ResultSummary and ProcessRunDetail.Warnings. */ /* 4. FeaturePipelineVersion: one row per distinct pipeline pin, with its golden-set activation. */ /* ===================================================================================== */ /* ------------------------------------------------------------------------------------- */ /* 1. FeatureValue */ /* ------------------------------------------------------------------------------------- */;

ALTER TABLE __mj."FeatureValue"
  ADD CONSTRAINT "FK_FeatureValue_AIModel" FOREIGN KEY ("AIModelID") REFERENCES __mj."AIModel" (
    "ID"
  ),
  ADD CONSTRAINT "CK_FeatureValue_Source" CHECK ("Source" IN ('Pipeline', 'Human'));

/* The key hash is unique per pipeline. Rows written before this migration have no key and are excluded. */
CREATE UNIQUE INDEX "UQ_FeatureValue_ValueKey" ON __mj."FeatureValue"("RecordProcessID", "ValueKeyHash")
WHERE
  NOT "ValueKeyHash" IS NULL;

ALTER TABLE __mj."FeatureValueCache"
ADD COLUMN "AIModelID" UUID NULL, ADD COLUMN "ParametersHash" VARCHAR(64) NULL /* ------------------------------------------------------------------------------------- */ /* 2. FeatureValueCache */ /* ------------------------------------------------------------------------------------- */;

ALTER TABLE __mj."FeatureValueCache"
  ADD CONSTRAINT "FK_FeatureValueCache_AIModel" FOREIGN KEY ("AIModelID") REFERENCES __mj."AIModel" (
    "ID"
  );

DROP INDEX IF EXISTS __mj."UQ_FeatureValueCache_Scoped";

DROP INDEX IF EXISTS __mj."UQ_FeatureValueCache_PromptScoped";

CREATE UNIQUE INDEX "UQ_FeatureValueCache_Scoped" ON __mj."FeatureValueCache"("RecordProcessID", "PromptID", "PromptVersionHash", "ConstraintHash", "AIModelID", "ParametersHash", "KeyHash")
WHERE
  NOT "RecordProcessID" IS NULL;

CREATE UNIQUE INDEX "UQ_FeatureValueCache_PromptScoped" ON __mj."FeatureValueCache"("PromptID", "PromptVersionHash", "ConstraintHash", "AIModelID", "ParametersHash", "KeyHash")
WHERE
  "RecordProcessID" IS NULL;

ALTER TABLE __mj."ProcessRun"
ADD COLUMN "ResultSummary" TEXT NULL /* ------------------------------------------------------------------------------------- */ /* 3. ProcessRun.ResultSummary, ProcessRunDetail.Warnings */ /* ------------------------------------------------------------------------------------- */;

ALTER TABLE __mj."ProcessRunDetail"
ADD COLUMN "Warnings" TEXT NULL;

/* ------------------------------------------------------------------------------------- */
/* 4. FeaturePipelineVersion */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."FeaturePipelineVersion" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "RecordProcessID" UUID NOT NULL,
  "Version" INT NOT NULL,
  "PinHash" VARCHAR(64) NOT NULL,
  "SpecHash" VARCHAR(64) NOT NULL,
  "PromptID" UUID NULL,
  "PromptVersionHash" VARCHAR(64) NULL,
  "AIModelID" UUID NULL,
  "ParametersHash" VARCHAR(64) NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Candidate'
  ),
  "Gated" BOOLEAN NOT NULL DEFAULT FALSE,
  "GoldenSetTestID" UUID NULL,
  "GoldenSetTestRunID" UUID NULL,
  "Metric" VARCHAR(20) NULL,
  "Threshold" DOUBLE PRECISION NULL,
  "ResultValue" DOUBLE PRECISION NULL,
  "ResultLower" DOUBLE PRECISION NULL,
  "ResultUpper" DOUBLE PRECISION NULL,
  "ResultN" INT NULL,
  "ResultDetails" TEXT NULL,
  "ActivatedAt" TIMESTAMPTZ NULL,
  "ApprovedByUserID" UUID NULL,
  "RetiredAt" TIMESTAMPTZ NULL,
  "BackfilledAt" TIMESTAMPTZ NULL,
  CONSTRAINT "PK_FeaturePipelineVersion" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FeaturePipelineVersion_RecordProcess" FOREIGN KEY ("RecordProcessID") REFERENCES __mj."RecordProcess" (
    "ID"
  ),
  CONSTRAINT "FK_FeaturePipelineVersion_Prompt" FOREIGN KEY ("PromptID") REFERENCES __mj."AIPrompt" (
    "ID"
  ),
  CONSTRAINT "FK_FeaturePipelineVersion_AIModel" FOREIGN KEY ("AIModelID") REFERENCES __mj."AIModel" (
    "ID"
  ),
  CONSTRAINT "FK_FeaturePipelineVersion_GoldenSetTest" FOREIGN KEY ("GoldenSetTestID") REFERENCES __mj."Test" (
    "ID"
  ),
  CONSTRAINT "FK_FeaturePipelineVersion_GoldenSetTestRun" FOREIGN KEY ("GoldenSetTestRunID") REFERENCES __mj."TestRun" (
    "ID"
  ),
  CONSTRAINT "FK_FeaturePipelineVersion_ApprovedByUser" FOREIGN KEY ("ApprovedByUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "UQ_FeaturePipelineVersion_Version" UNIQUE (
    "RecordProcessID",
    "Version"
  ),
  CONSTRAINT "UQ_FeaturePipelineVersion_Pin" UNIQUE (
    "RecordProcessID",
    "PinHash"
  ),
  CONSTRAINT "CK_FeaturePipelineVersion_Status" CHECK ("Status" IN ('Candidate', 'Active', 'Refused', 'Retired')),
  CONSTRAINT "CK_FeaturePipelineVersion_Metric" CHECK ("Metric" IN ('accuracy'))
);

COMMENT ON COLUMN __mj."FeatureValue"."PipelineVersion" IS 'Version of the Feature Pipeline (MJ: Feature Pipeline Versions.Version) that computed this value; part of the FeatureValueKey.';

COMMENT ON COLUMN __mj."FeatureValue"."AIModelID" IS 'Primary AI model the pipeline''s prompt is configured to run (highest-priority Active AI Prompt Model). Part of the FeatureValueKey; the model that actually answered is on the linked AI Prompt Run.';

COMMENT ON COLUMN __mj."FeatureValue"."ParametersHash" IS 'SHA-256 of the prompt''s inference parameters (temperature, topP, topK, minP, penalties, seed, response format, effort level, model parameters). Part of the FeatureValueKey.';

COMMENT ON COLUMN __mj."FeatureValue"."InputHash" IS 'SHA-256 of the normalized input the value was computed from (the Dedup Cache key hash when the pipeline caches). Part of the FeatureValueKey.';

COMMENT ON COLUMN __mj."FeatureValue"."ValueKeyHash" IS 'SHA-256 of the canonical FeatureValueKey (entity, record, feature, pipeline version, prompt version hash, AI model, parameters hash, input hash, source). Unique per pipeline: re-computing the same key updates the row instead of inserting a duplicate.';

COMMENT ON COLUMN __mj."FeatureValue"."Source" IS 'Who produced the value: Pipeline (computed by the Feature Pipeline) or Human (entered by a person, which write-back leaves in place).';

COMMENT ON COLUMN __mj."FeatureValueCache"."AIModelID" IS 'Primary AI model of the prompt that computed this cached result. Part of the cache key.';

COMMENT ON COLUMN __mj."FeatureValueCache"."ParametersHash" IS 'SHA-256 of the prompt''s inference parameters when this result was computed. Part of the cache key.';

COMMENT ON COLUMN __mj."ProcessRun"."ResultSummary" IS 'JSON summary of a Feature Pipeline run (FeaturePipelineRunResult); NULL for other work types.';

COMMENT ON COLUMN __mj."ProcessRunDetail"."Warnings" IS 'JSON array of the record''s non-fatal problems (for example, its Dedup Cache entry could not be stored) on a record that otherwise succeeded. NULL when there were none. Failures are in ErrorMessage, never here.';

COMMENT ON TABLE __mj."FeatureValue" IS NULL;

COMMENT ON TABLE __mj."FeatureValue" IS 'Feature values computed by Feature Pipelines (or entered by people), one row per Feature Value key, updated in place when the same key is recomputed.';

COMMENT ON TABLE __mj."FeaturePipelineVersion" IS 'One version of a Feature Pipeline: a distinct pin (spec hash, prompt version hash, primary AI model, parameters hash). A gated pipeline runs only under an Active version, and a version becomes Active only with a stored golden-set result at or above its declared threshold.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."Version" IS 'Monotonic version number within the pipeline (1, 2, ...).';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."PinHash" IS 'SHA-256 of the pin (SpecHash, PromptVersionHash, AIModelID, ParametersHash). Unique per pipeline.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."SpecHash" IS 'SHA-256 of the output-affecting parts of the DataFeatureSpec (Context, Outputs, PipelineType, Escalation, PromptID, ProcessorExtensionKey) and the OutputMapping.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."PromptID" IS 'The pipeline prompt this version runs.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."PromptVersionHash" IS 'Prompt version hash (template text, outputs, constraint block, pipeline type, escalation) of this version.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."AIModelID" IS 'Primary AI model of the prompt for this version.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."ParametersHash" IS 'SHA-256 of the prompt inference parameters for this version.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."Status" IS 'Candidate (registered, not yet allowed to write), Active (the version runs write), Refused (golden-set result below threshold), Retired (superseded by a later Active version).';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."Gated" IS 'True when the pipeline declares DataFeatureSpec.Activation: the version can become Active only through a stored golden-set result at or above Threshold.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."GoldenSetTestID" IS 'The MJ: Tests row holding the golden set this version was evaluated on.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."GoldenSetTestRunID" IS 'The MJ: Test Runs row of the evaluation whose result is stored here.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."Metric" IS 'Metric of the stored result: accuracy.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."Threshold" IS 'Declared activation threshold copied from DataFeatureSpec.Activation at evaluation time.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."ResultValue" IS 'Point estimate of the metric (the lowest per-output value when the pipeline has several outputs).';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."ResultLower" IS 'Lower bound of the 95% Wilson interval of ResultValue.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."ResultUpper" IS 'Upper bound of the 95% Wilson interval of ResultValue.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."ResultN" IS 'Number of golden cases scored.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."ResultDetails" IS 'JSON per-output results (correct, n, value, interval) and the per-case answers of the evaluation.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."ActivatedAt" IS 'When the version became Active.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."ApprovedByUserID" IS 'The user whose run activated the version (for an unattended activation, the Feature Pipeline Version Steward job''s user).';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."RetiredAt" IS 'When a later Active version superseded this one.';

COMMENT ON COLUMN __mj."FeaturePipelineVersion"."BackfilledAt" IS 'When the Feature Pipeline Version Steward finished the one backfill run of this activation of the version.';

/* =====================================================================================
 * EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * It contains the Entity and EntityField metadata inserts for MJ: Feature Pipeline Versions and the
 * new columns of MJ: Feature Values, MJ: Feature Value Caches, MJ: Process Runs and MJ: Process Run Details;
 * the regenerated base views; the spCreate / spUpdate / spDelete procedures; foreign-key indexes;
 * permission grants and extended properties.
 *
 * Do NOT edit it by hand. If the hand-written DDL above changes, re-run CodeGen and replace this
 * entire generated section.
 * ===================================================================================== */
/* SQL generated to create new entity MJ: Feature Pipeline Versions */
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
    'ca9e4797-3e8a-4942-afe9-274cd49872a7',
    'MJ: Feature Pipeline Versions',
    'Feature Pipeline Versions',
    'One version of a Feature Pipeline: a distinct pin (spec hash, prompt version hash, primary AI model, parameters hash). A gated pipeline runs only under an Active version, and a version becomes Active only with a stored golden-set result at or above its declared threshold.',
    NULL,
    'FeaturePipelineVersion',
    'vwFeaturePipelineVersions',
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
/* SQL generated to add new entity MJ: Feature Pipeline Versions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'ca9e4797-3e8a-4942-afe9-274cd49872a7',
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
/* SQL generated to add new permission for entity MJ: Feature Pipeline Versions for role UI */
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
  CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS UUID),
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
      "EntityID" = CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Feature Pipeline Versions for role Developer */
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
  CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS UUID),
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
      "EntityID" = CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Feature Pipeline Versions for role Integration */
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
  CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS UUID),
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
      "EntityID" = CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."FeaturePipelineVersion"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.FeaturePipelineVersion */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.FeaturePipelineVersion */
UPDATE __mj."FeaturePipelineVersion" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'FeaturePipelineVersion' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."FeaturePipelineVersion" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."FeaturePipelineVersion" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."FeaturePipelineVersion"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.FeaturePipelineVersion */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.FeaturePipelineVersion */
UPDATE __mj."FeaturePipelineVersion" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'FeaturePipelineVersion' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."FeaturePipelineVersion" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."FeaturePipelineVersion" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '52899340-a811-4b5f-aaf2-d8214bf87ddd' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('52899340-a811-4b5f-aaf2-d8214bf87ddd', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e934a165-c973-445d-8d4e-e17694354520' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'RecordProcessID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e934a165-c973-445d-8d4e-e17694354520', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'RecordProcessID', 'Record Process ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5b05ba2b-c65e-41a7-ae88-0df49abb963b' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'Version')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5b05ba2b-c65e-41a7-ae88-0df49abb963b', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'Version', 'Version', 'Monotonic version number within the pipeline (1, 2, ...).', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '69705ec9-fc16-472e-a335-d144d6a21c76' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'PinHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('69705ec9-fc16-472e-a335-d144d6a21c76', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'PinHash', 'Pin Hash', 'SHA-256 of the pin (SpecHash, PromptVersionHash, AIModelID, ParametersHash). Unique per pipeline.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '43668eee-8aa0-4133-a4a2-c1dd82aa8d43' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'SpecHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('43668eee-8aa0-4133-a4a2-c1dd82aa8d43', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'SpecHash', 'Spec Hash', 'SHA-256 of the output-affecting parts of the DataFeatureSpec (Context, Outputs, PipelineType, Escalation, PromptID, ProcessorExtensionKey) and the OutputMapping.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1929f7a-e8de-4478-9e49-d94ee34de1b6' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'PromptID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f1929f7a-e8de-4478-9e49-d94ee34de1b6', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'PromptID', 'Prompt ID', 'The pipeline prompt this version runs.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '73AD0238-8B56-EF11-991A-6045BDEBA539', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dc814c44-8c43-4a7c-b266-fe53b5cd531d' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'PromptVersionHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dc814c44-8c43-4a7c-b266-fe53b5cd531d', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'PromptVersionHash', 'Prompt Version Hash', 'Prompt version hash (template text, outputs, constraint block, pipeline type, escalation) of this version.', 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b5ea9619-094c-4520-825c-659c4ffeec70' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'AIModelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b5ea9619-094c-4520-825c-659c4ffeec70', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'AIModelID', 'AI Model ID', 'Primary AI model of the prompt for this version.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '18a9b06c-87e4-463b-87fd-eb9f84d91dca' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'ParametersHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('18a9b06c-87e4-463b-87fd-eb9f84d91dca', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'ParametersHash', 'Parameters Hash', 'SHA-256 of the prompt inference parameters for this version.', 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '33db8621-d45b-4e2f-9723-86d876ea8db3' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('33db8621-d45b-4e2f-9723-86d876ea8db3', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'Status', 'Status', 'Candidate (registered, not yet allowed to write), Active (the version runs write), Refused (golden-set result below threshold), Retired (superseded by a later Active version).', 'nvarchar', 40, 0, 0, FALSE, 'Candidate', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '479fcfea-63b9-418c-8505-14e31ea6ace8' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'Gated')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('479fcfea-63b9-418c-8505-14e31ea6ace8', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'Gated', 'Gated', 'True when the pipeline declares DataFeatureSpec.Activation: the version can become Active only through a stored golden-set result at or above Threshold.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e26e4ea8-5a11-4275-9eb1-438fa9b97f2b' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'GoldenSetTestID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e26e4ea8-5a11-4275-9eb1-438fa9b97f2b', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'GoldenSetTestID', 'Golden Set Test ID', 'The MJ: Tests row holding the golden set this version was evaluated on.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '1F949AD0-8C72-4846-8A0B-0B3D9F644231', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3692975f-204e-4eea-870a-0bc7526bfa29' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'GoldenSetTestRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3692975f-204e-4eea-870a-0bc7526bfa29', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'GoldenSetTestRunID', 'Golden Set Test Run ID', 'The MJ: Test Runs row of the evaluation whose result is stored here.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5e2ce44b-a3e0-4a00-b20b-fe08ddcee16c' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'Metric')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5e2ce44b-a3e0-4a00-b20b-fe08ddcee16c', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'Metric', 'Metric', 'Metric of the stored result: accuracy.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '78de1b90-07fa-4f6b-a429-134ebb6250a3' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'Threshold')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('78de1b90-07fa-4f6b-a429-134ebb6250a3', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'Threshold', 'Threshold', 'Declared activation threshold copied from DataFeatureSpec.Activation at evaluation time.', 'float', 8, 53, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a90e8c8a-6b05-4dc4-9b7d-ca587fcf5896' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'ResultValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a90e8c8a-6b05-4dc4-9b7d-ca587fcf5896', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'ResultValue', 'Result Value', 'Point estimate of the metric (the lowest per-output value when the pipeline has several outputs).', 'float', 8, 53, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '36665bcb-89c4-45d8-b321-f0dbc2ae1a07' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'ResultLower')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('36665bcb-89c4-45d8-b321-f0dbc2ae1a07', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'ResultLower', 'Result Lower', 'Lower bound of the 95% Wilson interval of ResultValue.', 'float', 8, 53, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '48242103-c83c-42b9-9591-5f34a3e50cbe' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'ResultUpper')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('48242103-c83c-42b9-9591-5f34a3e50cbe', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'ResultUpper', 'Result Upper', 'Upper bound of the 95% Wilson interval of ResultValue.', 'float', 8, 53, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1fef9ee3-6136-4599-be4a-9ce01eb247a4' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'ResultN')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1fef9ee3-6136-4599-be4a-9ce01eb247a4', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'ResultN', 'Result N', 'Number of golden cases scored.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5d1855bb-2a10-4b3e-90dc-c494720b6a24' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'ResultDetails')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5d1855bb-2a10-4b3e-90dc-c494720b6a24', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'ResultDetails', 'Result Details', 'JSON per-output results (correct, n, value, interval) and the per-case answers of the evaluation.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f4ae08ea-ff1e-4d5c-9388-464acbafbe62' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'ActivatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f4ae08ea-ff1e-4d5c-9388-464acbafbe62', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'ActivatedAt', 'Activated At', 'When the version became Active.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c4a91287-0f6f-430e-9467-b64e06f13880' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'ApprovedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c4a91287-0f6f-430e-9467-b64e06f13880', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'ApprovedByUserID', 'Approved By User ID', 'The user whose run activated the version (for an unattended activation, the Feature Pipeline Version Steward job''s user).', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9c8e8518-166c-414b-90d7-150c555869e9' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'RetiredAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9c8e8518-166c-414b-90d7-150c555869e9', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'RetiredAt', 'Retired At', 'When a later Active version superseded this one.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e907c585-94f1-48c9-901d-aee341cd0a5d' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'BackfilledAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e907c585-94f1-48c9-901d-aee341cd0a5d', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'BackfilledAt', 'Backfilled At', 'When the Feature Pipeline Version Steward finished the one backfill run of this activation of the version.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8b8cb8fc-cc9e-4496-9b59-f6d0fb67d7e5' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8b8cb8fc-cc9e-4496-9b59-f6d0fb67d7e5', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8d8a871d-f6b8-4f6e-b81b-79fb9368ba05' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8d8a871d-f6b8-4f6e-b81b-79fb9368ba05', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e5fa2d40-c49b-41cf-9a06-faddc56f821e' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'Warnings')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e5fa2d40-c49b-41cf-9a06-faddc56f821e', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F'), 'Warnings', 'Warnings', 'JSON array of the record''s non-fatal problems (for example, its Dedup Cache entry could not be stored) on a record that otherwise succeeded. NULL when there were none. Failures are in ErrorMessage, never here.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7e75d644-eca6-4490-ad2e-c3001ee1be9b' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'PipelineVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7e75d644-eca6-4490-ad2e-c3001ee1be9b', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'PipelineVersion', 'Pipeline Version', 'Version of the Feature Pipeline (MJ: Feature Pipeline Versions.Version) that computed this value; part of the FeatureValueKey.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad34364d-0dfe-4b09-9542-dfc20c47f8c4' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'AIModelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad34364d-0dfe-4b09-9542-dfc20c47f8c4', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'AIModelID', 'AI Model ID', 'Primary AI model the pipeline''s prompt is configured to run (highest-priority Active AI Prompt Model). Part of the FeatureValueKey; the model that actually answered is on the linked AI Prompt Run.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '795f432c-e51a-4714-82a4-83b5552e663d' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ParametersHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('795f432c-e51a-4714-82a4-83b5552e663d', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ParametersHash', 'Parameters Hash', 'SHA-256 of the prompt''s inference parameters (temperature, topP, topK, minP, penalties, seed, response format, effort level, model parameters). Part of the FeatureValueKey.', 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c5820eed-2b47-4d44-ada7-88c7fce66340' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'InputHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c5820eed-2b47-4d44-ada7-88c7fce66340', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'InputHash', 'Input Hash', 'SHA-256 of the normalized input the value was computed from (the Dedup Cache key hash when the pipeline caches). Part of the FeatureValueKey.', 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ed6a2c22-7502-4100-8a1a-4b8985158a9d' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'ValueKeyHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ed6a2c22-7502-4100-8a1a-4b8985158a9d', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'ValueKeyHash', 'Value Key Hash', 'SHA-256 of the canonical FeatureValueKey (entity, record, feature, pipeline version, prompt version hash, AI model, parameters hash, input hash, source). Unique per pipeline: re-computing the same key updates the row instead of inserting a duplicate.', 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '83c833af-df1f-43e9-a9a0-715ab5a9318b' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'Source')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('83c833af-df1f-43e9-a9a0-715ab5a9318b', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'Source', 'Source', 'Who produced the value: Pipeline (computed by the Feature Pipeline) or Human (entered by a person, which write-back leaves in place).', 'nvarchar', 40, 0, 0, FALSE, 'Pipeline', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd17a169b-1a6a-4edd-b080-25127058e592' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'ResultSummary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d17a169b-1a6a-4edd-b080-25127058e592', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA'), 'ResultSummary', 'Result Summary', 'JSON summary of a Feature Pipeline run (FeaturePipelineRunResult); NULL for other work types.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '155a1f54-e797-4c90-8b0d-224534b54187' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'AIModelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('155a1f54-e797-4c90-8b0d-224534b54187', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'AIModelID', 'AI Model ID', 'Primary AI model of the prompt that computed this cached result. Part of the cache key.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'de1f6ddc-0207-459e-a956-c1dba21d55e7' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'ParametersHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('de1f6ddc-0207-459e-a956-c1dba21d55e7', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'ParametersHash', 'Parameters Hash', 'SHA-256 of the prompt''s inference parameters when this result was computed. Part of the cache key.', 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 8122ff0e-c3f7-46d6-911f-6bb664390b2a */
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
    '8122ff0e-c3f7-46d6-911f-6bb664390b2a',
    '83C833AF-DF1F-43E9-A9A0-715AB5A9318B',
    1,
    'Human',
    'Human',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a98135f6-e8a9-44d9-bba0-b0ea2ad6cd49 */
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
    'a98135f6-e8a9-44d9-bba0-b0ea2ad6cd49',
    '83C833AF-DF1F-43E9-A9A0-715AB5A9318B',
    2,
    'Pipeline',
    'Pipeline',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 83C833AF-DF1F-43E9-A9A0-715AB5A9318B */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '83C833AF-DF1F-43E9-A9A0-715AB5A9318B';
/* SQL text to insert entity field value with ID ae0596ab-3b4c-4e9f-921d-02fe84ef4b48 */
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
    'ae0596ab-3b4c-4e9f-921d-02fe84ef4b48',
    '33DB8621-D45B-4E2F-9723-86D876EA8DB3',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID bfe2d869-9462-4352-b226-ae71316f1571 */
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
    'bfe2d869-9462-4352-b226-ae71316f1571',
    '33DB8621-D45B-4E2F-9723-86D876EA8DB3',
    2,
    'Candidate',
    'Candidate',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b31f07b6-f179-4b7e-93a1-d11b8588e492 */
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
    'b31f07b6-f179-4b7e-93a1-d11b8588e492',
    '33DB8621-D45B-4E2F-9723-86D876EA8DB3',
    3,
    'Refused',
    'Refused',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a01bc25c-ea2b-4d9a-a9dd-79631381192c */
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
    'a01bc25c-ea2b-4d9a-a9dd-79631381192c',
    '33DB8621-D45B-4E2F-9723-86D876EA8DB3',
    4,
    'Retired',
    'Retired',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 33DB8621-D45B-4E2F-9723-86D876EA8DB3 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '33DB8621-D45B-4E2F-9723-86D876EA8DB3';
/* SQL text to insert entity field value with ID f795c993-2dbd-406c-af8a-ba3483d6059d */
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
    'f795c993-2dbd-406c-af8a-ba3483d6059d',
    '5E2CE44B-A3E0-4A00-B20B-FE08DDCEE16C',
    1,
    'accuracy',
    'accuracy',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 5E2CE44B-A3E0-4A00-B20B-FE08DDCEE16C */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '5E2CE44B-A3E0-4A00-B20B-FE08DDCEE16C';
/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" IN (
    SELECT
      "e"."ID"
    FROM __mj."Entity" AS "e"
    WHERE
      "e"."AllowUserSearchAPI" = TRUE
      AND "e"."AutoUpdateAllowUserSearchAPI" = TRUE
      AND "e"."VirtualEntity" = FALSE
      AND COALESCE("e"."FullTextSearchEnabled", FALSE) = FALSE
      AND NOT "e"."SchemaName" IN ('sys', 'staging')
      AND NOT EXISTS(
        SELECT
          1
        FROM __mj."EntityField" AS "f2"
        WHERE
          "f2"."EntityID" = "e"."ID" AND "f2"."IncludeInUserSearchAPI" = TRUE
      )
  );
/* Create Entity Relationship: MJ: Tests -> MJ: Feature Pipeline Versions (One To Many via GoldenSetTestID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '79765c50-05b2-40c2-bca4-84cc4c18baec') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('79765c50-05b2-40c2-bca4-84cc4c18baec', '1F949AD0-8C72-4846-8A0B-0B3D9F644231', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'GoldenSetTestID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '1fe1dac5-9327-444f-a627-09a5ebb44c78') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1fe1dac5-9327-444f-a627-09a5ebb44c78', '73AD0238-8B56-EF11-991A-6045BDEBA539', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'PromptID', 'One To Many', TRUE, TRUE, 25, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f495b47e-3dee-40b1-a53d-241897e7ca0b') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f495b47e-3dee-40b1-a53d-241897e7ca0b', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'ApprovedByUserID', 'One To Many', TRUE, TRUE, 118, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '41346102-1574-4928-aa01-60ebba5858ab') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('41346102-1574-4928-aa01-60ebba5858ab', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'AIModelID', 'One To Many', TRUE, TRUE, 29, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5a44b453-40a9-4063-b6ab-f8440e2f2b8f') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5a44b453-40a9-4063-b6ab-f8440e2f2b8f', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'AIModelID', 'One To Many', TRUE, TRUE, 30, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a23724a9-5c51-4c37-97d0-c98a4521c34a') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a23724a9-5c51-4c37-97d0-c98a4521c34a', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', 'AIModelID', 'One To Many', TRUE, TRUE, 31, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '86705dd5-98ca-4bb2-8168-ed75106bf55a') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86705dd5-98ca-4bb2-8168-ed75106bf55a', '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'GoldenSetTestRunID', 'One To Many', TRUE, TRUE, 7, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '913b162c-a831-4859-b24a-7844dd0d194f') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('913b162c-a831-4859-b24a-7844dd0d194f', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'RecordProcessID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c506b56b-36a6-4ba6-b77e-33b0b0ade75d' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'RecordProcess')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c506b56b-36a6-4ba6-b77e-33b0b0ade75d', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'RecordProcess', 'Record Process', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '53db384f-a267-4da6-9884-10071cf0f72c' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'Prompt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('53db384f-a267-4da6-9884-10071cf0f72c', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'Prompt', 'Prompt', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2caf6828-cc0a-4cff-97c9-4371a90a20c3' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'AIModel')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2caf6828-cc0a-4cff-97c9-4371a90a20c3', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'AIModel', 'AI Model', NULL, 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c796c099-13e8-4291-9ab8-59c97f6e1093' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'GoldenSetTest')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c796c099-13e8-4291-9ab8-59c97f6e1093', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'GoldenSetTest', 'Golden Set Test', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '51b46495-6ea6-4df3-930a-216b17ddf105' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'GoldenSetTestRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('51b46495-6ea6-4df3-930a-216b17ddf105', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'GoldenSetTestRun', 'Golden Set Test Run', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9edbff82-7bb5-4287-8435-5903d4e86ab6' OR ("EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'ApprovedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9edbff82-7bb5-4287-8435-5903d4e86ab6', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' /* Entity: MJ: Feature Pipeline Versions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'), 'ApprovedByUser', 'Approved By User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9ad07904-3cf8-427a-9224-1601cc36361f' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'AIModel')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9ad07904-3cf8-427a-9224-1601cc36361f', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'AIModel', 'AI Model', NULL, 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '51ada067-84bf-4c97-8555-d302bfa26a34' OR ("EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND "Name" = 'AIModel')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('51ada067-84bf-4c97-8555-d302bfa26a34', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' /* Entity: MJ: Feature Value Caches */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'), 'AIModel', 'AI Model', NULL, 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '33DB8621-D45B-4E2F-9723-86D876EA8DB3' AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '78DE1B90-07FA-4F6B-A429-134EBB6250A3' AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'A90E8C8A-6B05-4DC4-9B7D-CA587FCF5896' AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'F4AE08EA-FF1E-4D5C-9388-464ACBAFBE62' AND "AutoUpdateDefaultInView" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '83C833AF-DF1F-43E9-A9A0-715AB5A9318B' AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 3 fields */
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.AIModelID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'AI Model'
WHERE
  "ID" = '155A1F54-E797-4C90-8B0D-224534B54187';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.ParametersHash */
UPDATE __mj."EntityField" SET "Category" = 'Hash Fingerprints', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'DE1F6DDC-0207-459E-A956-C1DBA21D55E7';
/* UPDATE Entity Field Category Info MJ: Feature Value Caches.AIModel */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '51ADA067-84BF-4C97-8555-D302BFA26A34';

/* Set categories for 1 fields */
/* UPDATE Entity Field Category Info MJ: Process Runs.ResultSummary */
UPDATE __mj."EntityField" SET "Category" = 'Progress and Results', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'D17A169B-1A6A-4EDD-B080-25127058E592';

/* Set categories for 1 fields */
/* UPDATE Entity Field Category Info MJ: Process Run Details.Warnings */
UPDATE __mj."EntityField" SET "Category" = 'Execution Results', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'E5FA2D40-C49B-41CF-9A06-FADDC56F821E';

/* Set categories for 7 fields */
/* UPDATE Entity Field Category Info MJ: Feature Values.PipelineVersion */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7E75D644-ECA6-4490-AD2E-C3001EE1BE9B';
/* UPDATE Entity Field Category Info MJ: Feature Values.AIModelID */
UPDATE __mj."EntityField" SET "Category" = 'AI Insights', "GeneratedFormSection" = 'Category', "DisplayName" = 'AI Model'
WHERE
  "ID" = 'AD34364D-0DFE-4B09-9542-DFC20C47F8C4';
/* UPDATE Entity Field Category Info MJ: Feature Values.ParametersHash */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '795F432C-E51A-4714-82A4-83B5552E663D';
/* UPDATE Entity Field Category Info MJ: Feature Values.InputHash */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C5820EED-2B47-4D44-ADA7-88C7FCE66340';
/* UPDATE Entity Field Category Info MJ: Feature Values.ValueKeyHash */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'ED6A2C22-7502-4100-8A1A-4B8985158A9D';
/* UPDATE Entity Field Category Info MJ: Feature Values.Source */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '83C833AF-DF1F-43E9-A9A0-715AB5A9318B';
/* UPDATE Entity Field Category Info MJ: Feature Values.AIModel */
UPDATE __mj."EntityField" SET "Category" = 'AI Insights', "GeneratedFormSection" = 'Category', "DisplayName" = 'AI Model Details'
WHERE
  "ID" = '9AD07904-3CF8-427A-9224-1601CC36361F';

/* Set categories for 32 fields */
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '52899340-A811-4B5F-AAF2-D8214BF87DDD';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.RecordProcessID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E934A165-C973-445D-8D4E-E17694354520';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Version */
UPDATE __mj."EntityField" SET "Category" = 'Version Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5B05BA2B-C65E-41A7-AE88-0DF49ABB963B';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.PinHash */
UPDATE __mj."EntityField" SET "Category" = 'Version Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '69705EC9-FC16-472E-A335-D144D6A21C76';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.SpecHash */
UPDATE __mj."EntityField" SET "Category" = 'Version Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '43668EEE-8AA0-4133-A4A2-C1DD82AA8D43';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.PromptID */
UPDATE __mj."EntityField" SET "Category" = 'Prompt and Model', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt'
WHERE
  "ID" = 'F1929F7A-E8DE-4478-9E49-D94EE34DE1B6';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.PromptVersionHash */
UPDATE __mj."EntityField" SET "Category" = 'Prompt and Model', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'DC814C44-8C43-4A7C-B266-FE53B5CD531D';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.AIModelID */
UPDATE __mj."EntityField" SET "Category" = 'Prompt and Model', "GeneratedFormSection" = 'Category', "DisplayName" = 'AI Model'
WHERE
  "ID" = 'B5EA9619-094C-4520-825C-659C4FFEEC70';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ParametersHash */
UPDATE __mj."EntityField" SET "Category" = 'Prompt and Model', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '18A9B06C-87E4-463B-87FD-EB9F84D91DCA';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Status */
UPDATE __mj."EntityField" SET "Category" = 'Status and Governance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '33DB8621-D45B-4E2F-9723-86D876EA8DB3';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Gated */
UPDATE __mj."EntityField" SET "Category" = 'Status and Governance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '479FCFEA-63B9-418C-8505-14E31EA6ACE8';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.GoldenSetTestID */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation and Results', "GeneratedFormSection" = 'Category', "DisplayName" = 'Golden Set Test'
WHERE
  "ID" = 'E26E4EA8-5A11-4275-9EB1-438FA9B97F2B';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.GoldenSetTestRunID */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation and Results', "GeneratedFormSection" = 'Category', "DisplayName" = 'Golden Set Test Run'
WHERE
  "ID" = '3692975F-204E-4EEA-870A-0BC7526BFA29';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Metric */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation and Results', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5E2CE44B-A3E0-4A00-B20B-FE08DDCEE16C';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Threshold */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation and Results', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '78DE1B90-07FA-4F6B-A429-134EBB6250A3';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ResultValue */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation and Results', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A90E8C8A-6B05-4DC4-9B7D-CA587FCF5896';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ResultLower */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation and Results', "GeneratedFormSection" = 'Category', "DisplayName" = 'Result Lower Bound'
WHERE
  "ID" = '36665BCB-89C4-45D8-B321-F0DBC2AE1A07';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ResultUpper */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation and Results', "GeneratedFormSection" = 'Category', "DisplayName" = 'Result Upper Bound'
WHERE
  "ID" = '48242103-C83C-42B9-9591-5F34A3E50CBE';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ResultN */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation and Results', "GeneratedFormSection" = 'Category', "DisplayName" = 'Result Sample Size (N)'
WHERE
  "ID" = '1FEF9EE3-6136-4599-BE4A-9CE01EB247A4';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ResultDetails */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation and Results', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '5D1855BB-2A10-4B3E-90DC-C494720B6A24';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ActivatedAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Stewardship', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F4AE08EA-FF1E-4D5C-9388-464ACBAFBE62';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ApprovedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Stewardship', "GeneratedFormSection" = 'Category', "DisplayName" = 'Approved By User'
WHERE
  "ID" = 'C4A91287-0F6F-430E-9467-B64E06F13880';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.RetiredAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Stewardship', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9C8E8518-166C-414B-90D7-150C555869E9';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.BackfilledAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Stewardship', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E907C585-94F1-48C9-901D-AEE341CD0A5D';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8B8CB8FC-CC9E-4496-9B59-F6D0FB67D7E5';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8D8A871D-F6B8-4F6E-B81B-79FB9368BA05';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.RecordProcess */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C506B56B-36A6-4BA6-B77E-33B0B0ADE75D';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Prompt */
UPDATE __mj."EntityField" SET "Category" = 'Prompt and Model', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt Text'
WHERE
  "ID" = '53DB384F-A267-4DA6-9884-10071CF0F72C';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.AIModel */
UPDATE __mj."EntityField" SET "Category" = 'Prompt and Model', "GeneratedFormSection" = 'Category', "DisplayName" = 'AI Model Name'
WHERE
  "ID" = '2CAF6828-CC0A-4CFF-97C9-4371A90A20C3';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.GoldenSetTest */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation and Results', "GeneratedFormSection" = 'Category', "DisplayName" = 'Golden Set Test Name'
WHERE
  "ID" = 'C796C099-13E8-4291-9AB8-59C97F6E1093';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.GoldenSetTestRun */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation and Results', "GeneratedFormSection" = 'Category', "DisplayName" = 'Golden Set Test Run Name'
WHERE
  "ID" = '51B46495-6EA6-4DF3-930A-216B17DDF105';
/* UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ApprovedByUser */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Stewardship', "GeneratedFormSection" = 'Category', "DisplayName" = 'Approved By User Name'
WHERE
  "ID" = '9EDBFF82-7BB5-4287-8435-5903D4E86AB6';

/* Set entity icon to fa fa-code-branch */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-code-branch', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e746a96d-2f5d-5823-8041-37e41801c19b', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'FieldCategoryInfo', '{
  "Evaluation and Results": {
    "description": "Golden set evaluation metrics, thresholds, statistical bounds, and detailed test result JSON data",
    "icon": "fa fa-chart-line"
  },
  "Prompt and Model": {
    "description": "Associated AI models, prompt references, inference parameters, and prompt configurations",
    "icon": "fa fa-robot"
  },
  "Status and Governance": {
    "description": "Lifecycle status, candidate states, and gating requirements for pipeline activation",
    "icon": "fa fa-flag"
  },
  "System Metadata": {
    "description": "System-managed audit trails and processing metadata",
    "icon": "fa fa-cog"
  },
  "Timeline and Stewardship": {
    "description": "Activation, retirement, backfill timestamps, and approval stewardship user details",
    "icon": "fa fa-history"
  },
  "Version Configuration": {
    "description": "Core pin hashes, specification hashes, and monotonic version identifiers",
    "icon": "fa fa-sliders-h"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c898220c-ba4f-58b3-99ce-2e432315cdea', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'FieldCategoryIcons', '{
  "Evaluation and Results": "fa fa-chart-line",
  "Prompt and Model": "fa fa-robot",
  "Status and Governance": "fa fa-flag",
  "System Metadata": "fa fa-cog",
  "Timeline and Stewardship": "fa fa-history",
  "Version Configuration": "fa fa-sliders-h"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Pipeline Versions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_pipeline_version_record_process_id"
    ON "__mj"."FeaturePipelineVersion" ("RecordProcessID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_pipeline_version_prompt_id"
    ON "__mj"."FeaturePipelineVersion" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_pipeline_version_ai_model_id"
    ON "__mj"."FeaturePipelineVersion" ("AIModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_pipeline_version_golden_set_test_id"
    ON "__mj"."FeaturePipelineVersion" ("GoldenSetTestID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_pipeline_version_golden_set_test_run_i"
    ON "__mj"."FeaturePipelineVersion" ("GoldenSetTestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_pipeline_version_approved_by_user_id"
    ON "__mj"."FeaturePipelineVersion" ("ApprovedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Pipeline Versions
-- Item: vwFeaturePipelineVersions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Feature Pipeline Versions
-----               SCHEMA:      __mj
-----               BASE TABLE:  FeaturePipelineVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwFeaturePipelineVersions"
AS
SELECT
    f.*,
    MJRecordProcess_RecordProcessID."Name" AS "RecordProcess",
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJAIModel_AIModelID."Name" AS "AIModel",
    MJTest_GoldenSetTestID."Name" AS "GoldenSetTest",
    MJTestRun_GoldenSetTestRunID."Test" AS "GoldenSetTestRun",
    MJUser_ApprovedByUserID."Name" AS "ApprovedByUser"
FROM
    "__mj"."FeaturePipelineVersion" AS f
INNER JOIN
    "__mj"."RecordProcess" AS MJRecordProcess_RecordProcessID
  ON
    "f"."RecordProcessID" = MJRecordProcess_RecordProcessID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "f"."PromptID" = MJAIPrompt_PromptID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_AIModelID
  ON
    "f"."AIModelID" = MJAIModel_AIModelID."ID"
LEFT OUTER JOIN
    "__mj"."Test" AS MJTest_GoldenSetTestID
  ON
    "f"."GoldenSetTestID" = MJTest_GoldenSetTestID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_GoldenSetTestRunID
  ON
    "f"."GoldenSetTestRunID" = MJTestRun_GoldenSetTestRunID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_ApprovedByUserID
  ON
    "f"."ApprovedByUserID" = MJUser_ApprovedByUserID."ID"
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
        AND tc.relname = 'vwFeaturePipelineVersions'
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
                           AND tc.relname = 'vwFeaturePipelineVersions'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwFeaturePipelineVersions" CASCADE;
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
GRANT SELECT ON "__mj"."vwFeaturePipelineVersions" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwFeaturePipelineVersions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwFeaturePipelineVersions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Pipeline Versions
-- Item: spCreateFeaturePipelineVersion
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR FeaturePipelineVersion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateFeaturePipelineVersion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateFeaturePipelineVersion"(
    p_id UUID DEFAULT NULL,
    p_recordprocessid UUID DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_pinhash varchar(64) DEFAULT NULL,
    p_spechash varchar(64) DEFAULT NULL,
    p_promptid_clear boolean DEFAULT false,
    p_promptid UUID DEFAULT NULL,
    p_promptversionhash_clear boolean DEFAULT false,
    p_promptversionhash varchar(64) DEFAULT NULL,
    p_aimodelid_clear boolean DEFAULT false,
    p_aimodelid UUID DEFAULT NULL,
    p_parametershash_clear boolean DEFAULT false,
    p_parametershash varchar(64) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_gated BOOLEAN DEFAULT NULL,
    p_goldensettestid_clear boolean DEFAULT false,
    p_goldensettestid UUID DEFAULT NULL,
    p_goldensettestrunid_clear boolean DEFAULT false,
    p_goldensettestrunid UUID DEFAULT NULL,
    p_metric_clear boolean DEFAULT false,
    p_metric varchar(20) DEFAULT NULL,
    p_threshold_clear boolean DEFAULT false,
    p_threshold float(53) DEFAULT NULL,
    p_resultvalue_clear boolean DEFAULT false,
    p_resultvalue float(53) DEFAULT NULL,
    p_resultlower_clear boolean DEFAULT false,
    p_resultlower float(53) DEFAULT NULL,
    p_resultupper_clear boolean DEFAULT false,
    p_resultupper float(53) DEFAULT NULL,
    p_resultn_clear boolean DEFAULT false,
    p_resultn int DEFAULT NULL,
    p_resultdetails_clear boolean DEFAULT false,
    p_resultdetails TEXT DEFAULT NULL,
    p_activatedat_clear boolean DEFAULT false,
    p_activatedat TIMESTAMPTZ DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_retiredat_clear boolean DEFAULT false,
    p_retiredat TIMESTAMPTZ DEFAULT NULL,
    p_backfilledat_clear boolean DEFAULT false,
    p_backfilledat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwFeaturePipelineVersions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."FeaturePipelineVersion"
        (
            "ID",
            "RecordProcessID",
                "Version",
                "PinHash",
                "SpecHash",
                "PromptID",
                "PromptVersionHash",
                "AIModelID",
                "ParametersHash",
                "Status",
                "Gated",
                "GoldenSetTestID",
                "GoldenSetTestRunID",
                "Metric",
                "Threshold",
                "ResultValue",
                "ResultLower",
                "ResultUpper",
                "ResultN",
                "ResultDetails",
                "ActivatedAt",
                "ApprovedByUserID",
                "RetiredAt",
                "BackfilledAt"
        )
    VALUES
        (
            v_new_id,
            p_recordprocessid,
                p_version,
                p_pinhash,
                p_spechash,
                CASE WHEN p_promptid_clear = true THEN NULL ELSE COALESCE(p_promptid, NULL) END,
                CASE WHEN p_promptversionhash_clear = true THEN NULL ELSE COALESCE(p_promptversionhash, NULL) END,
                CASE WHEN p_aimodelid_clear = true THEN NULL ELSE COALESCE(p_aimodelid, NULL) END,
                CASE WHEN p_parametershash_clear = true THEN NULL ELSE COALESCE(p_parametershash, NULL) END,
                COALESCE(p_status, 'Candidate'),
                COALESCE(p_gated, FALSE),
                CASE WHEN p_goldensettestid_clear = true THEN NULL ELSE COALESCE(p_goldensettestid, NULL) END,
                CASE WHEN p_goldensettestrunid_clear = true THEN NULL ELSE COALESCE(p_goldensettestrunid, NULL) END,
                CASE WHEN p_metric_clear = true THEN NULL ELSE COALESCE(p_metric, NULL) END,
                CASE WHEN p_threshold_clear = true THEN NULL ELSE COALESCE(p_threshold, NULL) END,
                CASE WHEN p_resultvalue_clear = true THEN NULL ELSE COALESCE(p_resultvalue, NULL) END,
                CASE WHEN p_resultlower_clear = true THEN NULL ELSE COALESCE(p_resultlower, NULL) END,
                CASE WHEN p_resultupper_clear = true THEN NULL ELSE COALESCE(p_resultupper, NULL) END,
                CASE WHEN p_resultn_clear = true THEN NULL ELSE COALESCE(p_resultn, NULL) END,
                CASE WHEN p_resultdetails_clear = true THEN NULL ELSE COALESCE(p_resultdetails, NULL) END,
                CASE WHEN p_activatedat_clear = true THEN NULL ELSE COALESCE(p_activatedat, NULL) END,
                CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, NULL) END,
                CASE WHEN p_retiredat_clear = true THEN NULL ELSE COALESCE(p_retiredat, NULL) END,
                CASE WHEN p_backfilledat_clear = true THEN NULL ELSE COALESCE(p_backfilledat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwFeaturePipelineVersions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFeaturePipelineVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFeaturePipelineVersion" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Pipeline Versions
-- Item: spUpdateFeaturePipelineVersion
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR FeaturePipelineVersion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateFeaturePipelineVersion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateFeaturePipelineVersion"(
    p_id UUID,
    p_recordprocessid UUID DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_pinhash varchar(64) DEFAULT NULL,
    p_spechash varchar(64) DEFAULT NULL,
    p_promptid_clear boolean DEFAULT false,
    p_promptid UUID DEFAULT NULL,
    p_promptversionhash_clear boolean DEFAULT false,
    p_promptversionhash varchar(64) DEFAULT NULL,
    p_aimodelid_clear boolean DEFAULT false,
    p_aimodelid UUID DEFAULT NULL,
    p_parametershash_clear boolean DEFAULT false,
    p_parametershash varchar(64) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_gated BOOLEAN DEFAULT NULL,
    p_goldensettestid_clear boolean DEFAULT false,
    p_goldensettestid UUID DEFAULT NULL,
    p_goldensettestrunid_clear boolean DEFAULT false,
    p_goldensettestrunid UUID DEFAULT NULL,
    p_metric_clear boolean DEFAULT false,
    p_metric varchar(20) DEFAULT NULL,
    p_threshold_clear boolean DEFAULT false,
    p_threshold float(53) DEFAULT NULL,
    p_resultvalue_clear boolean DEFAULT false,
    p_resultvalue float(53) DEFAULT NULL,
    p_resultlower_clear boolean DEFAULT false,
    p_resultlower float(53) DEFAULT NULL,
    p_resultupper_clear boolean DEFAULT false,
    p_resultupper float(53) DEFAULT NULL,
    p_resultn_clear boolean DEFAULT false,
    p_resultn int DEFAULT NULL,
    p_resultdetails_clear boolean DEFAULT false,
    p_resultdetails TEXT DEFAULT NULL,
    p_activatedat_clear boolean DEFAULT false,
    p_activatedat TIMESTAMPTZ DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_retiredat_clear boolean DEFAULT false,
    p_retiredat TIMESTAMPTZ DEFAULT NULL,
    p_backfilledat_clear boolean DEFAULT false,
    p_backfilledat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwFeaturePipelineVersions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."FeaturePipelineVersion"
    SET
        "RecordProcessID" = COALESCE(p_recordprocessid, "RecordProcessID"),
        "Version" = COALESCE(p_version, "Version"),
        "PinHash" = COALESCE(p_pinhash, "PinHash"),
        "SpecHash" = COALESCE(p_spechash, "SpecHash"),
        "PromptID" = CASE WHEN p_promptid_clear = true THEN NULL ELSE COALESCE(p_promptid, "PromptID") END,
        "PromptVersionHash" = CASE WHEN p_promptversionhash_clear = true THEN NULL ELSE COALESCE(p_promptversionhash, "PromptVersionHash") END,
        "AIModelID" = CASE WHEN p_aimodelid_clear = true THEN NULL ELSE COALESCE(p_aimodelid, "AIModelID") END,
        "ParametersHash" = CASE WHEN p_parametershash_clear = true THEN NULL ELSE COALESCE(p_parametershash, "ParametersHash") END,
        "Status" = COALESCE(p_status, "Status"),
        "Gated" = COALESCE(p_gated, "Gated"),
        "GoldenSetTestID" = CASE WHEN p_goldensettestid_clear = true THEN NULL ELSE COALESCE(p_goldensettestid, "GoldenSetTestID") END,
        "GoldenSetTestRunID" = CASE WHEN p_goldensettestrunid_clear = true THEN NULL ELSE COALESCE(p_goldensettestrunid, "GoldenSetTestRunID") END,
        "Metric" = CASE WHEN p_metric_clear = true THEN NULL ELSE COALESCE(p_metric, "Metric") END,
        "Threshold" = CASE WHEN p_threshold_clear = true THEN NULL ELSE COALESCE(p_threshold, "Threshold") END,
        "ResultValue" = CASE WHEN p_resultvalue_clear = true THEN NULL ELSE COALESCE(p_resultvalue, "ResultValue") END,
        "ResultLower" = CASE WHEN p_resultlower_clear = true THEN NULL ELSE COALESCE(p_resultlower, "ResultLower") END,
        "ResultUpper" = CASE WHEN p_resultupper_clear = true THEN NULL ELSE COALESCE(p_resultupper, "ResultUpper") END,
        "ResultN" = CASE WHEN p_resultn_clear = true THEN NULL ELSE COALESCE(p_resultn, "ResultN") END,
        "ResultDetails" = CASE WHEN p_resultdetails_clear = true THEN NULL ELSE COALESCE(p_resultdetails, "ResultDetails") END,
        "ActivatedAt" = CASE WHEN p_activatedat_clear = true THEN NULL ELSE COALESCE(p_activatedat, "ActivatedAt") END,
        "ApprovedByUserID" = CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, "ApprovedByUserID") END,
        "RetiredAt" = CASE WHEN p_retiredat_clear = true THEN NULL ELSE COALESCE(p_retiredat, "RetiredAt") END,
        "BackfilledAt" = CASE WHEN p_backfilledat_clear = true THEN NULL ELSE COALESCE(p_backfilledat, "BackfilledAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwFeaturePipelineVersions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFeaturePipelineVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFeaturePipelineVersion" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FeaturePipelineVersion table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_feature_pipeline_version"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_feature_pipeline_version" ON "__mj"."FeaturePipelineVersion";

CREATE TRIGGER "trg_update_feature_pipeline_version"
BEFORE UPDATE ON "__mj"."FeaturePipelineVersion"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_feature_pipeline_version"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Pipeline Versions
-- Item: spDeleteFeaturePipelineVersion
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR FeaturePipelineVersion
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteFeaturePipelineVersion'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteFeaturePipelineVersion"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."FeaturePipelineVersion"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFeaturePipelineVersion" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFeaturePipelineVersion" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Value Caches
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_cache_record_process_id"
    ON "__mj"."FeatureValueCache" ("RecordProcessID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_cache_prompt_id"
    ON "__mj"."FeatureValueCache" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_cache_ai_model_id"
    ON "__mj"."FeatureValueCache" ("AIModelID");

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
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJAIModel_AIModelID."Name" AS "AIModel"
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
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_AIModelID
  ON
    "f"."AIModelID" = MJAIModel_AIModelID."ID"
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
        AND tc.relname = 'vwFeatureValueCaches'
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
                           AND tc.relname = 'vwFeatureValueCaches'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
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
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_aimodelid_clear boolean DEFAULT false,
    p_aimodelid UUID DEFAULT NULL,
    p_parametershash_clear boolean DEFAULT false,
    p_parametershash varchar(64) DEFAULT NULL
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
                "ExpiresAt",
                "AIModelID",
                "ParametersHash"
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
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END,
                CASE WHEN p_aimodelid_clear = true THEN NULL ELSE COALESCE(p_aimodelid, NULL) END,
                CASE WHEN p_parametershash_clear = true THEN NULL ELSE COALESCE(p_parametershash, NULL) END
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
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_aimodelid_clear boolean DEFAULT false,
    p_aimodelid UUID DEFAULT NULL,
    p_parametershash_clear boolean DEFAULT false,
    p_parametershash varchar(64) DEFAULT NULL
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
        "ExpiresAt" = CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, "ExpiresAt") END,
        "AIModelID" = CASE WHEN p_aimodelid_clear = true THEN NULL ELSE COALESCE(p_aimodelid, "AIModelID") END,
        "ParametersHash" = CASE WHEN p_parametershash_clear = true THEN NULL ELSE COALESCE(p_parametershash, "ParametersHash") END
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

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_ai_model_id"
    ON "__mj"."FeatureValue" ("AIModelID");

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
    MJFeatureValueCache_FeatureValueCacheID."KeyDisplay" AS "FeatureValueCache",
    MJAIModel_AIModelID."Name" AS "AIModel"
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
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_AIModelID
  ON
    "f"."AIModelID" = MJAIModel_AIModelID."ID"
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
        AND tc.relname = 'vwFeatureValues'
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
                           AND tc.relname = 'vwFeatureValues'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
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
    p_computedat TIMESTAMPTZ DEFAULT NULL,
    p_pipelineversion_clear boolean DEFAULT false,
    p_pipelineversion int DEFAULT NULL,
    p_aimodelid_clear boolean DEFAULT false,
    p_aimodelid UUID DEFAULT NULL,
    p_parametershash_clear boolean DEFAULT false,
    p_parametershash varchar(64) DEFAULT NULL,
    p_inputhash_clear boolean DEFAULT false,
    p_inputhash varchar(64) DEFAULT NULL,
    p_valuekeyhash_clear boolean DEFAULT false,
    p_valuekeyhash varchar(64) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL
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
                "ComputedAt",
                "PipelineVersion",
                "AIModelID",
                "ParametersHash",
                "InputHash",
                "ValueKeyHash",
                "Source"
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
                COALESCE(p_computedat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_pipelineversion_clear = true THEN NULL ELSE COALESCE(p_pipelineversion, NULL) END,
                CASE WHEN p_aimodelid_clear = true THEN NULL ELSE COALESCE(p_aimodelid, NULL) END,
                CASE WHEN p_parametershash_clear = true THEN NULL ELSE COALESCE(p_parametershash, NULL) END,
                CASE WHEN p_inputhash_clear = true THEN NULL ELSE COALESCE(p_inputhash, NULL) END,
                CASE WHEN p_valuekeyhash_clear = true THEN NULL ELSE COALESCE(p_valuekeyhash, NULL) END,
                COALESCE(p_source, 'Pipeline')
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
    p_computedat TIMESTAMPTZ DEFAULT NULL,
    p_pipelineversion_clear boolean DEFAULT false,
    p_pipelineversion int DEFAULT NULL,
    p_aimodelid_clear boolean DEFAULT false,
    p_aimodelid UUID DEFAULT NULL,
    p_parametershash_clear boolean DEFAULT false,
    p_parametershash varchar(64) DEFAULT NULL,
    p_inputhash_clear boolean DEFAULT false,
    p_inputhash varchar(64) DEFAULT NULL,
    p_valuekeyhash_clear boolean DEFAULT false,
    p_valuekeyhash varchar(64) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL
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
        "ComputedAt" = COALESCE(p_computedat, "ComputedAt"),
        "PipelineVersion" = CASE WHEN p_pipelineversion_clear = true THEN NULL ELSE COALESCE(p_pipelineversion, "PipelineVersion") END,
        "AIModelID" = CASE WHEN p_aimodelid_clear = true THEN NULL ELSE COALESCE(p_aimodelid, "AIModelID") END,
        "ParametersHash" = CASE WHEN p_parametershash_clear = true THEN NULL ELSE COALESCE(p_parametershash, "ParametersHash") END,
        "InputHash" = CASE WHEN p_inputhash_clear = true THEN NULL ELSE COALESCE(p_inputhash, "InputHash") END,
        "ValueKeyHash" = CASE WHEN p_valuekeyhash_clear = true THEN NULL ELSE COALESCE(p_valuekeyhash, "ValueKeyHash") END,
        "Source" = COALESCE(p_source, "Source")
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
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_process_run_id"
    ON "__mj"."ProcessRunDetail" ("ProcessRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_entity_id"
    ON "__mj"."ProcessRunDetail" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_action_execution_log_id"
    ON "__mj"."ProcessRunDetail" ("ActionExecutionLogID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_ai_agent_run_id"
    ON "__mj"."ProcessRunDetail" ("AIAgentRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: vwProcessRunDetails
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Process Run Details
-----               SCHEMA:      __mj
-----               BASE TABLE:  ProcessRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwProcessRunDetails"
AS
SELECT
    p.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJActionExecutionLog_ActionExecutionLogID."Action" AS "ActionExecutionLog",
    MJAIAgentRun_AIAgentRunID."RunName" AS "AIAgentRun"
FROM
    "__mj"."ProcessRunDetail" AS p
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "p"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "__mj"."vwActionExecutionLogs" AS MJActionExecutionLog_ActionExecutionLogID
  ON
    "p"."ActionExecutionLogID" = MJActionExecutionLog_ActionExecutionLogID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_AIAgentRunID
  ON
    "p"."AIAgentRunID" = MJAIAgentRun_AIAgentRunID."ID"
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
        AND tc.relname = 'vwProcessRunDetails'
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
                           AND tc.relname = 'vwProcessRunDetails'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwProcessRunDetails" CASCADE;
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
GRANT SELECT ON "__mj"."vwProcessRunDetails" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwProcessRunDetails" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwProcessRunDetails" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: spCreateProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateProcessRunDetail"(
    p_id UUID DEFAULT NULL,
    p_processrunid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_durationms_clear boolean DEFAULT false,
    p_durationms int DEFAULT NULL,
    p_attemptcount int DEFAULT NULL,
    p_resultpayload_clear boolean DEFAULT false,
    p_resultpayload TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_actionexecutionlogid_clear boolean DEFAULT false,
    p_actionexecutionlogid UUID DEFAULT NULL,
    p_aiagentrunid_clear boolean DEFAULT false,
    p_aiagentrunid UUID DEFAULT NULL,
    p_warnings_clear boolean DEFAULT false,
    p_warnings TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwProcessRunDetails" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ProcessRunDetail"
        (
            "ID",
            "ProcessRunID",
                "EntityID",
                "RecordID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "DurationMs",
                "AttemptCount",
                "ResultPayload",
                "ErrorMessage",
                "ActionExecutionLogID",
                "AIAgentRunID",
                "Warnings"
        )
    VALUES
        (
            v_new_id,
            p_processrunid,
                p_entityid,
                p_recordid,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_durationms_clear = true THEN NULL ELSE COALESCE(p_durationms, NULL) END,
                COALESCE(p_attemptcount, 0),
                CASE WHEN p_resultpayload_clear = true THEN NULL ELSE COALESCE(p_resultpayload, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_actionexecutionlogid_clear = true THEN NULL ELSE COALESCE(p_actionexecutionlogid, NULL) END,
                CASE WHEN p_aiagentrunid_clear = true THEN NULL ELSE COALESCE(p_aiagentrunid, NULL) END,
                CASE WHEN p_warnings_clear = true THEN NULL ELSE COALESCE(p_warnings, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwProcessRunDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateProcessRunDetail" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: spUpdateProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateProcessRunDetail"(
    p_id UUID,
    p_processrunid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_durationms_clear boolean DEFAULT false,
    p_durationms int DEFAULT NULL,
    p_attemptcount int DEFAULT NULL,
    p_resultpayload_clear boolean DEFAULT false,
    p_resultpayload TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_actionexecutionlogid_clear boolean DEFAULT false,
    p_actionexecutionlogid UUID DEFAULT NULL,
    p_aiagentrunid_clear boolean DEFAULT false,
    p_aiagentrunid UUID DEFAULT NULL,
    p_warnings_clear boolean DEFAULT false,
    p_warnings TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwProcessRunDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ProcessRunDetail"
    SET
        "ProcessRunID" = COALESCE(p_processrunid, "ProcessRunID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "DurationMs" = CASE WHEN p_durationms_clear = true THEN NULL ELSE COALESCE(p_durationms, "DurationMs") END,
        "AttemptCount" = COALESCE(p_attemptcount, "AttemptCount"),
        "ResultPayload" = CASE WHEN p_resultpayload_clear = true THEN NULL ELSE COALESCE(p_resultpayload, "ResultPayload") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "ActionExecutionLogID" = CASE WHEN p_actionexecutionlogid_clear = true THEN NULL ELSE COALESCE(p_actionexecutionlogid, "ActionExecutionLogID") END,
        "AIAgentRunID" = CASE WHEN p_aiagentrunid_clear = true THEN NULL ELSE COALESCE(p_aiagentrunid, "AIAgentRunID") END,
        "Warnings" = CASE WHEN p_warnings_clear = true THEN NULL ELSE COALESCE(p_warnings, "Warnings") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwProcessRunDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateProcessRunDetail" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProcessRunDetail table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_process_run_detail"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_process_run_detail" ON "__mj"."ProcessRunDetail";

CREATE TRIGGER "trg_update_process_run_detail"
BEFORE UPDATE ON "__mj"."ProcessRunDetail"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_process_run_detail"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: spDeleteProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteProcessRunDetail"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ProcessRunDetail"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteProcessRunDetail" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_record_process_id"
    ON "__mj"."ProcessRun" ("RecordProcessID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_entity_id"
    ON "__mj"."ProcessRun" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_scheduled_job_run_id"
    ON "__mj"."ProcessRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_started_by_user_id"
    ON "__mj"."ProcessRun" ("StartedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: vwProcessRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Process Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  ProcessRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwProcessRuns"
AS
SELECT
    p.*,
    MJRecordProcess_RecordProcessID."Name" AS "RecordProcess",
    MJEntity_EntityID."Name" AS "Entity",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun",
    MJUser_StartedByUserID."Name" AS "StartedByUser"
FROM
    "__mj"."ProcessRun" AS p
LEFT OUTER JOIN
    "__mj"."RecordProcess" AS MJRecordProcess_RecordProcessID
  ON
    "p"."RecordProcessID" = MJRecordProcess_RecordProcessID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "p"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "__mj"."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "p"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_StartedByUserID
  ON
    "p"."StartedByUserID" = MJUser_StartedByUserID."ID"
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
        AND tc.relname = 'vwProcessRuns'
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
                           AND tc.relname = 'vwProcessRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwProcessRuns" CASCADE;
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
GRANT SELECT ON "__mj"."vwProcessRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwProcessRuns" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwProcessRuns" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: spCreateProcessRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ProcessRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateProcessRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateProcessRun"(
    p_id UUID DEFAULT NULL,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_triggeredby varchar(20) DEFAULT NULL,
    p_sourcetype varchar(20) DEFAULT NULL,
    p_sourceid_clear boolean DEFAULT false,
    p_sourceid UUID DEFAULT NULL,
    p_sourcefilter_clear boolean DEFAULT false,
    p_sourcefilter TEXT DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_starttime_clear boolean DEFAULT false,
    p_starttime TIMESTAMPTZ DEFAULT NULL,
    p_endtime_clear boolean DEFAULT false,
    p_endtime TIMESTAMPTZ DEFAULT NULL,
    p_totalitemcount_clear boolean DEFAULT false,
    p_totalitemcount int DEFAULT NULL,
    p_processeditems int DEFAULT NULL,
    p_successcount int DEFAULT NULL,
    p_errorcount int DEFAULT NULL,
    p_skippedcount int DEFAULT NULL,
    p_lastprocessedoffset_clear boolean DEFAULT false,
    p_lastprocessedoffset int DEFAULT NULL,
    p_lastprocessedkey_clear boolean DEFAULT false,
    p_lastprocessedkey varchar(450) DEFAULT NULL,
    p_batchsize_clear boolean DEFAULT false,
    p_batchsize int DEFAULT NULL,
    p_cancellationrequested BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_startedbyuserid_clear boolean DEFAULT false,
    p_startedbyuserid UUID DEFAULT NULL,
    p_dryrun BOOLEAN DEFAULT NULL,
    p_resultsummary_clear boolean DEFAULT false,
    p_resultsummary TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwProcessRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ProcessRun"
        (
            "ID",
            "RecordProcessID",
                "EntityID",
                "TriggeredBy",
                "SourceType",
                "SourceID",
                "SourceFilter",
                "ScheduledJobRunID",
                "Status",
                "StartTime",
                "EndTime",
                "TotalItemCount",
                "ProcessedItems",
                "SuccessCount",
                "ErrorCount",
                "SkippedCount",
                "LastProcessedOffset",
                "LastProcessedKey",
                "BatchSize",
                "CancellationRequested",
                "Configuration",
                "ErrorMessage",
                "StartedByUserID",
                "DryRun",
                "ResultSummary"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, NULL) END,
                CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, NULL) END,
                p_triggeredby,
                p_sourcetype,
                CASE WHEN p_sourceid_clear = true THEN NULL ELSE COALESCE(p_sourceid, NULL) END,
                CASE WHEN p_sourcefilter_clear = true THEN NULL ELSE COALESCE(p_sourcefilter, NULL) END,
                CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_starttime_clear = true THEN NULL ELSE COALESCE(p_starttime, NULL) END,
                CASE WHEN p_endtime_clear = true THEN NULL ELSE COALESCE(p_endtime, NULL) END,
                CASE WHEN p_totalitemcount_clear = true THEN NULL ELSE COALESCE(p_totalitemcount, NULL) END,
                COALESCE(p_processeditems, 0),
                COALESCE(p_successcount, 0),
                COALESCE(p_errorcount, 0),
                COALESCE(p_skippedcount, 0),
                CASE WHEN p_lastprocessedoffset_clear = true THEN NULL ELSE COALESCE(p_lastprocessedoffset, NULL) END,
                CASE WHEN p_lastprocessedkey_clear = true THEN NULL ELSE COALESCE(p_lastprocessedkey, NULL) END,
                CASE WHEN p_batchsize_clear = true THEN NULL ELSE COALESCE(p_batchsize, NULL) END,
                COALESCE(p_cancellationrequested, FALSE),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_startedbyuserid_clear = true THEN NULL ELSE COALESCE(p_startedbyuserid, NULL) END,
                COALESCE(p_dryrun, FALSE),
                CASE WHEN p_resultsummary_clear = true THEN NULL ELSE COALESCE(p_resultsummary, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwProcessRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateProcessRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateProcessRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: spUpdateProcessRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ProcessRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateProcessRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateProcessRun"(
    p_id UUID,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_triggeredby varchar(20) DEFAULT NULL,
    p_sourcetype varchar(20) DEFAULT NULL,
    p_sourceid_clear boolean DEFAULT false,
    p_sourceid UUID DEFAULT NULL,
    p_sourcefilter_clear boolean DEFAULT false,
    p_sourcefilter TEXT DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_starttime_clear boolean DEFAULT false,
    p_starttime TIMESTAMPTZ DEFAULT NULL,
    p_endtime_clear boolean DEFAULT false,
    p_endtime TIMESTAMPTZ DEFAULT NULL,
    p_totalitemcount_clear boolean DEFAULT false,
    p_totalitemcount int DEFAULT NULL,
    p_processeditems int DEFAULT NULL,
    p_successcount int DEFAULT NULL,
    p_errorcount int DEFAULT NULL,
    p_skippedcount int DEFAULT NULL,
    p_lastprocessedoffset_clear boolean DEFAULT false,
    p_lastprocessedoffset int DEFAULT NULL,
    p_lastprocessedkey_clear boolean DEFAULT false,
    p_lastprocessedkey varchar(450) DEFAULT NULL,
    p_batchsize_clear boolean DEFAULT false,
    p_batchsize int DEFAULT NULL,
    p_cancellationrequested BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_startedbyuserid_clear boolean DEFAULT false,
    p_startedbyuserid UUID DEFAULT NULL,
    p_dryrun BOOLEAN DEFAULT NULL,
    p_resultsummary_clear boolean DEFAULT false,
    p_resultsummary TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwProcessRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ProcessRun"
    SET
        "RecordProcessID" = CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, "RecordProcessID") END,
        "EntityID" = CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, "EntityID") END,
        "TriggeredBy" = COALESCE(p_triggeredby, "TriggeredBy"),
        "SourceType" = COALESCE(p_sourcetype, "SourceType"),
        "SourceID" = CASE WHEN p_sourceid_clear = true THEN NULL ELSE COALESCE(p_sourceid, "SourceID") END,
        "SourceFilter" = CASE WHEN p_sourcefilter_clear = true THEN NULL ELSE COALESCE(p_sourcefilter, "SourceFilter") END,
        "ScheduledJobRunID" = CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, "ScheduledJobRunID") END,
        "Status" = COALESCE(p_status, "Status"),
        "StartTime" = CASE WHEN p_starttime_clear = true THEN NULL ELSE COALESCE(p_starttime, "StartTime") END,
        "EndTime" = CASE WHEN p_endtime_clear = true THEN NULL ELSE COALESCE(p_endtime, "EndTime") END,
        "TotalItemCount" = CASE WHEN p_totalitemcount_clear = true THEN NULL ELSE COALESCE(p_totalitemcount, "TotalItemCount") END,
        "ProcessedItems" = COALESCE(p_processeditems, "ProcessedItems"),
        "SuccessCount" = COALESCE(p_successcount, "SuccessCount"),
        "ErrorCount" = COALESCE(p_errorcount, "ErrorCount"),
        "SkippedCount" = COALESCE(p_skippedcount, "SkippedCount"),
        "LastProcessedOffset" = CASE WHEN p_lastprocessedoffset_clear = true THEN NULL ELSE COALESCE(p_lastprocessedoffset, "LastProcessedOffset") END,
        "LastProcessedKey" = CASE WHEN p_lastprocessedkey_clear = true THEN NULL ELSE COALESCE(p_lastprocessedkey, "LastProcessedKey") END,
        "BatchSize" = CASE WHEN p_batchsize_clear = true THEN NULL ELSE COALESCE(p_batchsize, "BatchSize") END,
        "CancellationRequested" = COALESCE(p_cancellationrequested, "CancellationRequested"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "StartedByUserID" = CASE WHEN p_startedbyuserid_clear = true THEN NULL ELSE COALESCE(p_startedbyuserid, "StartedByUserID") END,
        "DryRun" = COALESCE(p_dryrun, "DryRun"),
        "ResultSummary" = CASE WHEN p_resultsummary_clear = true THEN NULL ELSE COALESCE(p_resultsummary, "ResultSummary") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwProcessRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateProcessRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateProcessRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProcessRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_process_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_process_run" ON "__mj"."ProcessRun";

CREATE TRIGGER "trg_update_process_run"
BEFORE UPDATE ON "__mj"."ProcessRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_process_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: spDeleteProcessRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ProcessRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteProcessRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteProcessRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ProcessRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteProcessRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteProcessRun" TO "cdp_Integration";

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
        AND tc.relname = 'vwAIPrompts'
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
                           AND tc.relname = 'vwAIPrompts'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
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
    p_promptconfiguration TEXT DEFAULT NULL,
    p_templatedatacapture_clear boolean DEFAULT false,
    p_templatedatacapture varchar(20) DEFAULT NULL
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
                "PromptConfiguration",
                "TemplateDataCapture"
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
                CASE WHEN p_promptconfiguration_clear = true THEN NULL ELSE COALESCE(p_promptconfiguration, NULL) END,
                CASE WHEN p_templatedatacapture_clear = true THEN NULL ELSE COALESCE(p_templatedatacapture, NULL) END
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
    p_promptconfiguration TEXT DEFAULT NULL,
    p_templatedatacapture_clear boolean DEFAULT false,
    p_templatedatacapture varchar(20) DEFAULT NULL
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
        "PromptConfiguration" = CASE WHEN p_promptconfiguration_clear = true THEN NULL ELSE COALESCE(p_promptconfiguration, "PromptConfiguration") END,
        "TemplateDataCapture" = CASE WHEN p_templatedatacapture_clear = true THEN NULL ELSE COALESCE(p_templatedatacapture, "TemplateDataCapture") END
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

        -- Cascade: Set MJ: Feature Pipeline Versions.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."FeaturePipelineVersion"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."FeaturePipelineVersion"
        SET "PromptID" = NULL
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

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_id"
    ON "__mj"."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_parent_run_id"
    ON "__mj"."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_id"
    ON "__mj"."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_user_id"
    ON "__mj"."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_detail_id"
    ON "__mj"."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_last_run_id"
    ON "__mj"."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_configuration_id"
    ON "__mj"."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_model_id"
    ON "__mj"."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_vendor_id"
    ON "__mj"."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_scheduled_job_run_id"
    ON "__mj"."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_test_run_id"
    ON "__mj"."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_primary_scope_entity_id"
    ON "__mj"."AIAgentRun" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_session_id"
    ON "__mj"."AIAgentRun" ("AgentSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_hierarchy_meta"(
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
            "ParentRunID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentRunID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentRunID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentRunID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_descendants"(
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
            "ParentRunID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentRunID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun" c
        INNER JOIN
            cte_descendants p ON c."ParentRunID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentRunID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentRunID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentRunID"
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
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIAgentRun"
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
            "__mj"."AIAgentRun" c
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentRuns"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentRun_ParentRunID."RunName" AS "ParentRun",
    MJConversation_ConversationID."Name" AS "Conversation",
    MJUser_UserID."Name" AS "User",
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJAIAgentRun_LastRunID."RunName" AS "LastRun",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIModel_OverrideModelID."Name" AS "OverrideModel",
    MJAIVendor_OverrideVendorID."Name" AS "OverrideVendor",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    hier_ParentRunID."RootID" AS "RootParentRunID",
    hier_ParentRunID."Depth" AS "ParentRunIDDepth",
    hier_ParentRunID."Path" AS "ParentRunIDPath",
    hier_ParentRunID."IsLeaf" AS "ParentRunIDIsLeaf",
    hier_ParentRunID."ChildCount" AS "ParentRunIDChildCount"
FROM
    "__mj"."AIAgentRun" AS a
INNER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_ParentRunID
  ON
    "a"."ParentRunID" = MJAIAgentRun_ParentRunID."ID"
LEFT OUTER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "a"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_LastRunID
  ON
    "a"."LastRunID" = MJAIAgentRun_LastRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_OverrideModelID
  ON
    "a"."OverrideModelID" = MJAIModel_OverrideModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIVendor" AS MJAIVendor_OverrideVendorID
  ON
    "a"."OverrideVendorID" = MJAIVendor_OverrideVendorID."ID"
LEFT OUTER JOIN
    "__mj"."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "a"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_agent_run_parent_run_id_get_hierarchy_meta"(a."ID", a."ParentRunID") AS hier_ParentRunID ON true
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
        AND tc.relname = 'vwAIAgentRuns'
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
                           AND tc.relname = 'vwAIAgentRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentRuns" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRun (JSON-arg shape)
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

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgentRuns"
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
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'LastHeartbeatAt', 'AgentSessionID', 'PlanMode', 'ExternalSessionID', 'ContinuationDepth']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ParentRunID' THEN '($1->>''ParentRunID'')::UUID'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Running'')'
        WHEN 'StartedAt' THEN 'COALESCE(($1->>''StartedAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'Success' THEN '($1->>''Success'')::BOOLEAN'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ConversationID' THEN '($1->>''ConversationID'')::UUID'
        WHEN 'UserID' THEN '($1->>''UserID'')::UUID'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'AgentState' THEN '($1->>''AgentState'')'
        WHEN 'TotalTokensUsed' THEN '($1->>''TotalTokensUsed'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'TotalPromptTokensUsed' THEN '($1->>''TotalPromptTokensUsed'')::INT'
        WHEN 'TotalCompletionTokensUsed' THEN '($1->>''TotalCompletionTokensUsed'')::INT'
        WHEN 'TotalTokensUsedRollup' THEN '($1->>''TotalTokensUsedRollup'')::INT'
        WHEN 'TotalPromptTokensUsedRollup' THEN '($1->>''TotalPromptTokensUsedRollup'')::INT'
        WHEN 'TotalCompletionTokensUsedRollup' THEN '($1->>''TotalCompletionTokensUsedRollup'')::INT'
        WHEN 'TotalCostRollup' THEN '($1->>''TotalCostRollup'')::DECIMAL(19, 8)'
        WHEN 'ConversationDetailID' THEN '($1->>''ConversationDetailID'')::UUID'
        WHEN 'ConversationDetailSequence' THEN '($1->>''ConversationDetailSequence'')::INT'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'FinalStep' THEN '($1->>''FinalStep'')'
        WHEN 'FinalPayload' THEN '($1->>''FinalPayload'')'
        WHEN 'Message' THEN '($1->>''Message'')'
        WHEN 'LastRunID' THEN '($1->>''LastRunID'')::UUID'
        WHEN 'StartingPayload' THEN '($1->>''StartingPayload'')'
        WHEN 'TotalPromptIterations' THEN 'COALESCE(($1->>''TotalPromptIterations'')::INT, 0)'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'OverrideModelID' THEN '($1->>''OverrideModelID'')::UUID'
        WHEN 'OverrideVendorID' THEN '($1->>''OverrideVendorID'')::UUID'
        WHEN 'Data' THEN '($1->>''Data'')'
        WHEN 'Verbose' THEN '($1->>''Verbose'')::BOOLEAN'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'ScheduledJobRunID' THEN '($1->>''ScheduledJobRunID'')::UUID'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'PrimaryScopeEntityID' THEN '($1->>''PrimaryScopeEntityID'')::UUID'
        WHEN 'PrimaryScopeRecordID' THEN '($1->>''PrimaryScopeRecordID'')'
        WHEN 'SecondaryScopes' THEN '($1->>''SecondaryScopes'')'
        WHEN 'ExternalReferenceID' THEN '($1->>''ExternalReferenceID'')'
        WHEN 'CompanyID' THEN '($1->>''CompanyID'')::UUID'
        WHEN 'TotalCacheReadTokensUsed' THEN '($1->>''TotalCacheReadTokensUsed'')::INT'
        WHEN 'TotalCacheWriteTokensUsed' THEN '($1->>''TotalCacheWriteTokensUsed'')::INT'
        WHEN 'LastHeartbeatAt' THEN '($1->>''LastHeartbeatAt'')::TIMESTAMPTZ'
        WHEN 'AgentSessionID' THEN '($1->>''AgentSessionID'')::UUID'
        WHEN 'PlanMode' THEN 'COALESCE(($1->>''PlanMode'')::BOOLEAN, FALSE)'
        WHEN 'ExternalSessionID' THEN '($1->>''ExternalSessionID'')'
        WHEN 'ContinuationDepth' THEN 'COALESCE(($1->>''ContinuationDepth'')::INTEGER, 0)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIAgentRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRun (JSON-arg shape)
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

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgentRun: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIAgentRun"
    SET
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ParentRunID" = CASE WHEN p_data ? 'ParentRunID' THEN (p_data->>'ParentRunID')::UUID ELSE "ParentRunID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "StartedAt" = CASE WHEN p_data ? 'StartedAt' THEN (p_data->>'StartedAt')::TIMESTAMPTZ ELSE "StartedAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ConversationID" = CASE WHEN p_data ? 'ConversationID' THEN (p_data->>'ConversationID')::UUID ELSE "ConversationID" END,
        "UserID" = CASE WHEN p_data ? 'UserID' THEN (p_data->>'UserID')::UUID ELSE "UserID" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "AgentState" = CASE WHEN p_data ? 'AgentState' THEN (p_data->>'AgentState') ELSE "AgentState" END,
        "TotalTokensUsed" = CASE WHEN p_data ? 'TotalTokensUsed' THEN (p_data->>'TotalTokensUsed')::INT ELSE "TotalTokensUsed" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "TotalPromptTokensUsed" = CASE WHEN p_data ? 'TotalPromptTokensUsed' THEN (p_data->>'TotalPromptTokensUsed')::INT ELSE "TotalPromptTokensUsed" END,
        "TotalCompletionTokensUsed" = CASE WHEN p_data ? 'TotalCompletionTokensUsed' THEN (p_data->>'TotalCompletionTokensUsed')::INT ELSE "TotalCompletionTokensUsed" END,
        "TotalTokensUsedRollup" = CASE WHEN p_data ? 'TotalTokensUsedRollup' THEN (p_data->>'TotalTokensUsedRollup')::INT ELSE "TotalTokensUsedRollup" END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_data ? 'TotalPromptTokensUsedRollup' THEN (p_data->>'TotalPromptTokensUsedRollup')::INT ELSE "TotalPromptTokensUsedRollup" END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_data ? 'TotalCompletionTokensUsedRollup' THEN (p_data->>'TotalCompletionTokensUsedRollup')::INT ELSE "TotalCompletionTokensUsedRollup" END,
        "TotalCostRollup" = CASE WHEN p_data ? 'TotalCostRollup' THEN (p_data->>'TotalCostRollup')::DECIMAL(19, 8) ELSE "TotalCostRollup" END,
        "ConversationDetailID" = CASE WHEN p_data ? 'ConversationDetailID' THEN (p_data->>'ConversationDetailID')::UUID ELSE "ConversationDetailID" END,
        "ConversationDetailSequence" = CASE WHEN p_data ? 'ConversationDetailSequence' THEN (p_data->>'ConversationDetailSequence')::INT ELSE "ConversationDetailSequence" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "FinalStep" = CASE WHEN p_data ? 'FinalStep' THEN (p_data->>'FinalStep') ELSE "FinalStep" END,
        "FinalPayload" = CASE WHEN p_data ? 'FinalPayload' THEN (p_data->>'FinalPayload') ELSE "FinalPayload" END,
        "Message" = CASE WHEN p_data ? 'Message' THEN (p_data->>'Message') ELSE "Message" END,
        "LastRunID" = CASE WHEN p_data ? 'LastRunID' THEN (p_data->>'LastRunID')::UUID ELSE "LastRunID" END,
        "StartingPayload" = CASE WHEN p_data ? 'StartingPayload' THEN (p_data->>'StartingPayload') ELSE "StartingPayload" END,
        "TotalPromptIterations" = CASE WHEN p_data ? 'TotalPromptIterations' THEN (p_data->>'TotalPromptIterations')::INT ELSE "TotalPromptIterations" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "OverrideModelID" = CASE WHEN p_data ? 'OverrideModelID' THEN (p_data->>'OverrideModelID')::UUID ELSE "OverrideModelID" END,
        "OverrideVendorID" = CASE WHEN p_data ? 'OverrideVendorID' THEN (p_data->>'OverrideVendorID')::UUID ELSE "OverrideVendorID" END,
        "Data" = CASE WHEN p_data ? 'Data' THEN (p_data->>'Data') ELSE "Data" END,
        "Verbose" = CASE WHEN p_data ? 'Verbose' THEN (p_data->>'Verbose')::BOOLEAN ELSE "Verbose" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "ScheduledJobRunID" = CASE WHEN p_data ? 'ScheduledJobRunID' THEN (p_data->>'ScheduledJobRunID')::UUID ELSE "ScheduledJobRunID" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "PrimaryScopeEntityID" = CASE WHEN p_data ? 'PrimaryScopeEntityID' THEN (p_data->>'PrimaryScopeEntityID')::UUID ELSE "PrimaryScopeEntityID" END,
        "PrimaryScopeRecordID" = CASE WHEN p_data ? 'PrimaryScopeRecordID' THEN (p_data->>'PrimaryScopeRecordID') ELSE "PrimaryScopeRecordID" END,
        "SecondaryScopes" = CASE WHEN p_data ? 'SecondaryScopes' THEN (p_data->>'SecondaryScopes') ELSE "SecondaryScopes" END,
        "ExternalReferenceID" = CASE WHEN p_data ? 'ExternalReferenceID' THEN (p_data->>'ExternalReferenceID') ELSE "ExternalReferenceID" END,
        "CompanyID" = CASE WHEN p_data ? 'CompanyID' THEN (p_data->>'CompanyID')::UUID ELSE "CompanyID" END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_data ? 'TotalCacheReadTokensUsed' THEN (p_data->>'TotalCacheReadTokensUsed')::INT ELSE "TotalCacheReadTokensUsed" END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_data ? 'TotalCacheWriteTokensUsed' THEN (p_data->>'TotalCacheWriteTokensUsed')::INT ELSE "TotalCacheWriteTokensUsed" END,
        "LastHeartbeatAt" = CASE WHEN p_data ? 'LastHeartbeatAt' THEN (p_data->>'LastHeartbeatAt')::TIMESTAMPTZ ELSE "LastHeartbeatAt" END,
        "AgentSessionID" = CASE WHEN p_data ? 'AgentSessionID' THEN (p_data->>'AgentSessionID')::UUID ELSE "AgentSessionID" END,
        "PlanMode" = CASE WHEN p_data ? 'PlanMode' THEN (p_data->>'PlanMode')::BOOLEAN ELSE "PlanMode" END,
        "ExternalSessionID" = CASE WHEN p_data ? 'ExternalSessionID' THEN (p_data->>'ExternalSessionID') ELSE "ExternalSessionID" END,
        "ContinuationDepth" = CASE WHEN p_data ? 'ContinuationDepth' THEN (p_data->>'ContinuationDepth')::INTEGER ELSE "ContinuationDepth" END,
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
    SELECT * FROM "__mj"."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run" ON "__mj"."AIAgentRun";

CREATE TRIGGER "trg_update_ai_agent_run"
BEFORE UPDATE ON "__mj"."AIAgentRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_run"();



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

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentExample"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentExample"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentNote"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentNote"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "OriginatingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "OriginatingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.ResumingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "ResumingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "ResumingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Medias records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunMedia"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Steps records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRunStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ParentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "ParentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "ParentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.LastRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "LastRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "LastRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Skills.ActivatedByRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationSkill"
        WHERE "ActivatedByRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ConversationSkill"
        SET "ActivatedByRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DuplicateRunDetailMatch"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DuplicateRunDetailMatch"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Session Iterations.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ExperimentSessionIteration"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ExperimentSessionIteration"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Sessions.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ExperimentSession"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ExperimentSession"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Process Run Details.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ProcessRunDetail"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ProcessRunDetail"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Rubric Evaluations.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RubricEvaluation"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RubricEvaluation"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutineRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutineRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIAgentRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRun" TO "cdp_Integration";
