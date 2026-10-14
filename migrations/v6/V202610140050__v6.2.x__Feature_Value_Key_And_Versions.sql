-- =====================================================================================
-- Feature Pipelines: Feature Value key, value source, run summary and version registry
--
-- 1. FeatureValue: the non-temporal FeatureValueKey columns (PipelineVersion, AIModelID, ParametersHash,
--    InputHash) and its hash (ValueKeyHash, unique per pipeline) so writes upsert on the key;
--    Source distinguishes pipeline-derived from human-entered values. The table's description
--    changes with it: values are keyed and updated in place, no longer an append-only history.
-- 2. FeatureValueCache: AIModelID and ParametersHash join the cache key; the two unique indexes are rebuilt
--    to include them. Cache rows written before this migration can never match the new key and
--    are deleted unless a Feature Value references them.
-- 3. ProcessRun.ResultSummary: the FeaturePipelineRunResult JSON of a Feature Pipeline run;
--    ProcessRunDetail.Warnings: a record's non-fatal problems, kept out of ErrorMessage.
-- 4. FeaturePipelineVersion: one row per distinct pipeline pin; golden-set activation and the
--    unattended steward's backfill marker (BackfilledAt).
-- FeatureValue.EffectiveAsOf is not part of this key; a later migration adds it.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. FeatureValue
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[FeatureValue]
    ADD [PipelineVersion] INT              NULL,
        [AIModelID]       UNIQUEIDENTIFIER NULL,
        [ParametersHash]  NVARCHAR(64)     NULL,
        [InputHash]       NVARCHAR(64)     NULL,
        [ValueKeyHash]    NVARCHAR(64)     NULL,
        [Source]          NVARCHAR(20)     NOT NULL CONSTRAINT [DF_FeatureValue_Source] DEFAULT (N'Pipeline');
GO

ALTER TABLE [${flyway:defaultSchema}].[FeatureValue]
    ADD CONSTRAINT [FK_FeatureValue_AIModel] FOREIGN KEY ([AIModelID])
            REFERENCES [${flyway:defaultSchema}].[AIModel]([ID]),
        CONSTRAINT [CK_FeatureValue_Source] CHECK ([Source] IN (N'Pipeline', N'Human'));
GO

-- The key hash is unique per pipeline. Rows written before this migration have no key and are excluded.
CREATE UNIQUE NONCLUSTERED INDEX [UQ_FeatureValue_ValueKey]
    ON [${flyway:defaultSchema}].[FeatureValue] ([RecordProcessID], [ValueKeyHash])
    WHERE [ValueKeyHash] IS NOT NULL;
GO

-- -------------------------------------------------------------------------------------
-- 2. FeatureValueCache
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[FeatureValueCache]
    ADD [AIModelID]      UNIQUEIDENTIFIER NULL,
        [ParametersHash] NVARCHAR(64)     NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[FeatureValueCache]
    ADD CONSTRAINT [FK_FeatureValueCache_AIModel] FOREIGN KEY ([AIModelID])
        REFERENCES [${flyway:defaultSchema}].[AIModel]([ID]);
GO

DROP INDEX [UQ_FeatureValueCache_Scoped] ON [${flyway:defaultSchema}].[FeatureValueCache];
GO
DROP INDEX [UQ_FeatureValueCache_PromptScoped] ON [${flyway:defaultSchema}].[FeatureValueCache];
GO

-- AIModelID is NULL for a prompt with no Active model. SQL Server treats NULLs as equal in a unique index, so
-- those rows still dedupe; PostgreSQL treats them as distinct, so the PostgreSQL conversion of these two
-- indexes needs NULLS NOT DISTINCT (release engineer: see the PR description).
CREATE UNIQUE NONCLUSTERED INDEX [UQ_FeatureValueCache_Scoped]
    ON [${flyway:defaultSchema}].[FeatureValueCache]
       ([RecordProcessID], [PromptID], [PromptVersionHash], [ConstraintHash], [AIModelID], [ParametersHash], [KeyHash])
    WHERE [RecordProcessID] IS NOT NULL;
GO

CREATE UNIQUE NONCLUSTERED INDEX [UQ_FeatureValueCache_PromptScoped]
    ON [${flyway:defaultSchema}].[FeatureValueCache]
       ([PromptID], [PromptVersionHash], [ConstraintHash], [AIModelID], [ParametersHash], [KeyHash])
    WHERE [RecordProcessID] IS NULL;
GO

-- Cache rows written before this migration have no ParametersHash, so the new key can never match them.
-- Delete them; a row a Feature Value references stays, as the provenance of the value computed from it.
DELETE c
FROM [${flyway:defaultSchema}].[FeatureValueCache] c
WHERE c.[ParametersHash] IS NULL
  AND NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[FeatureValue] fv WHERE fv.[FeatureValueCacheID] = c.[ID]);
GO

-- -------------------------------------------------------------------------------------
-- 3. ProcessRun.ResultSummary, ProcessRunDetail.Warnings
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[ProcessRun]
    ADD [ResultSummary] NVARCHAR(MAX) NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[ProcessRunDetail]
    ADD [Warnings] NVARCHAR(MAX) NULL;
GO

-- -------------------------------------------------------------------------------------
-- 4. FeaturePipelineVersion
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[FeaturePipelineVersion] (
    [ID]                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_FeaturePipelineVersion_ID] DEFAULT (newsequentialid()),
    [RecordProcessID]    UNIQUEIDENTIFIER NOT NULL,
    [Version]            INT              NOT NULL,
    [PinHash]            NVARCHAR(64)     NOT NULL,
    [SpecHash]           NVARCHAR(64)     NOT NULL,
    [PromptID]           UNIQUEIDENTIFIER NULL,
    [PromptVersionHash]  NVARCHAR(64)     NULL,
    [AIModelID]          UNIQUEIDENTIFIER NULL,
    [ParametersHash]     NVARCHAR(64)     NULL,
    [Status]             NVARCHAR(20)     NOT NULL CONSTRAINT [DF_FeaturePipelineVersion_Status] DEFAULT (N'Candidate'),
    [Gated]              BIT              NOT NULL CONSTRAINT [DF_FeaturePipelineVersion_Gated] DEFAULT (0),
    [GoldenSetTestID]    UNIQUEIDENTIFIER NULL,
    [GoldenSetTestRunID] UNIQUEIDENTIFIER NULL,
    [Metric]             NVARCHAR(20)     NULL,
    [Threshold]          FLOAT            NULL,
    [ResultValue]        FLOAT            NULL,
    [ResultLower]        FLOAT            NULL,
    [ResultUpper]        FLOAT            NULL,
    [ResultN]            INT              NULL,
    [ResultDetails]      NVARCHAR(MAX)    NULL,
    [ActivatedAt]        DATETIMEOFFSET   NULL,
    [ApprovedByUserID]   UNIQUEIDENTIFIER NULL,
    [RetiredAt]          DATETIMEOFFSET   NULL,
    [BackfilledAt]       DATETIMEOFFSET   NULL,
    CONSTRAINT [PK_FeaturePipelineVersion] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_FeaturePipelineVersion_RecordProcess] FOREIGN KEY ([RecordProcessID])
        REFERENCES [${flyway:defaultSchema}].[RecordProcess]([ID]),
    CONSTRAINT [FK_FeaturePipelineVersion_Prompt] FOREIGN KEY ([PromptID])
        REFERENCES [${flyway:defaultSchema}].[AIPrompt]([ID]),
    CONSTRAINT [FK_FeaturePipelineVersion_AIModel] FOREIGN KEY ([AIModelID])
        REFERENCES [${flyway:defaultSchema}].[AIModel]([ID]),
    CONSTRAINT [FK_FeaturePipelineVersion_GoldenSetTest] FOREIGN KEY ([GoldenSetTestID])
        REFERENCES [${flyway:defaultSchema}].[Test]([ID]),
    CONSTRAINT [FK_FeaturePipelineVersion_GoldenSetTestRun] FOREIGN KEY ([GoldenSetTestRunID])
        REFERENCES [${flyway:defaultSchema}].[TestRun]([ID]),
    CONSTRAINT [FK_FeaturePipelineVersion_ApprovedByUser] FOREIGN KEY ([ApprovedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [UQ_FeaturePipelineVersion_Version] UNIQUE ([RecordProcessID], [Version]),
    CONSTRAINT [UQ_FeaturePipelineVersion_Pin] UNIQUE ([RecordProcessID], [PinHash]),
    CONSTRAINT [CK_FeaturePipelineVersion_Status] CHECK ([Status] IN (N'Candidate', N'Active', N'Refused', N'Retired')),
    CONSTRAINT [CK_FeaturePipelineVersion_Metric] CHECK ([Metric] IN (N'accuracy', N'macro-f1'))
);
GO

-- -------------------------------------------------------------------------------------
-- 5. Extended properties
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Version of the Feature Pipeline (MJ: Feature Pipeline Versions.Version for this RecordProcessID) that computed this value. Part of the FeatureValueKey. NULL on rows written before versioning or by a processor run without a run-level Preflight.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue',
    @level2type = N'COLUMN', @level2name = N'PipelineVersion';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Primary AI model the pipeline''s prompt is configured to run (highest-priority Active AI Prompt Model). Part of the FeatureValueKey; the model that actually answered is on the linked AI Prompt Run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue',
    @level2type = N'COLUMN', @level2name = N'AIModelID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'SHA-256 of the prompt''s inference parameters (temperature, topP, topK, minP, penalties, seed, response format, effort level, model parameters). Part of the FeatureValueKey.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue',
    @level2type = N'COLUMN', @level2name = N'ParametersHash';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'SHA-256 of the normalized input the value was computed from (the Dedup Cache key hash when the pipeline caches). Part of the FeatureValueKey.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue',
    @level2type = N'COLUMN', @level2name = N'InputHash';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'SHA-256 of the canonical FeatureValueKey (entity, record, feature, pipeline version, prompt version hash, AI model, parameters hash, input hash, source). Unique per pipeline: re-computing the same key updates the row instead of inserting a duplicate.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue',
    @level2type = N'COLUMN', @level2name = N'ValueKeyHash';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Who produced the value: Pipeline (computed by the Feature Pipeline) or Human (a value a person entered on the target record, recorded when write-back found it and left it in place). Write-back never overwrites a Human value unless the run sets overwriteHumanValues.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue',
    @level2type = N'COLUMN', @level2name = N'Source';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Primary AI model of the prompt that computed this cached result. Part of the cache key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValueCache',
    @level2type = N'COLUMN', @level2name = N'AIModelID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'SHA-256 of the prompt''s inference parameters when this result was computed. Part of the cache key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValueCache',
    @level2type = N'COLUMN', @level2name = N'ParametersHash';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'JSON summary of a Feature Pipeline run (FeaturePipelineRunResult): attempted, upserted, unchanged, previewed, rejectedInvalid, failed, skipped and humanValuesPreserved counts, the pipeline pin and parameter fidelity, and the status. NULL for other work types.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProcessRun',
    @level2type = N'COLUMN', @level2name = N'ResultSummary';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'JSON array of the record''s non-fatal problems (for example, its Dedup Cache entry could not be stored) on a record that otherwise succeeded. NULL when there were none. Failures are in ErrorMessage, never here.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProcessRunDetail',
    @level2type = N'COLUMN', @level2name = N'Warnings';
-- Feature Values are now keyed and updated in place, so the table is no longer an append-only history.
EXEC sp_dropextendedproperty @name = N'MS_Description',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Feature values computed by Feature Pipelines (or entered by people, Source = Human): one row per Feature Value key (record, feature, pipeline version, prompt version, primary AI model, parameters, input, source), updated in place when the same key is recomputed, with provenance, model reasoning and run back-links. Earlier values of a row are in Record Changes. Rows written before the key existed (ValueKeyHash NULL) are kept as history.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'One version of a Feature Pipeline: a distinct pin (spec hash, prompt version hash, primary AI model, parameters hash). A gated pipeline runs only under an Active version, and a version becomes Active only with a stored golden-set result at or above its declared threshold.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Monotonic version number within the pipeline (1, 2, ...).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'Version';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the pin (SpecHash, PromptVersionHash, AIModelID, ParametersHash). Unique per pipeline.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'PinHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the output-affecting parts of the DataFeatureSpec (Context, Outputs, PipelineType, Escalation, PromptID, ProcessorExtensionKey) and the OutputMapping.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'SpecHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The pipeline prompt this version runs.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'PromptID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Prompt version hash (template text, outputs, constraint block, pipeline type, escalation) of this version.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'PromptVersionHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Primary AI model of the prompt for this version.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'AIModelID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the prompt inference parameters for this version.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'ParametersHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Candidate (registered, not yet allowed to write), Active (the version runs write), Refused (golden-set result below threshold), Retired (superseded by a later Active version).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'True when the pipeline declares DataFeatureSpec.Activation: the version can become Active only through a stored golden-set result at or above Threshold.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'Gated';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The MJ: Tests row holding the golden set this version was evaluated on.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'GoldenSetTestID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The MJ: Test Runs row of the evaluation whose result is stored here.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'GoldenSetTestRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Metric of the stored result: accuracy or macro-f1.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'Metric';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Declared activation threshold copied from DataFeatureSpec.Activation at evaluation time.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'Threshold';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Point estimate of the metric (the lowest per-output value when the pipeline has several outputs).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'ResultValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Lower bound of the 95% Wilson interval of ResultValue.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'ResultLower';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Upper bound of the 95% Wilson interval of ResultValue.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'ResultUpper';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Number of golden cases scored.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'ResultN';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON per-output results (correct, n, value, interval) and the per-case answers of the evaluation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'ResultDetails';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the version became Active.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'ActivatedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The user whose run activated the version: the context user of the activating golden-set evaluation or on-demand run; for an unattended activation, the user the Feature Pipeline Version Steward scheduled job runs as.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'ApprovedByUserID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When a later Active version superseded this one.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'RetiredAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the Feature Pipeline Version Steward finished the one backfill run of this activation of the version (the records whose latest Pipeline value was written under another version, or under none). NULL until then; cleared when the version is retired or becomes Active again, so each activation is backfilled once.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeaturePipelineVersion', @level2type = N'COLUMN', @level2name = N'BackfilledAt';
GO



























































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

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'ca9e4797-3e8a-4942-afe9-274cd49872a7',
         'MJ: Feature Pipeline Versions',
         'Feature Pipeline Versions',
         'One version of a Feature Pipeline: a distinct pin (spec hash, prompt version hash, primary AI model, parameters hash). A gated pipeline runs only under an Active version, and a version becomes Active only with a stored golden-set result at or above its declared threshold.',
         NULL,
         'FeaturePipelineVersion',
         'vwFeaturePipelineVersions',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Feature Pipeline Versions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ca9e4797-3e8a-4942-afe9-274cd49872a7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Feature Pipeline Versions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Feature Pipeline Versions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Feature Pipeline Versions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ca9e4797-3e8a-4942-afe9-274cd49872a7' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FeaturePipelineVersion */
ALTER TABLE [${flyway:defaultSchema}].[FeaturePipelineVersion] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FeaturePipelineVersion */
UPDATE [${flyway:defaultSchema}].[FeaturePipelineVersion] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FeaturePipelineVersion */
ALTER TABLE [${flyway:defaultSchema}].[FeaturePipelineVersion] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FeaturePipelineVersion */
ALTER TABLE [${flyway:defaultSchema}].[FeaturePipelineVersion] ADD CONSTRAINT [DF___mj_FeaturePipelineVersion___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FeaturePipelineVersion */
ALTER TABLE [${flyway:defaultSchema}].[FeaturePipelineVersion] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FeaturePipelineVersion */
UPDATE [${flyway:defaultSchema}].[FeaturePipelineVersion] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FeaturePipelineVersion */
ALTER TABLE [${flyway:defaultSchema}].[FeaturePipelineVersion] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FeaturePipelineVersion */
ALTER TABLE [${flyway:defaultSchema}].[FeaturePipelineVersion] ADD CONSTRAINT [DF___mj_FeaturePipelineVersion___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 36 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '52899340-a811-4b5f-aaf2-d8214bf87ddd' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '52899340-a811-4b5f-aaf2-d8214bf87ddd',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e934a165-c973-445d-8d4e-e17694354520' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'RecordProcessID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e934a165-c973-445d-8d4e-e17694354520',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'RecordProcessID',
            'Record Process ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'BDE34DF9-7B59-4921-9B80-E94BC013A5BB',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b05ba2b-c65e-41a7-ae88-0df49abb963b' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'Version')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5b05ba2b-c65e-41a7-ae88-0df49abb963b',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'Version',
            'Version',
            'Monotonic version number within the pipeline (1, 2, ...).',
            'int',
            4,
            10,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69705ec9-fc16-472e-a335-d144d6a21c76' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'PinHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '69705ec9-fc16-472e-a335-d144d6a21c76',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'PinHash',
            'Pin Hash',
            'SHA-256 of the pin (SpecHash, PromptVersionHash, AIModelID, ParametersHash). Unique per pipeline.',
            'nvarchar',
            128,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '43668eee-8aa0-4133-a4a2-c1dd82aa8d43' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'SpecHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '43668eee-8aa0-4133-a4a2-c1dd82aa8d43',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'SpecHash',
            'Spec Hash',
            'SHA-256 of the output-affecting parts of the DataFeatureSpec (Context, Outputs, PipelineType, Escalation, PromptID, ProcessorExtensionKey) and the OutputMapping.',
            'nvarchar',
            128,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f1929f7a-e8de-4478-9e49-d94ee34de1b6' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'PromptID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f1929f7a-e8de-4478-9e49-d94ee34de1b6',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'PromptID',
            'Prompt ID',
            'The pipeline prompt this version runs.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc814c44-8c43-4a7c-b266-fe53b5cd531d' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'PromptVersionHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dc814c44-8c43-4a7c-b266-fe53b5cd531d',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'PromptVersionHash',
            'Prompt Version Hash',
            'Prompt version hash (template text, outputs, constraint block, pipeline type, escalation) of this version.',
            'nvarchar',
            128,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b5ea9619-094c-4520-825c-659c4ffeec70' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'AIModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b5ea9619-094c-4520-825c-659c4ffeec70',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'AIModelID',
            'AI Model ID',
            'Primary AI model of the prompt for this version.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18a9b06c-87e4-463b-87fd-eb9f84d91dca' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'ParametersHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '18a9b06c-87e4-463b-87fd-eb9f84d91dca',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'ParametersHash',
            'Parameters Hash',
            'SHA-256 of the prompt inference parameters for this version.',
            'nvarchar',
            128,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '33db8621-d45b-4e2f-9723-86d876ea8db3' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '33db8621-d45b-4e2f-9723-86d876ea8db3',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'Status',
            'Status',
            'Candidate (registered, not yet allowed to write), Active (the version runs write), Refused (golden-set result below threshold), Retired (superseded by a later Active version).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Candidate',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '479fcfea-63b9-418c-8505-14e31ea6ace8' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'Gated')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '479fcfea-63b9-418c-8505-14e31ea6ace8',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'Gated',
            'Gated',
            'True when the pipeline declares DataFeatureSpec.Activation: the version can become Active only through a stored golden-set result at or above Threshold.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e26e4ea8-5a11-4275-9eb1-438fa9b97f2b' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'GoldenSetTestID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e26e4ea8-5a11-4275-9eb1-438fa9b97f2b',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'GoldenSetTestID',
            'Golden Set Test ID',
            'The MJ: Tests row holding the golden set this version was evaluated on.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '1F949AD0-8C72-4846-8A0B-0B3D9F644231',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3692975f-204e-4eea-870a-0bc7526bfa29' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'GoldenSetTestRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3692975f-204e-4eea-870a-0bc7526bfa29',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'GoldenSetTestRunID',
            'Golden Set Test Run ID',
            'The MJ: Test Runs row of the evaluation whose result is stored here.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e2ce44b-a3e0-4a00-b20b-fe08ddcee16c' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'Metric')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5e2ce44b-a3e0-4a00-b20b-fe08ddcee16c',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'Metric',
            'Metric',
            'Metric of the stored result: accuracy or macro-f1.',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '78de1b90-07fa-4f6b-a429-134ebb6250a3' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'Threshold')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '78de1b90-07fa-4f6b-a429-134ebb6250a3',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'Threshold',
            'Threshold',
            'Declared activation threshold copied from DataFeatureSpec.Activation at evaluation time.',
            'float',
            8,
            53,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a90e8c8a-6b05-4dc4-9b7d-ca587fcf5896' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'ResultValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a90e8c8a-6b05-4dc4-9b7d-ca587fcf5896',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'ResultValue',
            'Result Value',
            'Point estimate of the metric (the lowest per-output value when the pipeline has several outputs).',
            'float',
            8,
            53,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '36665bcb-89c4-45d8-b321-f0dbc2ae1a07' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'ResultLower')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '36665bcb-89c4-45d8-b321-f0dbc2ae1a07',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'ResultLower',
            'Result Lower',
            'Lower bound of the 95% Wilson interval of ResultValue.',
            'float',
            8,
            53,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '48242103-c83c-42b9-9591-5f34a3e50cbe' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'ResultUpper')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '48242103-c83c-42b9-9591-5f34a3e50cbe',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'ResultUpper',
            'Result Upper',
            'Upper bound of the 95% Wilson interval of ResultValue.',
            'float',
            8,
            53,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1fef9ee3-6136-4599-be4a-9ce01eb247a4' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'ResultN')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1fef9ee3-6136-4599-be4a-9ce01eb247a4',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'ResultN',
            'Result N',
            'Number of golden cases scored.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d1855bb-2a10-4b3e-90dc-c494720b6a24' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'ResultDetails')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5d1855bb-2a10-4b3e-90dc-c494720b6a24',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'ResultDetails',
            'Result Details',
            'JSON per-output results (correct, n, value, interval) and the per-case answers of the evaluation.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f4ae08ea-ff1e-4d5c-9388-464acbafbe62' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'ActivatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f4ae08ea-ff1e-4d5c-9388-464acbafbe62',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'ActivatedAt',
            'Activated At',
            'When the version became Active.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4a91287-0f6f-430e-9467-b64e06f13880' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'ApprovedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c4a91287-0f6f-430e-9467-b64e06f13880',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'ApprovedByUserID',
            'Approved By User ID',
            'The user whose run activated the version: the context user of the activating golden-set evaluation or on-demand run; for an unattended activation, the user the Feature Pipeline Version Steward scheduled job runs as.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c8e8518-166c-414b-90d7-150c555869e9' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'RetiredAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9c8e8518-166c-414b-90d7-150c555869e9',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'RetiredAt',
            'Retired At',
            'When a later Active version superseded this one.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e907c585-94f1-48c9-901d-aee341cd0a5d' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'BackfilledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e907c585-94f1-48c9-901d-aee341cd0a5d',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'BackfilledAt',
            'Backfilled At',
            'When the Feature Pipeline Version Steward finished the one backfill run of this activation of the version (the records whose latest Pipeline value was written under another version, or under none). NULL until then; cleared when the version is retired or becomes Active again, so each activation is backfilled once.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b8cb8fc-cc9e-4496-9b59-f6d0fb67d7e5' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8b8cb8fc-cc9e-4496-9b59-f6d0fb67d7e5',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d8a871d-f6b8-4f6e-b81b-79fb9368ba05' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8d8a871d-f6b8-4f6e-b81b-79fb9368ba05',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5fa2d40-c49b-41cf-9a06-faddc56f821e' OR (EntityID = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND Name = 'Warnings')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e5fa2d40-c49b-41cf-9a06-faddc56f821e',
            '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F', -- Entity: MJ: Process Run Details
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F'),
            'Warnings',
            'Warnings',
            'JSON array of the record''s non-fatal problems (for example, its Dedup Cache entry could not be stored) on a record that otherwise succeeded. NULL when there were none. Failures are in ErrorMessage, never here.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7e75d644-eca6-4490-ad2e-c3001ee1be9b' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'PipelineVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7e75d644-eca6-4490-ad2e-c3001ee1be9b',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'PipelineVersion',
            'Pipeline Version',
            'Version of the Feature Pipeline (MJ: Feature Pipeline Versions.Version for this RecordProcessID) that computed this value. Part of the FeatureValueKey. NULL on rows written before versioning or by a processor run without a run-level Preflight.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad34364d-0dfe-4b09-9542-dfc20c47f8c4' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'AIModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ad34364d-0dfe-4b09-9542-dfc20c47f8c4',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'AIModelID',
            'AI Model ID',
            'Primary AI model the pipeline''s prompt is configured to run (highest-priority Active AI Prompt Model). Part of the FeatureValueKey; the model that actually answered is on the linked AI Prompt Run.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '795f432c-e51a-4714-82a4-83b5552e663d' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'ParametersHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '795f432c-e51a-4714-82a4-83b5552e663d',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'ParametersHash',
            'Parameters Hash',
            'SHA-256 of the prompt''s inference parameters (temperature, topP, topK, minP, penalties, seed, response format, effort level, model parameters). Part of the FeatureValueKey.',
            'nvarchar',
            128,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5820eed-2b47-4d44-ada7-88c7fce66340' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'InputHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c5820eed-2b47-4d44-ada7-88c7fce66340',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'InputHash',
            'Input Hash',
            'SHA-256 of the normalized input the value was computed from (the Dedup Cache key hash when the pipeline caches). Part of the FeatureValueKey.',
            'nvarchar',
            128,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed6a2c22-7502-4100-8a1a-4b8985158a9d' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'ValueKeyHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ed6a2c22-7502-4100-8a1a-4b8985158a9d',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'ValueKeyHash',
            'Value Key Hash',
            'SHA-256 of the canonical FeatureValueKey (entity, record, feature, pipeline version, prompt version hash, AI model, parameters hash, input hash, source). Unique per pipeline: re-computing the same key updates the row instead of inserting a duplicate.',
            'nvarchar',
            128,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '83c833af-df1f-43e9-a9a0-715ab5a9318b' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'Source')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '83c833af-df1f-43e9-a9a0-715ab5a9318b',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'Source',
            'Source',
            'Who produced the value: Pipeline (computed by the Feature Pipeline) or Human (a value a person entered on the target record, recorded when write-back found it and left it in place). Write-back never overwrites a Human value unless the run sets overwriteHumanValues.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pipeline',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd17a169b-1a6a-4edd-b080-25127058e592' OR (EntityID = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND Name = 'ResultSummary')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd17a169b-1a6a-4edd-b080-25127058e592',
            '9989A9A4-5546-4552-A765-B27EE399BFEA', -- Entity: MJ: Process Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9989A9A4-5546-4552-A765-B27EE399BFEA'),
            'ResultSummary',
            'Result Summary',
            'JSON summary of a Feature Pipeline run (FeaturePipelineRunResult): attempted, upserted, unchanged, previewed, rejectedInvalid, failed, skipped and humanValuesPreserved counts, the pipeline pin and parameter fidelity, and the status. NULL for other work types.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '155a1f54-e797-4c90-8b0d-224534b54187' OR (EntityID = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND Name = 'AIModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '155a1f54-e797-4c90-8b0d-224534b54187',
            'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', -- Entity: MJ: Feature Value Caches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'),
            'AIModelID',
            'AI Model ID',
            'Primary AI model of the prompt that computed this cached result. Part of the cache key.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de1f6ddc-0207-459e-a956-c1dba21d55e7' OR (EntityID = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND Name = 'ParametersHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'de1f6ddc-0207-459e-a956-c1dba21d55e7',
            'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', -- Entity: MJ: Feature Value Caches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'),
            'ParametersHash',
            'Parameters Hash',
            'SHA-256 of the prompt''s inference parameters when this result was computed. Part of the cache key.',
            'nvarchar',
            128,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID 8122ff0e-c3f7-46d6-911f-6bb664390b2a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8122ff0e-c3f7-46d6-911f-6bb664390b2a', '83C833AF-DF1F-43E9-A9A0-715AB5A9318B', 1, 'Human', 'Human', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a98135f6-e8a9-44d9-bba0-b0ea2ad6cd49 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a98135f6-e8a9-44d9-bba0-b0ea2ad6cd49', '83C833AF-DF1F-43E9-A9A0-715AB5A9318B', 2, 'Pipeline', 'Pipeline', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 83C833AF-DF1F-43E9-A9A0-715AB5A9318B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='83C833AF-DF1F-43E9-A9A0-715AB5A9318B';

/* SQL text to insert entity field value with ID ae0596ab-3b4c-4e9f-921d-02fe84ef4b48 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ae0596ab-3b4c-4e9f-921d-02fe84ef4b48', '33DB8621-D45B-4E2F-9723-86D876EA8DB3', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bfe2d869-9462-4352-b226-ae71316f1571 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bfe2d869-9462-4352-b226-ae71316f1571', '33DB8621-D45B-4E2F-9723-86D876EA8DB3', 2, 'Candidate', 'Candidate', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b31f07b6-f179-4b7e-93a1-d11b8588e492 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b31f07b6-f179-4b7e-93a1-d11b8588e492', '33DB8621-D45B-4E2F-9723-86D876EA8DB3', 3, 'Refused', 'Refused', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a01bc25c-ea2b-4d9a-a9dd-79631381192c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a01bc25c-ea2b-4d9a-a9dd-79631381192c', '33DB8621-D45B-4E2F-9723-86D876EA8DB3', 4, 'Retired', 'Retired', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 33DB8621-D45B-4E2F-9723-86D876EA8DB3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='33DB8621-D45B-4E2F-9723-86D876EA8DB3';

/* SQL text to insert entity field value with ID f795c993-2dbd-406c-af8a-ba3483d6059d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f795c993-2dbd-406c-af8a-ba3483d6059d', '5E2CE44B-A3E0-4A00-B20B-FE08DDCEE16C', 1, 'accuracy', 'accuracy', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7bda8840-d91f-44c7-adf9-c0251ede89fa */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7bda8840-d91f-44c7-adf9-c0251ede89fa', '5E2CE44B-A3E0-4A00-B20B-FE08DDCEE16C', 2, 'macro-f1', 'macro-f1', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5E2CE44B-A3E0-4A00-B20B-FE08DDCEE16C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5E2CE44B-A3E0-4A00-B20B-FE08DDCEE16C';

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */

         UPDATE [${flyway:defaultSchema}].[Entity]
         SET [AllowUserSearchAPI] = 0
         WHERE [ID] IN (
            SELECT e.[ID]
            FROM [${flyway:defaultSchema}].[Entity] e
            WHERE e.[AllowUserSearchAPI] = 1
              AND e.[AutoUpdateAllowUserSearchAPI] = 1
              AND e.[VirtualEntity] = 0
              AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
              AND e.[SchemaName] NOT IN ('sys','staging')
              AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
         );


/* Create Entity Relationship: MJ: Tests -> MJ: Feature Pipeline Versions (One To Many via GoldenSetTestID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '79765c50-05b2-40c2-bca4-84cc4c18baec'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('79765c50-05b2-40c2-bca4-84cc4c18baec', '1F949AD0-8C72-4846-8A0B-0B3D9F644231', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'GoldenSetTestID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Prompts -> MJ: Feature Pipeline Versions (One To Many via PromptID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1fe1dac5-9327-444f-a627-09a5ebb44c78'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1fe1dac5-9327-444f-a627-09a5ebb44c78', '73AD0238-8B56-EF11-991A-6045BDEBA539', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'PromptID', 'One To Many', 1, 1, 25, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Feature Pipeline Versions (One To Many via ApprovedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f495b47e-3dee-40b1-a53d-241897e7ca0b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f495b47e-3dee-40b1-a53d-241897e7ca0b', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'ApprovedByUserID', 'One To Many', 1, 1, 118, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Models -> MJ: Feature Pipeline Versions (One To Many via AIModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '41346102-1574-4928-aa01-60ebba5858ab'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('41346102-1574-4928-aa01-60ebba5858ab', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'AIModelID', 'One To Many', 1, 1, 29, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Models -> MJ: Feature Values (One To Many via AIModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5a44b453-40a9-4063-b6ab-f8440e2f2b8f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5a44b453-40a9-4063-b6ab-f8440e2f2b8f', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'AIModelID', 'One To Many', 1, 1, 30, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Models -> MJ: Feature Value Caches (One To Many via AIModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a23724a9-5c51-4c37-97d0-c98a4521c34a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a23724a9-5c51-4c37-97d0-c98a4521c34a', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', 'AIModelID', 'One To Many', 1, 1, 31, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Test Runs -> MJ: Feature Pipeline Versions (One To Many via GoldenSetTestRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '86705dd5-98ca-4bb2-8168-ed75106bf55a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('86705dd5-98ca-4bb2-8168-ed75106bf55a', '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'GoldenSetTestRunID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Record Processes -> MJ: Feature Pipeline Versions (One To Many via RecordProcessID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '913b162c-a831-4859-b24a-7844dd0d194f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('913b162c-a831-4859-b24a-7844dd0d194f', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'RecordProcessID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for FeaturePipelineVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Pipeline Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RecordProcessID in table FeaturePipelineVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_RecordProcessID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeaturePipelineVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_RecordProcessID ON [${flyway:defaultSchema}].[FeaturePipelineVersion] ([RecordProcessID]);

-- Index for foreign key PromptID in table FeaturePipelineVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeaturePipelineVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_PromptID ON [${flyway:defaultSchema}].[FeaturePipelineVersion] ([PromptID]);

-- Index for foreign key AIModelID in table FeaturePipelineVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeaturePipelineVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_AIModelID ON [${flyway:defaultSchema}].[FeaturePipelineVersion] ([AIModelID]);

-- Index for foreign key GoldenSetTestID in table FeaturePipelineVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_GoldenSetTestID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeaturePipelineVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_GoldenSetTestID ON [${flyway:defaultSchema}].[FeaturePipelineVersion] ([GoldenSetTestID]);

-- Index for foreign key GoldenSetTestRunID in table FeaturePipelineVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_GoldenSetTestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeaturePipelineVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_GoldenSetTestRunID ON [${flyway:defaultSchema}].[FeaturePipelineVersion] ([GoldenSetTestRunID]);

-- Index for foreign key ApprovedByUserID in table FeaturePipelineVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeaturePipelineVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeaturePipelineVersion_ApprovedByUserID ON [${flyway:defaultSchema}].[FeaturePipelineVersion] ([ApprovedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID E934A165-C973-445D-8D4E-E17694354520 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E934A165-C973-445D-8D4E-E17694354520', @RelatedEntityNameFieldMap='RecordProcess';

/* Index for Foreign Keys for FeatureValueCache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Value Caches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RecordProcessID in table FeatureValueCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValueCache_RecordProcessID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValueCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValueCache_RecordProcessID ON [${flyway:defaultSchema}].[FeatureValueCache] ([RecordProcessID]);

-- Index for foreign key PromptID in table FeatureValueCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValueCache_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValueCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValueCache_PromptID ON [${flyway:defaultSchema}].[FeatureValueCache] ([PromptID]);

-- Index for foreign key AIModelID in table FeatureValueCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValueCache_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValueCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValueCache_AIModelID ON [${flyway:defaultSchema}].[FeatureValueCache] ([AIModelID]);

/* SQL text to update entity field related entity name field map for entity field ID 155A1F54-E797-4C90-8B0D-224534B54187 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='155A1F54-E797-4C90-8B0D-224534B54187', @RelatedEntityNameFieldMap='AIModel';

/* Index for Foreign Keys for FeatureValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RecordProcessID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_RecordProcessID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_RecordProcessID ON [${flyway:defaultSchema}].[FeatureValue] ([RecordProcessID]);

-- Index for foreign key EntityID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_EntityID ON [${flyway:defaultSchema}].[FeatureValue] ([EntityID]);

-- Index for foreign key PromptID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_PromptID ON [${flyway:defaultSchema}].[FeatureValue] ([PromptID]);

-- Index for foreign key ProcessRunID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunID ON [${flyway:defaultSchema}].[FeatureValue] ([ProcessRunID]);

-- Index for foreign key ProcessRunDetailID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunDetailID ON [${flyway:defaultSchema}].[FeatureValue] ([ProcessRunDetailID]);

-- Index for foreign key FeatureValueCacheID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_FeatureValueCacheID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_FeatureValueCacheID ON [${flyway:defaultSchema}].[FeatureValue] ([FeatureValueCacheID]);

-- Index for foreign key AIModelID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_AIModelID ON [${flyway:defaultSchema}].[FeatureValue] ([AIModelID]);

/* SQL text to update entity field related entity name field map for entity field ID AD34364D-0DFE-4B09-9542-DFC20C47F8C4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='AD34364D-0DFE-4B09-9542-DFC20C47F8C4', @RelatedEntityNameFieldMap='AIModel';

/* SQL text to update entity field related entity name field map for entity field ID F1929F7A-E8DE-4478-9E49-D94EE34DE1B6 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F1929F7A-E8DE-4478-9E49-D94EE34DE1B6', @RelatedEntityNameFieldMap='Prompt';

/* Base View SQL for MJ: Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: vwFeatureValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Feature Values
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FeatureValue
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFeatureValues]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFeatureValues];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFeatureValues]
AS
SELECT
    f.*,
    MJRecordProcess_RecordProcessID.[Name] AS [RecordProcess],
    MJEntity_EntityID.[Name] AS [Entity],
    MJAIPrompt_PromptID.[Name] AS [Prompt],
    MJProcessRunDetail_ProcessRunDetailID.[RecordID] AS [ProcessRunDetail],
    MJFeatureValueCache_FeatureValueCacheID.[KeyDisplay] AS [FeatureValueCache],
    MJAIModel_AIModelID.[Name] AS [AIModel]
FROM
    [${flyway:defaultSchema}].[FeatureValue] AS f
INNER JOIN
    [${flyway:defaultSchema}].[RecordProcess] AS MJRecordProcess_RecordProcessID
  ON
    [f].[RecordProcessID] = MJRecordProcess_RecordProcessID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [f].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_PromptID
  ON
    [f].[PromptID] = MJAIPrompt_PromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ProcessRunDetail] AS MJProcessRunDetail_ProcessRunDetailID
  ON
    [f].[ProcessRunDetailID] = MJProcessRunDetail_ProcessRunDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FeatureValueCache] AS MJFeatureValueCache_FeatureValueCacheID
  ON
    [f].[FeatureValueCacheID] = MJFeatureValueCache_FeatureValueCacheID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_AIModelID
  ON
    [f].[AIModelID] = MJAIModel_AIModelID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: Permissions for vwFeatureValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: spCreateFeatureValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FeatureValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFeatureValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFeatureValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFeatureValue]
    @ID uniqueidentifier = NULL,
    @RecordProcessID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(900),
    @FeatureName nvarchar(255),
    @ValueText_Clear bit = 0,
    @ValueText nvarchar(MAX) = NULL,
    @ValueNumeric_Clear bit = 0,
    @ValueNumeric float(53) = NULL,
    @ValueDate_Clear bit = 0,
    @ValueDate datetimeoffset = NULL,
    @ValueBoolean_Clear bit = 0,
    @ValueBoolean bit = NULL,
    @ValueJSON_Clear bit = 0,
    @ValueJSON nvarchar(MAX) = NULL,
    @Reasoning_Clear bit = 0,
    @Reasoning nvarchar(MAX) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence float(53) = NULL,
    @PromptID_Clear bit = 0,
    @PromptID uniqueidentifier = NULL,
    @PromptVersionHash_Clear bit = 0,
    @PromptVersionHash nvarchar(64) = NULL,
    @ConstraintHash_Clear bit = 0,
    @ConstraintHash nvarchar(64) = NULL,
    @ProcessRunID_Clear bit = 0,
    @ProcessRunID uniqueidentifier = NULL,
    @ProcessRunDetailID_Clear bit = 0,
    @ProcessRunDetailID uniqueidentifier = NULL,
    @AIPromptRunID_Clear bit = 0,
    @AIPromptRunID uniqueidentifier = NULL,
    @FeatureValueCacheID_Clear bit = 0,
    @FeatureValueCacheID uniqueidentifier = NULL,
    @ComputedAt datetimeoffset = NULL,
    @PipelineVersion_Clear bit = 0,
    @PipelineVersion int = NULL,
    @AIModelID_Clear bit = 0,
    @AIModelID uniqueidentifier = NULL,
    @ParametersHash_Clear bit = 0,
    @ParametersHash nvarchar(64) = NULL,
    @InputHash_Clear bit = 0,
    @InputHash nvarchar(64) = NULL,
    @ValueKeyHash_Clear bit = 0,
    @ValueKeyHash nvarchar(64) = NULL,
    @Source nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FeatureValue]
            (
                [ID],
                [RecordProcessID],
                [EntityID],
                [RecordID],
                [FeatureName],
                [ValueText],
                [ValueNumeric],
                [ValueDate],
                [ValueBoolean],
                [ValueJSON],
                [Reasoning],
                [Confidence],
                [PromptID],
                [PromptVersionHash],
                [ConstraintHash],
                [ProcessRunID],
                [ProcessRunDetailID],
                [AIPromptRunID],
                [FeatureValueCacheID],
                [ComputedAt],
                [PipelineVersion],
                [AIModelID],
                [ParametersHash],
                [InputHash],
                [ValueKeyHash],
                [Source]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RecordProcessID,
                @EntityID,
                @RecordID,
                @FeatureName,
                CASE WHEN @ValueText_Clear = 1 THEN NULL ELSE ISNULL(@ValueText, NULL) END,
                CASE WHEN @ValueNumeric_Clear = 1 THEN NULL ELSE ISNULL(@ValueNumeric, NULL) END,
                CASE WHEN @ValueDate_Clear = 1 THEN NULL ELSE ISNULL(@ValueDate, NULL) END,
                CASE WHEN @ValueBoolean_Clear = 1 THEN NULL ELSE ISNULL(@ValueBoolean, NULL) END,
                CASE WHEN @ValueJSON_Clear = 1 THEN NULL ELSE ISNULL(@ValueJSON, NULL) END,
                CASE WHEN @Reasoning_Clear = 1 THEN NULL ELSE ISNULL(@Reasoning, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, NULL) END,
                CASE WHEN @PromptVersionHash_Clear = 1 THEN NULL ELSE ISNULL(@PromptVersionHash, NULL) END,
                CASE WHEN @ConstraintHash_Clear = 1 THEN NULL ELSE ISNULL(@ConstraintHash, NULL) END,
                CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, NULL) END,
                CASE WHEN @ProcessRunDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunDetailID, NULL) END,
                CASE WHEN @AIPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIPromptRunID, NULL) END,
                CASE WHEN @FeatureValueCacheID_Clear = 1 THEN NULL ELSE ISNULL(@FeatureValueCacheID, NULL) END,
                ISNULL(@ComputedAt, sysdatetimeoffset()),
                CASE WHEN @PipelineVersion_Clear = 1 THEN NULL ELSE ISNULL(@PipelineVersion, NULL) END,
                CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, NULL) END,
                CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, NULL) END,
                CASE WHEN @InputHash_Clear = 1 THEN NULL ELSE ISNULL(@InputHash, NULL) END,
                CASE WHEN @ValueKeyHash_Clear = 1 THEN NULL ELSE ISNULL(@ValueKeyHash, NULL) END,
                ISNULL(@Source, 'Pipeline')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FeatureValue]
            (
                [RecordProcessID],
                [EntityID],
                [RecordID],
                [FeatureName],
                [ValueText],
                [ValueNumeric],
                [ValueDate],
                [ValueBoolean],
                [ValueJSON],
                [Reasoning],
                [Confidence],
                [PromptID],
                [PromptVersionHash],
                [ConstraintHash],
                [ProcessRunID],
                [ProcessRunDetailID],
                [AIPromptRunID],
                [FeatureValueCacheID],
                [ComputedAt],
                [PipelineVersion],
                [AIModelID],
                [ParametersHash],
                [InputHash],
                [ValueKeyHash],
                [Source]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RecordProcessID,
                @EntityID,
                @RecordID,
                @FeatureName,
                CASE WHEN @ValueText_Clear = 1 THEN NULL ELSE ISNULL(@ValueText, NULL) END,
                CASE WHEN @ValueNumeric_Clear = 1 THEN NULL ELSE ISNULL(@ValueNumeric, NULL) END,
                CASE WHEN @ValueDate_Clear = 1 THEN NULL ELSE ISNULL(@ValueDate, NULL) END,
                CASE WHEN @ValueBoolean_Clear = 1 THEN NULL ELSE ISNULL(@ValueBoolean, NULL) END,
                CASE WHEN @ValueJSON_Clear = 1 THEN NULL ELSE ISNULL(@ValueJSON, NULL) END,
                CASE WHEN @Reasoning_Clear = 1 THEN NULL ELSE ISNULL(@Reasoning, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, NULL) END,
                CASE WHEN @PromptVersionHash_Clear = 1 THEN NULL ELSE ISNULL(@PromptVersionHash, NULL) END,
                CASE WHEN @ConstraintHash_Clear = 1 THEN NULL ELSE ISNULL(@ConstraintHash, NULL) END,
                CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, NULL) END,
                CASE WHEN @ProcessRunDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunDetailID, NULL) END,
                CASE WHEN @AIPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIPromptRunID, NULL) END,
                CASE WHEN @FeatureValueCacheID_Clear = 1 THEN NULL ELSE ISNULL(@FeatureValueCacheID, NULL) END,
                ISNULL(@ComputedAt, sysdatetimeoffset()),
                CASE WHEN @PipelineVersion_Clear = 1 THEN NULL ELSE ISNULL(@PipelineVersion, NULL) END,
                CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, NULL) END,
                CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, NULL) END,
                CASE WHEN @InputHash_Clear = 1 THEN NULL ELSE ISNULL(@InputHash, NULL) END,
                CASE WHEN @ValueKeyHash_Clear = 1 THEN NULL ELSE ISNULL(@ValueKeyHash, NULL) END,
                ISNULL(@Source, 'Pipeline')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFeatureValues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Feature Values */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: spUpdateFeatureValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FeatureValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFeatureValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFeatureValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFeatureValue]
    @ID uniqueidentifier,
    @RecordProcessID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(900) = NULL,
    @FeatureName nvarchar(255) = NULL,
    @ValueText_Clear bit = 0,
    @ValueText nvarchar(MAX) = NULL,
    @ValueNumeric_Clear bit = 0,
    @ValueNumeric float(53) = NULL,
    @ValueDate_Clear bit = 0,
    @ValueDate datetimeoffset = NULL,
    @ValueBoolean_Clear bit = 0,
    @ValueBoolean bit = NULL,
    @ValueJSON_Clear bit = 0,
    @ValueJSON nvarchar(MAX) = NULL,
    @Reasoning_Clear bit = 0,
    @Reasoning nvarchar(MAX) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence float(53) = NULL,
    @PromptID_Clear bit = 0,
    @PromptID uniqueidentifier = NULL,
    @PromptVersionHash_Clear bit = 0,
    @PromptVersionHash nvarchar(64) = NULL,
    @ConstraintHash_Clear bit = 0,
    @ConstraintHash nvarchar(64) = NULL,
    @ProcessRunID_Clear bit = 0,
    @ProcessRunID uniqueidentifier = NULL,
    @ProcessRunDetailID_Clear bit = 0,
    @ProcessRunDetailID uniqueidentifier = NULL,
    @AIPromptRunID_Clear bit = 0,
    @AIPromptRunID uniqueidentifier = NULL,
    @FeatureValueCacheID_Clear bit = 0,
    @FeatureValueCacheID uniqueidentifier = NULL,
    @ComputedAt datetimeoffset = NULL,
    @PipelineVersion_Clear bit = 0,
    @PipelineVersion int = NULL,
    @AIModelID_Clear bit = 0,
    @AIModelID uniqueidentifier = NULL,
    @ParametersHash_Clear bit = 0,
    @ParametersHash nvarchar(64) = NULL,
    @InputHash_Clear bit = 0,
    @InputHash nvarchar(64) = NULL,
    @ValueKeyHash_Clear bit = 0,
    @ValueKeyHash nvarchar(64) = NULL,
    @Source nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FeatureValue]
    SET
        [RecordProcessID] = ISNULL(@RecordProcessID, [RecordProcessID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [FeatureName] = ISNULL(@FeatureName, [FeatureName]),
        [ValueText] = CASE WHEN @ValueText_Clear = 1 THEN NULL ELSE ISNULL(@ValueText, [ValueText]) END,
        [ValueNumeric] = CASE WHEN @ValueNumeric_Clear = 1 THEN NULL ELSE ISNULL(@ValueNumeric, [ValueNumeric]) END,
        [ValueDate] = CASE WHEN @ValueDate_Clear = 1 THEN NULL ELSE ISNULL(@ValueDate, [ValueDate]) END,
        [ValueBoolean] = CASE WHEN @ValueBoolean_Clear = 1 THEN NULL ELSE ISNULL(@ValueBoolean, [ValueBoolean]) END,
        [ValueJSON] = CASE WHEN @ValueJSON_Clear = 1 THEN NULL ELSE ISNULL(@ValueJSON, [ValueJSON]) END,
        [Reasoning] = CASE WHEN @Reasoning_Clear = 1 THEN NULL ELSE ISNULL(@Reasoning, [Reasoning]) END,
        [Confidence] = CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, [Confidence]) END,
        [PromptID] = CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, [PromptID]) END,
        [PromptVersionHash] = CASE WHEN @PromptVersionHash_Clear = 1 THEN NULL ELSE ISNULL(@PromptVersionHash, [PromptVersionHash]) END,
        [ConstraintHash] = CASE WHEN @ConstraintHash_Clear = 1 THEN NULL ELSE ISNULL(@ConstraintHash, [ConstraintHash]) END,
        [ProcessRunID] = CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, [ProcessRunID]) END,
        [ProcessRunDetailID] = CASE WHEN @ProcessRunDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunDetailID, [ProcessRunDetailID]) END,
        [AIPromptRunID] = CASE WHEN @AIPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIPromptRunID, [AIPromptRunID]) END,
        [FeatureValueCacheID] = CASE WHEN @FeatureValueCacheID_Clear = 1 THEN NULL ELSE ISNULL(@FeatureValueCacheID, [FeatureValueCacheID]) END,
        [ComputedAt] = ISNULL(@ComputedAt, [ComputedAt]),
        [PipelineVersion] = CASE WHEN @PipelineVersion_Clear = 1 THEN NULL ELSE ISNULL(@PipelineVersion, [PipelineVersion]) END,
        [AIModelID] = CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, [AIModelID]) END,
        [ParametersHash] = CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, [ParametersHash]) END,
        [InputHash] = CASE WHEN @InputHash_Clear = 1 THEN NULL ELSE ISNULL(@InputHash, [InputHash]) END,
        [ValueKeyHash] = CASE WHEN @ValueKeyHash_Clear = 1 THEN NULL ELSE ISNULL(@ValueKeyHash, [ValueKeyHash]) END,
        [Source] = ISNULL(@Source, [Source])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFeatureValues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFeatureValues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FeatureValue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFeatureValue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFeatureValue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFeatureValue
ON [${flyway:defaultSchema}].[FeatureValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FeatureValue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FeatureValue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Feature Values */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: spDeleteFeatureValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FeatureValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFeatureValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFeatureValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFeatureValue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FeatureValue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Feature Values */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Feature Value Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Value Caches
-- Item: vwFeatureValueCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Feature Value Caches
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FeatureValueCache
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFeatureValueCaches]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFeatureValueCaches];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFeatureValueCaches]
AS
SELECT
    f.*,
    MJRecordProcess_RecordProcessID.[Name] AS [RecordProcess],
    MJAIPrompt_PromptID.[Name] AS [Prompt],
    MJAIModel_AIModelID.[Name] AS [AIModel]
FROM
    [${flyway:defaultSchema}].[FeatureValueCache] AS f
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RecordProcess] AS MJRecordProcess_RecordProcessID
  ON
    [f].[RecordProcessID] = MJRecordProcess_RecordProcessID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_PromptID
  ON
    [f].[PromptID] = MJAIPrompt_PromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_AIModelID
  ON
    [f].[AIModelID] = MJAIModel_AIModelID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValueCaches] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValueCaches] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValueCaches] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwFeatureValueCaches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Feature Value Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Value Caches
-- Item: Permissions for vwFeatureValueCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValueCaches] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValueCaches] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValueCaches] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwFeatureValueCaches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Feature Value Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Value Caches
-- Item: spCreateFeatureValueCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FeatureValueCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFeatureValueCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFeatureValueCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFeatureValueCache]
    @ID uniqueidentifier = NULL,
    @RecordProcessID_Clear bit = 0,
    @RecordProcessID uniqueidentifier = NULL,
    @PromptID uniqueidentifier,
    @PromptVersionHash nvarchar(64),
    @ConstraintHash nvarchar(64),
    @KeyHash nvarchar(64),
    @KeyDisplay_Clear bit = 0,
    @KeyDisplay nvarchar(500) = NULL,
    @KeyJSON nvarchar(MAX),
    @OutputsJSON nvarchar(MAX),
    @Reasoning_Clear bit = 0,
    @Reasoning nvarchar(MAX) = NULL,
    @AIPromptRunID_Clear bit = 0,
    @AIPromptRunID uniqueidentifier = NULL,
    @HitCount int = NULL,
    @LastHitAt_Clear bit = 0,
    @LastHitAt datetimeoffset = NULL,
    @ComputedAt datetimeoffset = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @AIModelID_Clear bit = 0,
    @AIModelID uniqueidentifier = NULL,
    @ParametersHash_Clear bit = 0,
    @ParametersHash nvarchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FeatureValueCache]
            (
                [ID],
                [RecordProcessID],
                [PromptID],
                [PromptVersionHash],
                [ConstraintHash],
                [KeyHash],
                [KeyDisplay],
                [KeyJSON],
                [OutputsJSON],
                [Reasoning],
                [AIPromptRunID],
                [HitCount],
                [LastHitAt],
                [ComputedAt],
                [ExpiresAt],
                [AIModelID],
                [ParametersHash]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
                @PromptID,
                @PromptVersionHash,
                @ConstraintHash,
                @KeyHash,
                CASE WHEN @KeyDisplay_Clear = 1 THEN NULL ELSE ISNULL(@KeyDisplay, NULL) END,
                @KeyJSON,
                @OutputsJSON,
                CASE WHEN @Reasoning_Clear = 1 THEN NULL ELSE ISNULL(@Reasoning, NULL) END,
                CASE WHEN @AIPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIPromptRunID, NULL) END,
                ISNULL(@HitCount, 0),
                CASE WHEN @LastHitAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHitAt, NULL) END,
                ISNULL(@ComputedAt, sysdatetimeoffset()),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, NULL) END,
                CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FeatureValueCache]
            (
                [RecordProcessID],
                [PromptID],
                [PromptVersionHash],
                [ConstraintHash],
                [KeyHash],
                [KeyDisplay],
                [KeyJSON],
                [OutputsJSON],
                [Reasoning],
                [AIPromptRunID],
                [HitCount],
                [LastHitAt],
                [ComputedAt],
                [ExpiresAt],
                [AIModelID],
                [ParametersHash]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
                @PromptID,
                @PromptVersionHash,
                @ConstraintHash,
                @KeyHash,
                CASE WHEN @KeyDisplay_Clear = 1 THEN NULL ELSE ISNULL(@KeyDisplay, NULL) END,
                @KeyJSON,
                @OutputsJSON,
                CASE WHEN @Reasoning_Clear = 1 THEN NULL ELSE ISNULL(@Reasoning, NULL) END,
                CASE WHEN @AIPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIPromptRunID, NULL) END,
                ISNULL(@HitCount, 0),
                CASE WHEN @LastHitAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHitAt, NULL) END,
                ISNULL(@ComputedAt, sysdatetimeoffset()),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, NULL) END,
                CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFeatureValueCaches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValueCache] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValueCache] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValueCache] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Feature Value Caches */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValueCache] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValueCache] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValueCache] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Feature Value Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Value Caches
-- Item: spUpdateFeatureValueCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FeatureValueCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFeatureValueCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFeatureValueCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFeatureValueCache]
    @ID uniqueidentifier,
    @RecordProcessID_Clear bit = 0,
    @RecordProcessID uniqueidentifier = NULL,
    @PromptID uniqueidentifier = NULL,
    @PromptVersionHash nvarchar(64) = NULL,
    @ConstraintHash nvarchar(64) = NULL,
    @KeyHash nvarchar(64) = NULL,
    @KeyDisplay_Clear bit = 0,
    @KeyDisplay nvarchar(500) = NULL,
    @KeyJSON nvarchar(MAX) = NULL,
    @OutputsJSON nvarchar(MAX) = NULL,
    @Reasoning_Clear bit = 0,
    @Reasoning nvarchar(MAX) = NULL,
    @AIPromptRunID_Clear bit = 0,
    @AIPromptRunID uniqueidentifier = NULL,
    @HitCount int = NULL,
    @LastHitAt_Clear bit = 0,
    @LastHitAt datetimeoffset = NULL,
    @ComputedAt datetimeoffset = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @AIModelID_Clear bit = 0,
    @AIModelID uniqueidentifier = NULL,
    @ParametersHash_Clear bit = 0,
    @ParametersHash nvarchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FeatureValueCache]
    SET
        [RecordProcessID] = CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, [RecordProcessID]) END,
        [PromptID] = ISNULL(@PromptID, [PromptID]),
        [PromptVersionHash] = ISNULL(@PromptVersionHash, [PromptVersionHash]),
        [ConstraintHash] = ISNULL(@ConstraintHash, [ConstraintHash]),
        [KeyHash] = ISNULL(@KeyHash, [KeyHash]),
        [KeyDisplay] = CASE WHEN @KeyDisplay_Clear = 1 THEN NULL ELSE ISNULL(@KeyDisplay, [KeyDisplay]) END,
        [KeyJSON] = ISNULL(@KeyJSON, [KeyJSON]),
        [OutputsJSON] = ISNULL(@OutputsJSON, [OutputsJSON]),
        [Reasoning] = CASE WHEN @Reasoning_Clear = 1 THEN NULL ELSE ISNULL(@Reasoning, [Reasoning]) END,
        [AIPromptRunID] = CASE WHEN @AIPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIPromptRunID, [AIPromptRunID]) END,
        [HitCount] = ISNULL(@HitCount, [HitCount]),
        [LastHitAt] = CASE WHEN @LastHitAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHitAt, [LastHitAt]) END,
        [ComputedAt] = ISNULL(@ComputedAt, [ComputedAt]),
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END,
        [AIModelID] = CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, [AIModelID]) END,
        [ParametersHash] = CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, [ParametersHash]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFeatureValueCaches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFeatureValueCaches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValueCache] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValueCache] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValueCache] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FeatureValueCache table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFeatureValueCache]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFeatureValueCache];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFeatureValueCache
ON [${flyway:defaultSchema}].[FeatureValueCache]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FeatureValueCache]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FeatureValueCache] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Feature Value Caches */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValueCache] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValueCache] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValueCache] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Feature Value Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Value Caches
-- Item: spDeleteFeatureValueCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FeatureValueCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFeatureValueCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFeatureValueCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFeatureValueCache]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FeatureValueCache]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValueCache] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValueCache] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValueCache] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Feature Value Caches */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValueCache] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValueCache] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValueCache] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID B5EA9619-094C-4520-825C-659C4FFEEC70 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B5EA9619-094C-4520-825C-659C4FFEEC70', @RelatedEntityNameFieldMap='AIModel';

/* SQL text to update entity field related entity name field map for entity field ID E26E4EA8-5A11-4275-9EB1-438FA9B97F2B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E26E4EA8-5A11-4275-9EB1-438FA9B97F2B', @RelatedEntityNameFieldMap='GoldenSetTest';

/* SQL text to update entity field related entity name field map for entity field ID 3692975F-204E-4EEA-870A-0BC7526BFA29 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3692975F-204E-4EEA-870A-0BC7526BFA29', @RelatedEntityNameFieldMap='GoldenSetTestRun';

/* SQL text to update entity field related entity name field map for entity field ID C4A91287-0F6F-430E-9467-B64E06F13880 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C4A91287-0F6F-430E-9467-B64E06F13880', @RelatedEntityNameFieldMap='ApprovedByUser';

/* Base View SQL for MJ: Feature Pipeline Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Pipeline Versions
-- Item: vwFeaturePipelineVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Feature Pipeline Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FeaturePipelineVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFeaturePipelineVersions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFeaturePipelineVersions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFeaturePipelineVersions]
AS
SELECT
    f.*,
    MJRecordProcess_RecordProcessID.[Name] AS [RecordProcess],
    MJAIPrompt_PromptID.[Name] AS [Prompt],
    MJAIModel_AIModelID.[Name] AS [AIModel],
    MJTest_GoldenSetTestID.[Name] AS [GoldenSetTest],
    MJTestRun_GoldenSetTestRunID.[Test] AS [GoldenSetTestRun],
    MJUser_ApprovedByUserID.[Name] AS [ApprovedByUser]
FROM
    [${flyway:defaultSchema}].[FeaturePipelineVersion] AS f
INNER JOIN
    [${flyway:defaultSchema}].[RecordProcess] AS MJRecordProcess_RecordProcessID
  ON
    [f].[RecordProcessID] = MJRecordProcess_RecordProcessID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_PromptID
  ON
    [f].[PromptID] = MJAIPrompt_PromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_AIModelID
  ON
    [f].[AIModelID] = MJAIModel_AIModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Test] AS MJTest_GoldenSetTestID
  ON
    [f].[GoldenSetTestID] = MJTest_GoldenSetTestID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_GoldenSetTestRunID
  ON
    [f].[GoldenSetTestRunID] = MJTestRun_GoldenSetTestRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ApprovedByUserID
  ON
    [f].[ApprovedByUserID] = MJUser_ApprovedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFeaturePipelineVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Feature Pipeline Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Pipeline Versions
-- Item: Permissions for vwFeaturePipelineVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFeaturePipelineVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Feature Pipeline Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Pipeline Versions
-- Item: spCreateFeaturePipelineVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FeaturePipelineVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFeaturePipelineVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFeaturePipelineVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFeaturePipelineVersion]
    @ID uniqueidentifier = NULL,
    @RecordProcessID uniqueidentifier,
    @Version int,
    @PinHash nvarchar(64),
    @SpecHash nvarchar(64),
    @PromptID_Clear bit = 0,
    @PromptID uniqueidentifier = NULL,
    @PromptVersionHash_Clear bit = 0,
    @PromptVersionHash nvarchar(64) = NULL,
    @AIModelID_Clear bit = 0,
    @AIModelID uniqueidentifier = NULL,
    @ParametersHash_Clear bit = 0,
    @ParametersHash nvarchar(64) = NULL,
    @Status nvarchar(20) = NULL,
    @Gated bit = NULL,
    @GoldenSetTestID_Clear bit = 0,
    @GoldenSetTestID uniqueidentifier = NULL,
    @GoldenSetTestRunID_Clear bit = 0,
    @GoldenSetTestRunID uniqueidentifier = NULL,
    @Metric_Clear bit = 0,
    @Metric nvarchar(20) = NULL,
    @Threshold_Clear bit = 0,
    @Threshold float(53) = NULL,
    @ResultValue_Clear bit = 0,
    @ResultValue float(53) = NULL,
    @ResultLower_Clear bit = 0,
    @ResultLower float(53) = NULL,
    @ResultUpper_Clear bit = 0,
    @ResultUpper float(53) = NULL,
    @ResultN_Clear bit = 0,
    @ResultN int = NULL,
    @ResultDetails_Clear bit = 0,
    @ResultDetails nvarchar(MAX) = NULL,
    @ActivatedAt_Clear bit = 0,
    @ActivatedAt datetimeoffset = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @RetiredAt_Clear bit = 0,
    @RetiredAt datetimeoffset = NULL,
    @BackfilledAt_Clear bit = 0,
    @BackfilledAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FeaturePipelineVersion]
            (
                [ID],
                [RecordProcessID],
                [Version],
                [PinHash],
                [SpecHash],
                [PromptID],
                [PromptVersionHash],
                [AIModelID],
                [ParametersHash],
                [Status],
                [Gated],
                [GoldenSetTestID],
                [GoldenSetTestRunID],
                [Metric],
                [Threshold],
                [ResultValue],
                [ResultLower],
                [ResultUpper],
                [ResultN],
                [ResultDetails],
                [ActivatedAt],
                [ApprovedByUserID],
                [RetiredAt],
                [BackfilledAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RecordProcessID,
                @Version,
                @PinHash,
                @SpecHash,
                CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, NULL) END,
                CASE WHEN @PromptVersionHash_Clear = 1 THEN NULL ELSE ISNULL(@PromptVersionHash, NULL) END,
                CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, NULL) END,
                CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, NULL) END,
                ISNULL(@Status, 'Candidate'),
                ISNULL(@Gated, 0),
                CASE WHEN @GoldenSetTestID_Clear = 1 THEN NULL ELSE ISNULL(@GoldenSetTestID, NULL) END,
                CASE WHEN @GoldenSetTestRunID_Clear = 1 THEN NULL ELSE ISNULL(@GoldenSetTestRunID, NULL) END,
                CASE WHEN @Metric_Clear = 1 THEN NULL ELSE ISNULL(@Metric, NULL) END,
                CASE WHEN @Threshold_Clear = 1 THEN NULL ELSE ISNULL(@Threshold, NULL) END,
                CASE WHEN @ResultValue_Clear = 1 THEN NULL ELSE ISNULL(@ResultValue, NULL) END,
                CASE WHEN @ResultLower_Clear = 1 THEN NULL ELSE ISNULL(@ResultLower, NULL) END,
                CASE WHEN @ResultUpper_Clear = 1 THEN NULL ELSE ISNULL(@ResultUpper, NULL) END,
                CASE WHEN @ResultN_Clear = 1 THEN NULL ELSE ISNULL(@ResultN, NULL) END,
                CASE WHEN @ResultDetails_Clear = 1 THEN NULL ELSE ISNULL(@ResultDetails, NULL) END,
                CASE WHEN @ActivatedAt_Clear = 1 THEN NULL ELSE ISNULL(@ActivatedAt, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @RetiredAt_Clear = 1 THEN NULL ELSE ISNULL(@RetiredAt, NULL) END,
                CASE WHEN @BackfilledAt_Clear = 1 THEN NULL ELSE ISNULL(@BackfilledAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FeaturePipelineVersion]
            (
                [RecordProcessID],
                [Version],
                [PinHash],
                [SpecHash],
                [PromptID],
                [PromptVersionHash],
                [AIModelID],
                [ParametersHash],
                [Status],
                [Gated],
                [GoldenSetTestID],
                [GoldenSetTestRunID],
                [Metric],
                [Threshold],
                [ResultValue],
                [ResultLower],
                [ResultUpper],
                [ResultN],
                [ResultDetails],
                [ActivatedAt],
                [ApprovedByUserID],
                [RetiredAt],
                [BackfilledAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RecordProcessID,
                @Version,
                @PinHash,
                @SpecHash,
                CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, NULL) END,
                CASE WHEN @PromptVersionHash_Clear = 1 THEN NULL ELSE ISNULL(@PromptVersionHash, NULL) END,
                CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, NULL) END,
                CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, NULL) END,
                ISNULL(@Status, 'Candidate'),
                ISNULL(@Gated, 0),
                CASE WHEN @GoldenSetTestID_Clear = 1 THEN NULL ELSE ISNULL(@GoldenSetTestID, NULL) END,
                CASE WHEN @GoldenSetTestRunID_Clear = 1 THEN NULL ELSE ISNULL(@GoldenSetTestRunID, NULL) END,
                CASE WHEN @Metric_Clear = 1 THEN NULL ELSE ISNULL(@Metric, NULL) END,
                CASE WHEN @Threshold_Clear = 1 THEN NULL ELSE ISNULL(@Threshold, NULL) END,
                CASE WHEN @ResultValue_Clear = 1 THEN NULL ELSE ISNULL(@ResultValue, NULL) END,
                CASE WHEN @ResultLower_Clear = 1 THEN NULL ELSE ISNULL(@ResultLower, NULL) END,
                CASE WHEN @ResultUpper_Clear = 1 THEN NULL ELSE ISNULL(@ResultUpper, NULL) END,
                CASE WHEN @ResultN_Clear = 1 THEN NULL ELSE ISNULL(@ResultN, NULL) END,
                CASE WHEN @ResultDetails_Clear = 1 THEN NULL ELSE ISNULL(@ResultDetails, NULL) END,
                CASE WHEN @ActivatedAt_Clear = 1 THEN NULL ELSE ISNULL(@ActivatedAt, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @RetiredAt_Clear = 1 THEN NULL ELSE ISNULL(@RetiredAt, NULL) END,
                CASE WHEN @BackfilledAt_Clear = 1 THEN NULL ELSE ISNULL(@BackfilledAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFeaturePipelineVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFeaturePipelineVersion] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Feature Pipeline Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFeaturePipelineVersion] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Feature Pipeline Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Pipeline Versions
-- Item: spUpdateFeaturePipelineVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FeaturePipelineVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFeaturePipelineVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFeaturePipelineVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFeaturePipelineVersion]
    @ID uniqueidentifier,
    @RecordProcessID uniqueidentifier = NULL,
    @Version int = NULL,
    @PinHash nvarchar(64) = NULL,
    @SpecHash nvarchar(64) = NULL,
    @PromptID_Clear bit = 0,
    @PromptID uniqueidentifier = NULL,
    @PromptVersionHash_Clear bit = 0,
    @PromptVersionHash nvarchar(64) = NULL,
    @AIModelID_Clear bit = 0,
    @AIModelID uniqueidentifier = NULL,
    @ParametersHash_Clear bit = 0,
    @ParametersHash nvarchar(64) = NULL,
    @Status nvarchar(20) = NULL,
    @Gated bit = NULL,
    @GoldenSetTestID_Clear bit = 0,
    @GoldenSetTestID uniqueidentifier = NULL,
    @GoldenSetTestRunID_Clear bit = 0,
    @GoldenSetTestRunID uniqueidentifier = NULL,
    @Metric_Clear bit = 0,
    @Metric nvarchar(20) = NULL,
    @Threshold_Clear bit = 0,
    @Threshold float(53) = NULL,
    @ResultValue_Clear bit = 0,
    @ResultValue float(53) = NULL,
    @ResultLower_Clear bit = 0,
    @ResultLower float(53) = NULL,
    @ResultUpper_Clear bit = 0,
    @ResultUpper float(53) = NULL,
    @ResultN_Clear bit = 0,
    @ResultN int = NULL,
    @ResultDetails_Clear bit = 0,
    @ResultDetails nvarchar(MAX) = NULL,
    @ActivatedAt_Clear bit = 0,
    @ActivatedAt datetimeoffset = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @RetiredAt_Clear bit = 0,
    @RetiredAt datetimeoffset = NULL,
    @BackfilledAt_Clear bit = 0,
    @BackfilledAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FeaturePipelineVersion]
    SET
        [RecordProcessID] = ISNULL(@RecordProcessID, [RecordProcessID]),
        [Version] = ISNULL(@Version, [Version]),
        [PinHash] = ISNULL(@PinHash, [PinHash]),
        [SpecHash] = ISNULL(@SpecHash, [SpecHash]),
        [PromptID] = CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, [PromptID]) END,
        [PromptVersionHash] = CASE WHEN @PromptVersionHash_Clear = 1 THEN NULL ELSE ISNULL(@PromptVersionHash, [PromptVersionHash]) END,
        [AIModelID] = CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, [AIModelID]) END,
        [ParametersHash] = CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, [ParametersHash]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Gated] = ISNULL(@Gated, [Gated]),
        [GoldenSetTestID] = CASE WHEN @GoldenSetTestID_Clear = 1 THEN NULL ELSE ISNULL(@GoldenSetTestID, [GoldenSetTestID]) END,
        [GoldenSetTestRunID] = CASE WHEN @GoldenSetTestRunID_Clear = 1 THEN NULL ELSE ISNULL(@GoldenSetTestRunID, [GoldenSetTestRunID]) END,
        [Metric] = CASE WHEN @Metric_Clear = 1 THEN NULL ELSE ISNULL(@Metric, [Metric]) END,
        [Threshold] = CASE WHEN @Threshold_Clear = 1 THEN NULL ELSE ISNULL(@Threshold, [Threshold]) END,
        [ResultValue] = CASE WHEN @ResultValue_Clear = 1 THEN NULL ELSE ISNULL(@ResultValue, [ResultValue]) END,
        [ResultLower] = CASE WHEN @ResultLower_Clear = 1 THEN NULL ELSE ISNULL(@ResultLower, [ResultLower]) END,
        [ResultUpper] = CASE WHEN @ResultUpper_Clear = 1 THEN NULL ELSE ISNULL(@ResultUpper, [ResultUpper]) END,
        [ResultN] = CASE WHEN @ResultN_Clear = 1 THEN NULL ELSE ISNULL(@ResultN, [ResultN]) END,
        [ResultDetails] = CASE WHEN @ResultDetails_Clear = 1 THEN NULL ELSE ISNULL(@ResultDetails, [ResultDetails]) END,
        [ActivatedAt] = CASE WHEN @ActivatedAt_Clear = 1 THEN NULL ELSE ISNULL(@ActivatedAt, [ActivatedAt]) END,
        [ApprovedByUserID] = CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, [ApprovedByUserID]) END,
        [RetiredAt] = CASE WHEN @RetiredAt_Clear = 1 THEN NULL ELSE ISNULL(@RetiredAt, [RetiredAt]) END,
        [BackfilledAt] = CASE WHEN @BackfilledAt_Clear = 1 THEN NULL ELSE ISNULL(@BackfilledAt, [BackfilledAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFeaturePipelineVersions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFeaturePipelineVersions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeaturePipelineVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FeaturePipelineVersion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFeaturePipelineVersion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFeaturePipelineVersion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFeaturePipelineVersion
ON [${flyway:defaultSchema}].[FeaturePipelineVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FeaturePipelineVersion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FeaturePipelineVersion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Feature Pipeline Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeaturePipelineVersion] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Feature Pipeline Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Pipeline Versions
-- Item: spDeleteFeaturePipelineVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FeaturePipelineVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFeaturePipelineVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFeaturePipelineVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFeaturePipelineVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FeaturePipelineVersion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeaturePipelineVersion] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Feature Pipeline Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeaturePipelineVersion] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ProcessRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProcessRunID in table ProcessRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProcessRunDetail_ProcessRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProcessRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProcessRunDetail_ProcessRunID ON [${flyway:defaultSchema}].[ProcessRunDetail] ([ProcessRunID]);

-- Index for foreign key EntityID in table ProcessRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProcessRunDetail_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProcessRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProcessRunDetail_EntityID ON [${flyway:defaultSchema}].[ProcessRunDetail] ([EntityID]);

-- Index for foreign key ActionExecutionLogID in table ProcessRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProcessRunDetail_ActionExecutionLogID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProcessRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProcessRunDetail_ActionExecutionLogID ON [${flyway:defaultSchema}].[ProcessRunDetail] ([ActionExecutionLogID]);

-- Index for foreign key AIAgentRunID in table ProcessRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProcessRunDetail_AIAgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProcessRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProcessRunDetail_AIAgentRunID ON [${flyway:defaultSchema}].[ProcessRunDetail] ([AIAgentRunID]);

/* Index for Foreign Keys for ProcessRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RecordProcessID in table ProcessRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProcessRun_RecordProcessID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProcessRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProcessRun_RecordProcessID ON [${flyway:defaultSchema}].[ProcessRun] ([RecordProcessID]);

-- Index for foreign key EntityID in table ProcessRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProcessRun_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProcessRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProcessRun_EntityID ON [${flyway:defaultSchema}].[ProcessRun] ([EntityID]);

-- Index for foreign key ScheduledJobRunID in table ProcessRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProcessRun_ScheduledJobRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProcessRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProcessRun_ScheduledJobRunID ON [${flyway:defaultSchema}].[ProcessRun] ([ScheduledJobRunID]);

-- Index for foreign key StartedByUserID in table ProcessRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProcessRun_StartedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProcessRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProcessRun_StartedByUserID ON [${flyway:defaultSchema}].[ProcessRun] ([StartedByUserID]);

/* Base View SQL for MJ: Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Run Details
-- Item: vwProcessRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Process Run Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ProcessRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProcessRunDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProcessRunDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProcessRunDetails]
AS
SELECT
    p.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJActionExecutionLog_ActionExecutionLogID.[Action] AS [ActionExecutionLog],
    MJAIAgentRun_AIAgentRunID.[RunName] AS [AIAgentRun]
FROM
    [${flyway:defaultSchema}].[ProcessRunDetail] AS p
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [p].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwActionExecutionLogs] AS MJActionExecutionLog_ActionExecutionLogID
  ON
    [p].[ActionExecutionLogID] = MJActionExecutionLog_ActionExecutionLogID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AIAgentRunID
  ON
    [p].[AIAgentRunID] = MJAIAgentRun_AIAgentRunID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRunDetails] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRunDetails] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRunDetails] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProcessRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Run Details
-- Item: Permissions for vwProcessRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRunDetails] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRunDetails] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRunDetails] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProcessRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Run Details
-- Item: spCreateProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProcessRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProcessRunDetail]
    @ID uniqueidentifier = NULL,
    @ProcessRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @DurationMs_Clear bit = 0,
    @DurationMs int = NULL,
    @AttemptCount int = NULL,
    @ResultPayload_Clear bit = 0,
    @ResultPayload nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ActionExecutionLogID_Clear bit = 0,
    @ActionExecutionLogID uniqueidentifier = NULL,
    @AIAgentRunID_Clear bit = 0,
    @AIAgentRunID uniqueidentifier = NULL,
    @Warnings_Clear bit = 0,
    @Warnings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProcessRunDetail]
            (
                [ID],
                [ProcessRunID],
                [EntityID],
                [RecordID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationMs],
                [AttemptCount],
                [ResultPayload],
                [ErrorMessage],
                [ActionExecutionLogID],
                [AIAgentRunID],
                [Warnings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ProcessRunID,
                @EntityID,
                @RecordID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @DurationMs_Clear = 1 THEN NULL ELSE ISNULL(@DurationMs, NULL) END,
                ISNULL(@AttemptCount, 0),
                CASE WHEN @ResultPayload_Clear = 1 THEN NULL ELSE ISNULL(@ResultPayload, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, NULL) END,
                CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, NULL) END,
                CASE WHEN @Warnings_Clear = 1 THEN NULL ELSE ISNULL(@Warnings, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProcessRunDetail]
            (
                [ProcessRunID],
                [EntityID],
                [RecordID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationMs],
                [AttemptCount],
                [ResultPayload],
                [ErrorMessage],
                [ActionExecutionLogID],
                [AIAgentRunID],
                [Warnings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ProcessRunID,
                @EntityID,
                @RecordID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @DurationMs_Clear = 1 THEN NULL ELSE ISNULL(@DurationMs, NULL) END,
                ISNULL(@AttemptCount, 0),
                CASE WHEN @ResultPayload_Clear = 1 THEN NULL ELSE ISNULL(@ResultPayload, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, NULL) END,
                CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, NULL) END,
                CASE WHEN @Warnings_Clear = 1 THEN NULL ELSE ISNULL(@Warnings, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProcessRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRunDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRunDetail] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Process Run Details */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRunDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRunDetail] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Run Details
-- Item: spUpdateProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProcessRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProcessRunDetail]
    @ID uniqueidentifier,
    @ProcessRunID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(450) = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @DurationMs_Clear bit = 0,
    @DurationMs int = NULL,
    @AttemptCount int = NULL,
    @ResultPayload_Clear bit = 0,
    @ResultPayload nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ActionExecutionLogID_Clear bit = 0,
    @ActionExecutionLogID uniqueidentifier = NULL,
    @AIAgentRunID_Clear bit = 0,
    @AIAgentRunID uniqueidentifier = NULL,
    @Warnings_Clear bit = 0,
    @Warnings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProcessRunDetail]
    SET
        [ProcessRunID] = ISNULL(@ProcessRunID, [ProcessRunID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [DurationMs] = CASE WHEN @DurationMs_Clear = 1 THEN NULL ELSE ISNULL(@DurationMs, [DurationMs]) END,
        [AttemptCount] = ISNULL(@AttemptCount, [AttemptCount]),
        [ResultPayload] = CASE WHEN @ResultPayload_Clear = 1 THEN NULL ELSE ISNULL(@ResultPayload, [ResultPayload]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ActionExecutionLogID] = CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, [ActionExecutionLogID]) END,
        [AIAgentRunID] = CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, [AIAgentRunID]) END,
        [Warnings] = CASE WHEN @Warnings_Clear = 1 THEN NULL ELSE ISNULL(@Warnings, [Warnings]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProcessRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProcessRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRunDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRunDetail] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProcessRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProcessRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProcessRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProcessRunDetail
ON [${flyway:defaultSchema}].[ProcessRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProcessRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProcessRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Process Run Details */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRunDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRunDetail] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRunDetail] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Runs
-- Item: vwProcessRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Process Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ProcessRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProcessRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProcessRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProcessRuns]
AS
SELECT
    p.*,
    MJRecordProcess_RecordProcessID.[Name] AS [RecordProcess],
    MJEntity_EntityID.[Name] AS [Entity],
    MJScheduledJobRun_ScheduledJobRunID.[ScheduledJob] AS [ScheduledJobRun],
    MJUser_StartedByUserID.[Name] AS [StartedByUser]
FROM
    [${flyway:defaultSchema}].[ProcessRun] AS p
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RecordProcess] AS MJRecordProcess_RecordProcessID
  ON
    [p].[RecordProcessID] = MJRecordProcess_RecordProcessID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [p].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwScheduledJobRuns] AS MJScheduledJobRun_ScheduledJobRunID
  ON
    [p].[ScheduledJobRunID] = MJScheduledJobRun_ScheduledJobRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_StartedByUserID
  ON
    [p].[StartedByUserID] = MJUser_StartedByUserID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Runs
-- Item: Permissions for vwProcessRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProcessRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Runs
-- Item: spCreateProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProcessRun]
    @ID uniqueidentifier = NULL,
    @RecordProcessID_Clear bit = 0,
    @RecordProcessID uniqueidentifier = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @TriggeredBy nvarchar(20),
    @SourceType nvarchar(20),
    @SourceID_Clear bit = 0,
    @SourceID uniqueidentifier = NULL,
    @SourceFilter_Clear bit = 0,
    @SourceFilter nvarchar(MAX) = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @StartTime_Clear bit = 0,
    @StartTime datetimeoffset = NULL,
    @EndTime_Clear bit = 0,
    @EndTime datetimeoffset = NULL,
    @TotalItemCount_Clear bit = 0,
    @TotalItemCount int = NULL,
    @ProcessedItems int = NULL,
    @SuccessCount int = NULL,
    @ErrorCount int = NULL,
    @SkippedCount int = NULL,
    @LastProcessedOffset_Clear bit = 0,
    @LastProcessedOffset int = NULL,
    @LastProcessedKey_Clear bit = 0,
    @LastProcessedKey nvarchar(450) = NULL,
    @BatchSize_Clear bit = 0,
    @BatchSize int = NULL,
    @CancellationRequested bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @StartedByUserID_Clear bit = 0,
    @StartedByUserID uniqueidentifier = NULL,
    @DryRun bit = NULL,
    @ResultSummary_Clear bit = 0,
    @ResultSummary nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProcessRun]
            (
                [ID],
                [RecordProcessID],
                [EntityID],
                [TriggeredBy],
                [SourceType],
                [SourceID],
                [SourceFilter],
                [ScheduledJobRunID],
                [Status],
                [StartTime],
                [EndTime],
                [TotalItemCount],
                [ProcessedItems],
                [SuccessCount],
                [ErrorCount],
                [SkippedCount],
                [LastProcessedOffset],
                [LastProcessedKey],
                [BatchSize],
                [CancellationRequested],
                [Configuration],
                [ErrorMessage],
                [StartedByUserID],
                [DryRun],
                [ResultSummary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                @TriggeredBy,
                @SourceType,
                CASE WHEN @SourceID_Clear = 1 THEN NULL ELSE ISNULL(@SourceID, NULL) END,
                CASE WHEN @SourceFilter_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilter, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartTime_Clear = 1 THEN NULL ELSE ISNULL(@StartTime, NULL) END,
                CASE WHEN @EndTime_Clear = 1 THEN NULL ELSE ISNULL(@EndTime, NULL) END,
                CASE WHEN @TotalItemCount_Clear = 1 THEN NULL ELSE ISNULL(@TotalItemCount, NULL) END,
                ISNULL(@ProcessedItems, 0),
                ISNULL(@SuccessCount, 0),
                ISNULL(@ErrorCount, 0),
                ISNULL(@SkippedCount, 0),
                CASE WHEN @LastProcessedOffset_Clear = 1 THEN NULL ELSE ISNULL(@LastProcessedOffset, NULL) END,
                CASE WHEN @LastProcessedKey_Clear = 1 THEN NULL ELSE ISNULL(@LastProcessedKey, NULL) END,
                CASE WHEN @BatchSize_Clear = 1 THEN NULL ELSE ISNULL(@BatchSize, NULL) END,
                ISNULL(@CancellationRequested, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @StartedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@StartedByUserID, NULL) END,
                ISNULL(@DryRun, 0),
                CASE WHEN @ResultSummary_Clear = 1 THEN NULL ELSE ISNULL(@ResultSummary, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProcessRun]
            (
                [RecordProcessID],
                [EntityID],
                [TriggeredBy],
                [SourceType],
                [SourceID],
                [SourceFilter],
                [ScheduledJobRunID],
                [Status],
                [StartTime],
                [EndTime],
                [TotalItemCount],
                [ProcessedItems],
                [SuccessCount],
                [ErrorCount],
                [SkippedCount],
                [LastProcessedOffset],
                [LastProcessedKey],
                [BatchSize],
                [CancellationRequested],
                [Configuration],
                [ErrorMessage],
                [StartedByUserID],
                [DryRun],
                [ResultSummary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                @TriggeredBy,
                @SourceType,
                CASE WHEN @SourceID_Clear = 1 THEN NULL ELSE ISNULL(@SourceID, NULL) END,
                CASE WHEN @SourceFilter_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilter, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartTime_Clear = 1 THEN NULL ELSE ISNULL(@StartTime, NULL) END,
                CASE WHEN @EndTime_Clear = 1 THEN NULL ELSE ISNULL(@EndTime, NULL) END,
                CASE WHEN @TotalItemCount_Clear = 1 THEN NULL ELSE ISNULL(@TotalItemCount, NULL) END,
                ISNULL(@ProcessedItems, 0),
                ISNULL(@SuccessCount, 0),
                ISNULL(@ErrorCount, 0),
                ISNULL(@SkippedCount, 0),
                CASE WHEN @LastProcessedOffset_Clear = 1 THEN NULL ELSE ISNULL(@LastProcessedOffset, NULL) END,
                CASE WHEN @LastProcessedKey_Clear = 1 THEN NULL ELSE ISNULL(@LastProcessedKey, NULL) END,
                CASE WHEN @BatchSize_Clear = 1 THEN NULL ELSE ISNULL(@BatchSize, NULL) END,
                ISNULL(@CancellationRequested, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @StartedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@StartedByUserID, NULL) END,
                ISNULL(@DryRun, 0),
                CASE WHEN @ResultSummary_Clear = 1 THEN NULL ELSE ISNULL(@ResultSummary, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProcessRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Process Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Runs
-- Item: spUpdateProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProcessRun]
    @ID uniqueidentifier,
    @RecordProcessID_Clear bit = 0,
    @RecordProcessID uniqueidentifier = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @TriggeredBy nvarchar(20) = NULL,
    @SourceType nvarchar(20) = NULL,
    @SourceID_Clear bit = 0,
    @SourceID uniqueidentifier = NULL,
    @SourceFilter_Clear bit = 0,
    @SourceFilter nvarchar(MAX) = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @StartTime_Clear bit = 0,
    @StartTime datetimeoffset = NULL,
    @EndTime_Clear bit = 0,
    @EndTime datetimeoffset = NULL,
    @TotalItemCount_Clear bit = 0,
    @TotalItemCount int = NULL,
    @ProcessedItems int = NULL,
    @SuccessCount int = NULL,
    @ErrorCount int = NULL,
    @SkippedCount int = NULL,
    @LastProcessedOffset_Clear bit = 0,
    @LastProcessedOffset int = NULL,
    @LastProcessedKey_Clear bit = 0,
    @LastProcessedKey nvarchar(450) = NULL,
    @BatchSize_Clear bit = 0,
    @BatchSize int = NULL,
    @CancellationRequested bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @StartedByUserID_Clear bit = 0,
    @StartedByUserID uniqueidentifier = NULL,
    @DryRun bit = NULL,
    @ResultSummary_Clear bit = 0,
    @ResultSummary nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProcessRun]
    SET
        [RecordProcessID] = CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, [RecordProcessID]) END,
        [EntityID] = CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, [EntityID]) END,
        [TriggeredBy] = ISNULL(@TriggeredBy, [TriggeredBy]),
        [SourceType] = ISNULL(@SourceType, [SourceType]),
        [SourceID] = CASE WHEN @SourceID_Clear = 1 THEN NULL ELSE ISNULL(@SourceID, [SourceID]) END,
        [SourceFilter] = CASE WHEN @SourceFilter_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilter, [SourceFilter]) END,
        [ScheduledJobRunID] = CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, [ScheduledJobRunID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartTime] = CASE WHEN @StartTime_Clear = 1 THEN NULL ELSE ISNULL(@StartTime, [StartTime]) END,
        [EndTime] = CASE WHEN @EndTime_Clear = 1 THEN NULL ELSE ISNULL(@EndTime, [EndTime]) END,
        [TotalItemCount] = CASE WHEN @TotalItemCount_Clear = 1 THEN NULL ELSE ISNULL(@TotalItemCount, [TotalItemCount]) END,
        [ProcessedItems] = ISNULL(@ProcessedItems, [ProcessedItems]),
        [SuccessCount] = ISNULL(@SuccessCount, [SuccessCount]),
        [ErrorCount] = ISNULL(@ErrorCount, [ErrorCount]),
        [SkippedCount] = ISNULL(@SkippedCount, [SkippedCount]),
        [LastProcessedOffset] = CASE WHEN @LastProcessedOffset_Clear = 1 THEN NULL ELSE ISNULL(@LastProcessedOffset, [LastProcessedOffset]) END,
        [LastProcessedKey] = CASE WHEN @LastProcessedKey_Clear = 1 THEN NULL ELSE ISNULL(@LastProcessedKey, [LastProcessedKey]) END,
        [BatchSize] = CASE WHEN @BatchSize_Clear = 1 THEN NULL ELSE ISNULL(@BatchSize, [BatchSize]) END,
        [CancellationRequested] = ISNULL(@CancellationRequested, [CancellationRequested]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [StartedByUserID] = CASE WHEN @StartedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@StartedByUserID, [StartedByUserID]) END,
        [DryRun] = ISNULL(@DryRun, [DryRun]),
        [ResultSummary] = CASE WHEN @ResultSummary_Clear = 1 THEN NULL ELSE ISNULL(@ResultSummary, [ResultSummary]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProcessRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProcessRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProcessRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProcessRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProcessRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProcessRun
ON [${flyway:defaultSchema}].[ProcessRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProcessRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProcessRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Process Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Run Details
-- Item: spDeleteProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProcessRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProcessRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ProcessRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRunDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRunDetail] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Process Run Details */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRunDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRunDetail] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Runs
-- Item: spDeleteProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProcessRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ProcessRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Process Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProcessRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_CompactPromptIDID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactLength int
    DECLARE @MJAIAgentActions_CompactPromptID_CompactPromptID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool bit
    DECLARE cascade_update_MJAIAgentActions_CompactPromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID], [DeclareAsNativeTool]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [CompactPromptID] = @ID

    OPEN cascade_update_MJAIAgentActions_CompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID, @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_CompactPromptID_CompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_CompactPromptIDID, @AgentID = @MJAIAgentActions_CompactPromptID_AgentID, @ActionID = @MJAIAgentActions_CompactPromptID_ActionID, @Status = @MJAIAgentActions_CompactPromptID_Status, @MinExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_CompactPromptID_CompactMode, @CompactLength = @MJAIAgentActions_CompactPromptID_CompactLength, @CompactPromptID_Clear = 1, @CompactPromptID = @MJAIAgentActions_CompactPromptID_CompactPromptID, @DeclareAsNativeTool = @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool

        FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID, @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool
    END

    CLOSE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_PromptIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_PromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_StartingStep bit
    DECLARE @MJAIAgentSteps_PromptID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_PromptID_RetryCount int
    DECLARE @MJAIAgentSteps_PromptID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_PositionX int
    DECLARE @MJAIAgentSteps_PromptID_PositionY int
    DECLARE @MJAIAgentSteps_PromptID_Width int
    DECLARE @MJAIAgentSteps_PromptID_Height int
    DECLARE @MJAIAgentSteps_PromptID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_PromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJAIAgentSteps_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_PromptIDID, @AgentID = @MJAIAgentSteps_PromptID_AgentID, @Name = @MJAIAgentSteps_PromptID_Name, @Description = @MJAIAgentSteps_PromptID_Description, @StepType = @MJAIAgentSteps_PromptID_StepType, @StartingStep = @MJAIAgentSteps_PromptID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_PromptID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_PromptID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_PromptID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_PromptID_ActionID, @SubAgentID = @MJAIAgentSteps_PromptID_SubAgentID, @PromptID_Clear = 1, @PromptID = @MJAIAgentSteps_PromptID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_PromptID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_PromptID_PositionX, @PositionY = @MJAIAgentSteps_PromptID_PositionY, @Width = @MJAIAgentSteps_PromptID_Width, @Height = @MJAIAgentSteps_PromptID_Height, @Status = @MJAIAgentSteps_PromptID_Status, @ActionInputMapping = @MJAIAgentSteps_PromptID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_PromptID_LoopBodyType, @Configuration = @MJAIAgentSteps_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_PromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_PromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_SystemPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_SystemPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_SystemPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_SystemPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [SystemPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_ConfigSchema, @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_SystemPromptID_SystemPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_SystemPromptIDID, @Name = @MJAIAgentTypes_SystemPromptID_Name, @Description = @MJAIAgentTypes_SystemPromptID_Description, @SystemPromptID_Clear = 1, @SystemPromptID = @MJAIAgentTypes_SystemPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_SystemPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_SystemPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_SystemPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_SystemPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_ConfigSchema, @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor INTO @MJAIAgentTypes_ContextCompressionPromptIDID, @MJAIAgentTypes_ContextCompressionPromptID_Name, @MJAIAgentTypes_ContextCompressionPromptID_Description, @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_ContextCompressionPromptIDID, @Name = @MJAIAgentTypes_ContextCompressionPromptID_Name, @Description = @MJAIAgentTypes_ContextCompressionPromptID_Description, @SystemPromptID = @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor INTO @MJAIAgentTypes_ContextCompressionPromptIDID, @MJAIAgentTypes_ContextCompressionPromptID_Name, @MJAIAgentTypes_ContextCompressionPromptID_Description, @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [ConversationSummaryPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor INTO @MJAIAgentTypes_ConversationSummaryPromptIDID, @MJAIAgentTypes_ConversationSummaryPromptID_Name, @MJAIAgentTypes_ConversationSummaryPromptID_Description, @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_ConversationSummaryPromptIDID, @Name = @MJAIAgentTypes_ConversationSummaryPromptID_Name, @Description = @MJAIAgentTypes_ConversationSummaryPromptID_Description, @SystemPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @ConversationSummaryPromptID_Clear = 1, @ConversationSummaryPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor INTO @MJAIAgentTypes_ConversationSummaryPromptIDID, @MJAIAgentTypes_ConversationSummaryPromptID_Name, @MJAIAgentTypes_ConversationSummaryPromptID_Description, @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxMessages int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_RequirePlanMode bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ContextCompressionPromptIDID, @Name = @MJAIAgents_ContextCompressionPromptID_Name, @Description = @MJAIAgents_ContextCompressionPromptID_Description, @LogoURL = @MJAIAgents_ContextCompressionPromptID_LogoURL, @ParentID = @MJAIAgents_ContextCompressionPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ContextCompressionPromptID_TypeID, @Status = @MJAIAgents_ContextCompressionPromptID_Status, @DriverClass = @MJAIAgents_ContextCompressionPromptID_DriverClass, @IconClass = @MJAIAgents_ContextCompressionPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ContextCompressionPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ContextCompressionPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MessageMode = @MJAIAgents_ContextCompressionPromptID_MessageMode, @MaxMessages = @MJAIAgents_ContextCompressionPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ContextCompressionPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools
    END

    CLOSE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ConversationSummaryPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxMessages int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ConversationSummaryPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ConversationSummaryPromptIDID, @Name = @MJAIAgents_ConversationSummaryPromptID_Name, @Description = @MJAIAgents_ConversationSummaryPromptID_Description, @LogoURL = @MJAIAgents_ConversationSummaryPromptID_LogoURL, @ParentID = @MJAIAgents_ConversationSummaryPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ConversationSummaryPromptID_TypeID, @Status = @MJAIAgents_ConversationSummaryPromptID_Status, @DriverClass = @MJAIAgents_ConversationSummaryPromptID_DriverClass, @IconClass = @MJAIAgents_ConversationSummaryPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MessageMode = @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MaxMessages = @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ConversationSummaryPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @ConversationSummaryPromptID_Clear = 1, @ConversationSummaryPromptID = @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools
    END

    CLOSE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextCompressionID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @Name = @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @DefaultPromptForContextCompressionID_Clear = 1, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextSummarizationID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @Name = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID_Clear = 1, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel
    DECLARE @MJAIPromptModels_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptModels_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptModel]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptModels_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptModel] @ID = @MJAIPromptModels_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptModels_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptModels_PromptID_cursor
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun
    DECLARE @MJAIPromptRuns_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRuns_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptRuns_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRun] @ID = @MJAIPromptRuns_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRuns_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRuns_PromptID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_JudgeIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_JudgeID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsed int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPrompt int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletion int
    DECLARE @MJAIPromptRuns_JudgeID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_Success bit
    DECLARE @MJAIPromptRuns_JudgeID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_JudgeID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_JudgeID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopK int
    DECLARE @MJAIPromptRuns_JudgeID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_Seed int
    DECLARE @MJAIPromptRuns_JudgeID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_LogProbs bit
    DECLARE @MJAIPromptRuns_JudgeID_TopLogProbs int
    DECLARE @MJAIPromptRuns_JudgeID_DescendantCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_JudgeID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_JudgeID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_JudgeID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_JudgeID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_JudgeID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_Cancelled bit
    DECLARE @MJAIPromptRuns_JudgeID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_JudgeID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_CacheHit bit
    DECLARE @MJAIPromptRuns_JudgeID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_JudgeID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_JudgeID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_JudgeID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_JudgeID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_QueueTime int
    DECLARE @MJAIPromptRuns_JudgeID_PromptTime int
    DECLARE @MJAIPromptRuns_JudgeID_CompletionTime int
    DECLARE @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_EffortLevel int
    DECLARE @MJAIPromptRuns_JudgeID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup int
    DECLARE @MJAIPromptRuns_JudgeID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_JudgeID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_JudgeID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [JudgeID] = @ID

    OPEN cascade_update_MJAIPromptRuns_JudgeID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup, @MJAIPromptRuns_JudgeID_InputUnitsUsed, @MJAIPromptRuns_JudgeID_OutputUnitsUsed, @MJAIPromptRuns_JudgeID_UsageTypeID, @MJAIPromptRuns_JudgeID_ToolCallingMode, @MJAIPromptRuns_JudgeID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_JudgeID_JudgeID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_JudgeIDID, @PromptID = @MJAIPromptRuns_JudgeID_PromptID, @ModelID = @MJAIPromptRuns_JudgeID_ModelID, @VendorID = @MJAIPromptRuns_JudgeID_VendorID, @AgentID = @MJAIPromptRuns_JudgeID_AgentID, @ConfigurationID = @MJAIPromptRuns_JudgeID_ConfigurationID, @RunAt = @MJAIPromptRuns_JudgeID_RunAt, @CompletedAt = @MJAIPromptRuns_JudgeID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_JudgeID_Messages, @Result = @MJAIPromptRuns_JudgeID_Result, @TokensUsed = @MJAIPromptRuns_JudgeID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_JudgeID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_JudgeID_TokensCompletion, @TotalCost = @MJAIPromptRuns_JudgeID_TotalCost, @Success = @MJAIPromptRuns_JudgeID_Success, @ErrorMessage = @MJAIPromptRuns_JudgeID_ErrorMessage, @ParentID = @MJAIPromptRuns_JudgeID_ParentID, @RunType = @MJAIPromptRuns_JudgeID_RunType, @ExecutionOrder = @MJAIPromptRuns_JudgeID_ExecutionOrder, @Cost = @MJAIPromptRuns_JudgeID_Cost, @CostCurrency = @MJAIPromptRuns_JudgeID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_JudgeID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_JudgeID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_JudgeID_Temperature, @TopP = @MJAIPromptRuns_JudgeID_TopP, @TopK = @MJAIPromptRuns_JudgeID_TopK, @MinP = @MJAIPromptRuns_JudgeID_MinP, @FrequencyPenalty = @MJAIPromptRuns_JudgeID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_JudgeID_PresencePenalty, @Seed = @MJAIPromptRuns_JudgeID_Seed, @StopSequences = @MJAIPromptRuns_JudgeID_StopSequences, @ResponseFormat = @MJAIPromptRuns_JudgeID_ResponseFormat, @LogProbs = @MJAIPromptRuns_JudgeID_LogProbs, @TopLogProbs = @MJAIPromptRuns_JudgeID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_JudgeID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_JudgeID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_JudgeID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_JudgeID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_JudgeID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_JudgeID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_JudgeID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_JudgeID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_JudgeID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_JudgeID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_JudgeID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_JudgeID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_JudgeID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_JudgeID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_JudgeID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_JudgeID_ModelSelection, @Status = @MJAIPromptRuns_JudgeID_Status, @Cancelled = @MJAIPromptRuns_JudgeID_Cancelled, @CancellationReason = @MJAIPromptRuns_JudgeID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_JudgeID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_JudgeID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_JudgeID_CacheHit, @CacheKey = @MJAIPromptRuns_JudgeID_CacheKey, @JudgeID_Clear = 1, @JudgeID = @MJAIPromptRuns_JudgeID_JudgeID, @JudgeScore = @MJAIPromptRuns_JudgeID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_JudgeID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_JudgeID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_JudgeID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_JudgeID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_JudgeID_ChildPromptID, @QueueTime = @MJAIPromptRuns_JudgeID_QueueTime, @PromptTime = @MJAIPromptRuns_JudgeID_PromptTime, @CompletionTime = @MJAIPromptRuns_JudgeID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_JudgeID_EffortLevel, @RunName = @MJAIPromptRuns_JudgeID_RunName, @Comments = @MJAIPromptRuns_JudgeID_Comments, @TestRunID = @MJAIPromptRuns_JudgeID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_JudgeID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_JudgeID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_JudgeID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_JudgeID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_JudgeID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_JudgeID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_JudgeID_ToolCallingMode, @UserID = @MJAIPromptRuns_JudgeID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup, @MJAIPromptRuns_JudgeID_InputUnitsUsed, @MJAIPromptRuns_JudgeID_OutputUnitsUsed, @MJAIPromptRuns_JudgeID_UsageTypeID, @MJAIPromptRuns_JudgeID_ToolCallingMode, @MJAIPromptRuns_JudgeID_UserID
    END

    CLOSE cascade_update_MJAIPromptRuns_JudgeID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_JudgeID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ChildPromptIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsed int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_Success bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ChildPromptID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopK int
    DECLARE @MJAIPromptRuns_ChildPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_Seed int
    DECLARE @MJAIPromptRuns_ChildPromptID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_LogProbs bit
    DECLARE @MJAIPromptRuns_ChildPromptID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ChildPromptID_DescendantCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_Cancelled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ChildPromptID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheHit bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ChildPromptID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ChildPromptID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_QueueTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletionTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_EffortLevel int
    DECLARE @MJAIPromptRuns_ChildPromptID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_ChildPromptID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_ChildPromptID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ChildPromptID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup, @MJAIPromptRuns_ChildPromptID_InputUnitsUsed, @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed, @MJAIPromptRuns_ChildPromptID_UsageTypeID, @MJAIPromptRuns_ChildPromptID_ToolCallingMode, @MJAIPromptRuns_ChildPromptID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ChildPromptID_ChildPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ChildPromptIDID, @PromptID = @MJAIPromptRuns_ChildPromptID_PromptID, @ModelID = @MJAIPromptRuns_ChildPromptID_ModelID, @VendorID = @MJAIPromptRuns_ChildPromptID_VendorID, @AgentID = @MJAIPromptRuns_ChildPromptID_AgentID, @ConfigurationID = @MJAIPromptRuns_ChildPromptID_ConfigurationID, @RunAt = @MJAIPromptRuns_ChildPromptID_RunAt, @CompletedAt = @MJAIPromptRuns_ChildPromptID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ChildPromptID_Messages, @Result = @MJAIPromptRuns_ChildPromptID_Result, @TokensUsed = @MJAIPromptRuns_ChildPromptID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ChildPromptID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ChildPromptID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ChildPromptID_TotalCost, @Success = @MJAIPromptRuns_ChildPromptID_Success, @ErrorMessage = @MJAIPromptRuns_ChildPromptID_ErrorMessage, @ParentID = @MJAIPromptRuns_ChildPromptID_ParentID, @RunType = @MJAIPromptRuns_ChildPromptID_RunType, @ExecutionOrder = @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @Cost = @MJAIPromptRuns_ChildPromptID_Cost, @CostCurrency = @MJAIPromptRuns_ChildPromptID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ChildPromptID_Temperature, @TopP = @MJAIPromptRuns_ChildPromptID_TopP, @TopK = @MJAIPromptRuns_ChildPromptID_TopK, @MinP = @MJAIPromptRuns_ChildPromptID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ChildPromptID_PresencePenalty, @Seed = @MJAIPromptRuns_ChildPromptID_Seed, @StopSequences = @MJAIPromptRuns_ChildPromptID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ChildPromptID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ChildPromptID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ChildPromptID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ChildPromptID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ChildPromptID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ChildPromptID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ChildPromptID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ChildPromptID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ChildPromptID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ChildPromptID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ChildPromptID_ModelSelection, @Status = @MJAIPromptRuns_ChildPromptID_Status, @Cancelled = @MJAIPromptRuns_ChildPromptID_Cancelled, @CancellationReason = @MJAIPromptRuns_ChildPromptID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ChildPromptID_CacheHit, @CacheKey = @MJAIPromptRuns_ChildPromptID_CacheKey, @JudgeID = @MJAIPromptRuns_ChildPromptID_JudgeID, @JudgeScore = @MJAIPromptRuns_ChildPromptID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ChildPromptID_ErrorDetails, @ChildPromptID_Clear = 1, @ChildPromptID = @MJAIPromptRuns_ChildPromptID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ChildPromptID_QueueTime, @PromptTime = @MJAIPromptRuns_ChildPromptID_PromptTime, @CompletionTime = @MJAIPromptRuns_ChildPromptID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ChildPromptID_EffortLevel, @RunName = @MJAIPromptRuns_ChildPromptID_RunName, @Comments = @MJAIPromptRuns_ChildPromptID_Comments, @TestRunID = @MJAIPromptRuns_ChildPromptID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_ChildPromptID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_ChildPromptID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_ChildPromptID_ToolCallingMode, @UserID = @MJAIPromptRuns_ChildPromptID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup, @MJAIPromptRuns_ChildPromptID_InputUnitsUsed, @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed, @MJAIPromptRuns_ChildPromptID_UsageTypeID, @MJAIPromptRuns_ChildPromptID_ToolCallingMode, @MJAIPromptRuns_ChildPromptID_UserID
    END

    CLOSE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt
    DECLARE @MJAIPrompts_ResultSelectorPromptIDID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Name nvarchar(255)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Description nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TemplateID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Status nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResponseFormat nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinPowerRank int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PowerPreference nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelCount int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam nvarchar(100)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputType nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputExample nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MaxRetries int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EnableCaching bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMatchType nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold float(53)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptRole nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptPosition nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopK int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Seed int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_StopSequences nvarchar(1000)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopLogProbs int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EffortLevel int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration nvarchar(MAX)
    DECLARE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [TemplateID], [CategoryID], [TypeID], [Status], [ResponseFormat], [ModelSpecificResponseFormat], [AIModelTypeID], [MinPowerRank], [SelectionStrategy], [PowerPreference], [ParallelizationMode], [ParallelCount], [ParallelConfigParam], [OutputType], [OutputExample], [ValidationBehavior], [MaxRetries], [RetryDelayMS], [RetryStrategy], [ResultSelectorPromptID], [EnableCaching], [CacheTTLSeconds], [CacheMatchType], [CacheSimilarityThreshold], [CacheMustMatchModel], [CacheMustMatchVendor], [CacheMustMatchAgent], [CacheMustMatchConfig], [PromptRole], [PromptPosition], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [IncludeLogProbs], [TopLogProbs], [FailoverStrategy], [FailoverMaxAttempts], [FailoverDelaySeconds], [FailoverModelStrategy], [FailoverErrorScope], [EffortLevel], [AssistantPrefill], [PrefillFallbackMode], [RequireSpecificModels], [PromptConfiguration]
        FROM [${flyway:defaultSchema}].[AIPrompt]
        WHERE [ResultSelectorPromptID] = @ID

    OPEN cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPrompt] @ID = @MJAIPrompts_ResultSelectorPromptIDID, @Name = @MJAIPrompts_ResultSelectorPromptID_Name, @Description = @MJAIPrompts_ResultSelectorPromptID_Description, @TemplateID = @MJAIPrompts_ResultSelectorPromptID_TemplateID, @CategoryID = @MJAIPrompts_ResultSelectorPromptID_CategoryID, @TypeID = @MJAIPrompts_ResultSelectorPromptID_TypeID, @Status = @MJAIPrompts_ResultSelectorPromptID_Status, @ResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @ModelSpecificResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @AIModelTypeID = @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MinPowerRank = @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @SelectionStrategy = @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @PowerPreference = @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @ParallelizationMode = @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @ParallelCount = @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @ParallelConfigParam = @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @OutputType = @MJAIPrompts_ResultSelectorPromptID_OutputType, @OutputExample = @MJAIPrompts_ResultSelectorPromptID_OutputExample, @ValidationBehavior = @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MaxRetries = @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @RetryDelayMS = @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @RetryStrategy = @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @ResultSelectorPromptID_Clear = 1, @ResultSelectorPromptID = @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @EnableCaching = @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @CacheTTLSeconds = @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @CacheMatchType = @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @CacheSimilarityThreshold = @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @CacheMustMatchModel = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @CacheMustMatchVendor = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @CacheMustMatchAgent = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @CacheMustMatchConfig = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @PromptRole = @MJAIPrompts_ResultSelectorPromptID_PromptRole, @PromptPosition = @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @Temperature = @MJAIPrompts_ResultSelectorPromptID_Temperature, @TopP = @MJAIPrompts_ResultSelectorPromptID_TopP, @TopK = @MJAIPrompts_ResultSelectorPromptID_TopK, @MinP = @MJAIPrompts_ResultSelectorPromptID_MinP, @FrequencyPenalty = @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @Seed = @MJAIPrompts_ResultSelectorPromptID_Seed, @StopSequences = @MJAIPrompts_ResultSelectorPromptID_StopSequences, @IncludeLogProbs = @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @TopLogProbs = @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @FailoverStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @FailoverMaxAttempts = @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @FailoverDelaySeconds = @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @FailoverModelStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @FailoverErrorScope = @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @EffortLevel = @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @AssistantPrefill = @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @PrefillFallbackMode = @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @RequireSpecificModels = @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @PromptConfiguration = @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration

        FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration
    END

    CLOSE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    DEALLOCATE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache
    DECLARE @MJAIResultCache_AIPromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIResultCache_AIPromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AIPromptID] = @ID
    
    OPEN cascade_delete_MJAIResultCache_AIPromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIResultCache] @ID = @MJAIResultCache_AIPromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    END
    
    CLOSE cascade_delete_MJAIResultCache_AIPromptID_cursor
    DEALLOCATE cascade_delete_MJAIResultCache_AIPromptID_cursor
    
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_DefaultCompactPromptIDID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CategoryID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Name nvarchar(425)
    DECLARE @MJActions_DefaultCompactPromptID_Description nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Type nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_UserComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Code nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_DefaultCompactPromptID_CodeLocked bit
    DECLARE @MJActions_DefaultCompactPromptID_ForceCodeGeneration bit
    DECLARE @MJActions_DefaultCompactPromptID_RetentionPeriod int
    DECLARE @MJActions_DefaultCompactPromptID_Status nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_DriverClass nvarchar(255)
    DECLARE @MJActions_DefaultCompactPromptID_ParentID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_IconClass nvarchar(100)
    DECLARE @MJActions_DefaultCompactPromptID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Config nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS int
    DECLARE @MJActions_DefaultCompactPromptID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_DefaultCompactPromptID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [DefaultCompactPromptID] = @ID

    OPEN cascade_update_MJActions_DefaultCompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_DefaultCompactPromptID_DefaultCompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_DefaultCompactPromptIDID, @CategoryID = @MJActions_DefaultCompactPromptID_CategoryID, @Name = @MJActions_DefaultCompactPromptID_Name, @Description = @MJActions_DefaultCompactPromptID_Description, @Type = @MJActions_DefaultCompactPromptID_Type, @UserPrompt = @MJActions_DefaultCompactPromptID_UserPrompt, @UserComments = @MJActions_DefaultCompactPromptID_UserComments, @Code = @MJActions_DefaultCompactPromptID_Code, @CodeComments = @MJActions_DefaultCompactPromptID_CodeComments, @CodeApprovalStatus = @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_DefaultCompactPromptID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_DefaultCompactPromptID_CodeApprovedAt, @CodeLocked = @MJActions_DefaultCompactPromptID_CodeLocked, @ForceCodeGeneration = @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @RetentionPeriod = @MJActions_DefaultCompactPromptID_RetentionPeriod, @Status = @MJActions_DefaultCompactPromptID_Status, @DriverClass = @MJActions_DefaultCompactPromptID_DriverClass, @ParentID = @MJActions_DefaultCompactPromptID_ParentID, @IconClass = @MJActions_DefaultCompactPromptID_IconClass, @DefaultCompactPromptID_Clear = 1, @DefaultCompactPromptID = @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @Config = @MJActions_DefaultCompactPromptID_Config, @RuntimeActionConfiguration = @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @CreatedByAgentID = @MJActions_DefaultCompactPromptID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_DefaultCompactPromptID_cursor
    DEALLOCATE cascade_update_MJActions_DefaultCompactPromptID_cursor
    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument
    DECLARE @MJEntityDocuments_ReasoningPromptIDID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Name nvarchar(250)
    DECLARE @MJEntityDocuments_ReasoningPromptID_TypeID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_EntityID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Status nvarchar(15)
    DECLARE @MJEntityDocuments_ReasoningPromptID_TemplateID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_AIModelID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_VectorIndexID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Configuration nvarchar(MAX)
    DECLARE @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning bit
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningMode nvarchar(20)
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_AutomationLevel nvarchar(30)
    DECLARE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [TypeID], [EntityID], [VectorDatabaseID], [Status], [TemplateID], [AIModelID], [PotentialMatchThreshold], [AbsoluteMatchThreshold], [VectorIndexID], [Configuration], [EnableLLMReasoning], [ReasoningMode], [ReasoningThreshold], [ReasoningPromptID], [ReasoningAgentID], [AutomationLevel]
        FROM [${flyway:defaultSchema}].[EntityDocument]
        WHERE [ReasoningPromptID] = @ID

    OPEN cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningPromptID_cursor INTO @MJEntityDocuments_ReasoningPromptIDID, @MJEntityDocuments_ReasoningPromptID_Name, @MJEntityDocuments_ReasoningPromptID_TypeID, @MJEntityDocuments_ReasoningPromptID_EntityID, @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @MJEntityDocuments_ReasoningPromptID_Status, @MJEntityDocuments_ReasoningPromptID_TemplateID, @MJEntityDocuments_ReasoningPromptID_AIModelID, @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @MJEntityDocuments_ReasoningPromptID_Configuration, @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @MJEntityDocuments_ReasoningPromptID_AutomationLevel

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateEntityDocument] @ID = @MJEntityDocuments_ReasoningPromptIDID, @Name = @MJEntityDocuments_ReasoningPromptID_Name, @TypeID = @MJEntityDocuments_ReasoningPromptID_TypeID, @EntityID = @MJEntityDocuments_ReasoningPromptID_EntityID, @VectorDatabaseID = @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @Status = @MJEntityDocuments_ReasoningPromptID_Status, @TemplateID = @MJEntityDocuments_ReasoningPromptID_TemplateID, @AIModelID = @MJEntityDocuments_ReasoningPromptID_AIModelID, @PotentialMatchThreshold = @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @AbsoluteMatchThreshold = @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @VectorIndexID = @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @Configuration = @MJEntityDocuments_ReasoningPromptID_Configuration, @EnableLLMReasoning = @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @ReasoningMode = @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @ReasoningThreshold = @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @ReasoningPromptID_Clear = 1, @ReasoningPromptID = @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @ReasoningAgentID = @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @AutomationLevel = @MJEntityDocuments_ReasoningPromptID_AutomationLevel

        FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningPromptID_cursor INTO @MJEntityDocuments_ReasoningPromptIDID, @MJEntityDocuments_ReasoningPromptID_Name, @MJEntityDocuments_ReasoningPromptID_TypeID, @MJEntityDocuments_ReasoningPromptID_EntityID, @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @MJEntityDocuments_ReasoningPromptID_Status, @MJEntityDocuments_ReasoningPromptID_TemplateID, @MJEntityDocuments_ReasoningPromptID_AIModelID, @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @MJEntityDocuments_ReasoningPromptID_Configuration, @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @MJEntityDocuments_ReasoningPromptID_AutomationLevel
    END

    CLOSE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    DEALLOCATE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    
    -- Cascade update on FeaturePipelineVersion using cursor to call spUpdateFeaturePipelineVersion
    DECLARE @MJFeaturePipelineVersions_PromptIDID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_RecordProcessID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_Version int
    DECLARE @MJFeaturePipelineVersions_PromptID_PinHash nvarchar(64)
    DECLARE @MJFeaturePipelineVersions_PromptID_SpecHash nvarchar(64)
    DECLARE @MJFeaturePipelineVersions_PromptID_PromptID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_PromptVersionHash nvarchar(64)
    DECLARE @MJFeaturePipelineVersions_PromptID_AIModelID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_ParametersHash nvarchar(64)
    DECLARE @MJFeaturePipelineVersions_PromptID_Status nvarchar(20)
    DECLARE @MJFeaturePipelineVersions_PromptID_Gated bit
    DECLARE @MJFeaturePipelineVersions_PromptID_GoldenSetTestID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_GoldenSetTestRunID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_Metric nvarchar(20)
    DECLARE @MJFeaturePipelineVersions_PromptID_Threshold float(53)
    DECLARE @MJFeaturePipelineVersions_PromptID_ResultValue float(53)
    DECLARE @MJFeaturePipelineVersions_PromptID_ResultLower float(53)
    DECLARE @MJFeaturePipelineVersions_PromptID_ResultUpper float(53)
    DECLARE @MJFeaturePipelineVersions_PromptID_ResultN int
    DECLARE @MJFeaturePipelineVersions_PromptID_ResultDetails nvarchar(MAX)
    DECLARE @MJFeaturePipelineVersions_PromptID_ActivatedAt datetimeoffset
    DECLARE @MJFeaturePipelineVersions_PromptID_ApprovedByUserID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_RetiredAt datetimeoffset
    DECLARE @MJFeaturePipelineVersions_PromptID_BackfilledAt datetimeoffset
    DECLARE cascade_update_MJFeaturePipelineVersions_PromptID_cursor CURSOR FOR
        SELECT [ID], [RecordProcessID], [Version], [PinHash], [SpecHash], [PromptID], [PromptVersionHash], [AIModelID], [ParametersHash], [Status], [Gated], [GoldenSetTestID], [GoldenSetTestRunID], [Metric], [Threshold], [ResultValue], [ResultLower], [ResultUpper], [ResultN], [ResultDetails], [ActivatedAt], [ApprovedByUserID], [RetiredAt], [BackfilledAt]
        FROM [${flyway:defaultSchema}].[FeaturePipelineVersion]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJFeaturePipelineVersions_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJFeaturePipelineVersions_PromptID_cursor INTO @MJFeaturePipelineVersions_PromptIDID, @MJFeaturePipelineVersions_PromptID_RecordProcessID, @MJFeaturePipelineVersions_PromptID_Version, @MJFeaturePipelineVersions_PromptID_PinHash, @MJFeaturePipelineVersions_PromptID_SpecHash, @MJFeaturePipelineVersions_PromptID_PromptID, @MJFeaturePipelineVersions_PromptID_PromptVersionHash, @MJFeaturePipelineVersions_PromptID_AIModelID, @MJFeaturePipelineVersions_PromptID_ParametersHash, @MJFeaturePipelineVersions_PromptID_Status, @MJFeaturePipelineVersions_PromptID_Gated, @MJFeaturePipelineVersions_PromptID_GoldenSetTestID, @MJFeaturePipelineVersions_PromptID_GoldenSetTestRunID, @MJFeaturePipelineVersions_PromptID_Metric, @MJFeaturePipelineVersions_PromptID_Threshold, @MJFeaturePipelineVersions_PromptID_ResultValue, @MJFeaturePipelineVersions_PromptID_ResultLower, @MJFeaturePipelineVersions_PromptID_ResultUpper, @MJFeaturePipelineVersions_PromptID_ResultN, @MJFeaturePipelineVersions_PromptID_ResultDetails, @MJFeaturePipelineVersions_PromptID_ActivatedAt, @MJFeaturePipelineVersions_PromptID_ApprovedByUserID, @MJFeaturePipelineVersions_PromptID_RetiredAt, @MJFeaturePipelineVersions_PromptID_BackfilledAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJFeaturePipelineVersions_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateFeaturePipelineVersion] @ID = @MJFeaturePipelineVersions_PromptIDID, @RecordProcessID = @MJFeaturePipelineVersions_PromptID_RecordProcessID, @Version = @MJFeaturePipelineVersions_PromptID_Version, @PinHash = @MJFeaturePipelineVersions_PromptID_PinHash, @SpecHash = @MJFeaturePipelineVersions_PromptID_SpecHash, @PromptID_Clear = 1, @PromptID = @MJFeaturePipelineVersions_PromptID_PromptID, @PromptVersionHash = @MJFeaturePipelineVersions_PromptID_PromptVersionHash, @AIModelID = @MJFeaturePipelineVersions_PromptID_AIModelID, @ParametersHash = @MJFeaturePipelineVersions_PromptID_ParametersHash, @Status = @MJFeaturePipelineVersions_PromptID_Status, @Gated = @MJFeaturePipelineVersions_PromptID_Gated, @GoldenSetTestID = @MJFeaturePipelineVersions_PromptID_GoldenSetTestID, @GoldenSetTestRunID = @MJFeaturePipelineVersions_PromptID_GoldenSetTestRunID, @Metric = @MJFeaturePipelineVersions_PromptID_Metric, @Threshold = @MJFeaturePipelineVersions_PromptID_Threshold, @ResultValue = @MJFeaturePipelineVersions_PromptID_ResultValue, @ResultLower = @MJFeaturePipelineVersions_PromptID_ResultLower, @ResultUpper = @MJFeaturePipelineVersions_PromptID_ResultUpper, @ResultN = @MJFeaturePipelineVersions_PromptID_ResultN, @ResultDetails = @MJFeaturePipelineVersions_PromptID_ResultDetails, @ActivatedAt = @MJFeaturePipelineVersions_PromptID_ActivatedAt, @ApprovedByUserID = @MJFeaturePipelineVersions_PromptID_ApprovedByUserID, @RetiredAt = @MJFeaturePipelineVersions_PromptID_RetiredAt, @BackfilledAt = @MJFeaturePipelineVersions_PromptID_BackfilledAt

        FETCH NEXT FROM cascade_update_MJFeaturePipelineVersions_PromptID_cursor INTO @MJFeaturePipelineVersions_PromptIDID, @MJFeaturePipelineVersions_PromptID_RecordProcessID, @MJFeaturePipelineVersions_PromptID_Version, @MJFeaturePipelineVersions_PromptID_PinHash, @MJFeaturePipelineVersions_PromptID_SpecHash, @MJFeaturePipelineVersions_PromptID_PromptID, @MJFeaturePipelineVersions_PromptID_PromptVersionHash, @MJFeaturePipelineVersions_PromptID_AIModelID, @MJFeaturePipelineVersions_PromptID_ParametersHash, @MJFeaturePipelineVersions_PromptID_Status, @MJFeaturePipelineVersions_PromptID_Gated, @MJFeaturePipelineVersions_PromptID_GoldenSetTestID, @MJFeaturePipelineVersions_PromptID_GoldenSetTestRunID, @MJFeaturePipelineVersions_PromptID_Metric, @MJFeaturePipelineVersions_PromptID_Threshold, @MJFeaturePipelineVersions_PromptID_ResultValue, @MJFeaturePipelineVersions_PromptID_ResultLower, @MJFeaturePipelineVersions_PromptID_ResultUpper, @MJFeaturePipelineVersions_PromptID_ResultN, @MJFeaturePipelineVersions_PromptID_ResultDetails, @MJFeaturePipelineVersions_PromptID_ActivatedAt, @MJFeaturePipelineVersions_PromptID_ApprovedByUserID, @MJFeaturePipelineVersions_PromptID_RetiredAt, @MJFeaturePipelineVersions_PromptID_BackfilledAt
    END

    CLOSE cascade_update_MJFeaturePipelineVersions_PromptID_cursor
    DEALLOCATE cascade_update_MJFeaturePipelineVersions_PromptID_cursor
    
    -- Cascade delete from FeatureValueCache using cursor to call spDeleteFeatureValueCache
    DECLARE @MJFeatureValueCaches_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJFeatureValueCaches_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[FeatureValueCache]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJFeatureValueCaches_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJFeatureValueCaches_PromptID_cursor INTO @MJFeatureValueCaches_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteFeatureValueCache] @ID = @MJFeatureValueCaches_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJFeatureValueCaches_PromptID_cursor INTO @MJFeatureValueCaches_PromptIDID
    END
    
    CLOSE cascade_delete_MJFeatureValueCaches_PromptID_cursor
    DEALLOCATE cascade_delete_MJFeatureValueCaches_PromptID_cursor
    
    -- Cascade update on FeatureValue using cursor to call spUpdateFeatureValue
    DECLARE @MJFeatureValues_PromptIDID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_RecordProcessID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_EntityID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_RecordID nvarchar(900)
    DECLARE @MJFeatureValues_PromptID_FeatureName nvarchar(255)
    DECLARE @MJFeatureValues_PromptID_ValueText nvarchar(MAX)
    DECLARE @MJFeatureValues_PromptID_ValueNumeric float(53)
    DECLARE @MJFeatureValues_PromptID_ValueDate datetimeoffset
    DECLARE @MJFeatureValues_PromptID_ValueBoolean bit
    DECLARE @MJFeatureValues_PromptID_ValueJSON nvarchar(MAX)
    DECLARE @MJFeatureValues_PromptID_Reasoning nvarchar(MAX)
    DECLARE @MJFeatureValues_PromptID_Confidence float(53)
    DECLARE @MJFeatureValues_PromptID_PromptID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_PromptVersionHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_ConstraintHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_ProcessRunID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_ProcessRunDetailID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_AIPromptRunID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_FeatureValueCacheID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_ComputedAt datetimeoffset
    DECLARE @MJFeatureValues_PromptID_PipelineVersion int
    DECLARE @MJFeatureValues_PromptID_AIModelID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_ParametersHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_InputHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_ValueKeyHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_Source nvarchar(20)
    DECLARE cascade_update_MJFeatureValues_PromptID_cursor CURSOR FOR
        SELECT [ID], [RecordProcessID], [EntityID], [RecordID], [FeatureName], [ValueText], [ValueNumeric], [ValueDate], [ValueBoolean], [ValueJSON], [Reasoning], [Confidence], [PromptID], [PromptVersionHash], [ConstraintHash], [ProcessRunID], [ProcessRunDetailID], [AIPromptRunID], [FeatureValueCacheID], [ComputedAt], [PipelineVersion], [AIModelID], [ParametersHash], [InputHash], [ValueKeyHash], [Source]
        FROM [${flyway:defaultSchema}].[FeatureValue]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJFeatureValues_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJFeatureValues_PromptID_cursor INTO @MJFeatureValues_PromptIDID, @MJFeatureValues_PromptID_RecordProcessID, @MJFeatureValues_PromptID_EntityID, @MJFeatureValues_PromptID_RecordID, @MJFeatureValues_PromptID_FeatureName, @MJFeatureValues_PromptID_ValueText, @MJFeatureValues_PromptID_ValueNumeric, @MJFeatureValues_PromptID_ValueDate, @MJFeatureValues_PromptID_ValueBoolean, @MJFeatureValues_PromptID_ValueJSON, @MJFeatureValues_PromptID_Reasoning, @MJFeatureValues_PromptID_Confidence, @MJFeatureValues_PromptID_PromptID, @MJFeatureValues_PromptID_PromptVersionHash, @MJFeatureValues_PromptID_ConstraintHash, @MJFeatureValues_PromptID_ProcessRunID, @MJFeatureValues_PromptID_ProcessRunDetailID, @MJFeatureValues_PromptID_AIPromptRunID, @MJFeatureValues_PromptID_FeatureValueCacheID, @MJFeatureValues_PromptID_ComputedAt, @MJFeatureValues_PromptID_PipelineVersion, @MJFeatureValues_PromptID_AIModelID, @MJFeatureValues_PromptID_ParametersHash, @MJFeatureValues_PromptID_InputHash, @MJFeatureValues_PromptID_ValueKeyHash, @MJFeatureValues_PromptID_Source

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJFeatureValues_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateFeatureValue] @ID = @MJFeatureValues_PromptIDID, @RecordProcessID = @MJFeatureValues_PromptID_RecordProcessID, @EntityID = @MJFeatureValues_PromptID_EntityID, @RecordID = @MJFeatureValues_PromptID_RecordID, @FeatureName = @MJFeatureValues_PromptID_FeatureName, @ValueText = @MJFeatureValues_PromptID_ValueText, @ValueNumeric = @MJFeatureValues_PromptID_ValueNumeric, @ValueDate = @MJFeatureValues_PromptID_ValueDate, @ValueBoolean = @MJFeatureValues_PromptID_ValueBoolean, @ValueJSON = @MJFeatureValues_PromptID_ValueJSON, @Reasoning = @MJFeatureValues_PromptID_Reasoning, @Confidence = @MJFeatureValues_PromptID_Confidence, @PromptID_Clear = 1, @PromptID = @MJFeatureValues_PromptID_PromptID, @PromptVersionHash = @MJFeatureValues_PromptID_PromptVersionHash, @ConstraintHash = @MJFeatureValues_PromptID_ConstraintHash, @ProcessRunID = @MJFeatureValues_PromptID_ProcessRunID, @ProcessRunDetailID = @MJFeatureValues_PromptID_ProcessRunDetailID, @AIPromptRunID = @MJFeatureValues_PromptID_AIPromptRunID, @FeatureValueCacheID = @MJFeatureValues_PromptID_FeatureValueCacheID, @ComputedAt = @MJFeatureValues_PromptID_ComputedAt, @PipelineVersion = @MJFeatureValues_PromptID_PipelineVersion, @AIModelID = @MJFeatureValues_PromptID_AIModelID, @ParametersHash = @MJFeatureValues_PromptID_ParametersHash, @InputHash = @MJFeatureValues_PromptID_InputHash, @ValueKeyHash = @MJFeatureValues_PromptID_ValueKeyHash, @Source = @MJFeatureValues_PromptID_Source

        FETCH NEXT FROM cascade_update_MJFeatureValues_PromptID_cursor INTO @MJFeatureValues_PromptIDID, @MJFeatureValues_PromptID_RecordProcessID, @MJFeatureValues_PromptID_EntityID, @MJFeatureValues_PromptID_RecordID, @MJFeatureValues_PromptID_FeatureName, @MJFeatureValues_PromptID_ValueText, @MJFeatureValues_PromptID_ValueNumeric, @MJFeatureValues_PromptID_ValueDate, @MJFeatureValues_PromptID_ValueBoolean, @MJFeatureValues_PromptID_ValueJSON, @MJFeatureValues_PromptID_Reasoning, @MJFeatureValues_PromptID_Confidence, @MJFeatureValues_PromptID_PromptID, @MJFeatureValues_PromptID_PromptVersionHash, @MJFeatureValues_PromptID_ConstraintHash, @MJFeatureValues_PromptID_ProcessRunID, @MJFeatureValues_PromptID_ProcessRunDetailID, @MJFeatureValues_PromptID_AIPromptRunID, @MJFeatureValues_PromptID_FeatureValueCacheID, @MJFeatureValues_PromptID_ComputedAt, @MJFeatureValues_PromptID_PipelineVersion, @MJFeatureValues_PromptID_AIModelID, @MJFeatureValues_PromptID_ParametersHash, @MJFeatureValues_PromptID_InputHash, @MJFeatureValues_PromptID_ValueKeyHash, @MJFeatureValues_PromptID_Source
    END

    CLOSE cascade_update_MJFeatureValues_PromptID_cursor
    DEALLOCATE cascade_update_MJFeatureValues_PromptID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_PromptIDID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_PromptID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_PromptID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_PromptID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_PromptID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_PromptID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_PromptID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_PromptID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_PromptID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_BatchSize int
    DECLARE @MJRecordProcesses_PromptID_MaxConcurrency int
    DECLARE @MJRecordProcesses_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_PromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJRecordProcesses_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_PromptIDID, @Name = @MJRecordProcesses_PromptID_Name, @Description = @MJRecordProcesses_PromptID_Description, @CategoryID = @MJRecordProcesses_PromptID_CategoryID, @EntityID = @MJRecordProcesses_PromptID_EntityID, @Status = @MJRecordProcesses_PromptID_Status, @WorkType = @MJRecordProcesses_PromptID_WorkType, @ActionID = @MJRecordProcesses_PromptID_ActionID, @AgentID = @MJRecordProcesses_PromptID_AgentID, @PromptID_Clear = 1, @PromptID = @MJRecordProcesses_PromptID_PromptID, @ScopeType = @MJRecordProcesses_PromptID_ScopeType, @ScopeViewID = @MJRecordProcesses_PromptID_ScopeViewID, @ScopeListID = @MJRecordProcesses_PromptID_ScopeListID, @ScopeFilter = @MJRecordProcesses_PromptID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_PromptID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_PromptID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_PromptID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_PromptID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_PromptID_CronExpression, @Timezone = @MJRecordProcesses_PromptID_Timezone, @OnDemandEnabled = @MJRecordProcesses_PromptID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_PromptID_InputMapping, @OutputMapping = @MJRecordProcesses_PromptID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_PromptID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_PromptID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_PromptID_BatchSize, @MaxConcurrency = @MJRecordProcesses_PromptID_MaxConcurrency, @Configuration = @MJRecordProcesses_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_PromptID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_PromptID_cursor
    
    -- Cascade delete from ScopedPromptConfig using cursor to call spDeleteScopedPromptConfig
    DECLARE @MJScopedPromptConfigs_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJScopedPromptConfigs_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScopedPromptConfig]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJScopedPromptConfigs_PromptID_cursor INTO @MJScopedPromptConfigs_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteScopedPromptConfig] @ID = @MJScopedPromptConfigs_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJScopedPromptConfigs_PromptID_cursor INTO @MJScopedPromptConfigs_PromptIDID
    END
    
    CLOSE cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    DEALLOCATE cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    
    -- Cascade delete from ScopedPromptPart using cursor to call spDeleteScopedPromptPart
    DECLARE @MJScopedPromptParts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJScopedPromptParts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScopedPromptPart]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJScopedPromptParts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJScopedPromptParts_PromptID_cursor INTO @MJScopedPromptParts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteScopedPromptPart] @ID = @MJScopedPromptParts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJScopedPromptParts_PromptID_cursor INTO @MJScopedPromptParts_PromptIDID
    END
    
    CLOSE cascade_delete_MJScopedPromptParts_PromptID_cursor
    DEALLOCATE cascade_delete_MJScopedPromptParts_PromptID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_PromptIDID uniqueidentifier
    DECLARE @MJTasks_PromptID_ParentID uniqueidentifier
    DECLARE @MJTasks_PromptID_Name nvarchar(255)
    DECLARE @MJTasks_PromptID_Description nvarchar(MAX)
    DECLARE @MJTasks_PromptID_TypeID uniqueidentifier
    DECLARE @MJTasks_PromptID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_PromptID_ProjectID uniqueidentifier
    DECLARE @MJTasks_PromptID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_PromptID_UserID uniqueidentifier
    DECLARE @MJTasks_PromptID_AgentID uniqueidentifier
    DECLARE @MJTasks_PromptID_Status nvarchar(50)
    DECLARE @MJTasks_PromptID_PercentComplete int
    DECLARE @MJTasks_PromptID_DueAt datetimeoffset
    DECLARE @MJTasks_PromptID_StartedAt datetimeoffset
    DECLARE @MJTasks_PromptID_CompletedAt datetimeoffset
    DECLARE @MJTasks_PromptID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_PromptID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_PromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_PromptID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_PromptID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_PromptID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_PromptID_ActionID uniqueidentifier
    DECLARE @MJTasks_PromptID_StepType nvarchar(20)
    DECLARE @MJTasks_PromptID_PromptID uniqueidentifier
    DECLARE @MJTasks_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_PromptID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJTasks_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_PromptID_cursor INTO @MJTasks_PromptIDID, @MJTasks_PromptID_ParentID, @MJTasks_PromptID_Name, @MJTasks_PromptID_Description, @MJTasks_PromptID_TypeID, @MJTasks_PromptID_EnvironmentID, @MJTasks_PromptID_ProjectID, @MJTasks_PromptID_ConversationDetailID, @MJTasks_PromptID_UserID, @MJTasks_PromptID_AgentID, @MJTasks_PromptID_Status, @MJTasks_PromptID_PercentComplete, @MJTasks_PromptID_DueAt, @MJTasks_PromptID_StartedAt, @MJTasks_PromptID_CompletedAt, @MJTasks_PromptID_InputPayload, @MJTasks_PromptID_OutputPayload, @MJTasks_PromptID_ErrorMessage, @MJTasks_PromptID_AgentRunID, @MJTasks_PromptID_ClaimedBy, @MJTasks_PromptID_ClaimExpiresAt, @MJTasks_PromptID_ActionID, @MJTasks_PromptID_StepType, @MJTasks_PromptID_PromptID, @MJTasks_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_PromptIDID, @ParentID = @MJTasks_PromptID_ParentID, @Name = @MJTasks_PromptID_Name, @Description = @MJTasks_PromptID_Description, @TypeID = @MJTasks_PromptID_TypeID, @EnvironmentID = @MJTasks_PromptID_EnvironmentID, @ProjectID = @MJTasks_PromptID_ProjectID, @ConversationDetailID = @MJTasks_PromptID_ConversationDetailID, @UserID = @MJTasks_PromptID_UserID, @AgentID = @MJTasks_PromptID_AgentID, @Status = @MJTasks_PromptID_Status, @PercentComplete = @MJTasks_PromptID_PercentComplete, @DueAt = @MJTasks_PromptID_DueAt, @StartedAt = @MJTasks_PromptID_StartedAt, @CompletedAt = @MJTasks_PromptID_CompletedAt, @InputPayload = @MJTasks_PromptID_InputPayload, @OutputPayload = @MJTasks_PromptID_OutputPayload, @ErrorMessage = @MJTasks_PromptID_ErrorMessage, @AgentRunID = @MJTasks_PromptID_AgentRunID, @ClaimedBy = @MJTasks_PromptID_ClaimedBy, @ClaimExpiresAt = @MJTasks_PromptID_ClaimExpiresAt, @ActionID = @MJTasks_PromptID_ActionID, @StepType = @MJTasks_PromptID_StepType, @PromptID_Clear = 1, @PromptID = @MJTasks_PromptID_PromptID, @Configuration = @MJTasks_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_PromptID_cursor INTO @MJTasks_PromptIDID, @MJTasks_PromptID_ParentID, @MJTasks_PromptID_Name, @MJTasks_PromptID_Description, @MJTasks_PromptID_TypeID, @MJTasks_PromptID_EnvironmentID, @MJTasks_PromptID_ProjectID, @MJTasks_PromptID_ConversationDetailID, @MJTasks_PromptID_UserID, @MJTasks_PromptID_AgentID, @MJTasks_PromptID_Status, @MJTasks_PromptID_PercentComplete, @MJTasks_PromptID_DueAt, @MJTasks_PromptID_StartedAt, @MJTasks_PromptID_CompletedAt, @MJTasks_PromptID_InputPayload, @MJTasks_PromptID_OutputPayload, @MJTasks_PromptID_ErrorMessage, @MJTasks_PromptID_AgentRunID, @MJTasks_PromptID_ClaimedBy, @MJTasks_PromptID_ClaimExpiresAt, @MJTasks_PromptID_ActionID, @MJTasks_PromptID_StepType, @MJTasks_PromptID_PromptID, @MJTasks_PromptID_Configuration
    END

    CLOSE cascade_update_MJTasks_PromptID_cursor
    DEALLOCATE cascade_update_MJTasks_PromptID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* spDelete Permissions for MJ: AI Prompts */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceAIAgentRunIDID, @AgentID = @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @UserID = @MJAIAgentExamples_SourceAIAgentRunID_UserID, @CompanyID = @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @Type = @MJAIAgentExamples_SourceAIAgentRunID_Type, @ExampleInput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @Comments = @MJAIAgentExamples_SourceAIAgentRunID_Comments, @Status = @MJAIAgentExamples_SourceAIAgentRunID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt, @EmbeddingVectorBinary = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AuthorType nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @MJAIAgentNotes_SourceAIAgentRunID_AuthorType, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceAIAgentRunIDID, @AgentID = @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceAIAgentRunID_Note, @UserID = @MJAIAgentNotes_SourceAIAgentRunID_UserID, @Type = @MJAIAgentNotes_SourceAIAgentRunID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceAIAgentRunID_Comments, @Status = @MJAIAgentNotes_SourceAIAgentRunID_Status, @SourceConversationID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @AuthorType = @MJAIAgentNotes_SourceAIAgentRunID_AuthorType, @EmbeddingVectorBinary = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @MJAIAgentNotes_SourceAIAgentRunID_AuthorType, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_OriginatingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingTaskID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource], [OriginatingTaskID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [OriginatingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingTaskID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_OriginatingAgentRunIDID, @AgentID = @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_OriginatingAgentRunID_Status, @Request = @MJAIAgentRequests_OriginatingAgentRunID_Request, @Response = @MJAIAgentRequests_OriginatingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_OriginatingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_OriginatingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @OriginatingAgentRunID_Clear = 1, @OriginatingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource, @OriginatingTaskID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingTaskID

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingTaskID
    END

    CLOSE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_ResumingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSource nvarchar(20)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingTaskID uniqueidentifier
    DECLARE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource], [OriginatingTaskID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [ResumingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource, @MJAIAgentRequests_ResumingAgentRunID_OriginatingTaskID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_ResumingAgentRunIDID, @AgentID = @MJAIAgentRequests_ResumingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_ResumingAgentRunID_Status, @Request = @MJAIAgentRequests_ResumingAgentRunID_Request, @Response = @MJAIAgentRequests_ResumingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_ResumingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_ResumingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @OriginatingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID_Clear = 1, @ResumingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_ResumingAgentRunID_ResponseSource, @OriginatingTaskID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingTaskID

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource, @MJAIAgentRequests_ResumingAgentRunID_OriginatingTaskID
    END

    CLOSE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia
    DECLARE @MJAIAgentRunMedias_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunMedia]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] @ID = @MJAIAgentRunMedias_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] @ID = @MJAIAgentRunSteps_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ParentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ParentRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_Success bit
    DECLARE @MJAIAgentRuns_ParentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCost decimal(19, 8)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ParentRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ParentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Verbose bit
    DECLARE @MJAIAgentRuns_ParentRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_ParentRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ParentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ParentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PlanMode bit
    DECLARE @MJAIAgentRuns_ParentRunID_ExternalSessionID nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_ContinuationDepth int
    DECLARE cascade_update_MJAIAgentRuns_ParentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ParentRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ParentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID, @MJAIAgentRuns_ParentRunID_PlanMode, @MJAIAgentRuns_ParentRunID_ExternalSessionID, @MJAIAgentRuns_ParentRunID_ContinuationDepth

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ParentRunID_ParentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ParentRunIDID, @AgentID = @MJAIAgentRuns_ParentRunID_AgentID, @ParentRunID_Clear = 1, @ParentRunID = @MJAIAgentRuns_ParentRunID_ParentRunID, @Status = @MJAIAgentRuns_ParentRunID_Status, @StartedAt = @MJAIAgentRuns_ParentRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_ParentRunID_CompletedAt, @Success = @MJAIAgentRuns_ParentRunID_Success, @ErrorMessage = @MJAIAgentRuns_ParentRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ParentRunID_ConversationID, @UserID = @MJAIAgentRuns_ParentRunID_UserID, @Result = @MJAIAgentRuns_ParentRunID_Result, @AgentState = @MJAIAgentRuns_ParentRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ParentRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ParentRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ParentRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ParentRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_ParentRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_ParentRunID_FinalPayload, @Message = @MJAIAgentRuns_ParentRunID_Message, @LastRunID = @MJAIAgentRuns_ParentRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_ParentRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ParentRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ParentRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ParentRunID_OverrideVendorID, @Data = @MJAIAgentRuns_ParentRunID_Data, @Verbose = @MJAIAgentRuns_ParentRunID_Verbose, @EffortLevel = @MJAIAgentRuns_ParentRunID_EffortLevel, @RunName = @MJAIAgentRuns_ParentRunID_RunName, @Comments = @MJAIAgentRuns_ParentRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ParentRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ParentRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ParentRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ParentRunID_AgentSessionID, @PlanMode = @MJAIAgentRuns_ParentRunID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_ParentRunID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_ParentRunID_ContinuationDepth

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID, @MJAIAgentRuns_ParentRunID_PlanMode, @MJAIAgentRuns_ParentRunID_ExternalSessionID, @MJAIAgentRuns_ParentRunID_ContinuationDepth
    END

    CLOSE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_LastRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_LastRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_Success bit
    DECLARE @MJAIAgentRuns_LastRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCost decimal(19, 8)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_LastRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_LastRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Verbose bit
    DECLARE @MJAIAgentRuns_LastRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_LastRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_LastRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_LastRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PlanMode bit
    DECLARE @MJAIAgentRuns_LastRunID_ExternalSessionID nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_ContinuationDepth int
    DECLARE cascade_update_MJAIAgentRuns_LastRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [LastRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_LastRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID, @MJAIAgentRuns_LastRunID_PlanMode, @MJAIAgentRuns_LastRunID_ExternalSessionID, @MJAIAgentRuns_LastRunID_ContinuationDepth

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_LastRunID_LastRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_LastRunIDID, @AgentID = @MJAIAgentRuns_LastRunID_AgentID, @ParentRunID = @MJAIAgentRuns_LastRunID_ParentRunID, @Status = @MJAIAgentRuns_LastRunID_Status, @StartedAt = @MJAIAgentRuns_LastRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_LastRunID_CompletedAt, @Success = @MJAIAgentRuns_LastRunID_Success, @ErrorMessage = @MJAIAgentRuns_LastRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_LastRunID_ConversationID, @UserID = @MJAIAgentRuns_LastRunID_UserID, @Result = @MJAIAgentRuns_LastRunID_Result, @AgentState = @MJAIAgentRuns_LastRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_LastRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_LastRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_LastRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_LastRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_LastRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_LastRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_LastRunID_FinalPayload, @Message = @MJAIAgentRuns_LastRunID_Message, @LastRunID_Clear = 1, @LastRunID = @MJAIAgentRuns_LastRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_LastRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_LastRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_LastRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_LastRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_LastRunID_OverrideVendorID, @Data = @MJAIAgentRuns_LastRunID_Data, @Verbose = @MJAIAgentRuns_LastRunID_Verbose, @EffortLevel = @MJAIAgentRuns_LastRunID_EffortLevel, @RunName = @MJAIAgentRuns_LastRunID_RunName, @Comments = @MJAIAgentRuns_LastRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_LastRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_LastRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_LastRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_LastRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_LastRunID_AgentSessionID, @PlanMode = @MJAIAgentRuns_LastRunID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_LastRunID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_LastRunID_ContinuationDepth

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID, @MJAIAgentRuns_LastRunID_PlanMode, @MJAIAgentRuns_LastRunID_ExternalSessionID, @MJAIAgentRuns_LastRunID_ContinuationDepth
    END

    CLOSE cascade_update_MJAIAgentRuns_LastRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_LastRunID_cursor
    
    -- Cascade update on ConversationSkill using cursor to call spUpdateConversationSkill
    DECLARE @MJConversationSkills_ActivatedByRunIDID uniqueidentifier
    DECLARE @MJConversationSkills_ActivatedByRunID_ConversationID uniqueidentifier
    DECLARE @MJConversationSkills_ActivatedByRunID_SkillID uniqueidentifier
    DECLARE @MJConversationSkills_ActivatedByRunID_Status nvarchar(20)
    DECLARE @MJConversationSkills_ActivatedByRunID_ActivatedByRunID uniqueidentifier
    DECLARE @MJConversationSkills_ActivatedByRunID_EndedAt datetimeoffset
    DECLARE cascade_update_MJConversationSkills_ActivatedByRunID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [SkillID], [Status], [ActivatedByRunID], [EndedAt]
        FROM [${flyway:defaultSchema}].[ConversationSkill]
        WHERE [ActivatedByRunID] = @ID

    OPEN cascade_update_MJConversationSkills_ActivatedByRunID_cursor
    FETCH NEXT FROM cascade_update_MJConversationSkills_ActivatedByRunID_cursor INTO @MJConversationSkills_ActivatedByRunIDID, @MJConversationSkills_ActivatedByRunID_ConversationID, @MJConversationSkills_ActivatedByRunID_SkillID, @MJConversationSkills_ActivatedByRunID_Status, @MJConversationSkills_ActivatedByRunID_ActivatedByRunID, @MJConversationSkills_ActivatedByRunID_EndedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationSkills_ActivatedByRunID_ActivatedByRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationSkill] @ID = @MJConversationSkills_ActivatedByRunIDID, @ConversationID = @MJConversationSkills_ActivatedByRunID_ConversationID, @SkillID = @MJConversationSkills_ActivatedByRunID_SkillID, @Status = @MJConversationSkills_ActivatedByRunID_Status, @ActivatedByRunID_Clear = 1, @ActivatedByRunID = @MJConversationSkills_ActivatedByRunID_ActivatedByRunID, @EndedAt = @MJConversationSkills_ActivatedByRunID_EndedAt

        FETCH NEXT FROM cascade_update_MJConversationSkills_ActivatedByRunID_cursor INTO @MJConversationSkills_ActivatedByRunIDID, @MJConversationSkills_ActivatedByRunID_ConversationID, @MJConversationSkills_ActivatedByRunID_SkillID, @MJConversationSkills_ActivatedByRunID_Status, @MJConversationSkills_ActivatedByRunID_ActivatedByRunID, @MJConversationSkills_ActivatedByRunID_EndedAt
    END

    CLOSE cascade_update_MJConversationSkills_ActivatedByRunID_cursor
    DEALLOCATE cascade_update_MJConversationSkills_ActivatedByRunID_cursor
    
    -- Cascade update on DuplicateRunDetailMatch using cursor to call spUpdateDuplicateRunDetailMatch
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunIDID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_Action nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap nvarchar(MAX)
    DECLARE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [DuplicateRunDetailID], [MatchSource], [MatchRecordID], [MatchProbability], [MatchedAt], [Action], [ApprovalStatus], [RecordMergeLogID], [MergeStatus], [MergedAt], [RecordMetadata], [AIAgentRunID], [AIPromptRunID], [LLMRecommendation], [LLMConfidence], [LLMReasoning], [LLMProposedSurvivorRecordID], [LLMProposedFieldMap]
        FROM [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor INTO @MJDuplicateRunDetailMatches_AIAgentRunIDID, @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] @ID = @MJDuplicateRunDetailMatches_AIAgentRunIDID, @DuplicateRunDetailID = @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MatchSource = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MatchRecordID = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MatchProbability = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MatchedAt = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @Action = @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @ApprovalStatus = @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @RecordMergeLogID = @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MergeStatus = @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MergedAt = @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @RecordMetadata = @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @AIPromptRunID = @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @LLMRecommendation = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @LLMConfidence = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @LLMReasoning = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @LLMProposedSurvivorRecordID = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @LLMProposedFieldMap = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap

        FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor INTO @MJDuplicateRunDetailMatches_AIAgentRunIDID, @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap
    END

    CLOSE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    
    -- Cascade update on ExperimentSessionIteration using cursor to call spUpdateExperimentSessionIteration
    DECLARE @MJExperimentSessionIterations_AIAgentRunIDID uniqueidentifier
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID uniqueidentifier
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Sequence int
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Label nvarchar(255)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Score decimal(18, 6)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_ComputeCost decimal(18, 6)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_TokensUsed int
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Rationale nvarchar(MAX)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [ExperimentSessionID], [Sequence], [Label], [Status], [Score], [ComputeCost], [TokensUsed], [Rationale], [AIAgentRunID]
        FROM [${flyway:defaultSchema}].[ExperimentSessionIteration]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor INTO @MJExperimentSessionIterations_AIAgentRunIDID, @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @MJExperimentSessionIterations_AIAgentRunID_Sequence, @MJExperimentSessionIterations_AIAgentRunID_Label, @MJExperimentSessionIterations_AIAgentRunID_Status, @MJExperimentSessionIterations_AIAgentRunID_Score, @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @MJExperimentSessionIterations_AIAgentRunID_Rationale, @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateExperimentSessionIteration] @ID = @MJExperimentSessionIterations_AIAgentRunIDID, @ExperimentSessionID = @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @Sequence = @MJExperimentSessionIterations_AIAgentRunID_Sequence, @Label = @MJExperimentSessionIterations_AIAgentRunID_Label, @Status = @MJExperimentSessionIterations_AIAgentRunID_Status, @Score = @MJExperimentSessionIterations_AIAgentRunID_Score, @ComputeCost = @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @TokensUsed = @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @Rationale = @MJExperimentSessionIterations_AIAgentRunID_Rationale, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID

        FETCH NEXT FROM cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor INTO @MJExperimentSessionIterations_AIAgentRunIDID, @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @MJExperimentSessionIterations_AIAgentRunID_Sequence, @MJExperimentSessionIterations_AIAgentRunID_Label, @MJExperimentSessionIterations_AIAgentRunID_Status, @MJExperimentSessionIterations_AIAgentRunID_Score, @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @MJExperimentSessionIterations_AIAgentRunID_Rationale, @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID
    END

    CLOSE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    
    -- Cascade update on ExperimentSession using cursor to call spUpdateExperimentSession
    DECLARE @MJExperimentSessions_AgentRunIDID uniqueidentifier
    DECLARE @MJExperimentSessions_AgentRunID_ExperimentID uniqueidentifier
    DECLARE @MJExperimentSessions_AgentRunID_Name nvarchar(255)
    DECLARE @MJExperimentSessions_AgentRunID_Goal nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Budget nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Status nvarchar(20)
    DECLARE @MJExperimentSessions_AgentRunID_PlanSpec nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Leaderboard nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_AgentRunID uniqueidentifier
    DECLARE cascade_update_MJExperimentSessions_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [ExperimentID], [Name], [Goal], [Budget], [Status], [PlanSpec], [Leaderboard], [AgentRunID]
        FROM [${flyway:defaultSchema}].[ExperimentSession]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJExperimentSessions_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJExperimentSessions_AgentRunID_cursor INTO @MJExperimentSessions_AgentRunIDID, @MJExperimentSessions_AgentRunID_ExperimentID, @MJExperimentSessions_AgentRunID_Name, @MJExperimentSessions_AgentRunID_Goal, @MJExperimentSessions_AgentRunID_Budget, @MJExperimentSessions_AgentRunID_Status, @MJExperimentSessions_AgentRunID_PlanSpec, @MJExperimentSessions_AgentRunID_Leaderboard, @MJExperimentSessions_AgentRunID_AgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJExperimentSessions_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateExperimentSession] @ID = @MJExperimentSessions_AgentRunIDID, @ExperimentID = @MJExperimentSessions_AgentRunID_ExperimentID, @Name = @MJExperimentSessions_AgentRunID_Name, @Goal = @MJExperimentSessions_AgentRunID_Goal, @Budget = @MJExperimentSessions_AgentRunID_Budget, @Status = @MJExperimentSessions_AgentRunID_Status, @PlanSpec = @MJExperimentSessions_AgentRunID_PlanSpec, @Leaderboard = @MJExperimentSessions_AgentRunID_Leaderboard, @AgentRunID_Clear = 1, @AgentRunID = @MJExperimentSessions_AgentRunID_AgentRunID

        FETCH NEXT FROM cascade_update_MJExperimentSessions_AgentRunID_cursor INTO @MJExperimentSessions_AgentRunIDID, @MJExperimentSessions_AgentRunID_ExperimentID, @MJExperimentSessions_AgentRunID_Name, @MJExperimentSessions_AgentRunID_Goal, @MJExperimentSessions_AgentRunID_Budget, @MJExperimentSessions_AgentRunID_Status, @MJExperimentSessions_AgentRunID_PlanSpec, @MJExperimentSessions_AgentRunID_Leaderboard, @MJExperimentSessions_AgentRunID_AgentRunID
    END

    CLOSE cascade_update_MJExperimentSessions_AgentRunID_cursor
    DEALLOCATE cascade_update_MJExperimentSessions_AgentRunID_cursor
    
    -- Cascade update on ProcessRunDetail using cursor to call spUpdateProcessRunDetail
    DECLARE @MJProcessRunDetails_AIAgentRunIDID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_ProcessRunID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_EntityID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_RecordID nvarchar(450)
    DECLARE @MJProcessRunDetails_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJProcessRunDetails_AIAgentRunID_StartedAt datetimeoffset
    DECLARE @MJProcessRunDetails_AIAgentRunID_CompletedAt datetimeoffset
    DECLARE @MJProcessRunDetails_AIAgentRunID_DurationMs int
    DECLARE @MJProcessRunDetails_AIAgentRunID_AttemptCount int
    DECLARE @MJProcessRunDetails_AIAgentRunID_ResultPayload nvarchar(MAX)
    DECLARE @MJProcessRunDetails_AIAgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_Warnings nvarchar(MAX)
    DECLARE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [ProcessRunID], [EntityID], [RecordID], [Status], [StartedAt], [CompletedAt], [DurationMs], [AttemptCount], [ResultPayload], [ErrorMessage], [ActionExecutionLogID], [AIAgentRunID], [Warnings]
        FROM [${flyway:defaultSchema}].[ProcessRunDetail]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJProcessRunDetails_AIAgentRunID_cursor INTO @MJProcessRunDetails_AIAgentRunIDID, @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @MJProcessRunDetails_AIAgentRunID_EntityID, @MJProcessRunDetails_AIAgentRunID_RecordID, @MJProcessRunDetails_AIAgentRunID_Status, @MJProcessRunDetails_AIAgentRunID_StartedAt, @MJProcessRunDetails_AIAgentRunID_CompletedAt, @MJProcessRunDetails_AIAgentRunID_DurationMs, @MJProcessRunDetails_AIAgentRunID_AttemptCount, @MJProcessRunDetails_AIAgentRunID_ResultPayload, @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @MJProcessRunDetails_AIAgentRunID_AIAgentRunID, @MJProcessRunDetails_AIAgentRunID_Warnings

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJProcessRunDetails_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateProcessRunDetail] @ID = @MJProcessRunDetails_AIAgentRunIDID, @ProcessRunID = @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @EntityID = @MJProcessRunDetails_AIAgentRunID_EntityID, @RecordID = @MJProcessRunDetails_AIAgentRunID_RecordID, @Status = @MJProcessRunDetails_AIAgentRunID_Status, @StartedAt = @MJProcessRunDetails_AIAgentRunID_StartedAt, @CompletedAt = @MJProcessRunDetails_AIAgentRunID_CompletedAt, @DurationMs = @MJProcessRunDetails_AIAgentRunID_DurationMs, @AttemptCount = @MJProcessRunDetails_AIAgentRunID_AttemptCount, @ResultPayload = @MJProcessRunDetails_AIAgentRunID_ResultPayload, @ErrorMessage = @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @ActionExecutionLogID = @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJProcessRunDetails_AIAgentRunID_AIAgentRunID, @Warnings = @MJProcessRunDetails_AIAgentRunID_Warnings

        FETCH NEXT FROM cascade_update_MJProcessRunDetails_AIAgentRunID_cursor INTO @MJProcessRunDetails_AIAgentRunIDID, @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @MJProcessRunDetails_AIAgentRunID_EntityID, @MJProcessRunDetails_AIAgentRunID_RecordID, @MJProcessRunDetails_AIAgentRunID_Status, @MJProcessRunDetails_AIAgentRunID_StartedAt, @MJProcessRunDetails_AIAgentRunID_CompletedAt, @MJProcessRunDetails_AIAgentRunID_DurationMs, @MJProcessRunDetails_AIAgentRunID_AttemptCount, @MJProcessRunDetails_AIAgentRunID_ResultPayload, @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @MJProcessRunDetails_AIAgentRunID_AIAgentRunID, @MJProcessRunDetails_AIAgentRunID_Warnings
    END

    CLOSE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    
    -- Cascade update on RubricEvaluation using cursor to call spUpdateRubricEvaluation
    DECLARE @MJRubricEvaluations_AIAgentRunIDID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_RubricVersionID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_SubjectEntityID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_SubjectRecordID nvarchar(450)
    DECLARE @MJRubricEvaluations_AIAgentRunID_ContextEntityID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_ContextRecordID nvarchar(450)
    DECLARE @MJRubricEvaluations_AIAgentRunID_EvaluatorType nvarchar(20)
    DECLARE @MJRubricEvaluations_AIAgentRunID_EvaluatorUserID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_EvaluatorName nvarchar(255)
    DECLARE @MJRubricEvaluations_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJRubricEvaluations_AIAgentRunID_SupersedesEvaluationID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_SubmittedAt datetimeoffset
    DECLARE @MJRubricEvaluations_AIAgentRunID_PassThresholdApplied decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIAgentRunID_NormalizedScore decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIAgentRunID_Passed bit
    DECLARE @MJRubricEvaluations_AIAgentRunID_Outcome nvarchar(30)
    DECLARE @MJRubricEvaluations_AIAgentRunID_BandID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIAgentRunID_GateFailed bit
    DECLARE @MJRubricEvaluations_AIAgentRunID_Completeness decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIAgentRunID_ScoredCriteriaCount int
    DECLARE @MJRubricEvaluations_AIAgentRunID_ApplicableCriteriaCount int
    DECLARE @MJRubricEvaluations_AIAgentRunID_TotalCriteriaCount int
    DECLARE @MJRubricEvaluations_AIAgentRunID_Confidence decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIAgentRunID_Narrative nvarchar(MAX)
    DECLARE @MJRubricEvaluations_AIAgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJRubricEvaluations_AIAgentRunID_ScoringEngineVersion nvarchar(20)
    DECLARE @MJRubricEvaluations_AIAgentRunID_Metadata nvarchar(MAX)
    DECLARE cascade_update_MJRubricEvaluations_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [RubricVersionID], [SubjectEntityID], [SubjectRecordID], [ContextEntityID], [ContextRecordID], [EvaluatorType], [EvaluatorUserID], [AIPromptRunID], [AIAgentRunID], [EvaluatorName], [Status], [SupersedesEvaluationID], [SubmittedAt], [PassThresholdApplied], [NormalizedScore], [Passed], [Outcome], [BandID], [GateFailed], [Completeness], [ScoredCriteriaCount], [ApplicableCriteriaCount], [TotalCriteriaCount], [Confidence], [Narrative], [ErrorMessage], [ScoringEngineVersion], [Metadata]
        FROM [${flyway:defaultSchema}].[RubricEvaluation]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJRubricEvaluations_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJRubricEvaluations_AIAgentRunID_cursor INTO @MJRubricEvaluations_AIAgentRunIDID, @MJRubricEvaluations_AIAgentRunID_RubricVersionID, @MJRubricEvaluations_AIAgentRunID_SubjectEntityID, @MJRubricEvaluations_AIAgentRunID_SubjectRecordID, @MJRubricEvaluations_AIAgentRunID_ContextEntityID, @MJRubricEvaluations_AIAgentRunID_ContextRecordID, @MJRubricEvaluations_AIAgentRunID_EvaluatorType, @MJRubricEvaluations_AIAgentRunID_EvaluatorUserID, @MJRubricEvaluations_AIAgentRunID_AIPromptRunID, @MJRubricEvaluations_AIAgentRunID_AIAgentRunID, @MJRubricEvaluations_AIAgentRunID_EvaluatorName, @MJRubricEvaluations_AIAgentRunID_Status, @MJRubricEvaluations_AIAgentRunID_SupersedesEvaluationID, @MJRubricEvaluations_AIAgentRunID_SubmittedAt, @MJRubricEvaluations_AIAgentRunID_PassThresholdApplied, @MJRubricEvaluations_AIAgentRunID_NormalizedScore, @MJRubricEvaluations_AIAgentRunID_Passed, @MJRubricEvaluations_AIAgentRunID_Outcome, @MJRubricEvaluations_AIAgentRunID_BandID, @MJRubricEvaluations_AIAgentRunID_GateFailed, @MJRubricEvaluations_AIAgentRunID_Completeness, @MJRubricEvaluations_AIAgentRunID_ScoredCriteriaCount, @MJRubricEvaluations_AIAgentRunID_ApplicableCriteriaCount, @MJRubricEvaluations_AIAgentRunID_TotalCriteriaCount, @MJRubricEvaluations_AIAgentRunID_Confidence, @MJRubricEvaluations_AIAgentRunID_Narrative, @MJRubricEvaluations_AIAgentRunID_ErrorMessage, @MJRubricEvaluations_AIAgentRunID_ScoringEngineVersion, @MJRubricEvaluations_AIAgentRunID_Metadata

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRubricEvaluations_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRubricEvaluation] @ID = @MJRubricEvaluations_AIAgentRunIDID, @RubricVersionID = @MJRubricEvaluations_AIAgentRunID_RubricVersionID, @SubjectEntityID = @MJRubricEvaluations_AIAgentRunID_SubjectEntityID, @SubjectRecordID = @MJRubricEvaluations_AIAgentRunID_SubjectRecordID, @ContextEntityID = @MJRubricEvaluations_AIAgentRunID_ContextEntityID, @ContextRecordID = @MJRubricEvaluations_AIAgentRunID_ContextRecordID, @EvaluatorType = @MJRubricEvaluations_AIAgentRunID_EvaluatorType, @EvaluatorUserID = @MJRubricEvaluations_AIAgentRunID_EvaluatorUserID, @AIPromptRunID = @MJRubricEvaluations_AIAgentRunID_AIPromptRunID, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJRubricEvaluations_AIAgentRunID_AIAgentRunID, @EvaluatorName = @MJRubricEvaluations_AIAgentRunID_EvaluatorName, @Status = @MJRubricEvaluations_AIAgentRunID_Status, @SupersedesEvaluationID = @MJRubricEvaluations_AIAgentRunID_SupersedesEvaluationID, @SubmittedAt = @MJRubricEvaluations_AIAgentRunID_SubmittedAt, @PassThresholdApplied = @MJRubricEvaluations_AIAgentRunID_PassThresholdApplied, @NormalizedScore = @MJRubricEvaluations_AIAgentRunID_NormalizedScore, @Passed = @MJRubricEvaluations_AIAgentRunID_Passed, @Outcome = @MJRubricEvaluations_AIAgentRunID_Outcome, @BandID = @MJRubricEvaluations_AIAgentRunID_BandID, @GateFailed = @MJRubricEvaluations_AIAgentRunID_GateFailed, @Completeness = @MJRubricEvaluations_AIAgentRunID_Completeness, @ScoredCriteriaCount = @MJRubricEvaluations_AIAgentRunID_ScoredCriteriaCount, @ApplicableCriteriaCount = @MJRubricEvaluations_AIAgentRunID_ApplicableCriteriaCount, @TotalCriteriaCount = @MJRubricEvaluations_AIAgentRunID_TotalCriteriaCount, @Confidence = @MJRubricEvaluations_AIAgentRunID_Confidence, @Narrative = @MJRubricEvaluations_AIAgentRunID_Narrative, @ErrorMessage = @MJRubricEvaluations_AIAgentRunID_ErrorMessage, @ScoringEngineVersion = @MJRubricEvaluations_AIAgentRunID_ScoringEngineVersion, @Metadata = @MJRubricEvaluations_AIAgentRunID_Metadata

        FETCH NEXT FROM cascade_update_MJRubricEvaluations_AIAgentRunID_cursor INTO @MJRubricEvaluations_AIAgentRunIDID, @MJRubricEvaluations_AIAgentRunID_RubricVersionID, @MJRubricEvaluations_AIAgentRunID_SubjectEntityID, @MJRubricEvaluations_AIAgentRunID_SubjectRecordID, @MJRubricEvaluations_AIAgentRunID_ContextEntityID, @MJRubricEvaluations_AIAgentRunID_ContextRecordID, @MJRubricEvaluations_AIAgentRunID_EvaluatorType, @MJRubricEvaluations_AIAgentRunID_EvaluatorUserID, @MJRubricEvaluations_AIAgentRunID_AIPromptRunID, @MJRubricEvaluations_AIAgentRunID_AIAgentRunID, @MJRubricEvaluations_AIAgentRunID_EvaluatorName, @MJRubricEvaluations_AIAgentRunID_Status, @MJRubricEvaluations_AIAgentRunID_SupersedesEvaluationID, @MJRubricEvaluations_AIAgentRunID_SubmittedAt, @MJRubricEvaluations_AIAgentRunID_PassThresholdApplied, @MJRubricEvaluations_AIAgentRunID_NormalizedScore, @MJRubricEvaluations_AIAgentRunID_Passed, @MJRubricEvaluations_AIAgentRunID_Outcome, @MJRubricEvaluations_AIAgentRunID_BandID, @MJRubricEvaluations_AIAgentRunID_GateFailed, @MJRubricEvaluations_AIAgentRunID_Completeness, @MJRubricEvaluations_AIAgentRunID_ScoredCriteriaCount, @MJRubricEvaluations_AIAgentRunID_ApplicableCriteriaCount, @MJRubricEvaluations_AIAgentRunID_TotalCriteriaCount, @MJRubricEvaluations_AIAgentRunID_Confidence, @MJRubricEvaluations_AIAgentRunID_Narrative, @MJRubricEvaluations_AIAgentRunID_ErrorMessage, @MJRubricEvaluations_AIAgentRunID_ScoringEngineVersion, @MJRubricEvaluations_AIAgentRunID_Metadata
    END

    CLOSE cascade_update_MJRubricEvaluations_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJRubricEvaluations_AIAgentRunID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_AgentRunIDID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ParentID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_Name nvarchar(255)
    DECLARE @MJTasks_AgentRunID_Description nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_TypeID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ProjectID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_UserID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_AgentID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_Status nvarchar(50)
    DECLARE @MJTasks_AgentRunID_PercentComplete int
    DECLARE @MJTasks_AgentRunID_DueAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_StartedAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_AgentRunID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_ActionID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_StepType nvarchar(20)
    DECLARE @MJTasks_AgentRunID_PromptID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJTasks_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentRunID_cursor INTO @MJTasks_AgentRunIDID, @MJTasks_AgentRunID_ParentID, @MJTasks_AgentRunID_Name, @MJTasks_AgentRunID_Description, @MJTasks_AgentRunID_TypeID, @MJTasks_AgentRunID_EnvironmentID, @MJTasks_AgentRunID_ProjectID, @MJTasks_AgentRunID_ConversationDetailID, @MJTasks_AgentRunID_UserID, @MJTasks_AgentRunID_AgentID, @MJTasks_AgentRunID_Status, @MJTasks_AgentRunID_PercentComplete, @MJTasks_AgentRunID_DueAt, @MJTasks_AgentRunID_StartedAt, @MJTasks_AgentRunID_CompletedAt, @MJTasks_AgentRunID_InputPayload, @MJTasks_AgentRunID_OutputPayload, @MJTasks_AgentRunID_ErrorMessage, @MJTasks_AgentRunID_AgentRunID, @MJTasks_AgentRunID_ClaimedBy, @MJTasks_AgentRunID_ClaimExpiresAt, @MJTasks_AgentRunID_ActionID, @MJTasks_AgentRunID_StepType, @MJTasks_AgentRunID_PromptID, @MJTasks_AgentRunID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentRunIDID, @ParentID = @MJTasks_AgentRunID_ParentID, @Name = @MJTasks_AgentRunID_Name, @Description = @MJTasks_AgentRunID_Description, @TypeID = @MJTasks_AgentRunID_TypeID, @EnvironmentID = @MJTasks_AgentRunID_EnvironmentID, @ProjectID = @MJTasks_AgentRunID_ProjectID, @ConversationDetailID = @MJTasks_AgentRunID_ConversationDetailID, @UserID = @MJTasks_AgentRunID_UserID, @AgentID = @MJTasks_AgentRunID_AgentID, @Status = @MJTasks_AgentRunID_Status, @PercentComplete = @MJTasks_AgentRunID_PercentComplete, @DueAt = @MJTasks_AgentRunID_DueAt, @StartedAt = @MJTasks_AgentRunID_StartedAt, @CompletedAt = @MJTasks_AgentRunID_CompletedAt, @InputPayload = @MJTasks_AgentRunID_InputPayload, @OutputPayload = @MJTasks_AgentRunID_OutputPayload, @ErrorMessage = @MJTasks_AgentRunID_ErrorMessage, @AgentRunID_Clear = 1, @AgentRunID = @MJTasks_AgentRunID_AgentRunID, @ClaimedBy = @MJTasks_AgentRunID_ClaimedBy, @ClaimExpiresAt = @MJTasks_AgentRunID_ClaimExpiresAt, @ActionID = @MJTasks_AgentRunID_ActionID, @StepType = @MJTasks_AgentRunID_StepType, @PromptID = @MJTasks_AgentRunID_PromptID, @Configuration = @MJTasks_AgentRunID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_AgentRunID_cursor INTO @MJTasks_AgentRunIDID, @MJTasks_AgentRunID_ParentID, @MJTasks_AgentRunID_Name, @MJTasks_AgentRunID_Description, @MJTasks_AgentRunID_TypeID, @MJTasks_AgentRunID_EnvironmentID, @MJTasks_AgentRunID_ProjectID, @MJTasks_AgentRunID_ConversationDetailID, @MJTasks_AgentRunID_UserID, @MJTasks_AgentRunID_AgentID, @MJTasks_AgentRunID_Status, @MJTasks_AgentRunID_PercentComplete, @MJTasks_AgentRunID_DueAt, @MJTasks_AgentRunID_StartedAt, @MJTasks_AgentRunID_CompletedAt, @MJTasks_AgentRunID_InputPayload, @MJTasks_AgentRunID_OutputPayload, @MJTasks_AgentRunID_ErrorMessage, @MJTasks_AgentRunID_AgentRunID, @MJTasks_AgentRunID_ClaimedBy, @MJTasks_AgentRunID_ClaimExpiresAt, @MJTasks_AgentRunID_ActionID, @MJTasks_AgentRunID_StepType, @MJTasks_AgentRunID_PromptID, @MJTasks_AgentRunID_Configuration
    END

    CLOSE cascade_update_MJTasks_AgentRunID_cursor
    DEALLOCATE cascade_update_MJTasks_AgentRunID_cursor
    
    -- Cascade update on UserRoutineRun using cursor to call spUpdateUserRoutineRun
    DECLARE @MJUserRoutineRuns_AgentRunIDID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_RoutineID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_StartedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_AgentRunID_Status nvarchar(20)
    DECLARE @MJUserRoutineRuns_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_PromptRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_ResultSummary nvarchar(MAX)
    DECLARE @MJUserRoutineRuns_AgentRunID_ResultHash nvarchar(100)
    DECLARE @MJUserRoutineRuns_AgentRunID_NotificationSent bit
    DECLARE @MJUserRoutineRuns_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE cascade_update_MJUserRoutineRuns_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [RoutineID], [StartedAt], [CompletedAt], [Status], [AgentRunID], [PromptRunID], [ActionExecutionLogID], [ResultSummary], [ResultHash], [NotificationSent], [ErrorMessage]
        FROM [${flyway:defaultSchema}].[UserRoutineRun]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutineRuns_AgentRunID_cursor INTO @MJUserRoutineRuns_AgentRunIDID, @MJUserRoutineRuns_AgentRunID_RoutineID, @MJUserRoutineRuns_AgentRunID_StartedAt, @MJUserRoutineRuns_AgentRunID_CompletedAt, @MJUserRoutineRuns_AgentRunID_Status, @MJUserRoutineRuns_AgentRunID_AgentRunID, @MJUserRoutineRuns_AgentRunID_PromptRunID, @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @MJUserRoutineRuns_AgentRunID_ResultSummary, @MJUserRoutineRuns_AgentRunID_ResultHash, @MJUserRoutineRuns_AgentRunID_NotificationSent, @MJUserRoutineRuns_AgentRunID_ErrorMessage

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutineRuns_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutineRun] @ID = @MJUserRoutineRuns_AgentRunIDID, @RoutineID = @MJUserRoutineRuns_AgentRunID_RoutineID, @StartedAt = @MJUserRoutineRuns_AgentRunID_StartedAt, @CompletedAt = @MJUserRoutineRuns_AgentRunID_CompletedAt, @Status = @MJUserRoutineRuns_AgentRunID_Status, @AgentRunID_Clear = 1, @AgentRunID = @MJUserRoutineRuns_AgentRunID_AgentRunID, @PromptRunID = @MJUserRoutineRuns_AgentRunID_PromptRunID, @ActionExecutionLogID = @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @ResultSummary = @MJUserRoutineRuns_AgentRunID_ResultSummary, @ResultHash = @MJUserRoutineRuns_AgentRunID_ResultHash, @NotificationSent = @MJUserRoutineRuns_AgentRunID_NotificationSent, @ErrorMessage = @MJUserRoutineRuns_AgentRunID_ErrorMessage

        FETCH NEXT FROM cascade_update_MJUserRoutineRuns_AgentRunID_cursor INTO @MJUserRoutineRuns_AgentRunIDID, @MJUserRoutineRuns_AgentRunID_RoutineID, @MJUserRoutineRuns_AgentRunID_StartedAt, @MJUserRoutineRuns_AgentRunID_CompletedAt, @MJUserRoutineRuns_AgentRunID_Status, @MJUserRoutineRuns_AgentRunID_AgentRunID, @MJUserRoutineRuns_AgentRunID_PromptRunID, @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @MJUserRoutineRuns_AgentRunID_ResultSummary, @MJUserRoutineRuns_AgentRunID_ResultHash, @MJUserRoutineRuns_AgentRunID_NotificationSent, @MJUserRoutineRuns_AgentRunID_ErrorMessage
    END

    CLOSE cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    DEALLOCATE cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 8 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c506b56b-36a6-4ba6-b77e-33b0b0ade75d' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'RecordProcess')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c506b56b-36a6-4ba6-b77e-33b0b0ade75d',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'RecordProcess',
            'Record Process',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '53db384f-a267-4da6-9884-10071cf0f72c' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'Prompt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '53db384f-a267-4da6-9884-10071cf0f72c',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'Prompt',
            'Prompt',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2caf6828-cc0a-4cff-97c9-4371a90a20c3' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'AIModel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2caf6828-cc0a-4cff-97c9-4371a90a20c3',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'AIModel',
            'AI Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c796c099-13e8-4291-9ab8-59c97f6e1093' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'GoldenSetTest')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c796c099-13e8-4291-9ab8-59c97f6e1093',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'GoldenSetTest',
            'Golden Set Test',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51b46495-6ea6-4df3-930a-216b17ddf105' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'GoldenSetTestRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '51b46495-6ea6-4df3-930a-216b17ddf105',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'GoldenSetTestRun',
            'Golden Set Test Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9edbff82-7bb5-4287-8435-5903d4e86ab6' OR (EntityID = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND Name = 'ApprovedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9edbff82-7bb5-4287-8435-5903d4e86ab6',
            'CA9E4797-3E8A-4942-AFE9-274CD49872A7', -- Entity: MJ: Feature Pipeline Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7'),
            'ApprovedByUser',
            'Approved By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ad07904-3cf8-427a-9224-1601cc36361f' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'AIModel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9ad07904-3cf8-427a-9224-1601cc36361f',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'AIModel',
            'AI Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51ada067-84bf-4c97-8555-d302bfa26a34' OR (EntityID = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79' AND Name = 'AIModel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '51ada067-84bf-4c97-8555-d302bfa26a34',
            'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', -- Entity: MJ: Feature Value Caches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79'),
            'AIModel',
            'AI Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '33DB8621-D45B-4E2F-9723-86D876EA8DB3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '78DE1B90-07FA-4F6B-A429-134EBB6250A3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A90E8C8A-6B05-4DC4-9B7D-CA587FCF5896'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F4AE08EA-FF1E-4D5C-9388-464ACBAFBE62'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '83C833AF-DF1F-43E9-A9A0-715AB5A9318B'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 3 fields */

-- UPDATE Entity Field Category Info MJ: Feature Value Caches.AIModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Model'
WHERE 
   ID = '155A1F54-E797-4C90-8B0D-224534B54187';

-- UPDATE Entity Field Category Info MJ: Feature Value Caches.ParametersHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Hash Fingerprints',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DE1F6DDC-0207-459E-A956-C1DBA21D55E7';

-- UPDATE Entity Field Category Info MJ: Feature Value Caches.AIModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '51ADA067-84BF-4C97-8555-D302BFA26A34';

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: Process Runs.ResultSummary 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Progress and Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'D17A169B-1A6A-4EDD-B080-25127058E592';

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: Process Run Details.Warnings 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'E5FA2D40-C49B-41CF-9A06-FADDC56F821E';

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Feature Values.PipelineVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7E75D644-ECA6-4490-AD2E-C3001EE1BE9B';

-- UPDATE Entity Field Category Info MJ: Feature Values.AIModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Insights',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Model'
WHERE 
   ID = 'AD34364D-0DFE-4B09-9542-DFC20C47F8C4';

-- UPDATE Entity Field Category Info MJ: Feature Values.ParametersHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '795F432C-E51A-4714-82A4-83B5552E663D';

-- UPDATE Entity Field Category Info MJ: Feature Values.InputHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C5820EED-2B47-4D44-ADA7-88C7FCE66340';

-- UPDATE Entity Field Category Info MJ: Feature Values.ValueKeyHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ED6A2C22-7502-4100-8A1A-4B8985158A9D';

-- UPDATE Entity Field Category Info MJ: Feature Values.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '83C833AF-DF1F-43E9-A9A0-715AB5A9318B';

-- UPDATE Entity Field Category Info MJ: Feature Values.AIModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Insights',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Model Details'
WHERE 
   ID = '9AD07904-3CF8-427A-9224-1601CC36361F';

/* Set categories for 32 fields */

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '52899340-A811-4B5F-AAF2-D8214BF87DDD';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.RecordProcessID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E934A165-C973-445D-8D4E-E17694354520';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Version 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Version Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5B05BA2B-C65E-41A7-AE88-0DF49ABB963B';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.PinHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Version Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '69705EC9-FC16-472E-A335-D144D6A21C76';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.SpecHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Version Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '43668EEE-8AA0-4133-A4A2-C1DD82AA8D43';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.PromptID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prompt and Model',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt'
WHERE 
   ID = 'F1929F7A-E8DE-4478-9E49-D94EE34DE1B6';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.PromptVersionHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prompt and Model',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DC814C44-8C43-4A7C-B266-FE53B5CD531D';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.AIModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prompt and Model',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Model'
WHERE 
   ID = 'B5EA9619-094C-4520-825C-659C4FFEEC70';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ParametersHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prompt and Model',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '18A9B06C-87E4-463B-87FD-EB9F84D91DCA';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Governance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '33DB8621-D45B-4E2F-9723-86D876EA8DB3';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Gated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Governance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '479FCFEA-63B9-418C-8505-14E31EA6ACE8';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.GoldenSetTestID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Golden Set Test'
WHERE 
   ID = 'E26E4EA8-5A11-4275-9EB1-438FA9B97F2B';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.GoldenSetTestRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Golden Set Test Run'
WHERE 
   ID = '3692975F-204E-4EEA-870A-0BC7526BFA29';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Metric 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation and Results',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5E2CE44B-A3E0-4A00-B20B-FE08DDCEE16C';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Threshold 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation and Results',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '78DE1B90-07FA-4F6B-A429-134EBB6250A3';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ResultValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation and Results',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A90E8C8A-6B05-4DC4-9B7D-CA587FCF5896';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ResultLower 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Result Lower Bound'
WHERE 
   ID = '36665BCB-89C4-45D8-B321-F0DBC2AE1A07';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ResultUpper 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Result Upper Bound'
WHERE 
   ID = '48242103-C83C-42B9-9591-5F34A3E50CBE';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ResultN 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Result Sample Size (N)'
WHERE 
   ID = '1FEF9EE3-6136-4599-BE4A-9CE01EB247A4';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ResultDetails 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation and Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '5D1855BB-2A10-4B3E-90DC-C494720B6A24';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ActivatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Stewardship',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F4AE08EA-FF1E-4D5C-9388-464ACBAFBE62';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ApprovedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Stewardship',
   GeneratedFormSection = 'Category',
   DisplayName = 'Approved By User'
WHERE 
   ID = 'C4A91287-0F6F-430E-9467-B64E06F13880';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.RetiredAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Stewardship',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9C8E8518-166C-414B-90D7-150C555869E9';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.BackfilledAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Stewardship',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E907C585-94F1-48C9-901D-AEE341CD0A5D';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8B8CB8FC-CC9E-4496-9B59-F6D0FB67D7E5';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8D8A871D-F6B8-4F6E-B81B-79FB9368BA05';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.RecordProcess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C506B56B-36A6-4BA6-B77E-33B0B0ADE75D';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.Prompt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prompt and Model',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Text'
WHERE 
   ID = '53DB384F-A267-4DA6-9884-10071CF0F72C';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.AIModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prompt and Model',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Model Name'
WHERE 
   ID = '2CAF6828-CC0A-4CFF-97C9-4371A90A20C3';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.GoldenSetTest 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Golden Set Test Name'
WHERE 
   ID = 'C796C099-13E8-4291-9AB8-59C97F6E1093';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.GoldenSetTestRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation and Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Golden Set Test Run Name'
WHERE 
   ID = '51B46495-6EA6-4DF3-930A-216B17DDF105';

-- UPDATE Entity Field Category Info MJ: Feature Pipeline Versions.ApprovedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Stewardship',
   GeneratedFormSection = 'Category',
   DisplayName = 'Approved By User Name'
WHERE 
   ID = '9EDBFF82-7BB5-4287-8435-5903D4E86AB6';

/* Set entity icon to fa fa-code-branch */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-code-branch', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e746a96d-2f5d-5823-8041-37e41801c19b', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'FieldCategoryInfo', '{
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
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c898220c-ba4f-58b3-99ce-2e432315cdea', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'FieldCategoryIcons', '{
  "Evaluation and Results": "fa fa-chart-line",
  "Prompt and Model": "fa fa-robot",
  "Status and Governance": "fa fa-flag",
  "System Metadata": "fa fa-cog",
  "Timeline and Stewardship": "fa fa-history",
  "Version Configuration": "fa fa-sliders-h"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'CA9E4797-3E8A-4942-AFE9-274CD49872A7';

