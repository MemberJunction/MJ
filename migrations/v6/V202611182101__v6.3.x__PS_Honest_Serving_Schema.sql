/**************************************************************************************************
 * Migration: Predictive Studio — honest serving (publish records, scoring runs, monitoring results,
 * output bindings, the ML Models registry columns, model predictions as Feature Values)
 *
 *   1. MLModelPublishRecord  (MJ: ML Model Publish Records)  — the ledger of every human sign-off, every
 *                                                              applied publish or rollback, and every refused
 *                                                              publish attempt. Rows are never updated, except
 *                                                              that spDeleteEntityWithCoreDependencies clears
 *                                                              SignOffID, ReplacesModelID and TrainingRunID when
 *                                                              the referenced row is removed with its entity.
 *      MLScoringRun          (MJ: ML Scoring Runs)          — one row per scoring call, dry runs and refusals
 *                                                              included.
 *      MLMonitoringResult    (MJ: ML Monitoring Results)    — one row per model per monitoring period.
 *      MLOutputBinding       (MJ: ML Output Bindings)       — how one surface shows a model's output.
 *   2. MLModel               + the registry entry (lineage, artifact hash and status, delivery, status reason),
 *                              the statuses KeepBaseline and Unevaluated, the serving flag of a pre-change model
 *   3. MLModel               duplicate (PipelineID, Version) rows renumbered, then one version per pipeline
 *   4. FeatureValue          the per-record, per-feature as-of index (over FeatureValue.Role and MLModelID, which
 *                              V202611101901__v6.3.x__Task_Security_Saga_Shadow_Scoring adds with their metadata rows)
 *   5. vwLatestFeatureValues and its read-only virtual entity MJ: Latest Feature Values
 *   6. FeatureValue          model predictions (Source = 'Model') with their binding, scoring run and in-training
 *                              flag; RecordProcessID nullable; one row per binding, record, as-of instant and role
 *   7. MLModelScoringBinding the binding as a prediction feature: pipeline, feature name, column-copy source, status,
 *                              view authorization, retention
 *   8. MLModelScoringBinding existing bindings filled in; the write-back mapping of their Record Processes cleared
 *   9. MLModelScoringBinding MLModelID and MaterializedResultID dropped; the materialized mode removed
 *  10. vwUserHeldAuthorizations, the authorizations each user holds (MJ's authorization rule in SQL)
 *  11. vwLatestFeatureValues re-created with the prediction lineage columns
 *  12. spDeleteEntityWithCoreDependencies, re-created to clear the serving tables' rows when an entity is removed
 *  13. MLModel               models registered before the lifecycle gate: re-checked from their stored gate record,
 *                              or Unevaluated (the newest formerly Published one of a pipeline still serving it); then
 *                              at most one Published model per pipeline
 *
 * Documented exception (D4-13): section 13 rewrites MLModel business state (Status, StatusReason, ArtifactStatus,
 * ServingWhileUnevaluated, TrainingRunID) with raw UPDATEs, which writes no Record Changes rows. It is the one-time data
 * fix of the pre-change statuses that UX_MLModel_OnePublishedPerPipeline and the lifecycle gate need before they can hold;
 * the engine's step (g) (PreGateModelMigration, run by the Predictive Studio Registry Check job) does every later change
 * through the gate, with its publish records and Record Changes.
 **************************************************************************************************/

-- ============================================================================
-- 1. New tables
-- ============================================================================
CREATE TABLE [${flyway:defaultSchema}].[MLModelPublishRecord] (
    [ID]              UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MLModelPublishRecord_ID] DEFAULT (newsequentialid()),
    [ModelID]         UNIQUEIDENTIFIER NULL,
    [TrainingRunID]   UNIQUEIDENTIFIER NULL,
    [Kind]            NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL,
    [Purpose]         NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL,
    [ApproverKind]    NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL,
    [UserID]          UNIQUEIDENTIFIER NULL,
    [Initiator]       NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [RecordedAt]      DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_MLModelPublishRecord_RecordedAt] DEFAULT (SYSDATETIMEOFFSET()),
    [Decision]        NVARCHAR(10) COLLATE SQL_Latin1_General_CP1_CI_AS  NULL,
    [Reason]          NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [GateDecision]    NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Evidence]        NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [EvidenceSha256]  CHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS      NULL,
    [OverridesFlags]  NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_MLModelPublishRecord_OverridesFlags] DEFAULT (N'[]'),
    [SignOffID]       UNIQUEIDENTIFIER NULL,
    [ReplacesModelID] UNIQUEIDENTIFIER NULL,
    [Refusal]         NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Transient]       BIT              NOT NULL CONSTRAINT [DF_MLModelPublishRecord_Transient] DEFAULT (0),
    CONSTRAINT [PK_MLModelPublishRecord] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MLModelPublishRecord_Model]    FOREIGN KEY ([ModelID]) REFERENCES [${flyway:defaultSchema}].[MLModel] ([ID]),
    CONSTRAINT [FK_MLModelPublishRecord_Run]      FOREIGN KEY ([TrainingRunID]) REFERENCES [${flyway:defaultSchema}].[MLTrainingRun] ([ID]),
    CONSTRAINT [FK_MLModelPublishRecord_User]     FOREIGN KEY ([UserID]) REFERENCES [${flyway:defaultSchema}].[User] ([ID]),
    CONSTRAINT [FK_MLModelPublishRecord_SignOff]  FOREIGN KEY ([SignOffID]) REFERENCES [${flyway:defaultSchema}].[MLModelPublishRecord] ([ID]),
    CONSTRAINT [FK_MLModelPublishRecord_Replaces] FOREIGN KEY ([ReplacesModelID]) REFERENCES [${flyway:defaultSchema}].[MLModel] ([ID]),
    CONSTRAINT [CK_MLModelPublishRecord_Kind]     CHECK ([Kind] IN ('sign-off', 'publish', 'refusal')),
    CONSTRAINT [CK_MLModelPublishRecord_Purpose]  CHECK ([Purpose] IN ('publish', 'rollback', 'evaluate', 'adopt')),
    CONSTRAINT [CK_MLModelPublishRecord_Adopt]    CHECK ([Purpose] <> 'adopt' OR [Kind] = 'publish'),
    CONSTRAINT [CK_MLModelPublishRecord_Subject]  CHECK ([ModelID] IS NOT NULL OR [TrainingRunID] IS NOT NULL),
    CONSTRAINT [CK_MLModelPublishRecord_RunLevel] CHECK (([ModelID] IS NOT NULL AND [Purpose] <> 'evaluate')
                                                         OR ([ModelID] IS NULL AND [Kind] = 'refusal' AND [Purpose] = 'evaluate')),
    CONSTRAINT [CK_MLModelPublishRecord_Approver] CHECK (([ApproverKind] = 'user' AND [UserID] IS NOT NULL)
                                                         OR ([ApproverKind] = 'automated-gate' AND [UserID] IS NULL)),
    CONSTRAINT [CK_MLModelPublishRecord_SignOff]  CHECK (([Kind] = 'sign-off' AND [ApproverKind] = 'user' AND [Decision] IN ('approve', 'reject'))
                                                         OR ([Kind] <> 'sign-off' AND [Decision] IS NULL AND [OverridesFlags] = N'[]')),
    CONSTRAINT [CK_MLModelPublishRecord_Evidence] CHECK ([Kind] = 'refusal' OR ([Evidence] IS NOT NULL AND [EvidenceSha256] IS NOT NULL)),
    CONSTRAINT [CK_MLModelPublishRecord_Publish]  CHECK ([Kind] <> 'publish' OR [GateDecision] IS NOT NULL),
    CONSTRAINT [CK_MLModelPublishRecord_Refusal]  CHECK (([Kind] = 'refusal' AND [Refusal] IS NOT NULL)
                                                         OR ([Kind] <> 'refusal' AND [Refusal] IS NULL AND [Transient] = 0)),
    CONSTRAINT [CK_MLModelPublishRecord_Reason]   CHECK ([OverridesFlags] = N'[]' OR LEN(LTRIM(RTRIM(ISNULL([Reason], N'')))) > 0),
    CONSTRAINT [CK_MLModelPublishRecord_Json]     CHECK (ISJSON([Initiator]) = 1 AND ISJSON([OverridesFlags]) = 1
                                                         AND ([Evidence] IS NULL OR ISJSON([Evidence]) = 1)
                                                         AND ([GateDecision] IS NULL OR ISJSON([GateDecision]) = 1)
                                                         AND ([Refusal] IS NULL OR ISJSON([Refusal]) = 1))
);
GO
CREATE NONCLUSTERED INDEX [IX_MLModelPublishRecord_Model]
    ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([ModelID], [RecordedAt] DESC);
CREATE NONCLUSTERED INDEX [IX_MLModelPublishRecord_Run]
    ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([TrainingRunID], [RecordedAt] DESC);
-- One applied publish (or adoption of a pre-change Published model) per training run, ever: a retried
-- publish of the same run cannot apply twice.
CREATE UNIQUE NONCLUSTERED INDEX [UX_MLModelPublishRecord_OnePublishPerRun]
    ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([TrainingRunID])
    WHERE [Kind] = 'publish' AND [Purpose] IN ('publish', 'adopt') AND [TrainingRunID] IS NOT NULL;
-- One run-level outcome per training run: a retried job records a run without a model once.
CREATE UNIQUE NONCLUSTERED INDEX [UX_MLModelPublishRecord_OneRunOutcome]
    ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([TrainingRunID])
    WHERE [Purpose] = 'evaluate' AND [TrainingRunID] IS NOT NULL;
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The publish ledger of ML models: every human sign-off, every applied publish or rollback (automatic or by a person) and every refused publish attempt. An audit trail only: the lifecycle gate re-derives each decision from the stored evaluation and the model''s Delivery. Rows are never updated, except that spDeleteEntityWithCoreDependencies clears SignOffID, ReplacesModelID and TrainingRunID on surviving rows when the referenced row is deleted with its entity.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The model the record is about. NULL only on a run-level refusal: a training run whose outcome produced no model row.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'ModelID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The training run the record is about; the idempotency key of a publish and of a run-level refusal.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'TrainingRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'sign-off (a person approved or rejected), publish (a status change was applied) or refusal (a publish attempt was refused).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'Kind';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'publish, rollback (an archived model published again), evaluate (a run-level outcome only) or adopt (a pre-change Published model re-verified).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'Purpose';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'automated-gate when no person approved the publish; user when a person published or the publish consumed that person''s approving sign-off.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'ApproverKind';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The person who approved, when ApproverKind is user.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'UserID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON Actor: who started the attempt (a user, an agent run, a Record Process run or a scheduled job run).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'Initiator';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the record was written.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'RecordedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Sign-off rows only: approve or reject.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'Decision';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The reason in plain words; required when the record overrides flags.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'Reason';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON GateDecision as the gate re-derived it at the publish, kept as a copy for audit. Required on publish rows.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'GateDecision';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON EvidenceSnapshot built by the server from stored rows at the moment of the sign-off or publish.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'Evidence';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the canonical Evidence JSON; a sign-off authorises a publish only while it equals a fresh recomputation.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'EvidenceSha256';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of the leakage flags a sign-off acknowledges by name; empty on every other row.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'OverridesFlags';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Publish rows: the human sign-off this publish consumed, when one was required.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'SignOffID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Publish rows: the model archived in the same transaction.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'ReplacesModelID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Refusal rows: JSON TransitionRefusal, the reason the attempt was refused.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'Refusal';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Refusal rows: true when a retry may succeed.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelPublishRecord', @level2type = N'COLUMN', @level2name = N'Transient';
GO

CREATE TABLE [${flyway:defaultSchema}].[MLScoringRun] (
    [ID]                      UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MLScoringRun_ID] DEFAULT (newsequentialid()),
    [ModelID]                 UNIQUEIDENTIFIER NULL,
    [ModelVersion]            INT              NULL,
    [MLModelScoringBindingID] UNIQUEIDENTIFIER NULL,
    [ArtifactSha256]          CHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS      NULL,
    [FeatureSchemaHash]       CHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS      NULL,
    [Path]                    NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL,
    [ScopeKind]               NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL,
    [ScopeEntityID]           UNIQUEIDENTIFIER NOT NULL,
    [Scope]                   NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [EntityMapping]           NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [AsOfDate]                DATETIMEOFFSET   NOT NULL,
    [ReadPolicy]              NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [DryRun]                  BIT              NOT NULL CONSTRAINT [DF_MLScoringRun_DryRun] DEFAULT (0),
    [RequestedBy]             NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [RequestedByUserID]       UNIQUEIDENTIFIER NULL,
    [ProcessRunID]            UNIQUEIDENTIFIER NULL,
    [ScheduledJobRunID]       UNIQUEIDENTIFIER NULL,
    [Status]                  NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL CONSTRAINT [DF_MLScoringRun_Status] DEFAULT (N'running'),
    [Refusal]                 NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Total]                   INT              NOT NULL CONSTRAINT [DF_MLScoringRun_Total]   DEFAULT (0),
    [Written]                 INT              NOT NULL CONSTRAINT [DF_MLScoringRun_Written] DEFAULT (0),
    [Failed]                  INT              NOT NULL CONSTRAINT [DF_MLScoringRun_Failed]  DEFAULT (0),
    [Skipped]                 INT              NOT NULL CONSTRAINT [DF_MLScoringRun_Skipped] DEFAULT (0),
    [FirstErrors]             NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [StartedAt]               DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_MLScoringRun_StartedAt] DEFAULT (SYSDATETIMEOFFSET()),
    [EndedAt]                 DATETIMEOFFSET   NULL,
    CONSTRAINT [PK_MLScoringRun] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MLScoringRun_Model]   FOREIGN KEY ([ModelID]) REFERENCES [${flyway:defaultSchema}].[MLModel] ([ID]),
    CONSTRAINT [FK_MLScoringRun_Binding] FOREIGN KEY ([MLModelScoringBindingID]) REFERENCES [${flyway:defaultSchema}].[MLModelScoringBinding] ([ID]),
    CONSTRAINT [FK_MLScoringRun_Entity]  FOREIGN KEY ([ScopeEntityID]) REFERENCES [${flyway:defaultSchema}].[Entity] ([ID]),
    CONSTRAINT [FK_MLScoringRun_User]    FOREIGN KEY ([RequestedByUserID]) REFERENCES [${flyway:defaultSchema}].[User] ([ID]),
    CONSTRAINT [FK_MLScoringRun_Process] FOREIGN KEY ([ProcessRunID]) REFERENCES [${flyway:defaultSchema}].[ProcessRun] ([ID]),
    CONSTRAINT [FK_MLScoringRun_JobRun]  FOREIGN KEY ([ScheduledJobRunID]) REFERENCES [${flyway:defaultSchema}].[ScheduledJobRun] ([ID]),
    CONSTRAINT [CK_MLScoringRun_Path]      CHECK ([Path] IN ('score-record-set', 'record-process', 'monitoring', 'parity', 'predict')),
    CONSTRAINT [CK_MLScoringRun_ScopeKind] CHECK ([ScopeKind] IN ('record-ids', 'view', 'filter')),
    CONSTRAINT [CK_MLScoringRun_Status]    CHECK ([Status] IN ('running', 'refused', 'failed', 'completed')),
    CONSTRAINT [CK_MLScoringRun_Refused]   CHECK ([Status] <> 'refused' OR ([Refusal] IS NOT NULL AND [Written] = 0)),
    CONSTRAINT [CK_MLScoringRun_Model]     CHECK ([Status] = 'refused' OR ([ModelID] IS NOT NULL AND [ModelVersion] IS NOT NULL)),
    CONSTRAINT [CK_MLScoringRun_DryRun]    CHECK ([DryRun] = 0 OR [Written] = 0),
    CONSTRAINT [CK_MLScoringRun_Json]      CHECK (ISJSON([Scope]) = 1 AND ISJSON([ReadPolicy]) = 1 AND ISJSON([RequestedBy]) = 1
                                                  AND ([EntityMapping] IS NULL OR ISJSON([EntityMapping]) = 1)
                                                  AND ([Refusal] IS NULL OR ISJSON([Refusal]) = 1)
                                                  AND ([FirstErrors] IS NULL OR ISJSON([FirstErrors]) = 1))
);
GO
CREATE NONCLUSTERED INDEX [IX_MLScoringRun_Model]
    ON [${flyway:defaultSchema}].[MLScoringRun] ([ModelID], [StartedAt] DESC);
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One row per scoring call, dry runs and refusals included, written by the scoring service only. A running row exists before the first record is scored, so a crash leaves a visible row.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The exact model version that scored. NULL only on a refused run whose binding''s pipeline has no Published model.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'ModelID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The model''s Version, copied at the run.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'ModelVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The scoring binding a writing run scored for; NULL for a call that returns its scores and writes no Feature Value.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'MLModelScoringBindingID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the artifact bytes that scored; NULL only when the run was refused before the artifact verified.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'ArtifactSha256';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Hash of the model''s feature schema the run scored with.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'FeatureSchemaHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Which caller ran it: score-record-set, record-process, monitoring, parity or predict.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'Path';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'How the scope names its records: record-ids, view or filter.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'ScopeKind';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The entity whose records the scope names.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'ScopeEntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ScoringScope: the records the call asked to score.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'Scope';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON EntityRef mapping the scope entity onto the model''s grain, when they differ.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'EntityMapping';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The as-of instant the features were read at.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'AsOfDate';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ReadPolicy the features were read under.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'ReadPolicy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'True when the call scored without writing anything.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'DryRun';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON Actor: who asked for the run.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'RequestedBy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The requesting user, when a person asked; a joinable copy of RequestedBy.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'RequestedByUserID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The Process Run, when the Record Process path ran it.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'ProcessRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The Scheduled Job Run, when monitoring or parity ran it.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'ScheduledJobRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'running, refused, failed or completed. A failed run keeps the batches it wrote before the failing one.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ScoringRefusal when the run was refused.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'Refusal';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Records in scope.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'Total';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Records whose prediction was written.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'Written';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Records that failed to score.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'Failed';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Records skipped (for example, a person''s value the run must not overwrite).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'Skipped';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of the first errors, at most 20, each {recordId, message}.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'FirstErrors';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the run started.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'StartedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the run ended; NULL while it runs.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLScoringRun', @level2type = N'COLUMN', @level2name = N'EndedAt';
GO

CREATE TABLE [${flyway:defaultSchema}].[MLMonitoringResult] (
    [ID]                     UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MLMonitoringResult_ID] DEFAULT (newsequentialid()),
    [ModelID]                UNIQUEIDENTIFIER NOT NULL,
    [ScheduledJobRunID]      UNIQUEIDENTIFIER NULL,
    [Period]                 DATE             NOT NULL,
    [PeriodGrain]            NVARCHAR(10) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL,
    [State]                  NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL,
    [ScoredRows]             INT              NOT NULL CONSTRAINT [DF_MLMonitoringResult_Scored]  DEFAULT (0),
    [JoinedRows]             INT              NOT NULL CONSTRAINT [DF_MLMonitoringResult_Joined]  DEFAULT (0),
    [ExcludedInTrainingRows] INT              NOT NULL CONSTRAINT [DF_MLMonitoringResult_InTrain] DEFAULT (0),
    [PrimaryScore]           NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [PrimaryValue]           FLOAT            NULL,
    [PrimaryLower]           FLOAT            NULL,
    [PrimaryUpper]           FLOAT            NULL,
    [TrackedMetrics]         NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Calibration]            NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DriftLook]              NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DriftAlarms]            NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_MLMonitoringResult_Drift] DEFAULT (N'[]'),
    [Parity]                 NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [TriggersFired]          NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_MLMonitoringResult_Triggers] DEFAULT (N'[]'),
    [ChallengerRunID]        UNIQUEIDENTIFIER NULL,
    [ChallengerResult]       NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [RollbackCheck]          NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ErrorMessage]           NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    CONSTRAINT [PK_MLMonitoringResult] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MLMonitoringResult_Model]      FOREIGN KEY ([ModelID]) REFERENCES [${flyway:defaultSchema}].[MLModel] ([ID]),
    CONSTRAINT [FK_MLMonitoringResult_JobRun]     FOREIGN KEY ([ScheduledJobRunID]) REFERENCES [${flyway:defaultSchema}].[ScheduledJobRun] ([ID]),
    CONSTRAINT [FK_MLMonitoringResult_Challenger] FOREIGN KEY ([ChallengerRunID]) REFERENCES [${flyway:defaultSchema}].[MLTrainingRun] ([ID]),
    CONSTRAINT [CK_MLMonitoringResult_Grain] CHECK ([PeriodGrain] IN ('week', 'month', 'quarter')),
    CONSTRAINT [CK_MLMonitoringResult_State] CHECK ([State] IN ('window-open', 'evaluated', 'failed')),
    CONSTRAINT [UQ_MLMonitoringResult_ModelPeriod] UNIQUE ([ModelID], [PeriodGrain], [Period])
);
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One row per Published model per monitoring period: the outcome join, the tracked metrics, drift, parity, the triggers that fired and the challenger and rollback checks.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The model monitored.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'ModelID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The monitoring job run that wrote the row; NULL for a run started from the UI or a test.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'ScheduledJobRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The first day of the period.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'Period';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'week, month or quarter.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'PeriodGrain';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'window-open (outcomes not yet known), evaluated or failed.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'State';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Predictions the model stored for the period.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'ScoredRows';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Predictions joined to a known outcome.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'JoinedRows';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Joined predictions left out because the record was in the model''s training snapshot.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'ExcludedInTrainingRows';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON MetricWithInterval: the protocol''s primary metric over the joined rows.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'PrimaryScore';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The primary metric''s value, copied from PrimaryScore for queries and charts.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'PrimaryValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The primary metric''s interval lower bound, copied from PrimaryScore.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'PrimaryLower';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The primary metric''s interval upper bound, copied from PrimaryScore.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'PrimaryUpper';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of MetricWithInterval: the other tracked metrics (positive rate, log loss, RMSE and so on).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'TrackedMetrics';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON CalibrationReport over the joined rows.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'Calibration';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON per-input drift statistics of the period''s look: z, empirical p, adjusted p, the look''s threshold and index.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'DriftLook';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of the inputs whose drift alarm fired.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'DriftAlarms';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON {sampled, maxAbsDifference, passed}: the period''s scoring parity check.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'Parity';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of {kind, reason}: the retrain and rollback triggers that fired.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'TriggersFired';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The challenger training run a fired trigger started.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'ChallengerRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON {sharedRowIds, comparison, outcome, publishRecordId}: how the challenger compared and whether it was published or withheld.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'ChallengerResult';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON {previousModelId, sharedRowIds, comparison, consecutive, fired or not-eligible with the reason}: the automated rollback check.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'RollbackCheck';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Why the period failed, when State is failed.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLMonitoringResult', @level2type = N'COLUMN', @level2name = N'ErrorMessage';
GO

CREATE TABLE [${flyway:defaultSchema}].[MLOutputBinding] (
    [ID]                        UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MLOutputBinding_ID] DEFAULT (newsequentialid()),
    [ModelID]                   UNIQUEIDENTIFIER NOT NULL,
    [Surface]                   NVARCHAR(30) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL,
    [SortsBy]                   NVARCHAR(30) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL,
    [DriverDirectionRelativeTo] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL,
    [Label]                     NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    CONSTRAINT [PK_MLOutputBinding] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MLOutputBinding_Model] FOREIGN KEY ([ModelID]) REFERENCES [${flyway:defaultSchema}].[MLModel] ([ID]),
    CONSTRAINT [CK_MLOutputBinding_Surface]   CHECK ([Surface] IN ('at-risk-list', 'why-badge', 'predictions-grid', 'record-panel')),
    CONSTRAINT [CK_MLOutputBinding_SortsBy]   CHECK ([SortsBy] IN ('adverse-probability-desc', 'score-desc', 'score-asc', 'none')),
    CONSTRAINT [CK_MLOutputBinding_Direction] CHECK ([DriverDirectionRelativeTo] IN ('adverse-class', 'raw-contribution')),
    CONSTRAINT [UQ_MLOutputBinding_ModelSurface] UNIQUE ([ModelID], [Surface])
);
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'How one surface shows a model''s output: what it sorts by, which way driver directions point and the label. Created from the model''s OutputSemantics when the model is evaluated; a save that contradicts those semantics is refused.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLOutputBinding';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The model whose output the surface shows.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLOutputBinding', @level2type = N'COLUMN', @level2name = N'ModelID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'at-risk-list, why-badge, predictions-grid or record-panel.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLOutputBinding', @level2type = N'COLUMN', @level2name = N'Surface';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'adverse-probability-desc, score-desc, score-asc or none.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLOutputBinding', @level2type = N'COLUMN', @level2name = N'SortsBy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'adverse-class (a driver that raises the adverse outcome points up) or raw-contribution.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLOutputBinding', @level2type = N'COLUMN', @level2name = N'DriverDirectionRelativeTo';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The label the surface shows, naming the scored class.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLOutputBinding', @level2type = N'COLUMN', @level2name = N'Label';
GO

-- ============================================================================
-- 2. MLModel + the registry entry, the gate's statuses, the pre-change serving flag
-- ============================================================================
ALTER TABLE [${flyway:defaultSchema}].[MLModel]
    ADD [PredictionUnitID]        UNIQUEIDENTIFIER NULL,
        [EvaluationProtocolID]    UNIQUEIDENTIFIER NULL,
        [TrainingSnapshotID]      UNIQUEIDENTIFIER NULL,
        [TrainingRunID]           UNIQUEIDENTIFIER NULL,
        [ArtifactSha256]          CHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS      NULL,
        [SnapshotHash]            CHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS      NULL,
        [CodeVersion]             NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
        [FeatureSchemaHash]       CHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS      NULL,
        [OutputSemantics]         NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
        [Delivery]                NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
        [StatusReason]            NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
        [ArtifactStatus]          NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL CONSTRAINT [DF_MLModel_ArtifactStatus] DEFAULT (N'unverified'),
        [ArtifactCheckedAt]       DATETIMEOFFSET   NULL,
        [ServingWhileUnevaluated] BIT              NOT NULL CONSTRAINT [DF_MLModel_ServingWhileUnevaluated] DEFAULT (0);
GO
ALTER TABLE [${flyway:defaultSchema}].[MLModel]
    ADD CONSTRAINT [FK_MLModel_PredictionUnit] FOREIGN KEY ([PredictionUnitID])
            REFERENCES [${flyway:defaultSchema}].[MLPredictionUnit] ([ID]),
        CONSTRAINT [FK_MLModel_EvaluationProtocol] FOREIGN KEY ([EvaluationProtocolID])
            REFERENCES [${flyway:defaultSchema}].[MLEvaluationProtocol] ([ID]),
        CONSTRAINT [FK_MLModel_TrainingSnapshot] FOREIGN KEY ([TrainingSnapshotID])
            REFERENCES [${flyway:defaultSchema}].[MLTrainingSnapshot] ([ID]),
        CONSTRAINT [FK_MLModel_TrainingRun] FOREIGN KEY ([TrainingRunID])
            REFERENCES [${flyway:defaultSchema}].[MLTrainingRun] ([ID]),
        CONSTRAINT [CK_MLModel_ArtifactStatus]
            CHECK ([ArtifactStatus] IN ('unverified', 'verified', 'missing', 'hash-mismatch', 'legacy-local')),
        CONSTRAINT [CK_MLModel_Json]
            CHECK (([CodeVersion] IS NULL OR ISJSON([CodeVersion]) = 1) AND ([OutputSemantics] IS NULL OR ISJSON([OutputSemantics]) = 1)
                   AND ([Delivery] IS NULL OR ISJSON([Delivery]) = 1)),
        CONSTRAINT [CK_MLModel_ServingWhileUnevaluated]
            CHECK ([ServingWhileUnevaluated] = 0 OR [Status] = 'Unevaluated');
GO
-- At most one pre-change model keeps serving a pipeline.
CREATE UNIQUE NONCLUSTERED INDEX [UX_MLModel_OneServingUnevaluatedPerPipeline]
    ON [${flyway:defaultSchema}].[MLModel] ([PipelineID])
    WHERE [ServingWhileUnevaluated] = 1;
GO
-- Status gains the gate's keep-baseline outcome and the demotion status Unevaluated.
ALTER TABLE [${flyway:defaultSchema}].[MLModel] DROP CONSTRAINT [CK_MLModel_Status];
ALTER TABLE [${flyway:defaultSchema}].[MLModel]
    ADD CONSTRAINT [CK_MLModel_Status]
        CHECK ([Status] IN ('Draft', 'Validated', 'Published', 'Archived', 'KeepBaseline', 'Unevaluated'));
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The Prediction Unit version the model was trained under (the exact version row).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'PredictionUnitID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The Evaluation Protocol version the model was graded under (the exact version row).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'EvaluationProtocolID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The Training Snapshot the model was trained on.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'TrainingSnapshotID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The training run that produced the model.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'TrainingRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the shipped artifact''s stored bytes; a load that hashes differently is refused.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'ArtifactSha256';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Content hash of the training snapshot, copied at registration.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'SnapshotHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON CodeVersion of the training code: git commit, sidecar version, library versions, threads and seed.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'CodeVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Hash of the feature schema the model scores; a scoring request whose features hash differently is refused.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'FeatureSchemaHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON {task}: what the model''s output means (the task type and, for a classification, the adverse class).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'OutputSemantics';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON RegisteredDelivery: what the training run shipped and the gate decision it shipped under.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'Delivery';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Why the model has its status, in plain words: a kept baseline, a demotion to Unevaluated, an archive or a withheld publish.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'StatusReason';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Health of the stored artifact as last checked: unverified, verified, missing, hash-mismatch or legacy-local.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'ArtifactStatus';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When ArtifactStatus was last checked.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'ArtifactCheckedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'True for a model that was Published before the lifecycle gate, demoted to Unevaluated and kept serving its pipeline until a model published through the gate replaces it. Never set by an entity save.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModel', @level2type = N'COLUMN', @level2name = N'ServingWhileUnevaluated';
GO

-- ============================================================================
-- 3. MLModel: one version per pipeline
-- ============================================================================
-- A duplicate (PipelineID, Version) row keeps its place only when it is the oldest of its group; every
-- other one is renumbered above the pipeline's highest version, oldest __mj_CreatedAt first, and its old
-- number is kept in Lineage.renumberedFromVersion. A Lineage that is NULL or not valid JSON is replaced by
-- {"renumberedFromVersion": n}, so one malformed value cannot abort the migration (the old text is not kept).
WITH [Ranked] AS (
    SELECT [ID], [PipelineID], [__mj_CreatedAt],
           ROW_NUMBER() OVER (PARTITION BY [PipelineID], [Version] ORDER BY [__mj_CreatedAt], [ID]) AS [DuplicateRank]
    FROM [${flyway:defaultSchema}].[MLModel]
),
[Moves] AS (
    SELECT r.[ID],
           top_version.[MaxVersion] + ROW_NUMBER() OVER (PARTITION BY r.[PipelineID] ORDER BY r.[__mj_CreatedAt], r.[ID]) AS [NewVersion]
    FROM [Ranked] r
    JOIN (SELECT [PipelineID], MAX([Version]) AS [MaxVersion]
          FROM [${flyway:defaultSchema}].[MLModel]
          GROUP BY [PipelineID]) AS top_version ON top_version.[PipelineID] = r.[PipelineID]
    WHERE r.[DuplicateRank] > 1
)
UPDATE m
   SET [Lineage] = CASE WHEN ISJSON(m.[Lineage]) = 1
                        THEN JSON_MODIFY(m.[Lineage], '$.renumberedFromVersion', m.[Version])
                        ELSE JSON_MODIFY(N'{}', '$.renumberedFromVersion', m.[Version]) END,
       [Version] = mv.[NewVersion]
FROM [${flyway:defaultSchema}].[MLModel] m
JOIN [Moves] mv ON mv.[ID] = m.[ID];
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_MLModel_PipelineVersion]
    ON [${flyway:defaultSchema}].[MLModel] ([PipelineID], [Version]);
GO

-- ============================================================================
-- 4. FeatureValue: the latest value of one record's feature, by effective date
-- ============================================================================
CREATE NONCLUSTERED INDEX [IX_FeatureValue_Record_Feature_AsOf]
    ON [${flyway:defaultSchema}].[FeatureValue] ([EntityID], [RecordID], [FeatureName], [EffectiveAsOf] DESC, [ComputedAt] DESC)
    INCLUDE ([Source], [Role]);
GO

-- ============================================================================
-- 5. vwLatestFeatureValues and the MJ: Latest Feature Values virtual entity
-- ============================================================================
-- One row per (EntityID, RecordID, FeatureName): the newest Champion row by EffectiveAsOf, then ComputedAt
-- (a descending ORDER BY puts a NULL EffectiveAsOf last, so a dated value beats an undated one). ID leads,
-- because CodeGen makes the first column of a virtual entity with no primary key its key. A filter on the
-- partition columns is pushed below the window and seeks IX_FeatureValue_Record_Feature_AsOf.
CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwLatestFeatureValues] AS
SELECT fv.[ID], fv.[EntityID], fv.[RecordID], fv.[FeatureName], fv.[Source], fv.[Role], fv.[EffectiveAsOf], fv.[ComputedAt],
       fv.[MLModelID], fv.[RecordProcessID],
       fv.[ValueText], fv.[ValueNumeric], fv.[ValueDate], fv.[ValueBoolean], fv.[ValueJSON], fv.[Confidence]
FROM (
    SELECT f.*, ROW_NUMBER() OVER (PARTITION BY f.[EntityID], f.[RecordID], f.[FeatureName]
                                   ORDER BY f.[EffectiveAsOf] DESC, f.[ComputedAt] DESC, f.[ID] DESC) AS [LatestRank]
    FROM [${flyway:defaultSchema}].[FeatureValue] f
    WHERE f.[Role] = N'Champion'
) AS fv
WHERE fv.[LatestRank] = 1;
GO

-- CodeGen admits a view only through an existing virtual Entity row, so the row is written here under a
-- fixed ID; CodeGen then syncs the view's columns into EntityField rows.
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Entity] WHERE [ID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7')
    INSERT INTO [${flyway:defaultSchema}].[Entity]
        ([ID], [Name], [Description], [SchemaName], [BaseTable], [BaseView], [BaseViewGenerated], [VirtualEntity],
         [IncludeInAPI], [AllowCreateAPI], [AllowUpdateAPI], [AllowDeleteAPI], [AllowAllRowsAPI],
         [spCreateGenerated], [spUpdateGenerated], [spDeleteGenerated], [TrackRecordChanges])
    VALUES ('1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', N'MJ: Latest Feature Values',
            N'The latest value of each record''s feature: one row per entity, record and feature name, the newest Champion Feature Value by effective date, then computation time. Read-only.',
            N'${flyway:defaultSchema}', N'vwLatestFeatureValues', N'vwLatestFeatureValues', 0, 1,
            1, 0, 0, 0, 0,
            0, 0, 0, 0);
GO

-- ============================================================================
-- 6. FeatureValue: model predictions and their lineage
-- ============================================================================
-- A model's prediction is a Feature Value with Source = 'Model'. It names the scoring binding that defines it, the
-- scoring run that wrote it and whether the record was in the model's training snapshot; MLModelID (the exact model
-- version that scored it) is V202611101901__v6.3.x__Task_Security_Saga_Shadow_Scoring's column. A Model row carries no
-- Record Process, so RecordProcessID becomes nullable; the lineage check keeps a Pipeline row on its Record Process.
ALTER TABLE [${flyway:defaultSchema}].[FeatureValue]
    ADD [MLModelScoringBindingID] UNIQUEIDENTIFIER NULL,
        [MLScoringRunID]          UNIQUEIDENTIFIER NULL,
        [InTraining]              BIT              NULL;
GO
ALTER TABLE [${flyway:defaultSchema}].[FeatureValue] ALTER COLUMN [RecordProcessID] UNIQUEIDENTIFIER NULL;
ALTER TABLE [${flyway:defaultSchema}].[FeatureValue] DROP CONSTRAINT [CK_FeatureValue_Source];
GO
ALTER TABLE [${flyway:defaultSchema}].[FeatureValue]
    ADD CONSTRAINT [CK_FeatureValue_Source] CHECK ([Source] IN (N'Pipeline', N'Human', N'Model')),
        CONSTRAINT [CK_FeatureValue_SourceLineage] CHECK (
            -- Pipeline: a pipeline's answer, and the champion audit and challenger rows (their MLModelID is unconstrained here)
            ([Source] = N'Pipeline' AND [RecordProcessID] IS NOT NULL)
            -- Human: a person's value on a pipeline target, or on a binding scored with no Record Process
            OR ([Source] = N'Human' AND ([RecordProcessID] IS NOT NULL OR [MLModelScoringBindingID] IS NOT NULL))
            -- Model: a prediction carries its binding, model, run, as-of instant and in-training flag
            OR ([Source] = N'Model' AND [MLModelScoringBindingID] IS NOT NULL AND [MLModelID] IS NOT NULL
                AND [MLScoringRunID] IS NOT NULL AND [EffectiveAsOf] IS NOT NULL AND [InTraining] IS NOT NULL)),
        CONSTRAINT [FK_FeatureValue_ScoringBinding] FOREIGN KEY ([MLModelScoringBindingID])
            REFERENCES [${flyway:defaultSchema}].[MLModelScoringBinding] ([ID]),
        CONSTRAINT [FK_FeatureValue_ScoringRun] FOREIGN KEY ([MLScoringRunID])
            REFERENCES [${flyway:defaultSchema}].[MLScoringRun] ([ID]);
GO
-- One prediction per binding, record, as-of instant and role: a re-run of the same as-of date replaces it, and a
-- challenger's row (Role = 'Challenger') sits beside the champion's.
CREATE UNIQUE NONCLUSTERED INDEX [UQ_FeatureValue_ModelRow]
    ON [${flyway:defaultSchema}].[FeatureValue] ([MLModelScoringBindingID], [EntityID], [RecordID], [EffectiveAsOf], [Role])
    WHERE [Source] = N'Model';
GO
-- A binding's predictions over a period (the outcome join of a model's monitoring period), covered so it seeks.
CREATE NONCLUSTERED INDEX [IX_FeatureValue_Binding_AsOf]
    ON [${flyway:defaultSchema}].[FeatureValue] ([MLModelScoringBindingID], [EffectiveAsOf])
    INCLUDE ([EntityID], [RecordID], [Role], [MLModelID], [InTraining], [ValueNumeric], [ValueText])
    WHERE [Source] = N'Model';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The scoring binding whose prediction this is; set on every Model row and on a person''s value entered on a binding.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue', @level2type = N'COLUMN', @level2name = N'MLModelScoringBindingID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The scoring run that wrote this Model row.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue', @level2type = N'COLUMN', @level2name = N'MLScoringRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Model rows: true when the record was in the model''s training snapshot, so its score is optimistic.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue', @level2type = N'COLUMN', @level2name = N'InTraining';
GO

-- ============================================================================
-- 7. MLModelScoringBinding: a binding defines a prediction feature
-- ============================================================================
-- A binding names a training pipeline, not one model version: it scores with the pipeline's Published model, so a
-- new version needs no binding change. Its predictions are Feature Values named FeatureName on TargetEntityID; a
-- TargetColumn, when set, also receives a copy of the newest value, resolved from the result by TargetColumnSource.
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding]
    ADD [MLTrainingPipelineID] UNIQUEIDENTIFIER NULL,
        [FeatureName]          NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
        [TargetColumnSource]   NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
        [Status]               NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS  NOT NULL CONSTRAINT [DF_MLModelScoringBinding_Status] DEFAULT (N'Active'),
        [ViewAuthorizationID]  UNIQUEIDENTIFIER NULL,
        [RetentionDays]        INT              NULL;
GO

-- ============================================================================
-- 8. MLModelScoringBinding: existing bindings
-- ============================================================================
-- Each existing binding takes its model's pipeline, the target entity of that pipeline when it has none, and the
-- pipeline's name as its feature name (a second binding of the same name on one entity gets " (2)", " (3)" …, oldest
-- first). A binding that writes a column copies the value its write-back mapping wrote there: the adverse-class
-- probability of a classification, the predicted value of a regression. The materialized mode, never used, becomes
-- on-demand. The binding's column copy replaces the write-back mapping of each Record Process a binding names, so
-- that mapping is cleared.
UPDATE b
   SET [MLTrainingPipelineID] = m.[PipelineID]
FROM [${flyway:defaultSchema}].[MLModelScoringBinding] b
JOIN [${flyway:defaultSchema}].[MLModel] m ON m.[ID] = b.[MLModelID];
GO
UPDATE b
   SET [TargetEntityID] = p.[TargetEntityID]
FROM [${flyway:defaultSchema}].[MLModelScoringBinding] b
JOIN [${flyway:defaultSchema}].[MLTrainingPipeline] p ON p.[ID] = b.[MLTrainingPipelineID]
WHERE b.[TargetEntityID] IS NULL;
GO
WITH [Named] AS (
    SELECT b.[ID], p.[Name],
           ROW_NUMBER() OVER (PARTITION BY b.[TargetEntityID], p.[Name] ORDER BY b.[__mj_CreatedAt], b.[ID]) AS [NameRank]
    FROM [${flyway:defaultSchema}].[MLModelScoringBinding] b
    JOIN [${flyway:defaultSchema}].[MLTrainingPipeline] p ON p.[ID] = b.[MLTrainingPipelineID]
),
[Suffixed] AS (
    SELECT [ID], [Name], [NameRank],
           CASE WHEN [NameRank] = 1 THEN N'' ELSE N' (' + CAST([NameRank] AS NVARCHAR(10)) + N')' END AS [Suffix]
    FROM [Named]
)
UPDATE b
   SET [FeatureName] = LEFT(s.[Name], 255 - LEN(s.[Suffix])) + s.[Suffix]
FROM [${flyway:defaultSchema}].[MLModelScoringBinding] b
JOIN [Suffixed] s ON s.[ID] = b.[ID];
GO
UPDATE b
   SET [TargetColumnSource] = CASE m.[ProblemType] WHEN N'classification' THEN N'$.AdverseProbability' ELSE N'$.Value' END
FROM [${flyway:defaultSchema}].[MLModelScoringBinding] b
JOIN [${flyway:defaultSchema}].[MLModel] m ON m.[ID] = b.[MLModelID]
WHERE b.[TargetColumn] IS NOT NULL;
UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [Mode] = N'OnDemand' WHERE [Mode] = N'Materialized';
UPDATE [${flyway:defaultSchema}].[RecordProcess]
   SET [OutputMapping] = NULL
 WHERE [ID] IN (SELECT [RecordProcessID] FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [RecordProcessID] IS NOT NULL);
GO

-- ============================================================================
-- 9. MLModelScoringBinding: the model reference and the materialized mode removed
-- ============================================================================
DROP INDEX [IDX_AUTO_MJ_FKEY_MLModelScoringBinding_MLModelID] ON [${flyway:defaultSchema}].[MLModelScoringBinding];
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding] DROP CONSTRAINT [FK_MLModelScoringBinding_MLModel];
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding] DROP CONSTRAINT [CK_MLModelScoringBinding_Mode];
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding] DROP COLUMN [MLModelID], [MaterializedResultID];
GO
-- The MJ: ML Models -> MJ: ML Model Scoring Bindings relationship joined on the dropped MLModelID; CodeGen does not
-- remove a relationship whose join field is gone, so it goes with the column.
DELETE FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'B3324F8A-5E80-4C82-A929-5CF1B8E5D015';
GO
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding] ALTER COLUMN [MLTrainingPipelineID] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding] ALTER COLUMN [FeatureName] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL;
GO
ALTER TABLE [${flyway:defaultSchema}].[MLModelScoringBinding]
    ADD CONSTRAINT [FK_MLModelScoringBinding_Pipeline] FOREIGN KEY ([MLTrainingPipelineID])
            REFERENCES [${flyway:defaultSchema}].[MLTrainingPipeline] ([ID]),
        CONSTRAINT [FK_MLModelScoringBinding_Authorization] FOREIGN KEY ([ViewAuthorizationID])
            REFERENCES [${flyway:defaultSchema}].[Authorization] ([ID]),
        CONSTRAINT [CK_MLModelScoringBinding_Status] CHECK ([Status] IN (N'Active', N'Withdrawn')),
        CONSTRAINT [CK_MLModelScoringBinding_Retention] CHECK ([RetentionDays] IS NULL OR [RetentionDays] > 0),
        CONSTRAINT [CK_MLModelScoringBinding_CopySource] CHECK ([TargetColumn] IS NULL OR [TargetColumnSource] IS NOT NULL),
        CONSTRAINT [CK_MLModelScoringBinding_Mode] CHECK ([Mode] IN (N'OnDemand', N'Scheduled'));
GO
-- A feature name is unique on its entity: the latest-value view keys on (EntityID, RecordID, FeatureName).
CREATE UNIQUE NONCLUSTERED INDEX [UQ_MLModelScoringBinding_EntityFeature]
    ON [${flyway:defaultSchema}].[MLModelScoringBinding] ([TargetEntityID], [FeatureName])
    WHERE [TargetEntityID] IS NOT NULL;
GO
EXEC sp_updateextendedproperty @name = N'MS_Description', @value = N'Defines a prediction feature: the training pipeline whose Published model scores, the entity whose records it scores and the feature name its predictions are stored under as Feature Values. Optionally copies the newest value into an existing column. Who may see the predictions is ViewAuthorizationID.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelScoringBinding';
EXEC sp_updateextendedproperty @name = N'MS_Description', @value = N'Name of an existing column of the target entity that also receives the newest prediction; NULL stores the predictions as Feature Values only.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelScoringBinding', @level2type = N'COLUMN', @level2name = N'TargetColumn';
EXEC sp_updateextendedproperty @name = N'MS_Description', @value = N'Scoring mode: OnDemand or Scheduled.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelScoringBinding', @level2type = N'COLUMN', @level2name = N'Mode';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The training pipeline whose Published model scores for this binding; publishing a new version needs no binding change.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelScoringBinding', @level2type = N'COLUMN', @level2name = N'MLTrainingPipelineID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The feature name the predictions are stored under, unique on the target entity.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelScoringBinding', @level2type = N'COLUMN', @level2name = N'FeatureName';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The result reference ($.Value, $.Class, $.AdverseProbability or $.Probabilities.<class>) the column copy writes into TargetColumn; required when TargetColumn is set.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelScoringBinding', @level2type = N'COLUMN', @level2name = N'TargetColumnSource';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Active or Withdrawn. A withdrawn binding no longer scores, and the column copies it made are cleared; its Feature Values stay.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelScoringBinding', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The authorization a user must hold to see this binding''s predictions; a binding with none is visible to no user.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelScoringBinding', @level2type = N'COLUMN', @level2name = N'ViewAuthorizationID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Days of prediction history kept; NULL keeps all of it.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLModelScoringBinding', @level2type = N'COLUMN', @level2name = N'RetentionDays';
GO

-- ============================================================================
-- 10. vwUserHeldAuthorizations: the authorizations each user holds
-- ============================================================================
-- MJ's authorization rule in SQL. An Owner holds every authorization. Any other user holds one when it is active, none
-- of the user's roles has a Deny grant on it, and it or an ancestor (the ParentID chain, cycles stopped) is active with
-- an Allow grant and no Deny grant among the user's roles. A grant whose Type is not Allow counts as a Deny.
CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwUserHeldAuthorizations] AS
WITH [AuthorizationChain] AS (
    SELECT a.[ID] AS [AuthorizationID], a.[ID] AS [NodeID], a.[ParentID] AS [NextID],
           CAST(N'|' + CAST(a.[ID] AS NVARCHAR(36)) + N'|' AS NVARCHAR(MAX)) AS [Visited]
    FROM [${flyway:defaultSchema}].[Authorization] a
    UNION ALL
    SELECT c.[AuthorizationID], parent.[ID], parent.[ParentID],
           c.[Visited] + CAST(parent.[ID] AS NVARCHAR(36)) + N'|'
    FROM [AuthorizationChain] c
    JOIN [${flyway:defaultSchema}].[Authorization] parent ON parent.[ID] = c.[NextID]
    WHERE CHARINDEX(N'|' + CAST(parent.[ID] AS NVARCHAR(36)) + N'|', c.[Visited]) = 0
),
[UserGrant] AS (
    SELECT ur.[UserID], ar.[AuthorizationID],
           MAX(CASE WHEN LTRIM(RTRIM(ar.[Type])) = N'Allow' THEN 1 ELSE 0 END) AS [HasAllow],
           MAX(CASE WHEN LTRIM(RTRIM(ar.[Type])) = N'Allow' THEN 0 ELSE 1 END) AS [HasDeny]
    FROM [${flyway:defaultSchema}].[UserRole] ur
    JOIN [${flyway:defaultSchema}].[AuthorizationRole] ar ON ar.[RoleID] = ur.[RoleID]
    GROUP BY ur.[UserID], ar.[AuthorizationID]
)
SELECT u.[ID] AS [UserID], a.[ID] AS [AuthorizationID]
FROM [${flyway:defaultSchema}].[User] u
CROSS JOIN [${flyway:defaultSchema}].[Authorization] a
WHERE LTRIM(RTRIM(u.[Type])) = N'Owner'
UNION
SELECT g.[UserID], c.[AuthorizationID]
FROM [AuthorizationChain] c
JOIN [${flyway:defaultSchema}].[Authorization] linked ON linked.[ID] = c.[AuthorizationID] AND linked.[IsActive] = 1
JOIN [${flyway:defaultSchema}].[Authorization] node ON node.[ID] = c.[NodeID] AND node.[IsActive] = 1
JOIN [UserGrant] g ON g.[AuthorizationID] = c.[NodeID] AND g.[HasAllow] = 1 AND g.[HasDeny] = 0
WHERE NOT EXISTS (SELECT 1 FROM [UserGrant] d
                  WHERE d.[UserID] = g.[UserID] AND d.[AuthorizationID] = c.[AuthorizationID] AND d.[HasDeny] = 1);
GO

-- ============================================================================
-- 11. vwLatestFeatureValues re-created with the prediction lineage
-- ============================================================================
-- Section 5's view with the three lineage columns of section 6, so a reader of the latest value sees which binding,
-- scoring run and training-set membership it came from. ID still leads.
CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwLatestFeatureValues] AS
SELECT fv.[ID], fv.[EntityID], fv.[RecordID], fv.[FeatureName], fv.[Source], fv.[Role], fv.[EffectiveAsOf], fv.[ComputedAt],
       fv.[MLModelScoringBindingID], fv.[MLModelID], fv.[MLScoringRunID], fv.[InTraining], fv.[RecordProcessID],
       fv.[ValueText], fv.[ValueNumeric], fv.[ValueDate], fv.[ValueBoolean], fv.[ValueJSON], fv.[Confidence]
FROM (
    SELECT f.*, ROW_NUMBER() OVER (PARTITION BY f.[EntityID], f.[RecordID], f.[FeatureName]
                                   ORDER BY f.[EffectiveAsOf] DESC, f.[ComputedAt] DESC, f.[ID] DESC) AS [LatestRank]
    FROM [${flyway:defaultSchema}].[FeatureValue] f
    WHERE f.[Role] = N'Champion'
) AS fv
WHERE fv.[LatestRank] = 1;
GO

-- ============================================================================
-- 12. spDeleteEntityWithCoreDependencies: the serving tables
-- ============================================================================
-- Sections 1, 2, 6 and 9 add foreign keys into tables this proc deletes from when an entity is removed (MLModel,
-- MLTrainingRun, MLTrainingSnapshot, MLModelScoringBinding, MLScoringRun, MLTrainingPipeline, Entity), so removing an
-- entity whose pipeline has a model with a publish record, a scoring run, a monitoring result, an output binding or a
-- scoring binding with predictions would fail on those FKs. (FeatureValue.MLModelID -> MLModel is V202611101901's,
-- whose procedure already clears it.) The proc clears them after the pipelines' own steps begin and before the
-- binding, run, model and snapshot deletes:
--    - MLModelPublishRecord.ModelID -> MLModel (delete); .TrainingRunID -> MLTrainingRun (a run-level refusal, whose
--      ModelID is NULL, is deleted, since nulling its run would break CK_MLModelPublishRecord_Subject; a surviving
--      model's record that names the run is kept and loses only the link); .SignOffID -> MLModelPublishRecord,
--      .ReplacesModelID -> MLModel (null). These are the only mutations of a publish record.
--    - MLModel.TrainingRunID -> MLTrainingRun, .TrainingSnapshotID -> MLTrainingSnapshot (null)
--    - FeatureValue.MLModelID -> MLModel (null, after the deleted models' Source = 'Model' rows are deleted: a Model
--      row without its model fails CK_FeatureValue_SourceLineage)
--    - FeatureValue.MLScoringRunID -> MLScoringRun (delete, before each scoring-run delete) and
--      FeatureValue.MLModelScoringBindingID -> MLModelScoringBinding (delete, before the binding delete): a Model row,
--      or a person's value on a binding with no Record Process, fails CK_FeatureValue_SourceLineage when nulled
--    - MLOutputBinding.ModelID, MLMonitoringResult.ModelID -> MLModel (delete); MLScoringRun.ModelID -> MLModel
--      (delete: CK_MLScoringRun_Model forbids a null model on a run that is not refused)
--    - MLModelScoringBinding.MLTrainingPipelineID -> MLTrainingPipeline (delete: the bindings of the entity's
--      pipelines go with them)
--    - MLScoringRun.MLModelScoringBindingID -> MLModelScoringBinding, MLMonitoringResult.ChallengerRunID ->
--      MLTrainingRun (null)
--    - MLScoringRun.ScopeEntityID -> Entity (delete), in @Handled
-- FeatureValue.RecordProcessID -> RecordProcess is nullable since section 6; the process's rows are still deleted,
-- because a Pipeline row without its Record Process fails CK_FeatureValue_SourceLineage. The FKs into [User],
-- [Authorization], MLPredictionUnit, MLEvaluationProtocol, ProcessRun and ScheduledJobRun need no step: the proc
-- deletes from none of those tables. The policy in
-- packages/CodeGenLib/src/__tests__/fixtures/entity-delete-fk-policy.json records every entry. The rest of the proc
-- is V202611120915__v6.3.x__Artifact_Working_States_And_Delegate_Permissions's body (which runs before this
-- migration), unchanged: its Artifact.DelegateEntityID clear, and V202611101901's FeatureValue.MLModelID clear (kept
-- below, after the Source = 'Model' delete).
CREATE OR ALTER PROC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies]
  @EntityID uniqueidentifier
AS
BEGIN
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Own the transaction only when the caller has none (CodeGen calls in autocommit; a migration
-- runner may already hold one, and its rollback then covers this proc too).
DECLARE @OwnsTransaction bit = 0;
IF @@TRANCOUNT = 0
BEGIN
    BEGIN TRANSACTION;
    SET @OwnsTransaction = 1;
END

BEGIN TRY

    -- ── Precondition: refuse to start if something not covered by the policy points at this entity ──
    -- @Handled is the policy's delete and null references. A reference marked block
    -- (Entity.ParentID), a core table added after this migration, or an FK from an app schema is
    -- reported here, before anything is deleted.
    DECLARE @blockers nvarchar(max) = N'', @probe nvarchar(max) = N'';

    DECLARE @Handled TABLE (Pair nvarchar(400) PRIMARY KEY);
    INSERT INTO @Handled (Pair) VALUES
      (N'AccessControlRule.EntityID'), (N'ActionExecutionLog.TargetEntityID'),
      (N'AIAgentExample.PrimaryScopeEntityID'), (N'AIAgentNote.PrimaryScopeEntityID'),
      (N'AIAgentRun.PrimaryScopeEntityID'), (N'AIAgentSession.LinkedEntityID'),
      (N'ApplicationEntity.EntityID'), (N'ArchiveConfigurationEntity.EntityID'),
      (N'ArchiveRunDetail.EntityID'), (N'Artifact.DelegateEntityID'), (N'AuditLog.EntityID'),
      (N'CalendarEventLink.EntityID'),
      (N'ClusterAnalysis.EntityID'), (N'CompanyIntegrationEntityMap.EntityID'),
      (N'CompanyIntegrationRecordMap.EntityID'), (N'CompanyIntegrationRunDetail.EntityID'),
      (N'ContentSource.EntityID'), (N'Conversation.LinkedEntityID'), (N'DataContextItem.EntityID'),
      (N'DatasetItem.EntityID'), (N'DuplicateRun.EntityID'), (N'EntityAction.EntityID'),
      (N'EntityAction.ScopeEntityID'), (N'EntityAIAction.EntityID'), (N'EntityAIAction.OutputEntityID'),
      (N'EntityAlternateBaseView.EntityID'), (N'EntityCommunicationMessageType.EntityID'),
      (N'EntityDocument.EntityID'), (N'EntityField.EntityID'), (N'EntityField.RelatedEntityID'),
      (N'EntityFormContribution.EntityID'), (N'EntityFormContribution.RelatedEntityID'),
      (N'EntityFormOverride.EntityID'), (N'EntityOrganicKey.EntityID'),
      (N'EntityOrganicKeyRelatedEntity.RelatedEntityID'), (N'EntityPermission.EntityID'),
      (N'EntityRecordDocument.EntityID'), (N'EntityRelationship.EntityID'),
      (N'EntityRelationship.RelatedEntityID'), (N'EntitySetting.EntityID'),
      (N'EntityUniqueKey.EntityID'), (N'FeatureValue.EntityID'),
      (N'FileEntityRecordLink.EntityID'), (N'FormChromeRule.EntityID'),
      (N'FormChromeRule.RelatedEntityID'), (N'GeneratedCode.LinkedEntityID'),
      (N'GraphEdge.SourceEntityID'), (N'GraphEdge.TargetEntityID'), (N'GraphEdgeTypeEndpoint.EntityID'),
      (N'IdentityClaim.EntityID'), (N'IntegrationURLFormat.EntityID'), (N'InteractionLink.EntityID'),
      (N'List.EntityID'), (N'MaterializedResult.GeneratedEntityID'),
      (N'MaterializedResult.SourceEntityID'), (N'MLModelScoringBinding.TargetEntityID'),
      (N'MLScoringRun.ScopeEntityID'), (N'MLTrainingPipeline.TargetEntityID'), (N'ProcessRunDetail.EntityID'), (N'ProcessRun.EntityID'),
      (N'QueryEntity.EntityID'), (N'QueryField.SourceEntityID'),
      (N'RecommendationItem.DestinationEntityID'), (N'Recommendation.SourceEntityID'),
      (N'RecordChange.EntityID'), (N'RecordCloneLogItem.EntityID'), (N'RecordCloneLog.RootEntityID'),
      (N'RecordGeoCode.EntityID'), (N'RecordLink.SourceEntityID'), (N'RecordLink.TargetEntityID'),
      (N'RecordMergeLog.EntityID'), (N'RecordProcess.EntityID'), (N'RecordProcessWatermark.EntityID'),
      (N'ResourceType.CategoryEntityID'), (N'ResourceType.EntityID'),
      (N'RubricEvaluation.ContextEntityID'), (N'RubricEvaluation.SubjectEntityID'),
      (N'ScopedNotificationConfig.PrimaryScopeEntityID'), (N'ScopedPromptConfig.PrimaryScopeEntityID'),
      (N'ScopedPromptPart.PrimaryScopeEntityID'), (N'SearchScopeEntity.EntityID'),
      (N'SignatureRequest.EntityID'), (N'SystemEvent.EntityID'), (N'TaggedItem.EntityID'),
      (N'TagScope.ScopeEntityID'), (N'TemplateParam.EntityID'), (N'TestRun.TargetLogEntityID'),
      (N'UserApplicationEntity.EntityID'), (N'UserFavorite.EntityID'), (N'User.LinkedEntityID'),
      (N'UserRecordLog.EntityID'), (N'UserViewCategory.EntityID'), (N'UserView.EntityID'),
      (N'VersionLabel.EntityID'), (N'VersionLabelItem.EntityID');

    -- FOR XML PATH concatenation is deterministic (the += accumulator idiom is not). Only enabled
    -- NO_ACTION FKs can block the final DELETE; CASCADE / SET NULL / SET DEFAULT and disabled FKs
    -- are cleared or ignored by SQL Server itself.
    SELECT @probe = (
        SELECT DISTINCT
             N' UNION ALL SELECT ''' + REPLACE(SCHEMA_NAME(pt.schema_id) + '.' + pt.name + '.' + pc.name, '''', '''''')
           + N''' WHERE EXISTS (SELECT 1 FROM ' + QUOTENAME(SCHEMA_NAME(pt.schema_id)) + N'.' + QUOTENAME(pt.name)
           + N' WHERE ' + QUOTENAME(pc.name) + N' = @EntityID)'
        FROM sys.foreign_keys fk
        JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
             AND rt.name = 'Entity' AND SCHEMA_NAME(rt.schema_id) = '${flyway:defaultSchema}'
        JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
        WHERE fk.delete_referential_action = 0
          AND fk.is_disabled = 0
          AND NOT (SCHEMA_NAME(pt.schema_id) = '${flyway:defaultSchema}'
                   AND pt.name + '.' + pc.name IN (SELECT Pair FROM @Handled))
        FOR XML PATH(''), TYPE
    ).value('.', 'nvarchar(max)');

    IF LEN(ISNULL(@probe, N'')) > 0
    BEGIN
        DECLARE @found TABLE (Ref nvarchar(400));
        SET @probe = N'SELECT Ref FROM (SELECT CAST(NULL AS nvarchar(400)) Ref WHERE 1=0' + @probe + N') q;';
        INSERT INTO @found (Ref) EXEC sp_executesql @probe, N'@EntityID uniqueidentifier', @EntityID = @EntityID;

        SELECT @blockers = STUFF((SELECT N', ' + Ref FROM @found ORDER BY Ref FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, N'');

        IF @blockers IS NOT NULL AND @blockers <> N''
        BEGIN
            DECLARE @msg nvarchar(2048) = N'Cannot delete entity ' + CAST(@EntityID AS nvarchar(50))
                + N': rows still reference it through foreign keys this procedure does not clear ('
                + LEFT(@blockers, 1600) + N'). Clear them first. Nothing has been deleted.';
            THROW 50000, @msg, 1;
        END
    END

    -- ── Rows this proc deletes that other rows can reference: capture their IDs up front ──
    -- (Taken before any delete, so every child statement below sees the full parent set.)
    DECLARE @EntityFieldIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityFieldIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserView] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewCategoryIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewCategoryIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserViewCategory] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewRunIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewRunIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserViewRun] WHERE [UserViewID] IN (SELECT ID FROM @UserViewIDs);

    DECLARE @ListIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ListIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[List] WHERE [EntityID] = @EntityID;

    DECLARE @EntityDocumentIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityDocumentIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityDocument] WHERE [EntityID] = @EntityID;

    DECLARE @EntityRecordDocumentIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityRecordDocumentIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityRecordDocument]
        WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    DECLARE @DuplicateRunIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @DuplicateRunIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[DuplicateRun]
        WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    DECLARE @DuplicateRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @DuplicateRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[DuplicateRunDetail]
        WHERE [DuplicateRunID] IN (SELECT ID FROM @DuplicateRunIDs);

    DECLARE @EntityActionIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityActionIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityAction]
        WHERE [EntityID] = @EntityID OR [ScopeEntityID] = @EntityID;

    DECLARE @AlternateBaseViewIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @AlternateBaseViewIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityAlternateBaseView] WHERE [EntityID] = @EntityID;

    DECLARE @MessageTypeIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @MessageTypeIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;

    DECLARE @OrganicKeyIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @OrganicKeyIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityOrganicKey] WHERE [EntityID] = @EntityID;

    DECLARE @IntegrationEntityMapIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @IntegrationEntityMapIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] WHERE [EntityID] = @EntityID;

    DECLARE @IntegrationRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @IntegrationRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE [EntityID] = @EntityID;

    DECLARE @PipelineIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @PipelineIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingPipeline] WHERE [TargetEntityID] = @EntityID;

    DECLARE @MLModelIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @MLModelIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[MLModel] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);

    DECLARE @ProcessRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ProcessRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[ProcessRunDetail] WHERE [EntityID] = @EntityID;

    DECLARE @RecommendationIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecommendationIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[Recommendation] WHERE [SourceEntityID] = @EntityID;

    DECLARE @RecordCloneLogIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordCloneLogIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordCloneLog] WHERE [RootEntityID] = @EntityID;

    DECLARE @RecordMergeLogIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordMergeLogIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordMergeLog] WHERE [EntityID] = @EntityID;

    DECLARE @RecordProcessIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordProcessIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordProcess] WHERE [EntityID] = @EntityID;

    DECLARE @RubricEvaluationIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RubricEvaluationIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RubricEvaluation] WHERE [SubjectEntityID] = @EntityID;

    DECLARE @ResourceTypeIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ResourceTypeIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[ResourceType] WHERE [EntityID] = @EntityID;

    DECLARE @AgentNoteIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @AgentNoteIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[AIAgentNote] WHERE [PrimaryScopeEntityID] = @EntityID;

    -- RecordChange can be large, so its doomed set stays a subquery instead of a table variable.

    -- ── Nullable references to this entity: cleared, the rows survive ──
    UPDATE [${flyway:defaultSchema}].[ActionExecutionLog] SET [TargetEntityID] = NULL WHERE [TargetEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[AIAgentRun] SET [PrimaryScopeEntityID] = NULL WHERE [PrimaryScopeEntityID] = @EntityID;
    -- CK_AIAgentSession_LinkBinding / CK_Conversation_LinkBinding / CK_Artifact_DelegateBinding: both columns or neither
    UPDATE [${flyway:defaultSchema}].[AIAgentSession] SET [LinkedEntityID] = NULL, [LinkedRecordID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[Artifact] SET [DelegateEntityID] = NULL, [DelegateRecordID] = NULL WHERE [DelegateEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[AuditLog] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ClusterAnalysis] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ContentSource] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- CK_Conversation_LinkBinding / CK_Conversation_AnchorLinkBinding: clear LinkedRecordID and anchor columns with LinkedEntityID
    UPDATE [${flyway:defaultSchema}].[Conversation] SET [LinkedEntityID] = NULL, [LinkedRecordID] = NULL, [AnchorType] = NULL, [AnchorKey] = NULL, [AnchorMetadata] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[DataContextItem] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- Other entities' fields that point AT this entity (#3561)
    UPDATE [${flyway:defaultSchema}].[EntityField] SET [RelatedEntityID] = NULL WHERE [RelatedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[GeneratedCode] SET [LinkedEntityID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[IdentityClaim] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MaterializedResult] SET [GeneratedEntityID] = NULL WHERE [GeneratedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MaterializedResult] SET [SourceEntityID] = NULL WHERE [SourceEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [TargetEntityID] = NULL WHERE [TargetEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ProcessRun] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[QueryField] SET [SourceEntityID] = NULL WHERE [SourceEntityID] = @EntityID;
    -- ResourceType references Entity twice; EntityID is a delete (below), CategoryEntityID is cleared (#4483)
    UPDATE [${flyway:defaultSchema}].[ResourceType] SET [CategoryEntityID] = NULL WHERE [CategoryEntityID] = @EntityID;
    -- CK_RubricEvaluation_ContextPair: both columns or neither
    UPDATE [${flyway:defaultSchema}].[RubricEvaluation] SET [ContextEntityID] = NULL, [ContextRecordID] = NULL WHERE [ContextEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[SignatureRequest] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- SystemEvent has a physical FK but no entity, so generated metadata does not list it
    UPDATE [${flyway:defaultSchema}].[SystemEvent] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[TemplateParam] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[TestRun] SET [TargetLogEntityID] = NULL WHERE [TargetLogEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[User] SET [LinkedEntityID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[VersionLabel] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;

    -- ── Nullable references to rows deleted below: cleared first ──
    UPDATE [${flyway:defaultSchema}].[AIAgentNote] SET [ConsolidatedIntoNoteID] = NULL WHERE [ConsolidatedIntoNoteID] IN (SELECT ID FROM @AgentNoteIDs);
    UPDATE [${flyway:defaultSchema}].[ErrorLog] SET [CompanyIntegrationRunDetailID] = NULL WHERE [CompanyIntegrationRunDetailID] IN (SELECT ID FROM @IntegrationRunDetailIDs);
    UPDATE [${flyway:defaultSchema}].[ActionExecutionLog] SET [EntityActionID] = NULL WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    UPDATE [${flyway:defaultSchema}].[EntityAlternateBaseView] SET [ParentID] = NULL WHERE [ParentID] IN (SELECT ID FROM @AlternateBaseViewIDs);
    UPDATE [${flyway:defaultSchema}].[QueryEntity] SET [AlternateBaseViewID] = NULL WHERE [AlternateBaseViewID] IN (SELECT ID FROM @AlternateBaseViewIDs);
    UPDATE [${flyway:defaultSchema}].[ContentSource] SET [EntityDocumentID] = NULL WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    UPDATE [${flyway:defaultSchema}].[ContentItem] SET [EntityRecordDocumentID] = NULL WHERE [EntityRecordDocumentID] IN (SELECT ID FROM @EntityRecordDocumentIDs);
    UPDATE [${flyway:defaultSchema}].[DuplicateRun] SET [SourceListID] = NULL WHERE [SourceListID] IN (SELECT ID FROM @ListIDs);
    UPDATE [${flyway:defaultSchema}].[RecordProcess] SET [ScopeListID] = NULL WHERE [ScopeListID] IN (SELECT ID FROM @ListIDs);
    UPDATE [${flyway:defaultSchema}].[MLTrainingRun] SET [ResultingModelID] = NULL WHERE [ResultingModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[FeatureValue] SET [ProcessRunDetailID] = NULL WHERE [ProcessRunDetailID] IN (SELECT ID FROM @ProcessRunDetailIDs);
    UPDATE [${flyway:defaultSchema}].[RecordChange] SET [RestoredFromID] = NULL
        WHERE [RestoredFromID] IN (SELECT ID FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID);
    UPDATE [${flyway:defaultSchema}].[DuplicateRunDetailMatch] SET [RecordMergeLogID] = NULL WHERE [RecordMergeLogID] IN (SELECT ID FROM @RecordMergeLogIDs);
    UPDATE [${flyway:defaultSchema}].[FeatureValueCache] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[ProcessRun] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[MagicLinkInvite] SET [ResourceTypeID] = NULL WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    UPDATE [${flyway:defaultSchema}].[UserNotification] SET [ResourceTypeID] = NULL WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    UPDATE [${flyway:defaultSchema}].[RubricEvaluation] SET [SupersedesEvaluationID] = NULL WHERE [SupersedesEvaluationID] IN (SELECT ID FROM @RubricEvaluationIDs);
    UPDATE [${flyway:defaultSchema}].[UserView] SET [CategoryID] = NULL WHERE [CategoryID] IN (SELECT ID FROM @UserViewCategoryIDs);
    UPDATE [${flyway:defaultSchema}].[UserViewCategory] SET [ParentID] = NULL WHERE [ParentID] IN (SELECT ID FROM @UserViewCategoryIDs);
    UPDATE [${flyway:defaultSchema}].[DataContextItem] SET [ViewID] = NULL WHERE [ViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[EntityRelationship] SET [DisplayUserViewID] = NULL WHERE [DisplayUserViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[List] SET [SourceViewID] = NULL WHERE [SourceViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[RecordProcess] SET [ScopeViewID] = NULL WHERE [ScopeViewID] IN (SELECT ID FROM @UserViewIDs);

    -- ── Deletes, children before parents ──

    -- Entity fields: values and permissions first; the EntityField rows go last, just before Entity
    DELETE FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] IN (SELECT ID FROM @EntityFieldIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityFieldPermission] WHERE [EntityFieldID] IN (SELECT ID FROM @EntityFieldIDs);
    UPDATE [${flyway:defaultSchema}].[QueryField] SET [SourceEntityFieldID] = NULL WHERE [SourceEntityFieldID] IN (SELECT ID FROM @EntityFieldIDs);

    -- Saved-view run history
    DELETE FROM [${flyway:defaultSchema}].[UserViewRunDetail] WHERE [UserViewRunID] IN (SELECT ID FROM @UserViewRunIDs);
    DELETE FROM [${flyway:defaultSchema}].[UserViewRun] WHERE [UserViewID] IN (SELECT ID FROM @UserViewIDs);

    -- Lists
    DELETE FROM [${flyway:defaultSchema}].[ListDetail] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[ListInvitation] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[ListShare] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[List] WHERE [EntityID] = @EntityID;

    -- Duplicate detection (a run is tied to the entity directly or through its entity document)
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRunDetailMatch] WHERE [DuplicateRunDetailID] IN (SELECT ID FROM @DuplicateRunDetailIDs);
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRunDetail] WHERE [DuplicateRunID] IN (SELECT ID FROM @DuplicateRunIDs);
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRun] WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    -- Entity documents
    DELETE FROM [${flyway:defaultSchema}].[EntityDocumentRun] WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityDocumentSetting] WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityRecordDocument] WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityDocument] WHERE [EntityID] = @EntityID;

    -- Entity actions (on this entity, or scoped to one of its records)
    DELETE FROM [${flyway:defaultSchema}].[EntityActionFilter] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityActionInvocation] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityActionParam] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityAction] WHERE [EntityID] = @EntityID OR [ScopeEntityID] = @EntityID;

    -- Communication message types
    DELETE FROM [${flyway:defaultSchema}].[EntityCommunicationField] WHERE [EntityCommunicationMessageTypeID] IN (SELECT ID FROM @MessageTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;

    -- Organic keys
    DELETE FROM [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] WHERE [RelatedEntityID] = @EntityID OR [EntityOrganicKeyID] IN (SELECT ID FROM @OrganicKeyIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityOrganicKey] WHERE [EntityID] = @EntityID;

    -- Company integrations
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] WHERE [EntityMapID] IN (SELECT ID FROM @IntegrationEntityMapIDs);
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] WHERE [EntityMapID] IN (SELECT ID FROM @IntegrationEntityMapIDs);
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationRecordMap] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE [EntityID] = @EntityID;

    -- ML pipelines targeting this entity, their models, runs and scoring bindings
    -- the serving ledger: the models' publish records and the runs' run-level refusals (ModelID NULL) are deleted; a
    -- surviving record that consumed one of their sign-offs, replaced one of the models or names one of the runs loses
    -- only the link.
    -- the only mutation of a publish record: spDeleteEntityWithCoreDependencies clears SignOffID/ReplacesModelID when the referenced row is removed with its entity
    UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [SignOffID] = NULL WHERE [SignOffID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLModelPublishRecord] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs) OR ([ModelID] IS NULL AND [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs))));
    UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [ReplacesModelID] = NULL WHERE [ReplacesModelID] IN (SELECT ID FROM @MLModelIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLModelPublishRecord] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs) OR ([ModelID] IS NULL AND [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs)));
    -- the rows left that name one of the runs have a ModelID, so clearing TrainingRunID keeps CK_MLModelPublishRecord_Subject
    UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [TrainingRunID] = NULL WHERE [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    -- another pipeline's model that names one of these runs or snapshots loses only the lineage link
    UPDATE [${flyway:defaultSchema}].[MLModel] SET [TrainingRunID] = NULL WHERE [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    UPDATE [${flyway:defaultSchema}].[MLModel] SET [TrainingSnapshotID] = NULL WHERE [TrainingSnapshotID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingSnapshot] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    -- the models' predictions are deleted before MLModelID is cleared on any other Feature Value
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [Source] = N'Model' AND [MLModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[FeatureValue] SET [MLModelID] = NULL WHERE [MLModelID] IN (SELECT ID FROM @MLModelIDs);
    -- output bindings, scoring runs (CK_MLScoringRun_Model forbids clearing a run's model) and monitoring results
    DELETE FROM [${flyway:defaultSchema}].[MLOutputBinding] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [MLScoringRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLScoringRun] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLScoringRun] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[MLScoringRun] SET [MLModelScoringBindingID] = NULL WHERE [MLModelScoringBindingID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [MLTrainingPipelineID] IN (SELECT ID FROM @PipelineIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLMonitoringResult] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[MLMonitoringResult] SET [ChallengerRunID] = NULL WHERE [ChallengerRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [MLModelScoringBindingID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [MLTrainingPipelineID] IN (SELECT ID FROM @PipelineIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [MLTrainingPipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLModel] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    -- the pipelines' training snapshots; a run of another pipeline that names one loses only the link
    UPDATE [${flyway:defaultSchema}].[MLTrainingRun] SET [TrainingSnapshotID] = NULL WHERE [TrainingSnapshotID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingSnapshot] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingSnapshot] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingPipeline] WHERE [TargetEntityID] = @EntityID;
    -- scoring runs scoped to this entity, whatever model they ran (ScopeEntityID is NOT NULL)
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [MLScoringRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLScoringRun] WHERE [ScopeEntityID] = @EntityID);
    DELETE FROM [${flyway:defaultSchema}].[MLScoringRun] WHERE [ScopeEntityID] = @EntityID;

    -- Record processes and feature values
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [EntityID] = @EntityID OR [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[FeaturePipelineVersion] WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordProcessWatermark] WHERE [EntityID] = @EntityID OR [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordProcess] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ProcessRunDetail] WHERE [EntityID] = @EntityID;

    -- Recommendations
    DELETE FROM [${flyway:defaultSchema}].[RecommendationItem] WHERE [DestinationEntityID] = @EntityID OR [RecommendationID] IN (SELECT ID FROM @RecommendationIDs);
    DELETE FROM [${flyway:defaultSchema}].[Recommendation] WHERE [SourceEntityID] = @EntityID;

    -- Record history: version labels, changes, clone and merge logs
    DELETE FROM [${flyway:defaultSchema}].[VersionLabelItem] WHERE [EntityID] = @EntityID
        OR [RecordChangeID] IN (SELECT ID FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID);
    DELETE FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordCloneLogItem] WHERE [EntityID] = @EntityID OR [RecordCloneLogID] IN (SELECT ID FROM @RecordCloneLogIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordCloneLog] WHERE [RootEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordMergeDeletionLog] WHERE [RecordMergeLogID] IN (SELECT ID FROM @RecordMergeLogIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordMergeLog] WHERE [EntityID] = @EntityID;

    -- Rubric evaluations of this entity's records
    DELETE FROM [${flyway:defaultSchema}].[RubricEvaluationScore] WHERE [EvaluationID] IN (SELECT ID FROM @RubricEvaluationIDs);
    DELETE FROM [${flyway:defaultSchema}].[RubricEvaluation] WHERE [SubjectEntityID] = @EntityID;

    -- Resource types for this entity, with their links, permissions and workspace items
    DELETE FROM [${flyway:defaultSchema}].[ResourceLink] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[ResourcePermission] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[WorkspaceItem] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[ResourceType] WHERE [EntityID] = @EntityID;

    -- Scope columns whose NULL means "global": delete rather than widen the scope
    DELETE FROM [${flyway:defaultSchema}].[AIAgentNote] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[AIAgentExample] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedNotificationConfig] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedPromptConfig] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedPromptPart] WHERE [PrimaryScopeEntityID] = @EntityID;

    -- Datasets: bump the parent so cached datasets refresh, then drop the item
    UPDATE [${flyway:defaultSchema}].[Dataset] SET [__mj_UpdatedAt] = GETUTCDATE()
        WHERE [ID] IN (SELECT [DatasetID] FROM [${flyway:defaultSchema}].[DatasetItem] WHERE [EntityID] = @EntityID);
    DELETE FROM [${flyway:defaultSchema}].[DatasetItem] WHERE [EntityID] = @EntityID;

    -- Saved views, then their categories (UserView.CategoryID was cleared above)
    DELETE FROM [${flyway:defaultSchema}].[UserView] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserViewCategory] WHERE [EntityID] = @EntityID;

    -- Rows with no dependents of their own
    DELETE FROM [${flyway:defaultSchema}].[AccessControlRule] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ArchiveConfigurationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ArchiveRunDetail] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CalendarEventLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityAIAction] WHERE [EntityID] = @EntityID OR [OutputEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityAlternateBaseView] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityFormContribution] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityFormOverride] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityPermission] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[FileEntityRecordLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[FormChromeRule] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[GraphEdge] WHERE [SourceEntityID] = @EntityID OR [TargetEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[IntegrationURLFormat] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[InteractionLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[QueryEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordGeoCode] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordLink] WHERE [SourceEntityID] = @EntityID OR [TargetEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[SearchScopeEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[TaggedItem] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[TagScope] WHERE [ScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserApplicationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserFavorite] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserRecordLog] WHERE [EntityID] = @EntityID;

    -- The entity's own fields, then the entity
    DELETE FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[Entity] WHERE [ID] = @EntityID;

    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @OwnsTransaction = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH
END
GO

-- ============================================================================
-- 13. MLModel: models trained before the lifecycle gate, then one Published model per pipeline
-- ============================================================================
-- Documented exception (D4-13): this section's raw UPDATEs of MLModel business state write no Record Changes rows; it
-- is the one-time data fix of the pre-change statuses (see the header). Every later change goes through the gate.
-- A model with no Delivery was registered before the lifecycle gate. One whose training run stored the gate record
-- (ValidationResults.gate.decision.outcome, the newest such run whose ResultingModelID is the model) carries its own
-- evidence: it takes that run as its TrainingRunID, its artifact is re-checked (ArtifactStatus 'unverified'), a
-- Validated one returns to Draft (it is evaluated again from the stored record), a Published one stays Published until
-- it is re-verified on that record, and of several such Published models of one pipeline all but the newest are
-- archived. Every other Draft, Validated or Published model without a Delivery becomes Unevaluated with its artifact
-- unverified; the newest formerly Published one of each pipeline that keeps no Published model goes on serving it,
-- flagged ServingWhileUnevaluated, until a model published through the gate replaces it. Archived models stay as they
-- are. The ValidationResults test reads JSON only when ISJSON says it is JSON, so one malformed value cannot abort the
-- migration.
DECLARE @Evidence TABLE ([ModelID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY, [TrainingRunID] UNIQUEIDENTIFIER NOT NULL);
DECLARE @Serving TABLE ([ModelID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY);

INSERT INTO @Evidence ([ModelID], [TrainingRunID])
SELECT m.[ID], run.[ID]
FROM [${flyway:defaultSchema}].[MLModel] m
CROSS APPLY (
    SELECT TOP 1 r.[ID]
    FROM [${flyway:defaultSchema}].[MLTrainingRun] r
    WHERE r.[ResultingModelID] = m.[ID]
      AND (CASE WHEN ISJSON(r.[ValidationResults]) = 1
                THEN JSON_VALUE(r.[ValidationResults], '$.gate.decision.outcome') END) IS NOT NULL
    ORDER BY r.[__mj_CreatedAt] DESC, r.[ID] DESC
) AS run
WHERE m.[Delivery] IS NULL
  AND m.[Status] IN (N'Draft', N'Validated', N'Published');

UPDATE m
   SET [TrainingRunID]  = e.[TrainingRunID],
       [ArtifactStatus] = N'unverified',
       [Status]         = CASE WHEN m.[Status] = N'Validated' THEN N'Draft' ELSE m.[Status] END
FROM [${flyway:defaultSchema}].[MLModel] m
JOIN @Evidence e ON e.[ModelID] = m.[ID];

WITH [RankedEvidence] AS (
    SELECT m.[ID],
           ROW_NUMBER() OVER (PARTITION BY m.[PipelineID] ORDER BY m.[__mj_CreatedAt] DESC, m.[Version] DESC, m.[ID] DESC) AS [NewestRank]
    FROM [${flyway:defaultSchema}].[MLModel] m
    JOIN @Evidence e ON e.[ModelID] = m.[ID]
    WHERE m.[Status] = N'Published'
)
UPDATE m
   SET [Status]       = N'Archived',
       [StatusReason] = N'Superseded: more than one Published model of the pipeline before the lifecycle gate'
FROM [${flyway:defaultSchema}].[MLModel] m
JOIN [RankedEvidence] ranked ON ranked.[ID] = m.[ID]
WHERE ranked.[NewestRank] > 1;

WITH [RankedLegacy] AS (
    SELECT m.[ID],
           ROW_NUMBER() OVER (PARTITION BY m.[PipelineID] ORDER BY m.[__mj_CreatedAt] DESC, m.[Version] DESC, m.[ID] DESC) AS [NewestRank]
    FROM [${flyway:defaultSchema}].[MLModel] m
    WHERE m.[Status] = N'Published'
      AND m.[Delivery] IS NULL
      AND NOT EXISTS (SELECT 1 FROM @Evidence e WHERE e.[ModelID] = m.[ID])
      AND NOT EXISTS (SELECT 1
                      FROM [${flyway:defaultSchema}].[MLModel] kept
                      JOIN @Evidence ke ON ke.[ModelID] = kept.[ID]
                      WHERE kept.[PipelineID] = m.[PipelineID] AND kept.[Status] = N'Published')
)
INSERT INTO @Serving ([ModelID])
SELECT [ID] FROM [RankedLegacy] WHERE [NewestRank] = 1;

UPDATE m
   SET [Status]                  = N'Unevaluated',
       [ArtifactStatus]          = N'unverified',
       [ServingWhileUnevaluated] = CASE WHEN s.[ModelID] IS NULL THEN 0 ELSE 1 END,
       [StatusReason]            = CASE WHEN s.[ModelID] IS NULL
           THEN N'Trained before the Predictive Studio lifecycle gate; never evaluated under an Evaluation Protocol; the pipeline is retrained under its protocol automatically.'
           ELSE N'Trained before the Predictive Studio lifecycle gate and still serving; never evaluated under an Evaluation Protocol; replaced automatically when a model is published through the gate.' END
FROM [${flyway:defaultSchema}].[MLModel] m
LEFT JOIN @Serving s ON s.[ModelID] = m.[ID]
WHERE m.[Status] IN (N'Draft', N'Validated', N'Published')
  AND m.[Delivery] IS NULL
  AND NOT EXISTS (SELECT 1 FROM @Evidence e WHERE e.[ModelID] = m.[ID]);
GO
-- At most one Published model per pipeline. Created after the statuses above, so a pipeline that would still hold two
-- fails the migration here instead of serving from either.
CREATE UNIQUE NONCLUSTERED INDEX [UX_MLModel_OnePublishedPerPipeline]
    ON [${flyway:defaultSchema}].[MLModel] ([PipelineID])
    WHERE [Status] = N'Published';
GO




























































/* =====================================================================================
 * EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * Entity and EntityField metadata for MJ: ML Model Publish Records, MJ: ML Scoring Runs,
 * MJ: ML Monitoring Results, MJ: ML Output Bindings and the virtual entity MJ: Latest Feature
 * Values; new and dropped fields of MJ: ML Models, MJ: Feature Values and MJ: ML Model Scoring
 * Bindings; value lists, entity relationships, entity unique keys (including three for the
 * training schema's existing unique constraints, which the unique-key table was created without),
 * field categories and descriptions; base views, spCreate/spUpdate/spDelete (spUpdate* in the
 * single-write form, with the __mj_UpdatedAt trigger guarded by IF NOT UPDATE), permissions and
 * FK indexes. CodeGen ran on a database built from scratch by mj migrate with the hand-written
 * section above alone; a second database built from scratch with this section appended emits
 * nothing of this migration's. Four statements CodeGen emits on every fresh install belong to
 * V202611161958__v6.3.x__Artifact_Guest_Share_Links_And_WorkingState_Fixes (the MJ: Artifact
 * Guest Share Links unique key and three related-entity name-field maps), so they are not here.
 * Do NOT edit by hand: if the DDL above changes, re-run CodeGen and replace this section.
 * Five hand edits, each marked "HAND EDIT" where it is, must be re-applied after any regeneration: the
 * three EntityUniqueKey inserts for the training schema's existing constraints are guarded by ID or by
 * (EntityID, Name); the MJ: Latest Feature Values EntityID field is inserted with
 * AutoUpdateRelatedEntityInfo = 0; and (5) the seven bounded-text columns of MJ: ML Models that
 * CodeGen may pick as the name field are set to AutoUpdateIsNameField = 0. Two generated blocks are
 * deleted, not edited, whenever CodeGen emits them (no marker): a "Set LLM-identified FKs" block for
 * MJ: Latest Feature Values and an MJ: Entities -> MJ: Latest Feature Values EntityRelationship
 * derived from that FK (a relationship with no FK behind it); this regeneration emitted neither. One
 * generated statement is deleted (no marker): the LLM decoration's IsNameField = 1 on MJ: ML Models.TargetVariable.
 * Kept, it gives every foreign key into MLModel a joined name column; HAND EDIT (5) keeps CodeGen from choosing one.
 * ===================================================================================== */

/* SQL generated to create new entity MJ: ML Model Publish Records */

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
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'bc5c5f60-2512-467a-bec8-14b4d8d3b640',
         'MJ: ML Model Publish Records',
         'ML Model Publish Records',
         'The publish ledger of ML models: every human sign-off, every applied publish or rollback (automatic or by a person) and every refused publish attempt. An audit trail only: the lifecycle gate re-derives each decision from the stored evaluation and the model''s Delivery. Rows are never updated, except that spDeleteEntityWithCoreDependencies clears SignOffID, ReplacesModelID and TrainingRunID on surviving rows when the referenced row is deleted with its entity.',
         NULL,
         'MLModelPublishRecord',
         'vwMLModelPublishRecords',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: ML Model Publish Records to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'bc5c5f60-2512-467a-bec8-14b4d8d3b640', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: ML Scoring Runs */

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
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2',
         'MJ: ML Scoring Runs',
         'ML Scoring Runs',
         'One row per scoring call, dry runs and refusals included, written by the scoring service only. A running row exists before the first record is scored, so a crash leaves a visible row.',
         NULL,
         'MLScoringRun',
         'vwMLScoringRuns',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: ML Scoring Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: ML Monitoring Results */

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
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '18359693-d8df-4e8f-b5e1-d2c17b742834',
         'MJ: ML Monitoring Results',
         'ML Monitoring Results',
         'One row per Published model per monitoring period: the outcome join, the tracked metrics, drift, parity, the triggers that fired and the challenger and rollback checks.',
         NULL,
         'MLMonitoringResult',
         'vwMLMonitoringResults',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: ML Monitoring Results to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '18359693-d8df-4e8f-b5e1-d2c17b742834', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: ML Output Bindings */

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
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '75f9da13-10d3-4153-9299-e97f1ed296ad',
         'MJ: ML Output Bindings',
         'ML Output Bindings',
         'How one surface shows a model''s output: what it sorts by, which way driver directions point and the label. Created from the model''s OutputSemantics when the model is evaluated; a save that contradicts those semantics is refused.',
         NULL,
         'MLOutputBinding',
         'vwMLOutputBindings',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: ML Output Bindings to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '75f9da13-10d3-4153-9299-e97f1ed296ad', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Output Bindings for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModelPublishRecord */
ALTER TABLE [${flyway:defaultSchema}].[MLModelPublishRecord] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModelPublishRecord */
UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModelPublishRecord */
ALTER TABLE [${flyway:defaultSchema}].[MLModelPublishRecord] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLModelPublishRecord */
ALTER TABLE [${flyway:defaultSchema}].[MLModelPublishRecord] ADD CONSTRAINT [DF___mj_MLModelPublishRecord___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModelPublishRecord */
ALTER TABLE [${flyway:defaultSchema}].[MLModelPublishRecord] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModelPublishRecord */
UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModelPublishRecord */
ALTER TABLE [${flyway:defaultSchema}].[MLModelPublishRecord] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLModelPublishRecord */
ALTER TABLE [${flyway:defaultSchema}].[MLModelPublishRecord] ADD CONSTRAINT [DF___mj_MLModelPublishRecord___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLScoringRun */
ALTER TABLE [${flyway:defaultSchema}].[MLScoringRun] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLScoringRun */
UPDATE [${flyway:defaultSchema}].[MLScoringRun] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLScoringRun */
ALTER TABLE [${flyway:defaultSchema}].[MLScoringRun] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLScoringRun */
ALTER TABLE [${flyway:defaultSchema}].[MLScoringRun] ADD CONSTRAINT [DF___mj_MLScoringRun___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLScoringRun */
ALTER TABLE [${flyway:defaultSchema}].[MLScoringRun] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLScoringRun */
UPDATE [${flyway:defaultSchema}].[MLScoringRun] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLScoringRun */
ALTER TABLE [${flyway:defaultSchema}].[MLScoringRun] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLScoringRun */
ALTER TABLE [${flyway:defaultSchema}].[MLScoringRun] ADD CONSTRAINT [DF___mj_MLScoringRun___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLMonitoringResult */
ALTER TABLE [${flyway:defaultSchema}].[MLMonitoringResult] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLMonitoringResult */
UPDATE [${flyway:defaultSchema}].[MLMonitoringResult] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLMonitoringResult */
ALTER TABLE [${flyway:defaultSchema}].[MLMonitoringResult] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLMonitoringResult */
ALTER TABLE [${flyway:defaultSchema}].[MLMonitoringResult] ADD CONSTRAINT [DF___mj_MLMonitoringResult___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLMonitoringResult */
ALTER TABLE [${flyway:defaultSchema}].[MLMonitoringResult] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLMonitoringResult */
UPDATE [${flyway:defaultSchema}].[MLMonitoringResult] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLMonitoringResult */
ALTER TABLE [${flyway:defaultSchema}].[MLMonitoringResult] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLMonitoringResult */
ALTER TABLE [${flyway:defaultSchema}].[MLMonitoringResult] ADD CONSTRAINT [DF___mj_MLMonitoringResult___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLOutputBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLOutputBinding] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLOutputBinding */
UPDATE [${flyway:defaultSchema}].[MLOutputBinding] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLOutputBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLOutputBinding] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLOutputBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLOutputBinding] ADD CONSTRAINT [DF___mj_MLOutputBinding___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLOutputBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLOutputBinding] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLOutputBinding */
UPDATE [${flyway:defaultSchema}].[MLOutputBinding] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLOutputBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLOutputBinding] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLOutputBinding */
ALTER TABLE [${flyway:defaultSchema}].[MLOutputBinding] ADD CONSTRAINT [DF___mj_MLOutputBinding___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 125 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80c5c1bb-6f0c-4c4f-b2cd-182162748e53' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'ID')) BEGIN
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
            '80c5c1bb-6f0c-4c4f-b2cd-182162748e53',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1a24860-ae81-4cf5-8fe2-179e6b9f54bd' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'ModelID')) BEGIN
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
            'c1a24860-ae81-4cf5-8fe2-179e6b9f54bd',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'ModelID',
            'Model ID',
            'The model the record is about. NULL only on a run-level refusal: a training run whose outcome produced no model row.',
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
            'A3997636-011D-46E0-BC01-8B1E61E1087B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '089114d6-5a6b-41a8-80ff-0b4fcfa82c21' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'TrainingRunID')) BEGIN
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
            '089114d6-5a6b-41a8-80ff-0b4fcfa82c21',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'TrainingRunID',
            'Training Run ID',
            'The training run the record is about; the idempotency key of a publish and of a run-level refusal.',
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
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '940329a6-0c44-44c2-b816-f192c3ddf75f' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'Kind')) BEGIN
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
            '940329a6-0c44-44c2-b816-f192c3ddf75f',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'Kind',
            'Kind',
            'sign-off (a person approved or rejected), publish (a status change was applied) or refusal (a publish attempt was refused).',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '381291ce-94e9-47e5-b465-216713718bfd' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'Purpose')) BEGIN
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
            '381291ce-94e9-47e5-b465-216713718bfd',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'Purpose',
            'Purpose',
            'publish, rollback (an archived model published again), evaluate (a run-level outcome only) or adopt (a pre-change Published model re-verified).',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cccd3301-bf44-457e-b997-a82342ce35f2' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'ApproverKind')) BEGIN
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
            'cccd3301-bf44-457e-b997-a82342ce35f2',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'ApproverKind',
            'Approver Kind',
            'automated-gate when no person approved the publish; user when a person published or the publish consumed that person''s approving sign-off.',
            'nvarchar',
            40,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '87b82e1a-cfd0-4b51-9127-e344c63f1373' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'UserID')) BEGIN
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
            '87b82e1a-cfd0-4b51-9127-e344c63f1373',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'UserID',
            'User ID',
            'The person who approved, when ApproverKind is user.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44667eae-506d-4bfd-b6c8-92e4e148afb5' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'Initiator')) BEGIN
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
            '44667eae-506d-4bfd-b6c8-92e4e148afb5',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'Initiator',
            'Initiator',
            'JSON Actor: who started the attempt (a user, an agent run, a Record Process run or a scheduled job run).',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ab99cfe5-ddbf-4f08-a999-759012ade712' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'RecordedAt')) BEGIN
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
            'ab99cfe5-ddbf-4f08-a999-759012ade712',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'RecordedAt',
            'Recorded At',
            'When the record was written.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1dd29ab7-cf34-4cc4-9bc3-cc694ea33480' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'Decision')) BEGIN
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
            '1dd29ab7-cf34-4cc4-9bc3-cc694ea33480',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'Decision',
            'Decision',
            'Sign-off rows only: approve or reject.',
            'nvarchar',
            20,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88a11441-b549-45b5-8484-8b9ee7cdb5b3' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'Reason')) BEGIN
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
            '88a11441-b549-45b5-8484-8b9ee7cdb5b3',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'Reason',
            'Reason',
            'The reason in plain words; required when the record overrides flags.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34e9db74-eaf9-419a-9b7c-895c4af44fa0' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'GateDecision')) BEGIN
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
            '34e9db74-eaf9-419a-9b7c-895c4af44fa0',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'GateDecision',
            'Gate Decision',
            'JSON GateDecision as the gate re-derived it at the publish, kept as a copy for audit. Required on publish rows.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be4f236f-8b84-4931-b998-f2b568f8e714' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'Evidence')) BEGIN
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
            'be4f236f-8b84-4931-b998-f2b568f8e714',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'Evidence',
            'Evidence',
            'JSON EvidenceSnapshot built by the server from stored rows at the moment of the sign-off or publish.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fef8d7f7-cb33-4dc5-8165-5d4288e02942' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'EvidenceSha256')) BEGIN
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
            'fef8d7f7-cb33-4dc5-8165-5d4288e02942',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'EvidenceSha256',
            'Evidence Sha 256',
            'SHA-256 of the canonical Evidence JSON; a sign-off authorises a publish only while it equals a fresh recomputation.',
            'char',
            64,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa36fc82-f357-47a8-bd79-bde885e7e502' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'OverridesFlags')) BEGIN
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
            'fa36fc82-f357-47a8-bd79-bde885e7e502',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'OverridesFlags',
            'Overrides Flags',
            'JSON array of the leakage flags a sign-off acknowledges by name; empty on every other row.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            '[]',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08b15f48-8f82-4df6-9f51-9e944fe5f4a4' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'SignOffID')) BEGIN
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
            '08b15f48-8f82-4df6-9f51-9e944fe5f4a4',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'SignOffID',
            'Sign Off ID',
            'Publish rows: the human sign-off this publish consumed, when one was required.',
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
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7745439f-8c94-4042-9478-c89100c3ffc3' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'ReplacesModelID')) BEGIN
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
            '7745439f-8c94-4042-9478-c89100c3ffc3',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'ReplacesModelID',
            'Replaces Model ID',
            'Publish rows: the model archived in the same transaction.',
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
            'A3997636-011D-46E0-BC01-8B1E61E1087B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5791332f-d06d-4116-8c09-15269fc16d0f' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'Refusal')) BEGIN
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
            '5791332f-d06d-4116-8c09-15269fc16d0f',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'Refusal',
            'Refusal',
            'Refusal rows: JSON TransitionRefusal, the reason the attempt was refused.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '77191e92-a1c6-4aeb-875f-feb94ab491e6' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'Transient')) BEGIN
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
            '77191e92-a1c6-4aeb-875f-feb94ab491e6',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'Transient',
            'Transient',
            'Refusal rows: true when a retry may succeed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f340669-13e9-4172-89ea-b9ee16f72407' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = '__mj_CreatedAt')) BEGIN
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
            '5f340669-13e9-4172-89ea-b9ee16f72407',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b16f733-8e05-4d1f-ba5b-9e23b96e8905' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '2b16f733-8e05-4d1f-ba5b-9e23b96e8905',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3cb8070-e989-462a-acc9-07547455634d' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ID')) BEGIN
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
            'e3cb8070-e989-462a-acc9-07547455634d',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'ID',
            'ID',
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

      -- HAND EDIT (4) (re-apply after any tail regeneration): AutoUpdateRelatedEntityInfo = 0 pins this view field's relationship, so CodeGen's LLM decoration never infers a soft FK on MJ: Latest Feature Values.EntityID (the real FK is FeatureValue.EntityID, which spDeleteEntityWithCoreDependencies already covers)
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b7f56029-cf28-434c-b31e-4c236fe48ed5' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'EntityID')) BEGIN
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
            [AutoUpdateRelatedEntityInfo],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b7f56029-cf28-434c-b31e-4c236fe48ed5',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'EntityID',
            'Entity ID',
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
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            0,
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d765f7a-d8f0-445d-b486-8f460efa9d26' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'RecordID')) BEGIN
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
            '1d765f7a-d8f0-445d-b486-8f460efa9d26',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'RecordID',
            'Record ID',
            NULL,
            'nvarchar',
            1800,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6dfc99b-3dbc-4d7e-8e9b-ca20265e1a03' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'FeatureName')) BEGIN
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
            'd6dfc99b-3dbc-4d7e-8e9b-ca20265e1a03',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'FeatureName',
            'Feature Name',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f121d621-9b0a-412d-ad72-99e6d95ae363' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Source')) BEGIN
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
            'f121d621-9b0a-412d-ad72-99e6d95ae363',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'Source',
            'Source',
            NULL,
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9f933a69-6aab-4f53-848c-84118e48e113' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Role')) BEGIN
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
            '9f933a69-6aab-4f53-848c-84118e48e113',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'Role',
            'Role',
            NULL,
            'nvarchar',
            40,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f803213-626c-4674-a9c7-e272e834a888' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'EffectiveAsOf')) BEGIN
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
            '3f803213-626c-4674-a9c7-e272e834a888',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'EffectiveAsOf',
            'Effective As Of',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56a1a22f-5536-4ad4-af40-73bdc7d97469' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ComputedAt')) BEGIN
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
            '56a1a22f-5536-4ad4-af40-73bdc7d97469',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'ComputedAt',
            'Computed At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6126aad-2279-4778-bb39-2c840818ac49' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'MLModelScoringBindingID')) BEGIN
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
            'f6126aad-2279-4778-bb39-2c840818ac49',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'MLModelScoringBindingID',
            'ML Model Scoring Binding ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a14fc5f-1a67-493d-b3b1-04a8b7edc0db' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'MLModelID')) BEGIN
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
            '3a14fc5f-1a67-493d-b3b1-04a8b7edc0db',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'MLModelID',
            'ML Model ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '47fad71c-9ead-4f63-8b42-4103d908c454' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'MLScoringRunID')) BEGIN
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
            '47fad71c-9ead-4f63-8b42-4103d908c454',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'MLScoringRunID',
            'ML Scoring Run ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7987f81-6e7c-46fc-b408-c2e543d9f27a' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'InTraining')) BEGIN
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
            'a7987f81-6e7c-46fc-b408-c2e543d9f27a',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'InTraining',
            'In Training',
            NULL,
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34b2591a-814e-4186-b072-fa0fc5e96da8' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'RecordProcessID')) BEGIN
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
            '34b2591a-814e-4186-b072-fa0fc5e96da8',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'RecordProcessID',
            'Record Process ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ac1e9d90-20c6-47bd-818d-1a155b37fc8b' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueText')) BEGIN
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
            'ac1e9d90-20c6-47bd-818d-1a155b37fc8b',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'ValueText',
            'Value Text',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '589b764f-fec8-4ef6-a936-289630132999' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueNumeric')) BEGIN
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
            '589b764f-fec8-4ef6-a936-289630132999',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'ValueNumeric',
            'Value Numeric',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e86b922-c294-46c4-b78a-b322dc75e394' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueDate')) BEGIN
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
            '5e86b922-c294-46c4-b78a-b322dc75e394',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'ValueDate',
            'Value Date',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e491cd6f-09e0-4d52-a5bd-c0d6f45ec0ef' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueBoolean')) BEGIN
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
            'e491cd6f-09e0-4d52-a5bd-c0d6f45ec0ef',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'ValueBoolean',
            'Value Boolean',
            NULL,
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9cb5af74-f68d-4ad0-99c4-0004d0e7b712' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'ValueJSON')) BEGIN
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
            '9cb5af74-f68d-4ad0-99c4-0004d0e7b712',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'ValueJSON',
            'Value JSON',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aadb4ba9-8cb3-42eb-9746-d3f36587169b' OR (EntityID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name = 'Confidence')) BEGIN
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
            'aadb4ba9-8cb3-42eb-9746-d3f36587169b',
            '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', -- Entity: MJ: Latest Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'),
            'Confidence',
            'Confidence',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a5ab8b8-1db9-44de-ac6f-95f6561601b7' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'MLTrainingPipelineID')) BEGIN
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
            '9a5ab8b8-1db9-44de-ac6f-95f6561601b7',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA'),
            'MLTrainingPipelineID',
            'ML Training Pipeline ID',
            'The training pipeline whose Published model scores for this binding; publishing a new version needs no binding change.',
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
            '703FD109-331B-438D-902B-8E4A93C3F6AA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '13f4734b-cac4-40b6-a7a1-bbbb2c5ce0ff' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'FeatureName')) BEGIN
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
            '13f4734b-cac4-40b6-a7a1-bbbb2c5ce0ff',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA'),
            'FeatureName',
            'Feature Name',
            'The feature name the predictions are stored under, unique on the target entity.',
            'nvarchar',
            510,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a5b7894-74cb-42de-8749-351510121685' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'TargetColumnSource')) BEGIN
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
            '5a5b7894-74cb-42de-8749-351510121685',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA'),
            'TargetColumnSource',
            'Target Column Source',
            'The result reference ($.Value, $.Class, $.AdverseProbability or $.Probabilities.<class>) the column copy writes into TargetColumn; required when TargetColumn is set.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d45d97d-9dbc-42e0-bd83-33f7c91b6923' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'Status')) BEGIN
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
            '7d45d97d-9dbc-42e0-bd83-33f7c91b6923',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA'),
            'Status',
            'Status',
            'Active or Withdrawn. A withdrawn binding no longer scores, and the column copies it made are cleared; its Feature Values stay.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c531130d-2663-402b-9643-57af83e76f08' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'ViewAuthorizationID')) BEGIN
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
            'c531130d-2663-402b-9643-57af83e76f08',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA'),
            'ViewAuthorizationID',
            'View Authorization ID',
            'The authorization a user must hold to see this binding''s predictions; a binding with none is visible to no user.',
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
            'F9238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '134dd51d-b21a-437d-a82b-a9790472b91c' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'RetentionDays')) BEGIN
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
            '134dd51d-b21a-437d-a82b-a9790472b91c',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA'),
            'RetentionDays',
            'Retention Days',
            'Days of prediction history kept; NULL keeps all of it.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63758d3b-ebe1-4f32-8ddd-a6c56a403651' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'MLModelScoringBindingID')) BEGIN
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
            '63758d3b-ebe1-4f32-8ddd-a6c56a403651',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'MLModelScoringBindingID',
            'ML Model Scoring Binding ID',
            'The scoring binding whose prediction this is; set on every Model row and on a person''s value entered on a binding.',
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
            'FD8EF230-65F3-496D-A117-7610572C35AA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8dc16bec-2aa6-4e87-88cd-6a2bdd606249' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'MLScoringRunID')) BEGIN
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
            '8dc16bec-2aa6-4e87-88cd-6a2bdd606249',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'MLScoringRunID',
            'ML Scoring Run ID',
            'The scoring run that wrote this Model row.',
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
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd99f2888-bb28-4435-91fa-e550bb4a5cbf' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'InTraining')) BEGIN
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
            'd99f2888-bb28-4435-91fa-e550bb4a5cbf',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'InTraining',
            'In Training',
            'Model rows: true when the record was in the model''s training snapshot, so its score is optimistic.',
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd70f7357-7955-4a95-baca-2c1562af73ba' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'PredictionUnitID')) BEGIN
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
            'd70f7357-7955-4a95-baca-2c1562af73ba',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'PredictionUnitID',
            'Prediction Unit ID',
            'The Prediction Unit version the model was trained under (the exact version row).',
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
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56811dd1-2425-4943-93e4-699b08cca40c' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'EvaluationProtocolID')) BEGIN
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
            '56811dd1-2425-4943-93e4-699b08cca40c',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'EvaluationProtocolID',
            'Evaluation Protocol ID',
            'The Evaluation Protocol version the model was graded under (the exact version row).',
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
            '7DB88C96-C922-4724-AE93-7B91798CEAFE',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7965bb9c-a42e-4dcc-8e32-a78d8309b922' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingSnapshotID')) BEGIN
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
            '7965bb9c-a42e-4dcc-8e32-a78d8309b922',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'TrainingSnapshotID',
            'Training Snapshot ID',
            'The Training Snapshot the model was trained on.',
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
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '859e225e-3777-47fe-86fe-38bcd231a562' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingRunID')) BEGIN
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
            '859e225e-3777-47fe-86fe-38bcd231a562',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'TrainingRunID',
            'Training Run ID',
            'The training run that produced the model.',
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
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '53d76647-33d0-4f5f-860c-5ff4968e6429' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactSha256')) BEGIN
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
            '53d76647-33d0-4f5f-860c-5ff4968e6429',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'ArtifactSha256',
            'Artifact Sha 256',
            'SHA-256 of the shipped artifact''s stored bytes; a load that hashes differently is refused.',
            'char',
            64,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e52dd2c2-0d59-4ffc-a9e9-90456a571e27' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'SnapshotHash')) BEGIN
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
            'e52dd2c2-0d59-4ffc-a9e9-90456a571e27',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'SnapshotHash',
            'Snapshot Hash',
            'Content hash of the training snapshot, copied at registration.',
            'char',
            64,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'caaa603e-d0ba-4796-9851-eee910205605' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'CodeVersion')) BEGIN
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
            'caaa603e-d0ba-4796-9851-eee910205605',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'CodeVersion',
            'Code Version',
            'JSON CodeVersion of the training code: git commit, sidecar version, library versions, threads and seed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9bea6b10-2722-4ccf-8919-6cf80a634cdc' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'FeatureSchemaHash')) BEGIN
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
            '9bea6b10-2722-4ccf-8919-6cf80a634cdc',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'FeatureSchemaHash',
            'Feature Schema Hash',
            'Hash of the feature schema the model scores; a scoring request whose features hash differently is refused.',
            'char',
            64,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69e6b2e6-ce7d-4676-acee-6a24ab66eb87' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'OutputSemantics')) BEGIN
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
            '69e6b2e6-ce7d-4676-acee-6a24ab66eb87',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'OutputSemantics',
            'Output Semantics',
            'JSON {task}: what the model''s output means (the task type and, for a classification, the adverse class).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32243fff-0ada-46b8-95e6-9e9a300b9ed3' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Delivery')) BEGIN
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
            '32243fff-0ada-46b8-95e6-9e9a300b9ed3',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'Delivery',
            'Delivery',
            'JSON RegisteredDelivery: what the training run shipped and the gate decision it shipped under.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7cd0993f-a915-4d50-9fd8-cadcc9a4ff0e' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'StatusReason')) BEGIN
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
            '7cd0993f-a915-4d50-9fd8-cadcc9a4ff0e',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'StatusReason',
            'Status Reason',
            'Why the model has its status, in plain words: a kept baseline, a demotion to Unevaluated, an archive or a withheld publish.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d26a331-b246-4781-ab7e-5fc789ef4996' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactStatus')) BEGIN
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
            '3d26a331-b246-4781-ab7e-5fc789ef4996',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'ArtifactStatus',
            'Artifact Status',
            'Health of the stored artifact as last checked: unverified, verified, missing, hash-mismatch or legacy-local.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'unverified',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd577f2f-8a21-44f1-82a9-a0545ef10ca6' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ArtifactCheckedAt')) BEGIN
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
            'fd577f2f-8a21-44f1-82a9-a0545ef10ca6',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'ArtifactCheckedAt',
            'Artifact Checked At',
            'When ArtifactStatus was last checked.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd181470a-ef06-4ff6-a288-c7b4479d5b42' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ServingWhileUnevaluated')) BEGIN
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
            'd181470a-ef06-4ff6-a288-c7b4479d5b42',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'ServingWhileUnevaluated',
            'Serving While Unevaluated',
            'True for a model that was Published before the lifecycle gate, demoted to Unevaluated and kept serving its pipeline until a model published through the gate replaces it. Never set by an entity save.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f1e89cb7-38b9-42a0-849e-5fe2891056f9' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'ID')) BEGIN
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
            'f1e89cb7-38b9-42a0-849e-5fe2891056f9',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '92633337-875a-46e0-8b8a-c10043bf583a' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'ModelID')) BEGIN
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
            '92633337-875a-46e0-8b8a-c10043bf583a',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'ModelID',
            'Model ID',
            'The exact model version that scored. NULL only on a refused run whose binding''s pipeline has no Published model.',
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
            'A3997636-011D-46E0-BC01-8B1E61E1087B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '035103c4-23de-4842-9e5f-1838b2531358' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'ModelVersion')) BEGIN
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
            '035103c4-23de-4842-9e5f-1838b2531358',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'ModelVersion',
            'Model Version',
            'The model''s Version, copied at the run.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1418070-bc06-4c81-a5e5-9157d98260e1' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'MLModelScoringBindingID')) BEGIN
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
            'c1418070-bc06-4c81-a5e5-9157d98260e1',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'MLModelScoringBindingID',
            'ML Model Scoring Binding ID',
            'The scoring binding a writing run scored for; NULL for a call that returns its scores and writes no Feature Value.',
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
            'FD8EF230-65F3-496D-A117-7610572C35AA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e628b36a-a9ca-4ee1-b45c-c6c7ddeb946a' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'ArtifactSha256')) BEGIN
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
            'e628b36a-a9ca-4ee1-b45c-c6c7ddeb946a',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'ArtifactSha256',
            'Artifact Sha 256',
            'SHA-256 of the artifact bytes that scored; NULL only when the run was refused before the artifact verified.',
            'char',
            64,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c29838b7-2f50-4427-88af-ee9e4181539c' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'FeatureSchemaHash')) BEGIN
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
            'c29838b7-2f50-4427-88af-ee9e4181539c',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'FeatureSchemaHash',
            'Feature Schema Hash',
            'Hash of the model''s feature schema the run scored with.',
            'char',
            64,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7f0d206-facb-41b7-b581-12028ad8c572' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'Path')) BEGIN
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
            'a7f0d206-facb-41b7-b581-12028ad8c572',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'Path',
            'Path',
            'Which caller ran it: score-record-set, record-process, monitoring, parity or predict.',
            'nvarchar',
            40,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5c5ca5c1-9f48-40d8-a982-fde7b605a266' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'ScopeKind')) BEGIN
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
            '5c5ca5c1-9f48-40d8-a982-fde7b605a266',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'ScopeKind',
            'Scope Kind',
            'How the scope names its records: record-ids, view or filter.',
            'nvarchar',
            40,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4274b247-7fe6-42af-82f1-54c01b0bfcfe' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'ScopeEntityID')) BEGIN
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
            '4274b247-7fe6-42af-82f1-54c01b0bfcfe',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'ScopeEntityID',
            'Scope Entity ID',
            'The entity whose records the scope names.',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9eb4c128-62a6-4723-84be-b928b74a7b0d' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'Scope')) BEGIN
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
            '9eb4c128-62a6-4723-84be-b928b74a7b0d',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'Scope',
            'Scope',
            'JSON ScoringScope: the records the call asked to score.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '292f38de-b136-4a24-9205-58c6eda4bfc3' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'EntityMapping')) BEGIN
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
            '292f38de-b136-4a24-9205-58c6eda4bfc3',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'EntityMapping',
            'Entity Mapping',
            'JSON EntityRef mapping the scope entity onto the model''s grain, when they differ.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9fd64601-0b57-40a7-b646-7b3d923b4204' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'AsOfDate')) BEGIN
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
            '9fd64601-0b57-40a7-b646-7b3d923b4204',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'AsOfDate',
            'As Of Date',
            'The as-of instant the features were read at.',
            'datetimeoffset',
            10,
            34,
            7,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ca00152-6dfc-4d07-8d62-d2e756b476e5' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'ReadPolicy')) BEGIN
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
            '8ca00152-6dfc-4d07-8d62-d2e756b476e5',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'ReadPolicy',
            'Read Policy',
            'JSON ReadPolicy the features were read under.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b6434a0-8214-45cf-adf0-14eb1cee1991' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'DryRun')) BEGIN
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
            '6b6434a0-8214-45cf-adf0-14eb1cee1991',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'DryRun',
            'Dry Run',
            'True when the call scored without writing anything.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4f07b62-0498-4c66-a9bf-7a7d6d21e1c1' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'RequestedBy')) BEGIN
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
            'd4f07b62-0498-4c66-a9bf-7a7d6d21e1c1',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'RequestedBy',
            'Requested By',
            'JSON Actor: who asked for the run.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44a3f9e4-8767-4d71-8d31-800f5593537e' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'RequestedByUserID')) BEGIN
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
            '44a3f9e4-8767-4d71-8d31-800f5593537e',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'RequestedByUserID',
            'Requested By User ID',
            'The requesting user, when a person asked; a joinable copy of RequestedBy.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '496111ba-dd23-453a-a738-0ffa3840175e' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'ProcessRunID')) BEGIN
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
            '496111ba-dd23-453a-a738-0ffa3840175e',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'ProcessRunID',
            'Process Run ID',
            'The Process Run, when the Record Process path ran it.',
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
            '9989A9A4-5546-4552-A765-B27EE399BFEA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '080ec5a4-cf1b-4bae-95bd-c7bfbc1442c2' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'ScheduledJobRunID')) BEGIN
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
            '080ec5a4-cf1b-4bae-95bd-c7bfbc1442c2',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'ScheduledJobRunID',
            'Scheduled Job Run ID',
            'The Scheduled Job Run, when monitoring or parity ran it.',
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
            '05853432-5E13-4F2A-8618-77857ADF17FA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1b99310-9e0d-4a03-8a4e-f1f96a8ec370' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'Status')) BEGIN
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
            'd1b99310-9e0d-4a03-8a4e-f1f96a8ec370',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'Status',
            'Status',
            'running, refused, failed or completed. A failed run keeps the batches it wrote before the failing one.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'running',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a9d0eb0b-9a38-4ece-8ebd-e431b2927981' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'Refusal')) BEGIN
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
            'a9d0eb0b-9a38-4ece-8ebd-e431b2927981',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'Refusal',
            'Refusal',
            'JSON ScoringRefusal when the run was refused.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '014fcbc2-e056-4eeb-b192-ace37f3ff497' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'Total')) BEGIN
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
            '014fcbc2-e056-4eeb-b192-ace37f3ff497',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'Total',
            'Total',
            'Records in scope.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1101bbc0-d03a-4635-9510-76635311bcbe' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'Written')) BEGIN
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
            '1101bbc0-d03a-4635-9510-76635311bcbe',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'Written',
            'Written',
            'Records whose prediction was written.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '286790aa-aa0f-4ae2-bfe5-0f7ae9672906' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'Failed')) BEGIN
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
            '286790aa-aa0f-4ae2-bfe5-0f7ae9672906',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'Failed',
            'Failed',
            'Records that failed to score.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '21a4210a-737e-4f7e-b11b-7c69567952fb' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'Skipped')) BEGIN
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
            '21a4210a-737e-4f7e-b11b-7c69567952fb',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'Skipped',
            'Skipped',
            'Records skipped (for example, a person''s value the run must not overwrite).',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '04257c99-90d3-4396-9402-657c9f558c58' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'FirstErrors')) BEGIN
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
            '04257c99-90d3-4396-9402-657c9f558c58',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'FirstErrors',
            'First Errors',
            'JSON array of the first errors, at most 20, each {recordId, message}.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1605cc51-f9ad-4cb2-b4c3-7280e8bc6544' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'StartedAt')) BEGIN
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
            '1605cc51-f9ad-4cb2-b4c3-7280e8bc6544',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'StartedAt',
            'Started At',
            'When the run started.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c447f97a-de65-49b8-9b69-44e75347a05c' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'EndedAt')) BEGIN
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
            'c447f97a-de65-49b8-9b69-44e75347a05c',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'EndedAt',
            'Ended At',
            'When the run ended; NULL while it runs.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a523ad28-ddf2-4a9f-b98d-98a496860eab' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = '__mj_CreatedAt')) BEGIN
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
            'a523ad28-ddf2-4a9f-b98d-98a496860eab',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6eda4eec-7c3f-4c68-affa-e0f8234ac3e5' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '6eda4eec-7c3f-4c68-affa-e0f8234ac3e5',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c7230c6-1208-4299-8e20-d9f95c54bcc5' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'ID')) BEGIN
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
            '3c7230c6-1208-4299-8e20-d9f95c54bcc5',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fedef598-ea62-4001-91f2-65a0d7c2ed69' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'ModelID')) BEGIN
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
            'fedef598-ea62-4001-91f2-65a0d7c2ed69',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'ModelID',
            'Model ID',
            'The model monitored.',
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
            'A3997636-011D-46E0-BC01-8B1E61E1087B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1ee5d2d-3609-4f19-8ca1-58c4cad0a9e1' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'ScheduledJobRunID')) BEGIN
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
            'd1ee5d2d-3609-4f19-8ca1-58c4cad0a9e1',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'ScheduledJobRunID',
            'Scheduled Job Run ID',
            'The monitoring job run that wrote the row; NULL for a run started from the UI or a test.',
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
            '05853432-5E13-4F2A-8618-77857ADF17FA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4cc916c1-6cf0-4392-93eb-a56f04bb62d5' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'Period')) BEGIN
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
            '4cc916c1-6cf0-4392-93eb-a56f04bb62d5',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'Period',
            'Period',
            'The first day of the period.',
            'date',
            3,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '98f67019-f93f-4dd6-bba1-70b848353726' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'PeriodGrain')) BEGIN
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
            '98f67019-f93f-4dd6-bba1-70b848353726',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'PeriodGrain',
            'Period Grain',
            'week, month or quarter.',
            'nvarchar',
            20,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1aaf359f-c0a4-4cf0-8365-92803287fb66' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'State')) BEGIN
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
            '1aaf359f-c0a4-4cf0-8365-92803287fb66',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'State',
            'State',
            'window-open (outcomes not yet known), evaluated or failed.',
            'nvarchar',
            40,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81d5492d-dde5-44ed-978e-e67909a7acab' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'ScoredRows')) BEGIN
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
            '81d5492d-dde5-44ed-978e-e67909a7acab',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'ScoredRows',
            'Scored Rows',
            'Predictions the model stored for the period.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c69f005a-a435-46c7-9de8-62e09d6e7209' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'JoinedRows')) BEGIN
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
            'c69f005a-a435-46c7-9de8-62e09d6e7209',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'JoinedRows',
            'Joined Rows',
            'Predictions joined to a known outcome.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c0e7f6f2-b61a-4f20-bcf7-c485a500a404' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'ExcludedInTrainingRows')) BEGIN
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
            'c0e7f6f2-b61a-4f20-bcf7-c485a500a404',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'ExcludedInTrainingRows',
            'Excluded In Training Rows',
            'Joined predictions left out because the record was in the model''s training snapshot.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'afce783f-21f5-43c0-b6f2-b9c37fc4fbf2' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'PrimaryScore')) BEGIN
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
            'afce783f-21f5-43c0-b6f2-b9c37fc4fbf2',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'PrimaryScore',
            'Primary Score',
            'JSON MetricWithInterval: the protocol''s primary metric over the joined rows.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '10699c33-22cf-4ba1-8079-3a354fcb49f9' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'PrimaryValue')) BEGIN
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
            '10699c33-22cf-4ba1-8079-3a354fcb49f9',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'PrimaryValue',
            'Primary Value',
            'The primary metric''s value, copied from PrimaryScore for queries and charts.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cdfd9c3e-f52e-48ae-9843-2d7bc3860dd2' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'PrimaryLower')) BEGIN
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
            'cdfd9c3e-f52e-48ae-9843-2d7bc3860dd2',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'PrimaryLower',
            'Primary Lower',
            'The primary metric''s interval lower bound, copied from PrimaryScore.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c022edb6-4870-4cab-a9a9-e7ddbbe3b2fe' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'PrimaryUpper')) BEGIN
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
            'c022edb6-4870-4cab-a9a9-e7ddbbe3b2fe',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'PrimaryUpper',
            'Primary Upper',
            'The primary metric''s interval upper bound, copied from PrimaryScore.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7da54052-f022-45e3-95bb-d7c70e07e539' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'TrackedMetrics')) BEGIN
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
            '7da54052-f022-45e3-95bb-d7c70e07e539',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'TrackedMetrics',
            'Tracked Metrics',
            'JSON array of MetricWithInterval: the other tracked metrics (positive rate, log loss, RMSE and so on).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df8da9d9-8d9f-4272-9da7-73f16f1d3bc1' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'Calibration')) BEGIN
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
            'df8da9d9-8d9f-4272-9da7-73f16f1d3bc1',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'Calibration',
            'Calibration',
            'JSON CalibrationReport over the joined rows.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e85f9aa-08b8-4fb6-8036-ff7bcc422e6e' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'DriftLook')) BEGIN
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
            '5e85f9aa-08b8-4fb6-8036-ff7bcc422e6e',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'DriftLook',
            'Drift Look',
            'JSON per-input drift statistics of the period''s look: z, empirical p, adjusted p, the look''s threshold and index.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd59641f9-fc8f-43cb-ade7-6a4a544237b7' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'DriftAlarms')) BEGIN
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
            'd59641f9-fc8f-43cb-ade7-6a4a544237b7',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'DriftAlarms',
            'Drift Alarms',
            'JSON array of the inputs whose drift alarm fired.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            '[]',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fee3eaf7-0f45-41b1-a5b5-c15c46d3a44a' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'Parity')) BEGIN
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
            'fee3eaf7-0f45-41b1-a5b5-c15c46d3a44a',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'Parity',
            'Parity',
            'JSON {sampled, maxAbsDifference, passed}: the period''s scoring parity check.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44c03183-72fb-48c1-af77-d74bd3750997' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'TriggersFired')) BEGIN
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
            '44c03183-72fb-48c1-af77-d74bd3750997',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'TriggersFired',
            'Triggers Fired',
            'JSON array of {kind, reason}: the retrain and rollback triggers that fired.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            '[]',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dcf4fc08-b0f5-497c-b1b1-613baf468ab0' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'ChallengerRunID')) BEGIN
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
            'dcf4fc08-b0f5-497c-b1b1-613baf468ab0',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'ChallengerRunID',
            'Challenger Run ID',
            'The challenger training run a fired trigger started.',
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
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee9273b1-cc1c-4ff5-b6c7-b5874c6f8dbd' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'ChallengerResult')) BEGIN
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
            'ee9273b1-cc1c-4ff5-b6c7-b5874c6f8dbd',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'ChallengerResult',
            'Challenger Result',
            'JSON {sharedRowIds, comparison, outcome, publishRecordId}: how the challenger compared and whether it was published or withheld.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8540bbd-4487-406a-8ade-950f06df6961' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'RollbackCheck')) BEGIN
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
            'f8540bbd-4487-406a-8ade-950f06df6961',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'RollbackCheck',
            'Rollback Check',
            'JSON {previousModelId, sharedRowIds, comparison, consecutive, fired or not-eligible with the reason}: the automated rollback check.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58b18e38-a901-40b9-a670-3ad7b05ac820' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'ErrorMessage')) BEGIN
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
            '58b18e38-a901-40b9-a670-3ad7b05ac820',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'ErrorMessage',
            'Error Message',
            'Why the period failed, when State is failed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5d79b26-ace7-4a92-9854-c8467af131d6' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e5d79b26-ace7-4a92-9854-c8467af131d6',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd2617595-a76d-4d94-8d31-0f23a1f94d23' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'd2617595-a76d-4d94-8d31-0f23a1f94d23',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b35104bb-a8db-46e9-b4a7-04c8764958a5' OR (EntityID = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND Name = 'ID')) BEGIN
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
            'b35104bb-a8db-46e9-b4a7-04c8764958a5',
            '75F9DA13-10D3-4153-9299-E97F1ED296AD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0674e79f-d45c-49b5-bd64-d4166e92e45c' OR (EntityID = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND Name = 'ModelID')) BEGIN
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
            '0674e79f-d45c-49b5-bd64-d4166e92e45c',
            '75F9DA13-10D3-4153-9299-E97F1ED296AD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD'),
            'ModelID',
            'Model ID',
            'The model whose output the surface shows.',
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
            'A3997636-011D-46E0-BC01-8B1E61E1087B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cbde6ea2-03cc-4a4b-b5e6-51a5b114f889' OR (EntityID = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND Name = 'Surface')) BEGIN
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
            'cbde6ea2-03cc-4a4b-b5e6-51a5b114f889',
            '75F9DA13-10D3-4153-9299-E97F1ED296AD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD'),
            'Surface',
            'Surface',
            'at-risk-list, why-badge, predictions-grid or record-panel.',
            'nvarchar',
            60,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '480927ef-43d6-43d8-af27-884397692d15' OR (EntityID = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND Name = 'SortsBy')) BEGIN
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
            '480927ef-43d6-43d8-af27-884397692d15',
            '75F9DA13-10D3-4153-9299-E97F1ED296AD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD'),
            'SortsBy',
            'Sorts By',
            'adverse-probability-desc, score-desc, score-asc or none.',
            'nvarchar',
            60,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6bc9e1e-abde-4d8d-9905-e024a94d0aac' OR (EntityID = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND Name = 'DriverDirectionRelativeTo')) BEGIN
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
            'a6bc9e1e-abde-4d8d-9905-e024a94d0aac',
            '75F9DA13-10D3-4153-9299-E97F1ED296AD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD'),
            'DriverDirectionRelativeTo',
            'Driver Direction Relative To',
            'adverse-class (a driver that raises the adverse outcome points up) or raw-contribution.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4b8aa70f-84a5-48bc-adb9-4e43de26fd33' OR (EntityID = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND Name = 'Label')) BEGIN
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
            '4b8aa70f-84a5-48bc-adb9-4e43de26fd33',
            '75F9DA13-10D3-4153-9299-E97F1ED296AD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD'),
            'Label',
            'Label',
            'The label the surface shows, naming the scored class.',
            'nvarchar',
            510,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e63aff6-e431-4a19-8587-ee652f430a44' OR (EntityID = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND Name = '__mj_CreatedAt')) BEGIN
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
            '4e63aff6-e431-4a19-8587-ee652f430a44',
            '75F9DA13-10D3-4153-9299-E97F1ED296AD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8bfd740e-dee6-458a-a4bb-328d7346533c' OR (EntityID = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '8bfd740e-dee6-458a-a4bb-328d7346533c',
            '75F9DA13-10D3-4153-9299-E97F1ED296AD', -- Entity: MJ: ML Output Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD'),
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

/* HAND EDIT (5): the bounded-text columns of MJ: ML Models that CodeGen may pick as its name field, pinned */
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.TargetVariable the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'TargetVariable' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.ProblemType the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'ProblemType' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.Status the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'Status' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.ArtifactSha256 the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'ArtifactSha256' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.SnapshotHash the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'SnapshotHash' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.FeatureSchemaHash the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'FeatureSchemaHash' AND [IsNameField] = 0;
-- HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.ArtifactStatus the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AutoUpdateIsNameField] = 0 WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = N'ArtifactStatus' AND [IsNameField] = 0;

/* SQL text to sync entity unique keys (13 added, 0 updated, 0 removed) */
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('dd3be67f-c35f-45a0-afe1-553285e7c93a', '18359693-D8DF-4E8F-B5E1-D2C17B742834', 'UQ_MLMonitoringResult_ModelPeriod', 'ModelID,PeriodGrain,Period', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('cb945559-ef12-4233-a3d1-d2f033b073ce', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'UQ_FeatureValue_ModelRow', 'MLModelScoringBindingID,EntityID,RecordID,EffectiveAsOf,Role', '([Source]=N''Model'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('93275069-ad6d-46cb-bc40-23aa62f0bdef', '75F9DA13-10D3-4153-9299-E97F1ED296AD', 'UQ_MLOutputBinding_ModelSurface', 'ModelID,Surface', NULL);
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = 'b73646ed-db19-444e-9df2-5fc25e0ce986' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [Name] = 'UQ_MLEvaluationProtocol_Lineage_Version'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b73646ed-db19-444e-9df2-5fc25e0ce986', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'UQ_MLEvaluationProtocol_Lineage_Version', 'LineageRootID,Version', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('60bf8799-8770-4fb9-bc38-53b42d43f66e', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'UX_MLModel_OneServingUnevaluatedPerPipeline', 'PipelineID', '([ServingWhileUnevaluated]=(1))');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('13d270c1-93e1-4a75-83c7-7db302f3a152', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'UX_MLModel_PipelineVersion', 'PipelineID,Version', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c4d35846-8f14-4255-a95a-d1d87500e501', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'UX_MLModel_OnePublishedPerPipeline', 'PipelineID', '([Status]=N''Published'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('78910fdd-18f4-48e0-824f-d84855e29ce6', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'UX_MLModelPublishRecord_OnePublishPerRun', 'TrainingRunID', '([Kind]=''publish'' AND ([Purpose] IN (''publish'', ''adopt'')) AND [TrainingRunID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('82235b10-3719-4320-b793-8e90b8d810f7', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'UX_MLModelPublishRecord_OneRunOutcome', 'TrainingRunID', '([Purpose]=''evaluate'' AND [TrainingRunID] IS NOT NULL)');
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = '50796e8c-8868-4157-af29-8c4d37f2b678' OR ([EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [Name] = 'UQ_MLPredictionUnit_Lineage_Version'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('50796e8c-8868-4157-af29-8c4d37f2b678', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'UQ_MLPredictionUnit_Lineage_Version', 'LineageRootID,Version', NULL);
-- HAND EDIT (re-apply after any tail regeneration): guarded, because V202611101200__v6.3.x__Entity_Unique_Key_Sets.sql created the table without this row and any database where CodeGen ran after it already has it, under its own ID, so the guard matches the unique key (EntityID, Name) too
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [ID] = '72c3af54-0097-4dd6-a3b2-4f16e80d24b0' OR ([EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [Name] = 'UQ_MLTrainingSnapshot_ContentHash'))
    INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('72c3af54-0097-4dd6-a3b2-4f16e80d24b0', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'UQ_MLTrainingSnapshot_ContentHash', 'ContentHash', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('5296bd6d-304d-4bbd-9483-a6a1bf7f0e3e', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'UQ_MLModelScoringBinding_EntityFeature', 'TargetEntityID,FeatureName', '([TargetEntityID] IS NOT NULL)');

/* SQL text to sync 3 entity field value row(s) for entity field ID 940329A6-0C44-44C2-B816-F192C3DDF75F */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e068b3eb-aec5-4288-b383-8bce5d8f7c03', '940329A6-0C44-44C2-B816-F192C3DDF75F', 1, 'publish', 'publish', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f6b8417e-c84e-4587-bd49-e6e1d6f4ee88', '940329A6-0C44-44C2-B816-F192C3DDF75F', 2, 'refusal', 'refusal', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2458ea31-9cfc-4807-a5d0-8e1ad092c3e5', '940329A6-0C44-44C2-B816-F192C3DDF75F', 3, 'sign-off', 'sign-off', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 940329A6-0C44-44C2-B816-F192C3DDF75F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='940329A6-0C44-44C2-B816-F192C3DDF75F';

/* SQL text to sync 4 entity field value row(s) for entity field ID 381291CE-94E9-47E5-B465-216713718BFD */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8cf84ce0-7fea-4db0-a29a-93850d2e102c', '381291CE-94E9-47E5-B465-216713718BFD', 1, 'adopt', 'adopt', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('18d875a2-4953-475b-ae2e-204c3fed6f1a', '381291CE-94E9-47E5-B465-216713718BFD', 2, 'evaluate', 'evaluate', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0f8da959-2ae5-41c3-ade6-1b1377d1bd93', '381291CE-94E9-47E5-B465-216713718BFD', 3, 'publish', 'publish', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('21747a9f-1617-4bec-9d78-8da676522b9b', '381291CE-94E9-47E5-B465-216713718BFD', 4, 'rollback', 'rollback', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 381291CE-94E9-47E5-B465-216713718BFD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='381291CE-94E9-47E5-B465-216713718BFD';

/* SQL text to sync 5 entity field value row(s) for entity field ID A7F0D206-FACB-41B7-B581-12028AD8C572 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0cae480e-3c2e-4fc3-96a3-85303b910e63', 'A7F0D206-FACB-41B7-B581-12028AD8C572', 1, 'monitoring', 'monitoring', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e26a2b37-2ff2-4eb8-bd60-f82fd41a045e', 'A7F0D206-FACB-41B7-B581-12028AD8C572', 2, 'parity', 'parity', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('808eacbf-102e-4ddd-8372-c8fcaf15f58e', 'A7F0D206-FACB-41B7-B581-12028AD8C572', 3, 'predict', 'predict', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c06af62c-bbde-4f68-b7d6-6b0db09979dc', 'A7F0D206-FACB-41B7-B581-12028AD8C572', 4, 'record-process', 'record-process', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ecb1dceb-1f28-4bea-9456-6f35391076eb', 'A7F0D206-FACB-41B7-B581-12028AD8C572', 5, 'score-record-set', 'score-record-set', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A7F0D206-FACB-41B7-B581-12028AD8C572 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A7F0D206-FACB-41B7-B581-12028AD8C572';

/* SQL text to sync 3 entity field value row(s) for entity field ID 5C5CA5C1-9F48-40D8-A982-FDE7B605A266 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4f19b0b0-ab69-4827-b6a7-a53df91d66d1', '5C5CA5C1-9F48-40D8-A982-FDE7B605A266', 1, 'filter', 'filter', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ed1a86ec-388b-40eb-b8ce-b1e349348eae', '5C5CA5C1-9F48-40D8-A982-FDE7B605A266', 2, 'record-ids', 'record-ids', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('690540bc-5223-41ba-a766-d79747e2a907', '5C5CA5C1-9F48-40D8-A982-FDE7B605A266', 3, 'view', 'view', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5C5CA5C1-9F48-40D8-A982-FDE7B605A266 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5C5CA5C1-9F48-40D8-A982-FDE7B605A266';

/* SQL text to sync 4 entity field value row(s) for entity field ID D1B99310-9E0D-4A03-8A4E-F1F96A8EC370 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f56f8076-bea9-4d5f-94c0-a3f7c463dea1', 'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370', 1, 'completed', 'completed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('87339f06-b60b-4c28-acf8-3aca51023dce', 'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370', 2, 'failed', 'failed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ca4db3af-d412-4f5c-84f1-fdc9777aab98', 'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370', 3, 'refused', 'refused', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b73a72b7-ad0a-4392-a456-84b4f22b8784', 'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370', 4, 'running', 'running', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D1B99310-9E0D-4A03-8A4E-F1F96A8EC370 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D1B99310-9E0D-4A03-8A4E-F1F96A8EC370';

/* SQL text to sync 3 entity field value row(s) for entity field ID 98F67019-F93F-4DD6-BBA1-70B848353726 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('15e6a336-af4f-4c87-9daa-70dabb7706b3', '98F67019-F93F-4DD6-BBA1-70B848353726', 1, 'month', 'month', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8fe42854-c5c7-4e93-8120-3ef692312785', '98F67019-F93F-4DD6-BBA1-70B848353726', 2, 'quarter', 'quarter', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ee67f9fc-dbf6-408a-ab76-bfdc464e44de', '98F67019-F93F-4DD6-BBA1-70B848353726', 3, 'week', 'week', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 98F67019-F93F-4DD6-BBA1-70B848353726 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='98F67019-F93F-4DD6-BBA1-70B848353726';

/* SQL text to sync 3 entity field value row(s) for entity field ID 1AAF359F-C0A4-4CF0-8365-92803287FB66 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a53866f4-589b-4ae6-b258-43814d57a27f', '1AAF359F-C0A4-4CF0-8365-92803287FB66', 1, 'evaluated', 'evaluated', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('87a32765-0937-4222-8515-7ceb09aad0bb', '1AAF359F-C0A4-4CF0-8365-92803287FB66', 2, 'failed', 'failed', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a763b8e5-079d-428d-aac0-2b7a23b14c9f', '1AAF359F-C0A4-4CF0-8365-92803287FB66', 3, 'window-open', 'window-open', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1AAF359F-C0A4-4CF0-8365-92803287FB66 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1AAF359F-C0A4-4CF0-8365-92803287FB66';

/* SQL text to sync 4 entity field value row(s) for entity field ID CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('67d063d0-bbbb-49c5-aa12-478255de6d98', 'CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889', 1, 'at-risk-list', 'at-risk-list', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ffe8a738-da6a-4bd0-ba79-6f80fa3b2318', 'CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889', 2, 'predictions-grid', 'predictions-grid', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1e3b4477-4343-46b2-a5c2-ce0dbb042a1c', 'CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889', 3, 'record-panel', 'record-panel', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0f1ac20c-274a-4d7a-ae39-824c290e1ad6', 'CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889', 4, 'why-badge', 'why-badge', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889';

/* SQL text to sync 4 entity field value row(s) for entity field ID 480927EF-43D6-43D8-AF27-884397692D15 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e395edd0-9577-4227-a052-9f0aa7acfa9a', '480927EF-43D6-43D8-AF27-884397692D15', 1, 'adverse-probability-desc', 'adverse-probability-desc', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('32c54c1b-e5ab-422f-8ad3-fa5da461ad1b', '480927EF-43D6-43D8-AF27-884397692D15', 2, 'none', 'none', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('15091671-5ea0-434b-994a-ed8abd231c2b', '480927EF-43D6-43D8-AF27-884397692D15', 3, 'score-asc', 'score-asc', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4113fafb-e564-4cde-a50b-16de7c23932b', '480927EF-43D6-43D8-AF27-884397692D15', 4, 'score-desc', 'score-desc', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 480927EF-43D6-43D8-AF27-884397692D15 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='480927EF-43D6-43D8-AF27-884397692D15';

/* SQL text to sync 2 entity field value row(s) for entity field ID A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6e44e2c9-a60e-4215-8aa3-ba475716da7f', 'A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC', 1, 'adverse-class', 'adverse-class', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c85d7440-bb0d-4703-9b9c-b45891455329', 'A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC', 2, 'raw-contribution', 'raw-contribution', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC';

/* SQL text to sync 5 entity field value row(s) for entity field ID 3D26A331-B246-4781-AB7E-5FC789EF4996 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9a074f98-87b6-42c7-84eb-cb7ff4408c18', '3D26A331-B246-4781-AB7E-5FC789EF4996', 1, 'hash-mismatch', 'hash-mismatch', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5b18530b-15b6-4fcc-8943-ea9d25dca545', '3D26A331-B246-4781-AB7E-5FC789EF4996', 2, 'legacy-local', 'legacy-local', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d5aea6ae-2e84-40f3-9aab-8e96d2eeed0d', '3D26A331-B246-4781-AB7E-5FC789EF4996', 3, 'missing', 'missing', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('22240bf4-fc20-4d5b-b380-c92bbf4ab5fb', '3D26A331-B246-4781-AB7E-5FC789EF4996', 4, 'unverified', 'unverified', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8478c933-5ae0-4d23-acb8-e56e24c24e99', '3D26A331-B246-4781-AB7E-5FC789EF4996', 5, 'verified', 'verified', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3D26A331-B246-4781-AB7E-5FC789EF4996 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3D26A331-B246-4781-AB7E-5FC789EF4996';

/* SQL text to sync 4 entity field value row(s) for entity field ID 8B0C0799-D66A-48BA-987D-C32D477E2A28 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cb62b007-4aca-4b60-8959-878ba86f080d', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 3, 'KeepBaseline', 'KeepBaseline', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a236628a-2bd5-48bd-998c-f50b66ad2647', '8B0C0799-D66A-48BA-987D-C32D477E2A28', 5, 'Unevaluated', 'Unevaluated', 'Check', GETUTCDATE(), GETUTCDATE());
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='C2CE99CA-0E5D-4227-B71D-55A34C1B1F84';
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='5F645BCA-78A6-4F2F-B01D-1AE7ED48BFC8';

/* SQL text to sync 2 entity field value row(s) for entity field ID 83C833AF-DF1F-43E9-A9A0-715AB5A9318B */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('704ce04c-6029-44e8-b484-a2aa2f6ffe63', '83C833AF-DF1F-43E9-A9A0-715AB5A9318B', 2, 'Model', 'Model', 'Check', GETUTCDATE(), GETUTCDATE());
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='A98135F6-E8A9-44D9-BBA0-B0EA2AD6CD49';

/* SQL text to sync 2 entity field value row(s) for entity field ID 7D45D97D-9DBC-42E0-BD83-33F7C91B6923 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('99034faa-6a30-4414-9593-e319f83ae13e', '7D45D97D-9DBC-42E0-BD83-33F7C91B6923', 1, 'Active', 'Active', 'Check', GETUTCDATE(), GETUTCDATE());
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ef9f5a46-bd5e-48a5-b562-00dc7d376217', '7D45D97D-9DBC-42E0-BD83-33F7C91B6923', 2, 'Withdrawn', 'Withdrawn', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 7D45D97D-9DBC-42E0-BD83-33F7C91B6923 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='7D45D97D-9DBC-42E0-BD83-33F7C91B6923';

/* SQL text to sync 3 entity field value row(s) for entity field ID 919000EB-F5B2-495F-93F4-AE6D2A1AF119 */
DELETE FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE ID='285AB7F0-40C8-4455-A23A-8FC67D2C867C';
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=1 WHERE ID='774AF3CF-CBFD-4CEC-8E08-97F1EAE6039F';
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='59BF12A1-78DC-4042-9243-93935E738A59';

/* Deterministic search-flag hygiene — seed name fields */

         UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [IncludeInUserSearchAPI] = 1,
             [UserSearchPredicateAPI] = 'BeginsWith'
         WHERE [ID] IN (
            SELECT ranked.[ID] FROM (
               SELECT f.[ID],
                      ROW_NUMBER() OVER (
                         PARTITION BY f.[EntityID]
                         ORDER BY f.[Sequence], f.[Name]
                      ) AS rn
               FROM [${flyway:defaultSchema}].[EntityField] f
               INNER JOIN [${flyway:defaultSchema}].[Entity] e ON e.[ID] = f.[EntityID]
               WHERE LOWER(f.[Name]) IN ('name','title','firstname','lastname','middlename','displayname','fullname','label')
                 AND f.[AutoUpdateIncludeInUserSearchAPI] = 1
                 AND f.[IncludeInUserSearchAPI] = 0
                 AND ISNULL(f.[IsPrimaryKey], 0) = 0
                 AND ISNULL(f.[IsVirtual], 0) = 0
                 AND LOWER(f.[Type]) IN ('nvarchar','varchar','char','nchar')
                 AND ISNULL(f.[Length], 0) <> -1
                 AND e.[VirtualEntity] = 0
                 AND e.[AllowUserSearchAPI] = 1
                 AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
                 AND NOT ((e.[Name] = 'Logs' OR e.[Name] LIKE '% Logs') OR (e.[Name] = 'Log' OR e.[Name] LIKE '% Log') OR (e.[Name] = 'Runs' OR e.[Name] LIKE '% Runs') OR (e.[Name] = 'Run' OR e.[Name] LIKE '% Run') OR (e.[Name] = 'Run History' OR e.[Name] LIKE '% Run History') OR (e.[Name] = 'Run Steps' OR e.[Name] LIKE '% Run Steps') OR (e.[Name] = 'Run Messages' OR e.[Name] LIKE '% Run Messages') OR (e.[Name] = 'Execution Logs' OR e.[Name] LIKE '% Execution Logs') OR (e.[Name] = 'Details' OR e.[Name] LIKE '% Details') OR (e.[Name] = 'Detail' OR e.[Name] LIKE '% Detail') OR (e.[Name] = 'Lines' OR e.[Name] LIKE '% Lines') OR (e.[Name] = 'Line' OR e.[Name] LIKE '% Line') OR (e.[Name] = 'Items' OR e.[Name] LIKE '% Items') OR (e.[Name] = 'Item' OR e.[Name] LIKE '% Item') OR (e.[Name] = 'Steps' OR e.[Name] LIKE '% Steps') OR (e.[Name] = 'Step' OR e.[Name] LIKE '% Step') OR (e.[Name] = 'Params' OR e.[Name] LIKE '% Params') OR (e.[Name] = 'Param' OR e.[Name] LIKE '% Param') OR (e.[Name] = 'Mappings' OR e.[Name] LIKE '% Mappings') OR (e.[Name] = 'Mapping' OR e.[Name] LIKE '% Mapping') OR (e.[Name] = 'Audit' OR e.[Name] LIKE 'Audit %' OR e.[Name] LIKE '% Audit' OR e.[Name] LIKE '% Audit %') OR (e.[Name] = 'Record Change' OR e.[Name] LIKE 'Record Change %' OR e.[Name] LIKE '% Record Change' OR e.[Name] LIKE '% Record Change %'))
                 AND e.[SchemaName] NOT IN ('sys','staging')
                 AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
            ) ranked
            WHERE ranked.rn <= 3
         );

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


/* Create Entity Relationship: MJ: ML Model Publish Records -> MJ: ML Model Publish Records (One To Many via SignOffID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c0860c71-14bd-4dda-a973-6f37581e6506' OR ([EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND [RelatedEntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND [RelatedEntityJoinField] = 'SignOffID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c0860c71-14bd-4dda-a973-6f37581e6506', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'SignOffID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Prediction Units -> MJ: ML Models (One To Many via PredictionUnitID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '516351f6-491e-4438-8e87-ad9dccfb10b9' OR ([EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'PredictionUnitID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('516351f6-491e-4438-8e87-ad9dccfb10b9', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'PredictionUnitID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: ML Scoring Runs (One To Many via ScopeEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8eb22700-15d0-4632-a0cc-bb9c1eab1fb3' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND [RelatedEntityJoinField] = 'ScopeEntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8eb22700-15d0-4632-a0cc-bb9c1eab1fb3', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'ScopeEntityID', 'One To Many', 1, 1, 95, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: ML Model Publish Records (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '844030dd-c9b8-42b7-9735-be65a6c984b6' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND [RelatedEntityJoinField] = 'UserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('844030dd-c9b8-42b7-9735-be65a6c984b6', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'UserID', 'One To Many', 1, 1, 132, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: ML Scoring Runs (One To Many via RequestedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '38b9fb74-0c05-4d4a-8c77-f164acf95d8c' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND [RelatedEntityJoinField] = 'RequestedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('38b9fb74-0c05-4d4a-8c77-f164acf95d8c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'RequestedByUserID', 'One To Many', 1, 1, 133, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Authorizations -> MJ: ML Model Scoring Bindings (One To Many via ViewAuthorizationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6fa446e4-7955-43dd-bf2a-59497b84def3' OR ([EntityID] = 'F9238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND [RelatedEntityJoinField] = 'ViewAuthorizationID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6fa446e4-7955-43dd-bf2a-59497b84def3', 'F9238F34-2837-EF11-86D4-6045BDEE16E6', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'ViewAuthorizationID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Snapshots -> MJ: ML Models (One To Many via TrainingSnapshotID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ac6138e0-990c-4a49-87fb-0938fef3ebf5' OR ([EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'TrainingSnapshotID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ac6138e0-990c-4a49-87fb-0938fef3ebf5', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'TrainingSnapshotID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Model Scoring Bindings -> MJ: Feature Values (One To Many via MLModelScoringBindingID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '359c9d16-d70b-465c-831f-b1efa4e43f66' OR ([EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND [RelatedEntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND [RelatedEntityJoinField] = 'MLModelScoringBindingID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('359c9d16-d70b-465c-831f-b1efa4e43f66', 'FD8EF230-65F3-496D-A117-7610572C35AA', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'MLModelScoringBindingID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Model Scoring Bindings -> MJ: ML Scoring Runs (One To Many via MLModelScoringBindingID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e4850125-fc94-4f24-9ec2-eb12d8501b01' OR ([EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND [RelatedEntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND [RelatedEntityJoinField] = 'MLModelScoringBindingID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e4850125-fc94-4f24-9ec2-eb12d8501b01', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'MLModelScoringBindingID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Scheduled Job Runs -> MJ: ML Scoring Runs (One To Many via ScheduledJobRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '18b98129-dc6f-4161-b751-61488e8f676e' OR ([EntityID] = '05853432-5E13-4F2A-8618-77857ADF17FA' AND [RelatedEntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND [RelatedEntityJoinField] = 'ScheduledJobRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('18b98129-dc6f-4161-b751-61488e8f676e', '05853432-5E13-4F2A-8618-77857ADF17FA', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'ScheduledJobRunID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Scheduled Job Runs -> MJ: ML Monitoring Results (One To Many via ScheduledJobRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '514440b3-904d-4a7e-86b6-8b1e972bd208' OR ([EntityID] = '05853432-5E13-4F2A-8618-77857ADF17FA' AND [RelatedEntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND [RelatedEntityJoinField] = 'ScheduledJobRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('514440b3-904d-4a7e-86b6-8b1e972bd208', '05853432-5E13-4F2A-8618-77857ADF17FA', '18359693-D8DF-4E8F-B5E1-D2C17B742834', 'ScheduledJobRunID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Evaluation Protocols -> MJ: ML Models (One To Many via EvaluationProtocolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a46eb9a6-b30d-4175-8a83-2ef8883c0cc1' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'EvaluationProtocolID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a46eb9a6-b30d-4175-8a83-2ef8883c0cc1', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'EvaluationProtocolID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Model Publish Records (One To Many via TrainingRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '836f9dd0-bcbb-4e12-ba44-99590fb78b75' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND [RelatedEntityJoinField] = 'TrainingRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('836f9dd0-bcbb-4e12-ba44-99590fb78b75', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'TrainingRunID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Models (One To Many via TrainingRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8b8adc06-f681-4cb9-ad95-716f79434a64' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityJoinField] = 'TrainingRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8b8adc06-f681-4cb9-ad95-716f79434a64', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'TrainingRunID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Training Runs -> MJ: ML Monitoring Results (One To Many via ChallengerRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e14ed9cb-5252-42de-a188-1e967c3302e8' OR ([EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND [RelatedEntityJoinField] = 'ChallengerRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e14ed9cb-5252-42de-a188-1e967c3302e8', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', '18359693-D8DF-4E8F-B5E1-D2C17B742834', 'ChallengerRunID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Models -> MJ: ML Model Publish Records (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '16264ba0-2640-431d-ac96-6b97f010f9f5' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('16264ba0-2640-431d-ac96-6b97f010f9f5', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'ModelID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Model Publish Records (One To Many via ReplacesModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '32efa861-0881-4a0d-a7bf-6a8e56378dac' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND [RelatedEntityJoinField] = 'ReplacesModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('32efa861-0881-4a0d-a7bf-6a8e56378dac', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'ReplacesModelID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Scoring Runs (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e7a708ed-7a53-4b64-a429-ade600d1cbbf' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e7a708ed-7a53-4b64-a429-ade600d1cbbf', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'ModelID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Models -> MJ: ML Monitoring Results (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3d02aea8-0ae9-4640-b5f2-7ad15aa4f297' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3d02aea8-0ae9-4640-b5f2-7ad15aa4f297', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '18359693-D8DF-4E8F-B5E1-D2C17B742834', 'ModelID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Models -> MJ: ML Output Bindings (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5a458e54-c1f2-4352-884b-6c287e9454b0' OR ([EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [RelatedEntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND [RelatedEntityJoinField] = 'ModelID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5a458e54-c1f2-4352-884b-6c287e9454b0', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '75F9DA13-10D3-4153-9299-E97F1ED296AD', 'ModelID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Pipelines -> MJ: ML Model Scoring Bindings (One To Many via MLTrainingPipelineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '001e4a3a-ebe9-492c-a330-d97a6d715fc1' OR ([EntityID] = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND [RelatedEntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND [RelatedEntityJoinField] = 'MLTrainingPipelineID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('001e4a3a-ebe9-492c-a330-d97a6d715fc1', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'MLTrainingPipelineID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Scoring Runs -> MJ: Feature Values (One To Many via MLScoringRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '14f09508-94c8-4069-8800-04617df7eade' OR ([EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND [RelatedEntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND [RelatedEntityJoinField] = 'MLScoringRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('14f09508-94c8-4069-8800-04617df7eade', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'MLScoringRunID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Process Runs -> MJ: ML Scoring Runs (One To Many via ProcessRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2ea64da4-aff1-4254-aaef-f65eb5ce562a' OR ([EntityID] = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND [RelatedEntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND [RelatedEntityJoinField] = 'ProcessRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2ea64da4-aff1-4254-aaef-f65eb5ce562a', '9989A9A4-5546-4552-A765-B27EE399BFEA', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'ProcessRunID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to update virtual entity field ID for entity MJ: Latest Feature Values */
UPDATE
                                    [${flyway:defaultSchema}].[EntityField]
                                  SET
                                    
                                    Sequence=1,
                                    Type='uniqueidentifier',
                                    AllowsNull=0,
                                    IsPrimaryKey=1,IsUnique=1,
                                    Length=16,
                                    Precision=0,
                                    Scale=0
                                  WHERE
                                    ID = 'E3CB8070-E989-462A-ACC9-07547455634D';

/* SQL text to update virtual entity updated date for MJ: Latest Feature Values */
UPDATE [${flyway:defaultSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';

/* Set LLM-identified PKs for MJ: Latest Feature Values: ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                        SET IsPrimaryKey=0, IsUnique=0
                        WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND IsPrimaryKey=1 AND IsSoftPrimaryKey=0;
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET IsPrimaryKey=1, IsUnique=1, IsSoftPrimaryKey=1
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ID';

/* Set LLM-generated descriptions for MJ: Latest Feature Values (19 fields) */
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Unique identifier for this feature value record, matching the source FeatureValue.ID.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='The entity ID of the record this feature was computed for.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='EntityID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Serialized primary key of the record this feature value belongs to.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='RecordID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Name of the feature.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='FeatureName';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Who produced the value (e.g., Pipeline, Human, Model).', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Source';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Role of the feature value (e.g., Champion).', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Role';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Timestamp from which this value is considered effective for the feature.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='EffectiveAsOf';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Timestamp when this feature value was computed.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ComputedAt';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Identifier of the scoring binding whose prediction this value represents.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='MLModelScoringBindingID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Identifier of the ML model that scored this value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='MLModelID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Identifier of the ML scoring run that computed this value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='MLScoringRunID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Indicates whether this record was included in the model''s training snapshot.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='InTraining';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Identifier of the Record Process (Feature Pipeline) that computed this feature value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='RecordProcessID';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed feature value as text, for textual or categorical features.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueText';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed feature value as a floating-point numeric score or metric.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueNumeric';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed feature value formatted as a date/time timestamp.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueDate';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed feature value as a boolean true/false flag.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueBoolean';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Computed feature value as structured JSON data.', [AutoUpdateDescription] = 0, ExtendedType='JSON'
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='ValueJSON';
UPDATE [${flyway:defaultSchema}].[EntityField]
                         SET Description='Optional confidence score associated with this computed feature value.', [AutoUpdateDescription] = 0
                         WHERE EntityID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND Name='Confidence';

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E3CB8070-E989-462A-ACC9-07547455634D';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B7F56029-CF28-434C-B31E-4C236FE48ED5';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1D765F7A-D8F0-445D-B486-8F460EFA9D26';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.FeatureName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D6DFC99B-3DBC-4D7E-8E9B-CA20265E1A03';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F121D621-9B0A-412D-AD72-99E6D95AE363';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9F933A69-6AAB-4F53-848C-84118E48E113';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.EffectiveAsOf 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3F803213-626C-4674-A9C7-E272E834A888';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ComputedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '56A1A22F-5536-4AD4-AF40-73BDC7D97469';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.MLModelScoringBindingID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F6126AAD-2279-4778-BB39-2C840818AC49';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.MLModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3A14FC5F-1A67-493D-B3B1-04A8B7EDC0DB';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.MLScoringRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '47FAD71C-9EAD-4F63-8B42-4103D908C454';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.InTraining 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A7987F81-6E7C-46FC-B408-C2E543D9F27A';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.RecordProcessID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '34B2591A-814E-4186-B072-FA0FC5E96DA8';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueText 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Text)'
WHERE 
   ID = 'AC1E9D90-20C6-47BD-818D-1A155B37FC8B';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueNumeric 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Numeric)'
WHERE 
   ID = '589B764F-FEC8-4EF6-A936-289630132999';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Date)'
WHERE 
   ID = '5E86B922-C294-46C4-B78A-B322DC75E394';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueBoolean 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (Boolean)'
WHERE 
   ID = 'E491CD6F-09E0-4D52-A5BD-C0D6F45EC0EF';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Values',
   GeneratedFormSection = 'Category',
   DisplayName = 'Value (JSON)'
WHERE 
   ID = '9CB5AF74-F68D-4AD0-99C4-0004D0E7B712';

-- UPDATE Entity Field Category Info MJ: Latest Feature Values.Confidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AADB4BA9-8CB3-42EB-9746-D3F36587169B';

/* Set entity icon to fa-solid fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa-solid fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6ffbbf96-457e-5629-87d2-761e7e340241', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', 'FieldCategoryInfo', '{
  "Feature Details": {
    "description": "Metadata regarding the feature name, champion/challenger role, and confidence score",
    "icon": "fa-solid fa-sliders"
  },
  "Feature Values": {
    "description": "Typed representations of the computed feature value",
    "icon": "fa-solid fa-square-root-variable"
  },
  "Pipeline Provenance": {
    "description": "Lineage details linking values back to machine learning models, bindings, runs, and pipelines",
    "icon": "fa-solid fa-diagram-project"
  },
  "Record Context": {
    "description": "Target entity, record identifiers, source details, and effective dates",
    "icon": "fa-solid fa-bullseye"
  },
  "System Metadata": {
    "description": "System identifiers and administrative tracking fields",
    "icon": "fa-solid fa-gear"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('5da419c2-f730-51fc-a33a-261c05a2ae47', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', 'FieldCategoryIcons', '{
  "Feature Details": "fa-solid fa-sliders",
  "Feature Values": "fa-solid fa-square-root-variable",
  "Pipeline Provenance": "fa-solid fa-diagram-project",
  "Record Context": "fa-solid fa-bullseye",
  "System Metadata": "fa-solid fa-gear"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Update entity timestamp for MJ: Latest Feature Values after LLM decoration */
UPDATE [${flyway:defaultSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';

/* SQL text to update entity field related entity name field map for entity field ID 63758D3B-EBE1-4F32-8DDD-A6C56A403651 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='63758D3B-EBE1-4F32-8DDD-A6C56A403651', @RelatedEntityNameFieldMap='MLModelScoringBinding';

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
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_RecordProcessID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'RecordProcessID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_RecordProcessID ON [${flyway:defaultSchema}].[FeatureValue] ([RecordProcessID]);

-- Index for foreign key EntityID in table FeatureValue
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_EntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'EntityID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_EntityID ON [${flyway:defaultSchema}].[FeatureValue] ([EntityID]);

-- Index for foreign key PromptID in table FeatureValue
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_PromptID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'PromptID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_PromptID ON [${flyway:defaultSchema}].[FeatureValue] ([PromptID]);

-- Index for foreign key ProcessRunID in table FeatureValue
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ProcessRunID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunID ON [${flyway:defaultSchema}].[FeatureValue] ([ProcessRunID]);

-- Index for foreign key ProcessRunDetailID in table FeatureValue
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunDetailID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ProcessRunDetailID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunDetailID ON [${flyway:defaultSchema}].[FeatureValue] ([ProcessRunDetailID]);

-- Index for foreign key FeatureValueCacheID in table FeatureValue
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_FeatureValueCacheID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'FeatureValueCacheID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_FeatureValueCacheID ON [${flyway:defaultSchema}].[FeatureValue] ([FeatureValueCacheID]);

-- Index for foreign key AIModelID in table FeatureValue
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_AIModelID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'AIModelID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_AIModelID ON [${flyway:defaultSchema}].[FeatureValue] ([AIModelID]);

-- Index for foreign key MLModelID in table FeatureValue
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_MLModelID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'MLModelID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_MLModelID ON [${flyway:defaultSchema}].[FeatureValue] ([MLModelID]);

-- Index for foreign key MLModelScoringBindingID in table FeatureValue
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_MLModelScoringBindingID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'MLModelScoringBindingID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_MLModelScoringBindingID ON [${flyway:defaultSchema}].[FeatureValue] ([MLModelScoringBindingID]);

-- Index for foreign key MLScoringRunID in table FeatureValue
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_MLScoringRunID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'MLScoringRunID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_MLScoringRunID ON [${flyway:defaultSchema}].[FeatureValue] ([MLScoringRunID]);

-- FK INDEX SKIPPED for ${flyway:defaultSchema}.FeatureValue
--   RecordID (nvarchar): 1800 bytes, over SQL Server's 1700-byte index key limit
-- Joins and related-record lookups on these columns run without an index. Give the
-- column(s) a narrower explicit length in the source schema definition so they can be indexed.;

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
    MJAIModel_AIModelID.[Name] AS [AIModel],
    MJMLModelScoringBinding_MLModelScoringBindingID.[TargetColumn] AS [MLModelScoringBinding]
FROM
    [${flyway:defaultSchema}].[FeatureValue] AS f
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RecordProcess] AS MJRecordProcess_RecordProcessID
  ON
    [f].[RecordProcessID] = MJRecordProcess_RecordProcessID.[ID]
LEFT OUTER JOIN
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLModelScoringBinding] AS MJMLModelScoringBinding_MLModelScoringBindingID
  ON
    [f].[MLModelScoringBindingID] = MJMLModelScoringBinding_MLModelScoringBindingID.[ID]
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
    @RecordProcessID_Clear bit = 0,
    @RecordProcessID uniqueidentifier = NULL,
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
    @Source nvarchar(20) = NULL,
    @EffectiveAsOf_Clear bit = 0,
    @EffectiveAsOf datetimeoffset = NULL,
    @InputAsOf_Clear bit = 0,
    @InputAsOf datetimeoffset = NULL,
    @Role nvarchar(20) = NULL,
    @MLModelID_Clear bit = 0,
    @MLModelID uniqueidentifier = NULL,
    @MLModelScoringBindingID_Clear bit = 0,
    @MLModelScoringBindingID uniqueidentifier = NULL,
    @MLScoringRunID_Clear bit = 0,
    @MLScoringRunID uniqueidentifier = NULL,
    @InTraining_Clear bit = 0,
    @InTraining bit = NULL
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
                [Source],
                [EffectiveAsOf],
                [InputAsOf],
                [Role],
                [MLModelID],
                [MLModelScoringBindingID],
                [MLScoringRunID],
                [InTraining]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
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
                ISNULL(@Source, 'Pipeline'),
                CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, NULL) END,
                CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, NULL) END,
                ISNULL(@Role, 'Champion'),
                CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, NULL) END,
                CASE WHEN @MLModelScoringBindingID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelScoringBindingID, NULL) END,
                CASE WHEN @MLScoringRunID_Clear = 1 THEN NULL ELSE ISNULL(@MLScoringRunID, NULL) END,
                CASE WHEN @InTraining_Clear = 1 THEN NULL ELSE ISNULL(@InTraining, NULL) END
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
                [Source],
                [EffectiveAsOf],
                [InputAsOf],
                [Role],
                [MLModelID],
                [MLModelScoringBindingID],
                [MLScoringRunID],
                [InTraining]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
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
                ISNULL(@Source, 'Pipeline'),
                CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, NULL) END,
                CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, NULL) END,
                ISNULL(@Role, 'Champion'),
                CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, NULL) END,
                CASE WHEN @MLModelScoringBindingID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelScoringBindingID, NULL) END,
                CASE WHEN @MLScoringRunID_Clear = 1 THEN NULL ELSE ISNULL(@MLScoringRunID, NULL) END,
                CASE WHEN @InTraining_Clear = 1 THEN NULL ELSE ISNULL(@InTraining, NULL) END
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
    @RecordProcessID_Clear bit = 0,
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
    @Source nvarchar(20) = NULL,
    @EffectiveAsOf_Clear bit = 0,
    @EffectiveAsOf datetimeoffset = NULL,
    @InputAsOf_Clear bit = 0,
    @InputAsOf datetimeoffset = NULL,
    @Role nvarchar(20) = NULL,
    @MLModelID_Clear bit = 0,
    @MLModelID uniqueidentifier = NULL,
    @MLModelScoringBindingID_Clear bit = 0,
    @MLModelScoringBindingID uniqueidentifier = NULL,
    @MLScoringRunID_Clear bit = 0,
    @MLScoringRunID uniqueidentifier = NULL,
    @InTraining_Clear bit = 0,
    @InTraining bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FeatureValue]
    SET
        [RecordProcessID] = CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, [RecordProcessID]) END,
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
        [Source] = ISNULL(@Source, [Source]),
        [EffectiveAsOf] = CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, [EffectiveAsOf]) END,
        [InputAsOf] = CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, [InputAsOf]) END,
        [Role] = ISNULL(@Role, [Role]),
        [MLModelID] = CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, [MLModelID]) END,
        [MLModelScoringBindingID] = CASE WHEN @MLModelScoringBindingID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelScoringBindingID, [MLModelScoringBindingID]) END,
        [MLScoringRunID] = CASE WHEN @MLScoringRunID_Clear = 1 THEN NULL ELSE ISNULL(@MLScoringRunID, [MLScoringRunID]) END,
        [InTraining] = CASE WHEN @InTraining_Clear = 1 THEN NULL ELSE ISNULL(@InTraining, [InTraining]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[FeatureValue]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[FeatureValue] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
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

/* Base View Permissions SQL for MJ: Latest Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Latest Feature Values
-- Item: Permissions for vwLatestFeatureValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* SQL text to update entity field related entity name field map for entity field ID 87B82E1A-CFD0-4B51-9127-E344C63F1373 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='87B82E1A-CFD0-4B51-9127-E344C63F1373', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 9A5AB8B8-1DB9-44DE-AC6F-95F6561601B7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9A5AB8B8-1DB9-44DE-AC6F-95F6561601B7', @RelatedEntityNameFieldMap='MLTrainingPipeline';

/* SQL text to update entity field related entity name field map for entity field ID D70F7357-7955-4A95-BACA-2C1562AF73BA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D70F7357-7955-4A95-BACA-2C1562AF73BA', @RelatedEntityNameFieldMap='PredictionUnit';

/* SQL text to update entity field related entity name field map for entity field ID D1EE5D2D-3609-4F19-8CA1-58C4CAD0A9E1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D1EE5D2D-3609-4F19-8CA1-58C4CAD0A9E1', @RelatedEntityNameFieldMap='ScheduledJobRun';

/* SQL text to update entity field related entity name field map for entity field ID C1418070-BC06-4C81-A5E5-9157D98260E1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C1418070-BC06-4C81-A5E5-9157D98260E1', @RelatedEntityNameFieldMap='MLModelScoringBinding';

/* SQL text to update entity field related entity name field map for entity field ID 56811DD1-2425-4943-93E4-699B08CCA40C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='56811DD1-2425-4943-93E4-699B08CCA40C', @RelatedEntityNameFieldMap='EvaluationProtocol';

/* SQL text to update entity field related entity name field map for entity field ID C531130D-2663-402B-9643-57AF83E76F08 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C531130D-2663-402B-9643-57AF83E76F08', @RelatedEntityNameFieldMap='ViewAuthorization';

/* SQL text to update entity field related entity name field map for entity field ID 4274B247-7FE6-42AF-82F1-54C01B0BFCFE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4274B247-7FE6-42AF-82F1-54C01B0BFCFE', @RelatedEntityNameFieldMap='ScopeEntity';

/* SQL text to update entity field related entity name field map for entity field ID 7965BB9C-A42E-4DCC-8E32-A78D8309B922 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7965BB9C-A42E-4DCC-8E32-A78D8309B922', @RelatedEntityNameFieldMap='TrainingSnapshot';

/* SQL text to update entity field related entity name field map for entity field ID 44A3F9E4-8767-4D71-8D31-800F5593537E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='44A3F9E4-8767-4D71-8D31-800F5593537E', @RelatedEntityNameFieldMap='RequestedByUser';

/* SQL text to update entity field related entity name field map for entity field ID 080EC5A4-CF1B-4BAE-95BD-C7BFBC1442C2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='080EC5A4-CF1B-4BAE-95BD-C7BFBC1442C2', @RelatedEntityNameFieldMap='ScheduledJobRun';

/* Index for Foreign Keys for MLModelPublishRecord */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Publish Records
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table MLModelPublishRecord
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelPublishRecord_ModelID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ModelID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelPublishRecord_ModelID ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([ModelID]);

-- Index for foreign key TrainingRunID in table MLModelPublishRecord
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelPublishRecord_TrainingRunID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'TrainingRunID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelPublishRecord_TrainingRunID ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([TrainingRunID]);

-- Index for foreign key UserID in table MLModelPublishRecord
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelPublishRecord_UserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'UserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelPublishRecord_UserID ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([UserID]);

-- Index for foreign key SignOffID in table MLModelPublishRecord
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelPublishRecord_SignOffID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'SignOffID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelPublishRecord_SignOffID ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([SignOffID]);

-- Index for foreign key ReplacesModelID in table MLModelPublishRecord
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelPublishRecord_ReplacesModelID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelPublishRecord]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ReplacesModelID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelPublishRecord_ReplacesModelID ON [${flyway:defaultSchema}].[MLModelPublishRecord] ([ReplacesModelID]);

/* Base View SQL for MJ: ML Model Publish Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Publish Records
-- Item: vwMLModelPublishRecords
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Model Publish Records
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLModelPublishRecord
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLModelPublishRecords]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLModelPublishRecords];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLModelPublishRecords]
AS
SELECT
    m.*,
    MJUser_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[MLModelPublishRecord] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [m].[UserID] = MJUser_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModelPublishRecords] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Model Publish Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Publish Records
-- Item: Permissions for vwMLModelPublishRecords
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModelPublishRecords] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Model Publish Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Publish Records
-- Item: spCreateMLModelPublishRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLModelPublishRecord
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLModelPublishRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLModelPublishRecord];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLModelPublishRecord]
    @ID uniqueidentifier = NULL,
    @ModelID_Clear bit = 0,
    @ModelID uniqueidentifier = NULL,
    @TrainingRunID_Clear bit = 0,
    @TrainingRunID uniqueidentifier = NULL,
    @Kind nvarchar(20),
    @Purpose nvarchar(20),
    @ApproverKind nvarchar(20),
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Initiator nvarchar(MAX),
    @RecordedAt datetimeoffset = NULL,
    @Decision_Clear bit = 0,
    @Decision nvarchar(10) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @GateDecision_Clear bit = 0,
    @GateDecision nvarchar(MAX) = NULL,
    @Evidence_Clear bit = 0,
    @Evidence nvarchar(MAX) = NULL,
    @EvidenceSha256_Clear bit = 0,
    @EvidenceSha256 char(64) = NULL,
    @OverridesFlags nvarchar(MAX) = NULL,
    @SignOffID_Clear bit = 0,
    @SignOffID uniqueidentifier = NULL,
    @ReplacesModelID_Clear bit = 0,
    @ReplacesModelID uniqueidentifier = NULL,
    @Refusal_Clear bit = 0,
    @Refusal nvarchar(MAX) = NULL,
    @Transient bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLModelPublishRecord]
            (
                [ID],
                [ModelID],
                [TrainingRunID],
                [Kind],
                [Purpose],
                [ApproverKind],
                [UserID],
                [Initiator],
                [RecordedAt],
                [Decision],
                [Reason],
                [GateDecision],
                [Evidence],
                [EvidenceSha256],
                [OverridesFlags],
                [SignOffID],
                [ReplacesModelID],
                [Refusal],
                [Transient]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @ModelID_Clear = 1 THEN NULL ELSE ISNULL(@ModelID, NULL) END,
                CASE WHEN @TrainingRunID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRunID, NULL) END,
                @Kind,
                @Purpose,
                @ApproverKind,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                @Initiator,
                ISNULL(@RecordedAt, sysdatetimeoffset()),
                CASE WHEN @Decision_Clear = 1 THEN NULL ELSE ISNULL(@Decision, NULL) END,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @GateDecision_Clear = 1 THEN NULL ELSE ISNULL(@GateDecision, NULL) END,
                CASE WHEN @Evidence_Clear = 1 THEN NULL ELSE ISNULL(@Evidence, NULL) END,
                CASE WHEN @EvidenceSha256_Clear = 1 THEN NULL ELSE ISNULL(@EvidenceSha256, NULL) END,
                ISNULL(@OverridesFlags, '[]'),
                CASE WHEN @SignOffID_Clear = 1 THEN NULL ELSE ISNULL(@SignOffID, NULL) END,
                CASE WHEN @ReplacesModelID_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesModelID, NULL) END,
                CASE WHEN @Refusal_Clear = 1 THEN NULL ELSE ISNULL(@Refusal, NULL) END,
                ISNULL(@Transient, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLModelPublishRecord]
            (
                [ModelID],
                [TrainingRunID],
                [Kind],
                [Purpose],
                [ApproverKind],
                [UserID],
                [Initiator],
                [RecordedAt],
                [Decision],
                [Reason],
                [GateDecision],
                [Evidence],
                [EvidenceSha256],
                [OverridesFlags],
                [SignOffID],
                [ReplacesModelID],
                [Refusal],
                [Transient]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @ModelID_Clear = 1 THEN NULL ELSE ISNULL(@ModelID, NULL) END,
                CASE WHEN @TrainingRunID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRunID, NULL) END,
                @Kind,
                @Purpose,
                @ApproverKind,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                @Initiator,
                ISNULL(@RecordedAt, sysdatetimeoffset()),
                CASE WHEN @Decision_Clear = 1 THEN NULL ELSE ISNULL(@Decision, NULL) END,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @GateDecision_Clear = 1 THEN NULL ELSE ISNULL(@GateDecision, NULL) END,
                CASE WHEN @Evidence_Clear = 1 THEN NULL ELSE ISNULL(@Evidence, NULL) END,
                CASE WHEN @EvidenceSha256_Clear = 1 THEN NULL ELSE ISNULL(@EvidenceSha256, NULL) END,
                ISNULL(@OverridesFlags, '[]'),
                CASE WHEN @SignOffID_Clear = 1 THEN NULL ELSE ISNULL(@SignOffID, NULL) END,
                CASE WHEN @ReplacesModelID_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesModelID, NULL) END,
                CASE WHEN @Refusal_Clear = 1 THEN NULL ELSE ISNULL(@Refusal, NULL) END,
                ISNULL(@Transient, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLModelPublishRecords] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelPublishRecord] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Model Publish Records */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelPublishRecord] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Model Publish Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Publish Records
-- Item: spUpdateMLModelPublishRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLModelPublishRecord
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLModelPublishRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModelPublishRecord];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModelPublishRecord]
    @ID uniqueidentifier,
    @ModelID_Clear bit = 0,
    @ModelID uniqueidentifier = NULL,
    @TrainingRunID_Clear bit = 0,
    @TrainingRunID uniqueidentifier = NULL,
    @Kind nvarchar(20) = NULL,
    @Purpose nvarchar(20) = NULL,
    @ApproverKind nvarchar(20) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Initiator nvarchar(MAX) = NULL,
    @RecordedAt datetimeoffset = NULL,
    @Decision_Clear bit = 0,
    @Decision nvarchar(10) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @GateDecision_Clear bit = 0,
    @GateDecision nvarchar(MAX) = NULL,
    @Evidence_Clear bit = 0,
    @Evidence nvarchar(MAX) = NULL,
    @EvidenceSha256_Clear bit = 0,
    @EvidenceSha256 char(64) = NULL,
    @OverridesFlags nvarchar(MAX) = NULL,
    @SignOffID_Clear bit = 0,
    @SignOffID uniqueidentifier = NULL,
    @ReplacesModelID_Clear bit = 0,
    @ReplacesModelID uniqueidentifier = NULL,
    @Refusal_Clear bit = 0,
    @Refusal nvarchar(MAX) = NULL,
    @Transient bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLModelPublishRecord]
    SET
        [ModelID] = CASE WHEN @ModelID_Clear = 1 THEN NULL ELSE ISNULL(@ModelID, [ModelID]) END,
        [TrainingRunID] = CASE WHEN @TrainingRunID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRunID, [TrainingRunID]) END,
        [Kind] = ISNULL(@Kind, [Kind]),
        [Purpose] = ISNULL(@Purpose, [Purpose]),
        [ApproverKind] = ISNULL(@ApproverKind, [ApproverKind]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [Initiator] = ISNULL(@Initiator, [Initiator]),
        [RecordedAt] = ISNULL(@RecordedAt, [RecordedAt]),
        [Decision] = CASE WHEN @Decision_Clear = 1 THEN NULL ELSE ISNULL(@Decision, [Decision]) END,
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [GateDecision] = CASE WHEN @GateDecision_Clear = 1 THEN NULL ELSE ISNULL(@GateDecision, [GateDecision]) END,
        [Evidence] = CASE WHEN @Evidence_Clear = 1 THEN NULL ELSE ISNULL(@Evidence, [Evidence]) END,
        [EvidenceSha256] = CASE WHEN @EvidenceSha256_Clear = 1 THEN NULL ELSE ISNULL(@EvidenceSha256, [EvidenceSha256]) END,
        [OverridesFlags] = ISNULL(@OverridesFlags, [OverridesFlags]),
        [SignOffID] = CASE WHEN @SignOffID_Clear = 1 THEN NULL ELSE ISNULL(@SignOffID, [SignOffID]) END,
        [ReplacesModelID] = CASE WHEN @ReplacesModelID_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesModelID, [ReplacesModelID]) END,
        [Refusal] = CASE WHEN @Refusal_Clear = 1 THEN NULL ELSE ISNULL(@Refusal, [Refusal]) END,
        [Transient] = ISNULL(@Transient, [Transient]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLModelPublishRecords] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLModelPublishRecords]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelPublishRecord] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLModelPublishRecord table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLModelPublishRecord]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLModelPublishRecord];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLModelPublishRecord
ON [${flyway:defaultSchema}].[MLModelPublishRecord]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[MLModelPublishRecord]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[MLModelPublishRecord] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ: ML Model Publish Records */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelPublishRecord] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Model Publish Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Publish Records
-- Item: spDeleteMLModelPublishRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLModelPublishRecord
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLModelPublishRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModelPublishRecord];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModelPublishRecord]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLModelPublishRecord]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelPublishRecord] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Model Publish Records */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelPublishRecord] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLModelScoringBinding */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RecordProcessID in table MLModelScoringBinding
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelScoringBinding_RecordProcessID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelScoringBinding]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelScoringBinding]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'RecordProcessID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelScoringBinding_RecordProcessID ON [${flyway:defaultSchema}].[MLModelScoringBinding] ([RecordProcessID]);

-- Index for foreign key TargetEntityID in table MLModelScoringBinding
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelScoringBinding_TargetEntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelScoringBinding]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelScoringBinding]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'TargetEntityID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelScoringBinding_TargetEntityID ON [${flyway:defaultSchema}].[MLModelScoringBinding] ([TargetEntityID]);

-- Index for foreign key MLTrainingPipelineID in table MLModelScoringBinding
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelScoringBinding_MLTrainingPipelineID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelScoringBinding]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelScoringBinding]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'MLTrainingPipelineID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelScoringBinding_MLTrainingPipelineID ON [${flyway:defaultSchema}].[MLModelScoringBinding] ([MLTrainingPipelineID]);

-- Index for foreign key ViewAuthorizationID in table MLModelScoringBinding
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModelScoringBinding_ViewAuthorizationID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelScoringBinding]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModelScoringBinding]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ViewAuthorizationID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModelScoringBinding_ViewAuthorizationID ON [${flyway:defaultSchema}].[MLModelScoringBinding] ([ViewAuthorizationID]);

/* Base View SQL for MJ: ML Model Scoring Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: vwMLModelScoringBindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Model Scoring Bindings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLModelScoringBinding
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLModelScoringBindings]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLModelScoringBindings];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLModelScoringBindings]
AS
SELECT
    m.*,
    MJRecordProcess_RecordProcessID.[Name] AS [RecordProcess],
    MJEntity_TargetEntityID.[Name] AS [TargetEntity],
    MJMLTrainingPipeline_MLTrainingPipelineID.[Name] AS [MLTrainingPipeline],
    MJAuthorization_ViewAuthorizationID.[Name] AS [ViewAuthorization]
FROM
    [${flyway:defaultSchema}].[MLModelScoringBinding] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RecordProcess] AS MJRecordProcess_RecordProcessID
  ON
    [m].[RecordProcessID] = MJRecordProcess_RecordProcessID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_TargetEntityID
  ON
    [m].[TargetEntityID] = MJEntity_TargetEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_MLTrainingPipelineID
  ON
    [m].[MLTrainingPipelineID] = MJMLTrainingPipeline_MLTrainingPipelineID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Authorization] AS MJAuthorization_ViewAuthorizationID
  ON
    [m].[ViewAuthorizationID] = MJAuthorization_ViewAuthorizationID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelScoringBindings] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelScoringBindings] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelScoringBindings] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModelScoringBindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Model Scoring Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: Permissions for vwMLModelScoringBindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelScoringBindings] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelScoringBindings] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModelScoringBindings] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModelScoringBindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Model Scoring Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: spCreateMLModelScoringBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLModelScoringBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLModelScoringBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLModelScoringBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLModelScoringBinding]
    @ID uniqueidentifier = NULL,
    @RecordProcessID_Clear bit = 0,
    @RecordProcessID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetColumn_Clear bit = 0,
    @TargetColumn nvarchar(255) = NULL,
    @Mode nvarchar(20) = NULL,
    @LastScoredAt_Clear bit = 0,
    @LastScoredAt datetimeoffset = NULL,
    @LastRowCount_Clear bit = 0,
    @LastRowCount int = NULL,
    @MLTrainingPipelineID uniqueidentifier,
    @FeatureName nvarchar(255),
    @TargetColumnSource_Clear bit = 0,
    @TargetColumnSource nvarchar(255) = NULL,
    @Status nvarchar(20) = NULL,
    @ViewAuthorizationID_Clear bit = 0,
    @ViewAuthorizationID uniqueidentifier = NULL,
    @RetentionDays_Clear bit = 0,
    @RetentionDays int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLModelScoringBinding]
            (
                [ID],
                [RecordProcessID],
                [TargetEntityID],
                [TargetColumn],
                [Mode],
                [LastScoredAt],
                [LastRowCount],
                [MLTrainingPipelineID],
                [FeatureName],
                [TargetColumnSource],
                [Status],
                [ViewAuthorizationID],
                [RetentionDays]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetColumn_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumn, NULL) END,
                ISNULL(@Mode, 'OnDemand'),
                CASE WHEN @LastScoredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastScoredAt, NULL) END,
                CASE WHEN @LastRowCount_Clear = 1 THEN NULL ELSE ISNULL(@LastRowCount, NULL) END,
                @MLTrainingPipelineID,
                @FeatureName,
                CASE WHEN @TargetColumnSource_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumnSource, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @ViewAuthorizationID_Clear = 1 THEN NULL ELSE ISNULL(@ViewAuthorizationID, NULL) END,
                CASE WHEN @RetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@RetentionDays, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLModelScoringBinding]
            (
                [RecordProcessID],
                [TargetEntityID],
                [TargetColumn],
                [Mode],
                [LastScoredAt],
                [LastRowCount],
                [MLTrainingPipelineID],
                [FeatureName],
                [TargetColumnSource],
                [Status],
                [ViewAuthorizationID],
                [RetentionDays]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetColumn_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumn, NULL) END,
                ISNULL(@Mode, 'OnDemand'),
                CASE WHEN @LastScoredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastScoredAt, NULL) END,
                CASE WHEN @LastRowCount_Clear = 1 THEN NULL ELSE ISNULL(@LastRowCount, NULL) END,
                @MLTrainingPipelineID,
                @FeatureName,
                CASE WHEN @TargetColumnSource_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumnSource, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @ViewAuthorizationID_Clear = 1 THEN NULL ELSE ISNULL(@ViewAuthorizationID, NULL) END,
                CASE WHEN @RetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@RetentionDays, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLModelScoringBindings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelScoringBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelScoringBinding] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Model Scoring Bindings */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelScoringBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelScoringBinding] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Model Scoring Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: spUpdateMLModelScoringBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLModelScoringBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLModelScoringBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding]
    @ID uniqueidentifier,
    @RecordProcessID_Clear bit = 0,
    @RecordProcessID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetColumn_Clear bit = 0,
    @TargetColumn nvarchar(255) = NULL,
    @Mode nvarchar(20) = NULL,
    @LastScoredAt_Clear bit = 0,
    @LastScoredAt datetimeoffset = NULL,
    @LastRowCount_Clear bit = 0,
    @LastRowCount int = NULL,
    @MLTrainingPipelineID uniqueidentifier = NULL,
    @FeatureName nvarchar(255) = NULL,
    @TargetColumnSource_Clear bit = 0,
    @TargetColumnSource nvarchar(255) = NULL,
    @Status nvarchar(20) = NULL,
    @ViewAuthorizationID_Clear bit = 0,
    @ViewAuthorizationID uniqueidentifier = NULL,
    @RetentionDays_Clear bit = 0,
    @RetentionDays int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLModelScoringBinding]
    SET
        [RecordProcessID] = CASE WHEN @RecordProcessID_Clear = 1 THEN NULL ELSE ISNULL(@RecordProcessID, [RecordProcessID]) END,
        [TargetEntityID] = CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, [TargetEntityID]) END,
        [TargetColumn] = CASE WHEN @TargetColumn_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumn, [TargetColumn]) END,
        [Mode] = ISNULL(@Mode, [Mode]),
        [LastScoredAt] = CASE WHEN @LastScoredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastScoredAt, [LastScoredAt]) END,
        [LastRowCount] = CASE WHEN @LastRowCount_Clear = 1 THEN NULL ELSE ISNULL(@LastRowCount, [LastRowCount]) END,
        [MLTrainingPipelineID] = ISNULL(@MLTrainingPipelineID, [MLTrainingPipelineID]),
        [FeatureName] = ISNULL(@FeatureName, [FeatureName]),
        [TargetColumnSource] = CASE WHEN @TargetColumnSource_Clear = 1 THEN NULL ELSE ISNULL(@TargetColumnSource, [TargetColumnSource]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ViewAuthorizationID] = CASE WHEN @ViewAuthorizationID_Clear = 1 THEN NULL ELSE ISNULL(@ViewAuthorizationID, [ViewAuthorizationID]) END,
        [RetentionDays] = CASE WHEN @RetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@RetentionDays, [RetentionDays]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLModelScoringBindings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLModelScoringBindings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLModelScoringBinding table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLModelScoringBinding]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLModelScoringBinding];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLModelScoringBinding
ON [${flyway:defaultSchema}].[MLModelScoringBinding]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[MLModelScoringBinding]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[MLModelScoringBinding] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ: ML Model Scoring Bindings */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Model Scoring Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Model Scoring Bindings
-- Item: spDeleteMLModelScoringBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLModelScoringBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLModelScoringBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLModelScoringBinding]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Model Scoring Bindings */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModelScoringBinding] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLModel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PipelineID in table MLModel
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_PipelineID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'PipelineID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_PipelineID ON [${flyway:defaultSchema}].[MLModel] ([PipelineID]);

-- Index for foreign key AlgorithmID in table MLModel
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_AlgorithmID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'AlgorithmID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_AlgorithmID ON [${flyway:defaultSchema}].[MLModel] ([AlgorithmID]);

-- Index for foreign key ArtifactFileID in table MLModel
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_ArtifactFileID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ArtifactFileID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_ArtifactFileID ON [${flyway:defaultSchema}].[MLModel] ([ArtifactFileID]);

-- Index for foreign key PredictionUnitID in table MLModel
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_PredictionUnitID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'PredictionUnitID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_PredictionUnitID ON [${flyway:defaultSchema}].[MLModel] ([PredictionUnitID]);

-- Index for foreign key EvaluationProtocolID in table MLModel
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_EvaluationProtocolID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'EvaluationProtocolID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_EvaluationProtocolID ON [${flyway:defaultSchema}].[MLModel] ([EvaluationProtocolID]);

-- Index for foreign key TrainingSnapshotID in table MLModel
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_TrainingSnapshotID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'TrainingSnapshotID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_TrainingSnapshotID ON [${flyway:defaultSchema}].[MLModel] ([TrainingSnapshotID]);

-- Index for foreign key TrainingRunID in table MLModel
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_TrainingRunID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'TrainingRunID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_TrainingRunID ON [${flyway:defaultSchema}].[MLModel] ([TrainingRunID]);

/* Base View SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: vwMLModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Models
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLModels]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLModels];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLModels]
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID.[Name] AS [Pipeline],
    MJMLAlgorithm_AlgorithmID.[Name] AS [Algorithm],
    MJFile_ArtifactFileID.[Name] AS [ArtifactFile],
    MJMLPredictionUnit_PredictionUnitID.[Name] AS [PredictionUnit],
    MJMLEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol],
    MJMLTrainingSnapshot_TrainingSnapshotID.[ContentHash] AS [TrainingSnapshot]
FROM
    [${flyway:defaultSchema}].[MLModel] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_PipelineID
  ON
    [m].[PipelineID] = MJMLTrainingPipeline_PipelineID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_ArtifactFileID
  ON
    [m].[ArtifactFileID] = MJFile_ArtifactFileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLPredictionUnit] AS MJMLPredictionUnit_PredictionUnitID
  ON
    [m].[PredictionUnitID] = MJMLPredictionUnit_PredictionUnitID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJMLEvaluationProtocol_EvaluationProtocolID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLTrainingSnapshot] AS MJMLTrainingSnapshot_TrainingSnapshotID
  ON
    [m].[TrainingSnapshotID] = MJMLTrainingSnapshot_TrainingSnapshotID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModels] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModels] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModels] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: Permissions for vwMLModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModels] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModels] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLModels] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: spCreateMLModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLModel]
    @ID uniqueidentifier = NULL,
    @PipelineID uniqueidentifier,
    @Version int = NULL,
    @AlgorithmID uniqueidentifier,
    @ArtifactFileID_Clear bit = 0,
    @ArtifactFileID uniqueidentifier = NULL,
    @FittedPreprocessing_Clear bit = 0,
    @FittedPreprocessing nvarchar(MAX) = NULL,
    @FeatureSchema nvarchar(MAX),
    @TargetVariable nvarchar(500),
    @ProblemType nvarchar(20),
    @Metrics_Clear bit = 0,
    @Metrics nvarchar(MAX) = NULL,
    @HoldoutMetrics_Clear bit = 0,
    @HoldoutMetrics nvarchar(MAX) = NULL,
    @FeatureImportance_Clear bit = 0,
    @FeatureImportance nvarchar(MAX) = NULL,
    @Lineage_Clear bit = 0,
    @Lineage nvarchar(MAX) = NULL,
    @TrainedAt_Clear bit = 0,
    @TrainedAt datetimeoffset = NULL,
    @TrainingDurationSec_Clear bit = 0,
    @TrainingDurationSec int = NULL,
    @TrainingRowCount_Clear bit = 0,
    @TrainingRowCount int = NULL,
    @Status nvarchar(20) = NULL,
    @PredictionUnitID_Clear bit = 0,
    @PredictionUnitID uniqueidentifier = NULL,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL,
    @TrainingSnapshotID_Clear bit = 0,
    @TrainingSnapshotID uniqueidentifier = NULL,
    @TrainingRunID_Clear bit = 0,
    @TrainingRunID uniqueidentifier = NULL,
    @ArtifactSha256_Clear bit = 0,
    @ArtifactSha256 char(64) = NULL,
    @SnapshotHash_Clear bit = 0,
    @SnapshotHash char(64) = NULL,
    @CodeVersion_Clear bit = 0,
    @CodeVersion nvarchar(MAX) = NULL,
    @FeatureSchemaHash_Clear bit = 0,
    @FeatureSchemaHash char(64) = NULL,
    @OutputSemantics_Clear bit = 0,
    @OutputSemantics nvarchar(MAX) = NULL,
    @Delivery_Clear bit = 0,
    @Delivery nvarchar(MAX) = NULL,
    @StatusReason_Clear bit = 0,
    @StatusReason nvarchar(MAX) = NULL,
    @ArtifactStatus nvarchar(20) = NULL,
    @ArtifactCheckedAt_Clear bit = 0,
    @ArtifactCheckedAt datetimeoffset = NULL,
    @ServingWhileUnevaluated bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLModel]
            (
                [ID],
                [PipelineID],
                [Version],
                [AlgorithmID],
                [ArtifactFileID],
                [FittedPreprocessing],
                [FeatureSchema],
                [TargetVariable],
                [ProblemType],
                [Metrics],
                [HoldoutMetrics],
                [FeatureImportance],
                [Lineage],
                [TrainedAt],
                [TrainingDurationSec],
                [TrainingRowCount],
                [Status],
                [PredictionUnitID],
                [EvaluationProtocolID],
                [TrainingSnapshotID],
                [TrainingRunID],
                [ArtifactSha256],
                [SnapshotHash],
                [CodeVersion],
                [FeatureSchemaHash],
                [OutputSemantics],
                [Delivery],
                [StatusReason],
                [ArtifactStatus],
                [ArtifactCheckedAt],
                [ServingWhileUnevaluated]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PipelineID,
                ISNULL(@Version, 1),
                @AlgorithmID,
                CASE WHEN @ArtifactFileID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactFileID, NULL) END,
                CASE WHEN @FittedPreprocessing_Clear = 1 THEN NULL ELSE ISNULL(@FittedPreprocessing, NULL) END,
                @FeatureSchema,
                @TargetVariable,
                @ProblemType,
                CASE WHEN @Metrics_Clear = 1 THEN NULL ELSE ISNULL(@Metrics, NULL) END,
                CASE WHEN @HoldoutMetrics_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetrics, NULL) END,
                CASE WHEN @FeatureImportance_Clear = 1 THEN NULL ELSE ISNULL(@FeatureImportance, NULL) END,
                CASE WHEN @Lineage_Clear = 1 THEN NULL ELSE ISNULL(@Lineage, NULL) END,
                CASE WHEN @TrainedAt_Clear = 1 THEN NULL ELSE ISNULL(@TrainedAt, NULL) END,
                CASE WHEN @TrainingDurationSec_Clear = 1 THEN NULL ELSE ISNULL(@TrainingDurationSec, NULL) END,
                CASE WHEN @TrainingRowCount_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRowCount, NULL) END,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @PredictionUnitID_Clear = 1 THEN NULL ELSE ISNULL(@PredictionUnitID, NULL) END,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END,
                CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, NULL) END,
                CASE WHEN @TrainingRunID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRunID, NULL) END,
                CASE WHEN @ArtifactSha256_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactSha256, NULL) END,
                CASE WHEN @SnapshotHash_Clear = 1 THEN NULL ELSE ISNULL(@SnapshotHash, NULL) END,
                CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, NULL) END,
                CASE WHEN @FeatureSchemaHash_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSchemaHash, NULL) END,
                CASE WHEN @OutputSemantics_Clear = 1 THEN NULL ELSE ISNULL(@OutputSemantics, NULL) END,
                CASE WHEN @Delivery_Clear = 1 THEN NULL ELSE ISNULL(@Delivery, NULL) END,
                CASE WHEN @StatusReason_Clear = 1 THEN NULL ELSE ISNULL(@StatusReason, NULL) END,
                ISNULL(@ArtifactStatus, 'unverified'),
                CASE WHEN @ArtifactCheckedAt_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactCheckedAt, NULL) END,
                ISNULL(@ServingWhileUnevaluated, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLModel]
            (
                [PipelineID],
                [Version],
                [AlgorithmID],
                [ArtifactFileID],
                [FittedPreprocessing],
                [FeatureSchema],
                [TargetVariable],
                [ProblemType],
                [Metrics],
                [HoldoutMetrics],
                [FeatureImportance],
                [Lineage],
                [TrainedAt],
                [TrainingDurationSec],
                [TrainingRowCount],
                [Status],
                [PredictionUnitID],
                [EvaluationProtocolID],
                [TrainingSnapshotID],
                [TrainingRunID],
                [ArtifactSha256],
                [SnapshotHash],
                [CodeVersion],
                [FeatureSchemaHash],
                [OutputSemantics],
                [Delivery],
                [StatusReason],
                [ArtifactStatus],
                [ArtifactCheckedAt],
                [ServingWhileUnevaluated]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PipelineID,
                ISNULL(@Version, 1),
                @AlgorithmID,
                CASE WHEN @ArtifactFileID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactFileID, NULL) END,
                CASE WHEN @FittedPreprocessing_Clear = 1 THEN NULL ELSE ISNULL(@FittedPreprocessing, NULL) END,
                @FeatureSchema,
                @TargetVariable,
                @ProblemType,
                CASE WHEN @Metrics_Clear = 1 THEN NULL ELSE ISNULL(@Metrics, NULL) END,
                CASE WHEN @HoldoutMetrics_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetrics, NULL) END,
                CASE WHEN @FeatureImportance_Clear = 1 THEN NULL ELSE ISNULL(@FeatureImportance, NULL) END,
                CASE WHEN @Lineage_Clear = 1 THEN NULL ELSE ISNULL(@Lineage, NULL) END,
                CASE WHEN @TrainedAt_Clear = 1 THEN NULL ELSE ISNULL(@TrainedAt, NULL) END,
                CASE WHEN @TrainingDurationSec_Clear = 1 THEN NULL ELSE ISNULL(@TrainingDurationSec, NULL) END,
                CASE WHEN @TrainingRowCount_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRowCount, NULL) END,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @PredictionUnitID_Clear = 1 THEN NULL ELSE ISNULL(@PredictionUnitID, NULL) END,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END,
                CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, NULL) END,
                CASE WHEN @TrainingRunID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRunID, NULL) END,
                CASE WHEN @ArtifactSha256_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactSha256, NULL) END,
                CASE WHEN @SnapshotHash_Clear = 1 THEN NULL ELSE ISNULL(@SnapshotHash, NULL) END,
                CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, NULL) END,
                CASE WHEN @FeatureSchemaHash_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSchemaHash, NULL) END,
                CASE WHEN @OutputSemantics_Clear = 1 THEN NULL ELSE ISNULL(@OutputSemantics, NULL) END,
                CASE WHEN @Delivery_Clear = 1 THEN NULL ELSE ISNULL(@Delivery, NULL) END,
                CASE WHEN @StatusReason_Clear = 1 THEN NULL ELSE ISNULL(@StatusReason, NULL) END,
                ISNULL(@ArtifactStatus, 'unverified'),
                CASE WHEN @ArtifactCheckedAt_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactCheckedAt, NULL) END,
                ISNULL(@ServingWhileUnevaluated, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModel] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModel] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModel] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Models */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModel] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModel] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModel] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: spUpdateMLModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModel]
    @ID uniqueidentifier,
    @PipelineID uniqueidentifier = NULL,
    @Version int = NULL,
    @AlgorithmID uniqueidentifier = NULL,
    @ArtifactFileID_Clear bit = 0,
    @ArtifactFileID uniqueidentifier = NULL,
    @FittedPreprocessing_Clear bit = 0,
    @FittedPreprocessing nvarchar(MAX) = NULL,
    @FeatureSchema nvarchar(MAX) = NULL,
    @TargetVariable nvarchar(500) = NULL,
    @ProblemType nvarchar(20) = NULL,
    @Metrics_Clear bit = 0,
    @Metrics nvarchar(MAX) = NULL,
    @HoldoutMetrics_Clear bit = 0,
    @HoldoutMetrics nvarchar(MAX) = NULL,
    @FeatureImportance_Clear bit = 0,
    @FeatureImportance nvarchar(MAX) = NULL,
    @Lineage_Clear bit = 0,
    @Lineage nvarchar(MAX) = NULL,
    @TrainedAt_Clear bit = 0,
    @TrainedAt datetimeoffset = NULL,
    @TrainingDurationSec_Clear bit = 0,
    @TrainingDurationSec int = NULL,
    @TrainingRowCount_Clear bit = 0,
    @TrainingRowCount int = NULL,
    @Status nvarchar(20) = NULL,
    @PredictionUnitID_Clear bit = 0,
    @PredictionUnitID uniqueidentifier = NULL,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL,
    @TrainingSnapshotID_Clear bit = 0,
    @TrainingSnapshotID uniqueidentifier = NULL,
    @TrainingRunID_Clear bit = 0,
    @TrainingRunID uniqueidentifier = NULL,
    @ArtifactSha256_Clear bit = 0,
    @ArtifactSha256 char(64) = NULL,
    @SnapshotHash_Clear bit = 0,
    @SnapshotHash char(64) = NULL,
    @CodeVersion_Clear bit = 0,
    @CodeVersion nvarchar(MAX) = NULL,
    @FeatureSchemaHash_Clear bit = 0,
    @FeatureSchemaHash char(64) = NULL,
    @OutputSemantics_Clear bit = 0,
    @OutputSemantics nvarchar(MAX) = NULL,
    @Delivery_Clear bit = 0,
    @Delivery nvarchar(MAX) = NULL,
    @StatusReason_Clear bit = 0,
    @StatusReason nvarchar(MAX) = NULL,
    @ArtifactStatus nvarchar(20) = NULL,
    @ArtifactCheckedAt_Clear bit = 0,
    @ArtifactCheckedAt datetimeoffset = NULL,
    @ServingWhileUnevaluated bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLModel]
    SET
        [PipelineID] = ISNULL(@PipelineID, [PipelineID]),
        [Version] = ISNULL(@Version, [Version]),
        [AlgorithmID] = ISNULL(@AlgorithmID, [AlgorithmID]),
        [ArtifactFileID] = CASE WHEN @ArtifactFileID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactFileID, [ArtifactFileID]) END,
        [FittedPreprocessing] = CASE WHEN @FittedPreprocessing_Clear = 1 THEN NULL ELSE ISNULL(@FittedPreprocessing, [FittedPreprocessing]) END,
        [FeatureSchema] = ISNULL(@FeatureSchema, [FeatureSchema]),
        [TargetVariable] = ISNULL(@TargetVariable, [TargetVariable]),
        [ProblemType] = ISNULL(@ProblemType, [ProblemType]),
        [Metrics] = CASE WHEN @Metrics_Clear = 1 THEN NULL ELSE ISNULL(@Metrics, [Metrics]) END,
        [HoldoutMetrics] = CASE WHEN @HoldoutMetrics_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetrics, [HoldoutMetrics]) END,
        [FeatureImportance] = CASE WHEN @FeatureImportance_Clear = 1 THEN NULL ELSE ISNULL(@FeatureImportance, [FeatureImportance]) END,
        [Lineage] = CASE WHEN @Lineage_Clear = 1 THEN NULL ELSE ISNULL(@Lineage, [Lineage]) END,
        [TrainedAt] = CASE WHEN @TrainedAt_Clear = 1 THEN NULL ELSE ISNULL(@TrainedAt, [TrainedAt]) END,
        [TrainingDurationSec] = CASE WHEN @TrainingDurationSec_Clear = 1 THEN NULL ELSE ISNULL(@TrainingDurationSec, [TrainingDurationSec]) END,
        [TrainingRowCount] = CASE WHEN @TrainingRowCount_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRowCount, [TrainingRowCount]) END,
        [Status] = ISNULL(@Status, [Status]),
        [PredictionUnitID] = CASE WHEN @PredictionUnitID_Clear = 1 THEN NULL ELSE ISNULL(@PredictionUnitID, [PredictionUnitID]) END,
        [EvaluationProtocolID] = CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, [EvaluationProtocolID]) END,
        [TrainingSnapshotID] = CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, [TrainingSnapshotID]) END,
        [TrainingRunID] = CASE WHEN @TrainingRunID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRunID, [TrainingRunID]) END,
        [ArtifactSha256] = CASE WHEN @ArtifactSha256_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactSha256, [ArtifactSha256]) END,
        [SnapshotHash] = CASE WHEN @SnapshotHash_Clear = 1 THEN NULL ELSE ISNULL(@SnapshotHash, [SnapshotHash]) END,
        [CodeVersion] = CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, [CodeVersion]) END,
        [FeatureSchemaHash] = CASE WHEN @FeatureSchemaHash_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSchemaHash, [FeatureSchemaHash]) END,
        [OutputSemantics] = CASE WHEN @OutputSemantics_Clear = 1 THEN NULL ELSE ISNULL(@OutputSemantics, [OutputSemantics]) END,
        [Delivery] = CASE WHEN @Delivery_Clear = 1 THEN NULL ELSE ISNULL(@Delivery, [Delivery]) END,
        [StatusReason] = CASE WHEN @StatusReason_Clear = 1 THEN NULL ELSE ISNULL(@StatusReason, [StatusReason]) END,
        [ArtifactStatus] = ISNULL(@ArtifactStatus, [ArtifactStatus]),
        [ArtifactCheckedAt] = CASE WHEN @ArtifactCheckedAt_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactCheckedAt, [ArtifactCheckedAt]) END,
        [ServingWhileUnevaluated] = ISNULL(@ServingWhileUnevaluated, [ServingWhileUnevaluated]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLModels] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLModels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModel] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModel] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLModel table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLModel]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLModel];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLModel
ON [${flyway:defaultSchema}].[MLModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[MLModel]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[MLModel] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ: ML Models */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModel] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModel] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModel] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: spDeleteMLModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLModel]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModel] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModel] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModel] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Models */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModel] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModel] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModel] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLMonitoringResult */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Monitoring Results
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table MLMonitoringResult
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLMonitoringResult_ModelID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLMonitoringResult]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLMonitoringResult]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ModelID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLMonitoringResult_ModelID ON [${flyway:defaultSchema}].[MLMonitoringResult] ([ModelID]);

-- Index for foreign key ScheduledJobRunID in table MLMonitoringResult
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLMonitoringResult_ScheduledJobRunID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLMonitoringResult]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLMonitoringResult]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ScheduledJobRunID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLMonitoringResult_ScheduledJobRunID ON [${flyway:defaultSchema}].[MLMonitoringResult] ([ScheduledJobRunID]);

-- Index for foreign key ChallengerRunID in table MLMonitoringResult
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLMonitoringResult_ChallengerRunID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLMonitoringResult]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLMonitoringResult]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ChallengerRunID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLMonitoringResult_ChallengerRunID ON [${flyway:defaultSchema}].[MLMonitoringResult] ([ChallengerRunID]);

/* Base View SQL for MJ: ML Monitoring Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Monitoring Results
-- Item: vwMLMonitoringResults
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Monitoring Results
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLMonitoringResult
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLMonitoringResults]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLMonitoringResults];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLMonitoringResults]
AS
SELECT
    m.*,
    MJScheduledJobRun_ScheduledJobRunID.[ScheduledJob] AS [ScheduledJobRun]
FROM
    [${flyway:defaultSchema}].[MLMonitoringResult] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwScheduledJobRuns] AS MJScheduledJobRun_ScheduledJobRunID
  ON
    [m].[ScheduledJobRunID] = MJScheduledJobRun_ScheduledJobRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLMonitoringResults] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Monitoring Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Monitoring Results
-- Item: Permissions for vwMLMonitoringResults
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLMonitoringResults] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Monitoring Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Monitoring Results
-- Item: spCreateMLMonitoringResult
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLMonitoringResult
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLMonitoringResult]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLMonitoringResult];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLMonitoringResult]
    @ID uniqueidentifier = NULL,
    @ModelID uniqueidentifier,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @Period date,
    @PeriodGrain nvarchar(10),
    @State nvarchar(20),
    @ScoredRows int = NULL,
    @JoinedRows int = NULL,
    @ExcludedInTrainingRows int = NULL,
    @PrimaryScore_Clear bit = 0,
    @PrimaryScore nvarchar(MAX) = NULL,
    @PrimaryValue_Clear bit = 0,
    @PrimaryValue float(53) = NULL,
    @PrimaryLower_Clear bit = 0,
    @PrimaryLower float(53) = NULL,
    @PrimaryUpper_Clear bit = 0,
    @PrimaryUpper float(53) = NULL,
    @TrackedMetrics_Clear bit = 0,
    @TrackedMetrics nvarchar(MAX) = NULL,
    @Calibration_Clear bit = 0,
    @Calibration nvarchar(MAX) = NULL,
    @DriftLook_Clear bit = 0,
    @DriftLook nvarchar(MAX) = NULL,
    @DriftAlarms nvarchar(MAX) = NULL,
    @Parity_Clear bit = 0,
    @Parity nvarchar(MAX) = NULL,
    @TriggersFired nvarchar(MAX) = NULL,
    @ChallengerRunID_Clear bit = 0,
    @ChallengerRunID uniqueidentifier = NULL,
    @ChallengerResult_Clear bit = 0,
    @ChallengerResult nvarchar(MAX) = NULL,
    @RollbackCheck_Clear bit = 0,
    @RollbackCheck nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLMonitoringResult]
            (
                [ID],
                [ModelID],
                [ScheduledJobRunID],
                [Period],
                [PeriodGrain],
                [State],
                [ScoredRows],
                [JoinedRows],
                [ExcludedInTrainingRows],
                [PrimaryScore],
                [PrimaryValue],
                [PrimaryLower],
                [PrimaryUpper],
                [TrackedMetrics],
                [Calibration],
                [DriftLook],
                [DriftAlarms],
                [Parity],
                [TriggersFired],
                [ChallengerRunID],
                [ChallengerResult],
                [RollbackCheck],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ModelID,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                @Period,
                @PeriodGrain,
                @State,
                ISNULL(@ScoredRows, 0),
                ISNULL(@JoinedRows, 0),
                ISNULL(@ExcludedInTrainingRows, 0),
                CASE WHEN @PrimaryScore_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScore, NULL) END,
                CASE WHEN @PrimaryValue_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryValue, NULL) END,
                CASE WHEN @PrimaryLower_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryLower, NULL) END,
                CASE WHEN @PrimaryUpper_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryUpper, NULL) END,
                CASE WHEN @TrackedMetrics_Clear = 1 THEN NULL ELSE ISNULL(@TrackedMetrics, NULL) END,
                CASE WHEN @Calibration_Clear = 1 THEN NULL ELSE ISNULL(@Calibration, NULL) END,
                CASE WHEN @DriftLook_Clear = 1 THEN NULL ELSE ISNULL(@DriftLook, NULL) END,
                ISNULL(@DriftAlarms, '[]'),
                CASE WHEN @Parity_Clear = 1 THEN NULL ELSE ISNULL(@Parity, NULL) END,
                ISNULL(@TriggersFired, '[]'),
                CASE WHEN @ChallengerRunID_Clear = 1 THEN NULL ELSE ISNULL(@ChallengerRunID, NULL) END,
                CASE WHEN @ChallengerResult_Clear = 1 THEN NULL ELSE ISNULL(@ChallengerResult, NULL) END,
                CASE WHEN @RollbackCheck_Clear = 1 THEN NULL ELSE ISNULL(@RollbackCheck, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLMonitoringResult]
            (
                [ModelID],
                [ScheduledJobRunID],
                [Period],
                [PeriodGrain],
                [State],
                [ScoredRows],
                [JoinedRows],
                [ExcludedInTrainingRows],
                [PrimaryScore],
                [PrimaryValue],
                [PrimaryLower],
                [PrimaryUpper],
                [TrackedMetrics],
                [Calibration],
                [DriftLook],
                [DriftAlarms],
                [Parity],
                [TriggersFired],
                [ChallengerRunID],
                [ChallengerResult],
                [RollbackCheck],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ModelID,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                @Period,
                @PeriodGrain,
                @State,
                ISNULL(@ScoredRows, 0),
                ISNULL(@JoinedRows, 0),
                ISNULL(@ExcludedInTrainingRows, 0),
                CASE WHEN @PrimaryScore_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScore, NULL) END,
                CASE WHEN @PrimaryValue_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryValue, NULL) END,
                CASE WHEN @PrimaryLower_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryLower, NULL) END,
                CASE WHEN @PrimaryUpper_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryUpper, NULL) END,
                CASE WHEN @TrackedMetrics_Clear = 1 THEN NULL ELSE ISNULL(@TrackedMetrics, NULL) END,
                CASE WHEN @Calibration_Clear = 1 THEN NULL ELSE ISNULL(@Calibration, NULL) END,
                CASE WHEN @DriftLook_Clear = 1 THEN NULL ELSE ISNULL(@DriftLook, NULL) END,
                ISNULL(@DriftAlarms, '[]'),
                CASE WHEN @Parity_Clear = 1 THEN NULL ELSE ISNULL(@Parity, NULL) END,
                ISNULL(@TriggersFired, '[]'),
                CASE WHEN @ChallengerRunID_Clear = 1 THEN NULL ELSE ISNULL(@ChallengerRunID, NULL) END,
                CASE WHEN @ChallengerResult_Clear = 1 THEN NULL ELSE ISNULL(@ChallengerResult, NULL) END,
                CASE WHEN @RollbackCheck_Clear = 1 THEN NULL ELSE ISNULL(@RollbackCheck, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLMonitoringResults] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLMonitoringResult] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Monitoring Results */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLMonitoringResult] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Monitoring Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Monitoring Results
-- Item: spUpdateMLMonitoringResult
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLMonitoringResult
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLMonitoringResult]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLMonitoringResult];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLMonitoringResult]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @Period date = NULL,
    @PeriodGrain nvarchar(10) = NULL,
    @State nvarchar(20) = NULL,
    @ScoredRows int = NULL,
    @JoinedRows int = NULL,
    @ExcludedInTrainingRows int = NULL,
    @PrimaryScore_Clear bit = 0,
    @PrimaryScore nvarchar(MAX) = NULL,
    @PrimaryValue_Clear bit = 0,
    @PrimaryValue float(53) = NULL,
    @PrimaryLower_Clear bit = 0,
    @PrimaryLower float(53) = NULL,
    @PrimaryUpper_Clear bit = 0,
    @PrimaryUpper float(53) = NULL,
    @TrackedMetrics_Clear bit = 0,
    @TrackedMetrics nvarchar(MAX) = NULL,
    @Calibration_Clear bit = 0,
    @Calibration nvarchar(MAX) = NULL,
    @DriftLook_Clear bit = 0,
    @DriftLook nvarchar(MAX) = NULL,
    @DriftAlarms nvarchar(MAX) = NULL,
    @Parity_Clear bit = 0,
    @Parity nvarchar(MAX) = NULL,
    @TriggersFired nvarchar(MAX) = NULL,
    @ChallengerRunID_Clear bit = 0,
    @ChallengerRunID uniqueidentifier = NULL,
    @ChallengerResult_Clear bit = 0,
    @ChallengerResult nvarchar(MAX) = NULL,
    @RollbackCheck_Clear bit = 0,
    @RollbackCheck nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLMonitoringResult]
    SET
        [ModelID] = ISNULL(@ModelID, [ModelID]),
        [ScheduledJobRunID] = CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, [ScheduledJobRunID]) END,
        [Period] = ISNULL(@Period, [Period]),
        [PeriodGrain] = ISNULL(@PeriodGrain, [PeriodGrain]),
        [State] = ISNULL(@State, [State]),
        [ScoredRows] = ISNULL(@ScoredRows, [ScoredRows]),
        [JoinedRows] = ISNULL(@JoinedRows, [JoinedRows]),
        [ExcludedInTrainingRows] = ISNULL(@ExcludedInTrainingRows, [ExcludedInTrainingRows]),
        [PrimaryScore] = CASE WHEN @PrimaryScore_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScore, [PrimaryScore]) END,
        [PrimaryValue] = CASE WHEN @PrimaryValue_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryValue, [PrimaryValue]) END,
        [PrimaryLower] = CASE WHEN @PrimaryLower_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryLower, [PrimaryLower]) END,
        [PrimaryUpper] = CASE WHEN @PrimaryUpper_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryUpper, [PrimaryUpper]) END,
        [TrackedMetrics] = CASE WHEN @TrackedMetrics_Clear = 1 THEN NULL ELSE ISNULL(@TrackedMetrics, [TrackedMetrics]) END,
        [Calibration] = CASE WHEN @Calibration_Clear = 1 THEN NULL ELSE ISNULL(@Calibration, [Calibration]) END,
        [DriftLook] = CASE WHEN @DriftLook_Clear = 1 THEN NULL ELSE ISNULL(@DriftLook, [DriftLook]) END,
        [DriftAlarms] = ISNULL(@DriftAlarms, [DriftAlarms]),
        [Parity] = CASE WHEN @Parity_Clear = 1 THEN NULL ELSE ISNULL(@Parity, [Parity]) END,
        [TriggersFired] = ISNULL(@TriggersFired, [TriggersFired]),
        [ChallengerRunID] = CASE WHEN @ChallengerRunID_Clear = 1 THEN NULL ELSE ISNULL(@ChallengerRunID, [ChallengerRunID]) END,
        [ChallengerResult] = CASE WHEN @ChallengerResult_Clear = 1 THEN NULL ELSE ISNULL(@ChallengerResult, [ChallengerResult]) END,
        [RollbackCheck] = CASE WHEN @RollbackCheck_Clear = 1 THEN NULL ELSE ISNULL(@RollbackCheck, [RollbackCheck]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLMonitoringResults] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLMonitoringResults]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLMonitoringResult] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLMonitoringResult table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLMonitoringResult]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLMonitoringResult];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLMonitoringResult
ON [${flyway:defaultSchema}].[MLMonitoringResult]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[MLMonitoringResult]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[MLMonitoringResult] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ: ML Monitoring Results */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLMonitoringResult] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Monitoring Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Monitoring Results
-- Item: spDeleteMLMonitoringResult
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLMonitoringResult
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLMonitoringResult]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLMonitoringResult];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLMonitoringResult]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLMonitoringResult]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLMonitoringResult] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Monitoring Results */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLMonitoringResult] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLOutputBinding */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Output Bindings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table MLOutputBinding
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLOutputBinding_ModelID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLOutputBinding]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLOutputBinding]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ModelID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLOutputBinding_ModelID ON [${flyway:defaultSchema}].[MLOutputBinding] ([ModelID]);

/* Base View SQL for MJ: ML Output Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Output Bindings
-- Item: vwMLOutputBindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Output Bindings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLOutputBinding
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLOutputBindings]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLOutputBindings];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLOutputBindings]
AS
SELECT
    m.*
FROM
    [${flyway:defaultSchema}].[MLOutputBinding] AS m
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLOutputBindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Output Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Output Bindings
-- Item: Permissions for vwMLOutputBindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLOutputBindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Output Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Output Bindings
-- Item: spCreateMLOutputBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLOutputBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLOutputBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLOutputBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLOutputBinding]
    @ID uniqueidentifier = NULL,
    @ModelID uniqueidentifier,
    @Surface nvarchar(30),
    @SortsBy nvarchar(30),
    @DriverDirectionRelativeTo nvarchar(20),
    @Label nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLOutputBinding]
            (
                [ID],
                [ModelID],
                [Surface],
                [SortsBy],
                [DriverDirectionRelativeTo],
                [Label]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ModelID,
                @Surface,
                @SortsBy,
                @DriverDirectionRelativeTo,
                @Label
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLOutputBinding]
            (
                [ModelID],
                [Surface],
                [SortsBy],
                [DriverDirectionRelativeTo],
                [Label]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ModelID,
                @Surface,
                @SortsBy,
                @DriverDirectionRelativeTo,
                @Label
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLOutputBindings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLOutputBinding] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Output Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLOutputBinding] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Output Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Output Bindings
-- Item: spUpdateMLOutputBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLOutputBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLOutputBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLOutputBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLOutputBinding]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier = NULL,
    @Surface nvarchar(30) = NULL,
    @SortsBy nvarchar(30) = NULL,
    @DriverDirectionRelativeTo nvarchar(20) = NULL,
    @Label nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLOutputBinding]
    SET
        [ModelID] = ISNULL(@ModelID, [ModelID]),
        [Surface] = ISNULL(@Surface, [Surface]),
        [SortsBy] = ISNULL(@SortsBy, [SortsBy]),
        [DriverDirectionRelativeTo] = ISNULL(@DriverDirectionRelativeTo, [DriverDirectionRelativeTo]),
        [Label] = ISNULL(@Label, [Label]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLOutputBindings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLOutputBindings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLOutputBinding] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLOutputBinding table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLOutputBinding]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLOutputBinding];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLOutputBinding
ON [${flyway:defaultSchema}].[MLOutputBinding]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[MLOutputBinding]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[MLOutputBinding] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ: ML Output Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLOutputBinding] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Output Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Output Bindings
-- Item: spDeleteMLOutputBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLOutputBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLOutputBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLOutputBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLOutputBinding]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLOutputBinding]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLOutputBinding] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Output Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLOutputBinding] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLScoringRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Scoring Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table MLScoringRun
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_ModelID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ModelID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_ModelID ON [${flyway:defaultSchema}].[MLScoringRun] ([ModelID]);

-- Index for foreign key MLModelScoringBindingID in table MLScoringRun
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_MLModelScoringBindingID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'MLModelScoringBindingID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_MLModelScoringBindingID ON [${flyway:defaultSchema}].[MLScoringRun] ([MLModelScoringBindingID]);

-- Index for foreign key ScopeEntityID in table MLScoringRun
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_ScopeEntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ScopeEntityID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_ScopeEntityID ON [${flyway:defaultSchema}].[MLScoringRun] ([ScopeEntityID]);

-- Index for foreign key RequestedByUserID in table MLScoringRun
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_RequestedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'RequestedByUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_RequestedByUserID ON [${flyway:defaultSchema}].[MLScoringRun] ([RequestedByUserID]);

-- Index for foreign key ProcessRunID in table MLScoringRun
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_ProcessRunID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ProcessRunID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_ProcessRunID ON [${flyway:defaultSchema}].[MLScoringRun] ([ProcessRunID]);

-- Index for foreign key ScheduledJobRunID in table MLScoringRun
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLScoringRun_ScheduledJobRunID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLScoringRun]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ScheduledJobRunID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLScoringRun_ScheduledJobRunID ON [${flyway:defaultSchema}].[MLScoringRun] ([ScheduledJobRunID]);

/* Base View SQL for MJ: ML Scoring Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Scoring Runs
-- Item: vwMLScoringRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Scoring Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLScoringRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLScoringRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLScoringRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLScoringRuns]
AS
SELECT
    m.*,
    MJMLModelScoringBinding_MLModelScoringBindingID.[TargetColumn] AS [MLModelScoringBinding],
    MJEntity_ScopeEntityID.[Name] AS [ScopeEntity],
    MJUser_RequestedByUserID.[Name] AS [RequestedByUser],
    MJScheduledJobRun_ScheduledJobRunID.[ScheduledJob] AS [ScheduledJobRun]
FROM
    [${flyway:defaultSchema}].[MLScoringRun] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLModelScoringBinding] AS MJMLModelScoringBinding_MLModelScoringBindingID
  ON
    [m].[MLModelScoringBindingID] = MJMLModelScoringBinding_MLModelScoringBindingID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_ScopeEntityID
  ON
    [m].[ScopeEntityID] = MJEntity_ScopeEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_RequestedByUserID
  ON
    [m].[RequestedByUserID] = MJUser_RequestedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwScheduledJobRuns] AS MJScheduledJobRun_ScheduledJobRunID
  ON
    [m].[ScheduledJobRunID] = MJScheduledJobRun_ScheduledJobRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLScoringRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Scoring Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Scoring Runs
-- Item: Permissions for vwMLScoringRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLScoringRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Scoring Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Scoring Runs
-- Item: spCreateMLScoringRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLScoringRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLScoringRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLScoringRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLScoringRun]
    @ID uniqueidentifier = NULL,
    @ModelID_Clear bit = 0,
    @ModelID uniqueidentifier = NULL,
    @ModelVersion_Clear bit = 0,
    @ModelVersion int = NULL,
    @MLModelScoringBindingID_Clear bit = 0,
    @MLModelScoringBindingID uniqueidentifier = NULL,
    @ArtifactSha256_Clear bit = 0,
    @ArtifactSha256 char(64) = NULL,
    @FeatureSchemaHash_Clear bit = 0,
    @FeatureSchemaHash char(64) = NULL,
    @Path nvarchar(20),
    @ScopeKind nvarchar(20),
    @ScopeEntityID uniqueidentifier,
    @Scope nvarchar(MAX),
    @EntityMapping_Clear bit = 0,
    @EntityMapping nvarchar(MAX) = NULL,
    @AsOfDate datetimeoffset,
    @ReadPolicy nvarchar(MAX),
    @DryRun bit = NULL,
    @RequestedBy nvarchar(MAX),
    @RequestedByUserID_Clear bit = 0,
    @RequestedByUserID uniqueidentifier = NULL,
    @ProcessRunID_Clear bit = 0,
    @ProcessRunID uniqueidentifier = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @Refusal_Clear bit = 0,
    @Refusal nvarchar(MAX) = NULL,
    @Total int = NULL,
    @Written int = NULL,
    @Failed int = NULL,
    @Skipped int = NULL,
    @FirstErrors_Clear bit = 0,
    @FirstErrors nvarchar(MAX) = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLScoringRun]
            (
                [ID],
                [ModelID],
                [ModelVersion],
                [MLModelScoringBindingID],
                [ArtifactSha256],
                [FeatureSchemaHash],
                [Path],
                [ScopeKind],
                [ScopeEntityID],
                [Scope],
                [EntityMapping],
                [AsOfDate],
                [ReadPolicy],
                [DryRun],
                [RequestedBy],
                [RequestedByUserID],
                [ProcessRunID],
                [ScheduledJobRunID],
                [Status],
                [Refusal],
                [Total],
                [Written],
                [Failed],
                [Skipped],
                [FirstErrors],
                [StartedAt],
                [EndedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @ModelID_Clear = 1 THEN NULL ELSE ISNULL(@ModelID, NULL) END,
                CASE WHEN @ModelVersion_Clear = 1 THEN NULL ELSE ISNULL(@ModelVersion, NULL) END,
                CASE WHEN @MLModelScoringBindingID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelScoringBindingID, NULL) END,
                CASE WHEN @ArtifactSha256_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactSha256, NULL) END,
                CASE WHEN @FeatureSchemaHash_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSchemaHash, NULL) END,
                @Path,
                @ScopeKind,
                @ScopeEntityID,
                @Scope,
                CASE WHEN @EntityMapping_Clear = 1 THEN NULL ELSE ISNULL(@EntityMapping, NULL) END,
                @AsOfDate,
                @ReadPolicy,
                ISNULL(@DryRun, 0),
                @RequestedBy,
                CASE WHEN @RequestedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@RequestedByUserID, NULL) END,
                CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                ISNULL(@Status, 'running'),
                CASE WHEN @Refusal_Clear = 1 THEN NULL ELSE ISNULL(@Refusal, NULL) END,
                ISNULL(@Total, 0),
                ISNULL(@Written, 0),
                ISNULL(@Failed, 0),
                ISNULL(@Skipped, 0),
                CASE WHEN @FirstErrors_Clear = 1 THEN NULL ELSE ISNULL(@FirstErrors, NULL) END,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLScoringRun]
            (
                [ModelID],
                [ModelVersion],
                [MLModelScoringBindingID],
                [ArtifactSha256],
                [FeatureSchemaHash],
                [Path],
                [ScopeKind],
                [ScopeEntityID],
                [Scope],
                [EntityMapping],
                [AsOfDate],
                [ReadPolicy],
                [DryRun],
                [RequestedBy],
                [RequestedByUserID],
                [ProcessRunID],
                [ScheduledJobRunID],
                [Status],
                [Refusal],
                [Total],
                [Written],
                [Failed],
                [Skipped],
                [FirstErrors],
                [StartedAt],
                [EndedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @ModelID_Clear = 1 THEN NULL ELSE ISNULL(@ModelID, NULL) END,
                CASE WHEN @ModelVersion_Clear = 1 THEN NULL ELSE ISNULL(@ModelVersion, NULL) END,
                CASE WHEN @MLModelScoringBindingID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelScoringBindingID, NULL) END,
                CASE WHEN @ArtifactSha256_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactSha256, NULL) END,
                CASE WHEN @FeatureSchemaHash_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSchemaHash, NULL) END,
                @Path,
                @ScopeKind,
                @ScopeEntityID,
                @Scope,
                CASE WHEN @EntityMapping_Clear = 1 THEN NULL ELSE ISNULL(@EntityMapping, NULL) END,
                @AsOfDate,
                @ReadPolicy,
                ISNULL(@DryRun, 0),
                @RequestedBy,
                CASE WHEN @RequestedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@RequestedByUserID, NULL) END,
                CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                ISNULL(@Status, 'running'),
                CASE WHEN @Refusal_Clear = 1 THEN NULL ELSE ISNULL(@Refusal, NULL) END,
                ISNULL(@Total, 0),
                ISNULL(@Written, 0),
                ISNULL(@Failed, 0),
                ISNULL(@Skipped, 0),
                CASE WHEN @FirstErrors_Clear = 1 THEN NULL ELSE ISNULL(@FirstErrors, NULL) END,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLScoringRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLScoringRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Scoring Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLScoringRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Scoring Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Scoring Runs
-- Item: spUpdateMLScoringRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLScoringRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLScoringRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLScoringRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLScoringRun]
    @ID uniqueidentifier,
    @ModelID_Clear bit = 0,
    @ModelID uniqueidentifier = NULL,
    @ModelVersion_Clear bit = 0,
    @ModelVersion int = NULL,
    @MLModelScoringBindingID_Clear bit = 0,
    @MLModelScoringBindingID uniqueidentifier = NULL,
    @ArtifactSha256_Clear bit = 0,
    @ArtifactSha256 char(64) = NULL,
    @FeatureSchemaHash_Clear bit = 0,
    @FeatureSchemaHash char(64) = NULL,
    @Path nvarchar(20) = NULL,
    @ScopeKind nvarchar(20) = NULL,
    @ScopeEntityID uniqueidentifier = NULL,
    @Scope nvarchar(MAX) = NULL,
    @EntityMapping_Clear bit = 0,
    @EntityMapping nvarchar(MAX) = NULL,
    @AsOfDate datetimeoffset = NULL,
    @ReadPolicy nvarchar(MAX) = NULL,
    @DryRun bit = NULL,
    @RequestedBy nvarchar(MAX) = NULL,
    @RequestedByUserID_Clear bit = 0,
    @RequestedByUserID uniqueidentifier = NULL,
    @ProcessRunID_Clear bit = 0,
    @ProcessRunID uniqueidentifier = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @Refusal_Clear bit = 0,
    @Refusal nvarchar(MAX) = NULL,
    @Total int = NULL,
    @Written int = NULL,
    @Failed int = NULL,
    @Skipped int = NULL,
    @FirstErrors_Clear bit = 0,
    @FirstErrors nvarchar(MAX) = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLScoringRun]
    SET
        [ModelID] = CASE WHEN @ModelID_Clear = 1 THEN NULL ELSE ISNULL(@ModelID, [ModelID]) END,
        [ModelVersion] = CASE WHEN @ModelVersion_Clear = 1 THEN NULL ELSE ISNULL(@ModelVersion, [ModelVersion]) END,
        [MLModelScoringBindingID] = CASE WHEN @MLModelScoringBindingID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelScoringBindingID, [MLModelScoringBindingID]) END,
        [ArtifactSha256] = CASE WHEN @ArtifactSha256_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactSha256, [ArtifactSha256]) END,
        [FeatureSchemaHash] = CASE WHEN @FeatureSchemaHash_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSchemaHash, [FeatureSchemaHash]) END,
        [Path] = ISNULL(@Path, [Path]),
        [ScopeKind] = ISNULL(@ScopeKind, [ScopeKind]),
        [ScopeEntityID] = ISNULL(@ScopeEntityID, [ScopeEntityID]),
        [Scope] = ISNULL(@Scope, [Scope]),
        [EntityMapping] = CASE WHEN @EntityMapping_Clear = 1 THEN NULL ELSE ISNULL(@EntityMapping, [EntityMapping]) END,
        [AsOfDate] = ISNULL(@AsOfDate, [AsOfDate]),
        [ReadPolicy] = ISNULL(@ReadPolicy, [ReadPolicy]),
        [DryRun] = ISNULL(@DryRun, [DryRun]),
        [RequestedBy] = ISNULL(@RequestedBy, [RequestedBy]),
        [RequestedByUserID] = CASE WHEN @RequestedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@RequestedByUserID, [RequestedByUserID]) END,
        [ProcessRunID] = CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, [ProcessRunID]) END,
        [ScheduledJobRunID] = CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, [ScheduledJobRunID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Refusal] = CASE WHEN @Refusal_Clear = 1 THEN NULL ELSE ISNULL(@Refusal, [Refusal]) END,
        [Total] = ISNULL(@Total, [Total]),
        [Written] = ISNULL(@Written, [Written]),
        [Failed] = ISNULL(@Failed, [Failed]),
        [Skipped] = ISNULL(@Skipped, [Skipped]),
        [FirstErrors] = CASE WHEN @FirstErrors_Clear = 1 THEN NULL ELSE ISNULL(@FirstErrors, [FirstErrors]) END,
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLScoringRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLScoringRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLScoringRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLScoringRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLScoringRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLScoringRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLScoringRun
ON [${flyway:defaultSchema}].[MLScoringRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[MLScoringRun]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[MLScoringRun] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ: ML Scoring Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLScoringRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Scoring Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Scoring Runs
-- Item: spDeleteMLScoringRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLScoringRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLScoringRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLScoringRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLScoringRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLScoringRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLScoringRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Scoring Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLScoringRun] TO [cdp_Developer], [cdp_Integration];

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
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxSubAgentConsultRounds int
    DECLARE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools], [MaxSubAgentConsultRounds]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools, @MJAIAgents_ContextCompressionPromptID_MaxSubAgentConsultRounds

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ContextCompressionPromptIDID, @Name = @MJAIAgents_ContextCompressionPromptID_Name, @Description = @MJAIAgents_ContextCompressionPromptID_Description, @LogoURL = @MJAIAgents_ContextCompressionPromptID_LogoURL, @ParentID = @MJAIAgents_ContextCompressionPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ContextCompressionPromptID_TypeID, @Status = @MJAIAgents_ContextCompressionPromptID_Status, @DriverClass = @MJAIAgents_ContextCompressionPromptID_DriverClass, @IconClass = @MJAIAgents_ContextCompressionPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ContextCompressionPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ContextCompressionPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MessageMode = @MJAIAgents_ContextCompressionPromptID_MessageMode, @MaxMessages = @MJAIAgents_ContextCompressionPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ContextCompressionPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools, @MaxSubAgentConsultRounds = @MJAIAgents_ContextCompressionPromptID_MaxSubAgentConsultRounds

        FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools, @MJAIAgents_ContextCompressionPromptID_MaxSubAgentConsultRounds
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
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxSubAgentConsultRounds int
    DECLARE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools], [MaxSubAgentConsultRounds]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ConversationSummaryPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools, @MJAIAgents_ConversationSummaryPromptID_MaxSubAgentConsultRounds

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ConversationSummaryPromptIDID, @Name = @MJAIAgents_ConversationSummaryPromptID_Name, @Description = @MJAIAgents_ConversationSummaryPromptID_Description, @LogoURL = @MJAIAgents_ConversationSummaryPromptID_LogoURL, @ParentID = @MJAIAgents_ConversationSummaryPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ConversationSummaryPromptID_TypeID, @Status = @MJAIAgents_ConversationSummaryPromptID_Status, @DriverClass = @MJAIAgents_ConversationSummaryPromptID_DriverClass, @IconClass = @MJAIAgents_ConversationSummaryPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MessageMode = @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MaxMessages = @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ConversationSummaryPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @ConversationSummaryPromptID_Clear = 1, @ConversationSummaryPromptID = @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools, @MaxSubAgentConsultRounds = @MJAIAgents_ConversationSummaryPromptID_MaxSubAgentConsultRounds

        FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools, @MJAIAgents_ConversationSummaryPromptID_MaxSubAgentConsultRounds
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
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TimeoutMS int
    DECLARE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [TemplateID], [CategoryID], [TypeID], [Status], [ResponseFormat], [ModelSpecificResponseFormat], [AIModelTypeID], [MinPowerRank], [SelectionStrategy], [PowerPreference], [ParallelizationMode], [ParallelCount], [ParallelConfigParam], [OutputType], [OutputExample], [ValidationBehavior], [MaxRetries], [RetryDelayMS], [RetryStrategy], [ResultSelectorPromptID], [EnableCaching], [CacheTTLSeconds], [CacheMatchType], [CacheSimilarityThreshold], [CacheMustMatchModel], [CacheMustMatchVendor], [CacheMustMatchAgent], [CacheMustMatchConfig], [PromptRole], [PromptPosition], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [IncludeLogProbs], [TopLogProbs], [FailoverStrategy], [FailoverMaxAttempts], [FailoverDelaySeconds], [FailoverModelStrategy], [FailoverErrorScope], [EffortLevel], [AssistantPrefill], [PrefillFallbackMode], [RequireSpecificModels], [PromptConfiguration], [TemplateDataCapture], [TimeoutMS]
        FROM [${flyway:defaultSchema}].[AIPrompt]
        WHERE [ResultSelectorPromptID] = @ID

    OPEN cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture, @MJAIPrompts_ResultSelectorPromptID_TimeoutMS

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPrompt] @ID = @MJAIPrompts_ResultSelectorPromptIDID, @Name = @MJAIPrompts_ResultSelectorPromptID_Name, @Description = @MJAIPrompts_ResultSelectorPromptID_Description, @TemplateID = @MJAIPrompts_ResultSelectorPromptID_TemplateID, @CategoryID = @MJAIPrompts_ResultSelectorPromptID_CategoryID, @TypeID = @MJAIPrompts_ResultSelectorPromptID_TypeID, @Status = @MJAIPrompts_ResultSelectorPromptID_Status, @ResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @ModelSpecificResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @AIModelTypeID = @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MinPowerRank = @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @SelectionStrategy = @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @PowerPreference = @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @ParallelizationMode = @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @ParallelCount = @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @ParallelConfigParam = @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @OutputType = @MJAIPrompts_ResultSelectorPromptID_OutputType, @OutputExample = @MJAIPrompts_ResultSelectorPromptID_OutputExample, @ValidationBehavior = @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MaxRetries = @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @RetryDelayMS = @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @RetryStrategy = @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @ResultSelectorPromptID_Clear = 1, @ResultSelectorPromptID = @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @EnableCaching = @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @CacheTTLSeconds = @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @CacheMatchType = @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @CacheSimilarityThreshold = @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @CacheMustMatchModel = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @CacheMustMatchVendor = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @CacheMustMatchAgent = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @CacheMustMatchConfig = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @PromptRole = @MJAIPrompts_ResultSelectorPromptID_PromptRole, @PromptPosition = @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @Temperature = @MJAIPrompts_ResultSelectorPromptID_Temperature, @TopP = @MJAIPrompts_ResultSelectorPromptID_TopP, @TopK = @MJAIPrompts_ResultSelectorPromptID_TopK, @MinP = @MJAIPrompts_ResultSelectorPromptID_MinP, @FrequencyPenalty = @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @Seed = @MJAIPrompts_ResultSelectorPromptID_Seed, @StopSequences = @MJAIPrompts_ResultSelectorPromptID_StopSequences, @IncludeLogProbs = @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @TopLogProbs = @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @FailoverStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @FailoverMaxAttempts = @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @FailoverDelaySeconds = @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @FailoverModelStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @FailoverErrorScope = @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @EffortLevel = @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @AssistantPrefill = @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @PrefillFallbackMode = @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @RequireSpecificModels = @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @PromptConfiguration = @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @TemplateDataCapture = @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture, @TimeoutMS = @MJAIPrompts_ResultSelectorPromptID_TimeoutMS

        FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture, @MJAIPrompts_ResultSelectorPromptID_TimeoutMS
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
    DECLARE @MJActions_DefaultCompactPromptID_CompensationActionID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CompensationInputMapping nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_IsIdempotent bit
    DECLARE cascade_update_MJActions_DefaultCompactPromptID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID], [CompensationActionID], [CompensationInputMapping], [IsIdempotent]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [DefaultCompactPromptID] = @ID

    OPEN cascade_update_MJActions_DefaultCompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID, @MJActions_DefaultCompactPromptID_CompensationActionID, @MJActions_DefaultCompactPromptID_CompensationInputMapping, @MJActions_DefaultCompactPromptID_IsIdempotent

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_DefaultCompactPromptID_DefaultCompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_DefaultCompactPromptIDID, @CategoryID = @MJActions_DefaultCompactPromptID_CategoryID, @Name = @MJActions_DefaultCompactPromptID_Name, @Description = @MJActions_DefaultCompactPromptID_Description, @Type = @MJActions_DefaultCompactPromptID_Type, @UserPrompt = @MJActions_DefaultCompactPromptID_UserPrompt, @UserComments = @MJActions_DefaultCompactPromptID_UserComments, @Code = @MJActions_DefaultCompactPromptID_Code, @CodeComments = @MJActions_DefaultCompactPromptID_CodeComments, @CodeApprovalStatus = @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_DefaultCompactPromptID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_DefaultCompactPromptID_CodeApprovedAt, @CodeLocked = @MJActions_DefaultCompactPromptID_CodeLocked, @ForceCodeGeneration = @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @RetentionPeriod = @MJActions_DefaultCompactPromptID_RetentionPeriod, @Status = @MJActions_DefaultCompactPromptID_Status, @DriverClass = @MJActions_DefaultCompactPromptID_DriverClass, @ParentID = @MJActions_DefaultCompactPromptID_ParentID, @IconClass = @MJActions_DefaultCompactPromptID_IconClass, @DefaultCompactPromptID_Clear = 1, @DefaultCompactPromptID = @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @Config = @MJActions_DefaultCompactPromptID_Config, @RuntimeActionConfiguration = @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @CreatedByAgentID = @MJActions_DefaultCompactPromptID_CreatedByAgentID, @CompensationActionID = @MJActions_DefaultCompactPromptID_CompensationActionID, @CompensationInputMapping = @MJActions_DefaultCompactPromptID_CompensationInputMapping, @IsIdempotent = @MJActions_DefaultCompactPromptID_IsIdempotent

        FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID, @MJActions_DefaultCompactPromptID_CompensationActionID, @MJActions_DefaultCompactPromptID_CompensationInputMapping, @MJActions_DefaultCompactPromptID_IsIdempotent
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
    DECLARE @MJFeatureValues_PromptID_EffectiveAsOf datetimeoffset
    DECLARE @MJFeatureValues_PromptID_InputAsOf datetimeoffset
    DECLARE @MJFeatureValues_PromptID_Role nvarchar(20)
    DECLARE @MJFeatureValues_PromptID_MLModelID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_MLModelScoringBindingID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_MLScoringRunID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_InTraining bit
    DECLARE cascade_update_MJFeatureValues_PromptID_cursor CURSOR FOR
        SELECT [ID], [RecordProcessID], [EntityID], [RecordID], [FeatureName], [ValueText], [ValueNumeric], [ValueDate], [ValueBoolean], [ValueJSON], [Reasoning], [Confidence], [PromptID], [PromptVersionHash], [ConstraintHash], [ProcessRunID], [ProcessRunDetailID], [AIPromptRunID], [FeatureValueCacheID], [ComputedAt], [PipelineVersion], [AIModelID], [ParametersHash], [InputHash], [ValueKeyHash], [Source], [EffectiveAsOf], [InputAsOf], [Role], [MLModelID], [MLModelScoringBindingID], [MLScoringRunID], [InTraining]
        FROM [${flyway:defaultSchema}].[FeatureValue]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJFeatureValues_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJFeatureValues_PromptID_cursor INTO @MJFeatureValues_PromptIDID, @MJFeatureValues_PromptID_RecordProcessID, @MJFeatureValues_PromptID_EntityID, @MJFeatureValues_PromptID_RecordID, @MJFeatureValues_PromptID_FeatureName, @MJFeatureValues_PromptID_ValueText, @MJFeatureValues_PromptID_ValueNumeric, @MJFeatureValues_PromptID_ValueDate, @MJFeatureValues_PromptID_ValueBoolean, @MJFeatureValues_PromptID_ValueJSON, @MJFeatureValues_PromptID_Reasoning, @MJFeatureValues_PromptID_Confidence, @MJFeatureValues_PromptID_PromptID, @MJFeatureValues_PromptID_PromptVersionHash, @MJFeatureValues_PromptID_ConstraintHash, @MJFeatureValues_PromptID_ProcessRunID, @MJFeatureValues_PromptID_ProcessRunDetailID, @MJFeatureValues_PromptID_AIPromptRunID, @MJFeatureValues_PromptID_FeatureValueCacheID, @MJFeatureValues_PromptID_ComputedAt, @MJFeatureValues_PromptID_PipelineVersion, @MJFeatureValues_PromptID_AIModelID, @MJFeatureValues_PromptID_ParametersHash, @MJFeatureValues_PromptID_InputHash, @MJFeatureValues_PromptID_ValueKeyHash, @MJFeatureValues_PromptID_Source, @MJFeatureValues_PromptID_EffectiveAsOf, @MJFeatureValues_PromptID_InputAsOf, @MJFeatureValues_PromptID_Role, @MJFeatureValues_PromptID_MLModelID, @MJFeatureValues_PromptID_MLModelScoringBindingID, @MJFeatureValues_PromptID_MLScoringRunID, @MJFeatureValues_PromptID_InTraining

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJFeatureValues_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateFeatureValue] @ID = @MJFeatureValues_PromptIDID, @RecordProcessID = @MJFeatureValues_PromptID_RecordProcessID, @EntityID = @MJFeatureValues_PromptID_EntityID, @RecordID = @MJFeatureValues_PromptID_RecordID, @FeatureName = @MJFeatureValues_PromptID_FeatureName, @ValueText = @MJFeatureValues_PromptID_ValueText, @ValueNumeric = @MJFeatureValues_PromptID_ValueNumeric, @ValueDate = @MJFeatureValues_PromptID_ValueDate, @ValueBoolean = @MJFeatureValues_PromptID_ValueBoolean, @ValueJSON = @MJFeatureValues_PromptID_ValueJSON, @Reasoning = @MJFeatureValues_PromptID_Reasoning, @Confidence = @MJFeatureValues_PromptID_Confidence, @PromptID_Clear = 1, @PromptID = @MJFeatureValues_PromptID_PromptID, @PromptVersionHash = @MJFeatureValues_PromptID_PromptVersionHash, @ConstraintHash = @MJFeatureValues_PromptID_ConstraintHash, @ProcessRunID = @MJFeatureValues_PromptID_ProcessRunID, @ProcessRunDetailID = @MJFeatureValues_PromptID_ProcessRunDetailID, @AIPromptRunID = @MJFeatureValues_PromptID_AIPromptRunID, @FeatureValueCacheID = @MJFeatureValues_PromptID_FeatureValueCacheID, @ComputedAt = @MJFeatureValues_PromptID_ComputedAt, @PipelineVersion = @MJFeatureValues_PromptID_PipelineVersion, @AIModelID = @MJFeatureValues_PromptID_AIModelID, @ParametersHash = @MJFeatureValues_PromptID_ParametersHash, @InputHash = @MJFeatureValues_PromptID_InputHash, @ValueKeyHash = @MJFeatureValues_PromptID_ValueKeyHash, @Source = @MJFeatureValues_PromptID_Source, @EffectiveAsOf = @MJFeatureValues_PromptID_EffectiveAsOf, @InputAsOf = @MJFeatureValues_PromptID_InputAsOf, @Role = @MJFeatureValues_PromptID_Role, @MLModelID = @MJFeatureValues_PromptID_MLModelID, @MLModelScoringBindingID = @MJFeatureValues_PromptID_MLModelScoringBindingID, @MLScoringRunID = @MJFeatureValues_PromptID_MLScoringRunID, @InTraining = @MJFeatureValues_PromptID_InTraining

        FETCH NEXT FROM cascade_update_MJFeatureValues_PromptID_cursor INTO @MJFeatureValues_PromptIDID, @MJFeatureValues_PromptID_RecordProcessID, @MJFeatureValues_PromptID_EntityID, @MJFeatureValues_PromptID_RecordID, @MJFeatureValues_PromptID_FeatureName, @MJFeatureValues_PromptID_ValueText, @MJFeatureValues_PromptID_ValueNumeric, @MJFeatureValues_PromptID_ValueDate, @MJFeatureValues_PromptID_ValueBoolean, @MJFeatureValues_PromptID_ValueJSON, @MJFeatureValues_PromptID_Reasoning, @MJFeatureValues_PromptID_Confidence, @MJFeatureValues_PromptID_PromptID, @MJFeatureValues_PromptID_PromptVersionHash, @MJFeatureValues_PromptID_ConstraintHash, @MJFeatureValues_PromptID_ProcessRunID, @MJFeatureValues_PromptID_ProcessRunDetailID, @MJFeatureValues_PromptID_AIPromptRunID, @MJFeatureValues_PromptID_FeatureValueCacheID, @MJFeatureValues_PromptID_ComputedAt, @MJFeatureValues_PromptID_PipelineVersion, @MJFeatureValues_PromptID_AIModelID, @MJFeatureValues_PromptID_ParametersHash, @MJFeatureValues_PromptID_InputHash, @MJFeatureValues_PromptID_ValueKeyHash, @MJFeatureValues_PromptID_Source, @MJFeatureValues_PromptID_EffectiveAsOf, @MJFeatureValues_PromptID_InputAsOf, @MJFeatureValues_PromptID_Role, @MJFeatureValues_PromptID_MLModelID, @MJFeatureValues_PromptID_MLModelScoringBindingID, @MJFeatureValues_PromptID_MLScoringRunID, @MJFeatureValues_PromptID_InTraining
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
    DECLARE @MJRecordProcesses_PromptID_ChallengerConfiguration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_PromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration], [ChallengerConfiguration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJRecordProcesses_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration, @MJRecordProcesses_PromptID_ChallengerConfiguration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_PromptIDID, @Name = @MJRecordProcesses_PromptID_Name, @Description = @MJRecordProcesses_PromptID_Description, @CategoryID = @MJRecordProcesses_PromptID_CategoryID, @EntityID = @MJRecordProcesses_PromptID_EntityID, @Status = @MJRecordProcesses_PromptID_Status, @WorkType = @MJRecordProcesses_PromptID_WorkType, @ActionID = @MJRecordProcesses_PromptID_ActionID, @AgentID = @MJRecordProcesses_PromptID_AgentID, @PromptID_Clear = 1, @PromptID = @MJRecordProcesses_PromptID_PromptID, @ScopeType = @MJRecordProcesses_PromptID_ScopeType, @ScopeViewID = @MJRecordProcesses_PromptID_ScopeViewID, @ScopeListID = @MJRecordProcesses_PromptID_ScopeListID, @ScopeFilter = @MJRecordProcesses_PromptID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_PromptID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_PromptID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_PromptID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_PromptID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_PromptID_CronExpression, @Timezone = @MJRecordProcesses_PromptID_Timezone, @OnDemandEnabled = @MJRecordProcesses_PromptID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_PromptID_InputMapping, @OutputMapping = @MJRecordProcesses_PromptID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_PromptID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_PromptID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_PromptID_BatchSize, @MaxConcurrency = @MJRecordProcesses_PromptID_MaxConcurrency, @Configuration = @MJRecordProcesses_PromptID_Configuration, @ChallengerConfiguration = @MJRecordProcesses_PromptID_ChallengerConfiguration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration, @MJRecordProcesses_PromptID_ChallengerConfiguration
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
    DECLARE @MJTasks_PromptID_SecurityEnvelope nvarchar(MAX)
    DECLARE @MJTasks_PromptID_CompensatesTaskID uniqueidentifier
    DECLARE @MJTasks_PromptID_CorrelationKey nvarchar(400)
    DECLARE @MJTasks_PromptID_AttemptCount int
    DECLARE @MJTasks_PromptID_NextAttemptAt datetimeoffset
    DECLARE cascade_update_MJTasks_PromptID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration], [SecurityEnvelope], [CompensatesTaskID], [CorrelationKey], [AttemptCount], [NextAttemptAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJTasks_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_PromptID_cursor INTO @MJTasks_PromptIDID, @MJTasks_PromptID_ParentID, @MJTasks_PromptID_Name, @MJTasks_PromptID_Description, @MJTasks_PromptID_TypeID, @MJTasks_PromptID_EnvironmentID, @MJTasks_PromptID_ProjectID, @MJTasks_PromptID_ConversationDetailID, @MJTasks_PromptID_UserID, @MJTasks_PromptID_AgentID, @MJTasks_PromptID_Status, @MJTasks_PromptID_PercentComplete, @MJTasks_PromptID_DueAt, @MJTasks_PromptID_StartedAt, @MJTasks_PromptID_CompletedAt, @MJTasks_PromptID_InputPayload, @MJTasks_PromptID_OutputPayload, @MJTasks_PromptID_ErrorMessage, @MJTasks_PromptID_AgentRunID, @MJTasks_PromptID_ClaimedBy, @MJTasks_PromptID_ClaimExpiresAt, @MJTasks_PromptID_ActionID, @MJTasks_PromptID_StepType, @MJTasks_PromptID_PromptID, @MJTasks_PromptID_Configuration, @MJTasks_PromptID_SecurityEnvelope, @MJTasks_PromptID_CompensatesTaskID, @MJTasks_PromptID_CorrelationKey, @MJTasks_PromptID_AttemptCount, @MJTasks_PromptID_NextAttemptAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_PromptIDID, @ParentID = @MJTasks_PromptID_ParentID, @Name = @MJTasks_PromptID_Name, @Description = @MJTasks_PromptID_Description, @TypeID = @MJTasks_PromptID_TypeID, @EnvironmentID = @MJTasks_PromptID_EnvironmentID, @ProjectID = @MJTasks_PromptID_ProjectID, @ConversationDetailID = @MJTasks_PromptID_ConversationDetailID, @UserID = @MJTasks_PromptID_UserID, @AgentID = @MJTasks_PromptID_AgentID, @Status = @MJTasks_PromptID_Status, @PercentComplete = @MJTasks_PromptID_PercentComplete, @DueAt = @MJTasks_PromptID_DueAt, @StartedAt = @MJTasks_PromptID_StartedAt, @CompletedAt = @MJTasks_PromptID_CompletedAt, @InputPayload = @MJTasks_PromptID_InputPayload, @OutputPayload = @MJTasks_PromptID_OutputPayload, @ErrorMessage = @MJTasks_PromptID_ErrorMessage, @AgentRunID = @MJTasks_PromptID_AgentRunID, @ClaimedBy = @MJTasks_PromptID_ClaimedBy, @ClaimExpiresAt = @MJTasks_PromptID_ClaimExpiresAt, @ActionID = @MJTasks_PromptID_ActionID, @StepType = @MJTasks_PromptID_StepType, @PromptID_Clear = 1, @PromptID = @MJTasks_PromptID_PromptID, @Configuration = @MJTasks_PromptID_Configuration, @SecurityEnvelope = @MJTasks_PromptID_SecurityEnvelope, @CompensatesTaskID = @MJTasks_PromptID_CompensatesTaskID, @CorrelationKey = @MJTasks_PromptID_CorrelationKey, @AttemptCount = @MJTasks_PromptID_AttemptCount, @NextAttemptAt = @MJTasks_PromptID_NextAttemptAt

        FETCH NEXT FROM cascade_update_MJTasks_PromptID_cursor INTO @MJTasks_PromptIDID, @MJTasks_PromptID_ParentID, @MJTasks_PromptID_Name, @MJTasks_PromptID_Description, @MJTasks_PromptID_TypeID, @MJTasks_PromptID_EnvironmentID, @MJTasks_PromptID_ProjectID, @MJTasks_PromptID_ConversationDetailID, @MJTasks_PromptID_UserID, @MJTasks_PromptID_AgentID, @MJTasks_PromptID_Status, @MJTasks_PromptID_PercentComplete, @MJTasks_PromptID_DueAt, @MJTasks_PromptID_StartedAt, @MJTasks_PromptID_CompletedAt, @MJTasks_PromptID_InputPayload, @MJTasks_PromptID_OutputPayload, @MJTasks_PromptID_ErrorMessage, @MJTasks_PromptID_AgentRunID, @MJTasks_PromptID_ClaimedBy, @MJTasks_PromptID_ClaimExpiresAt, @MJTasks_PromptID_ActionID, @MJTasks_PromptID_StepType, @MJTasks_PromptID_PromptID, @MJTasks_PromptID_Configuration, @MJTasks_PromptID_SecurityEnvelope, @MJTasks_PromptID_CompensatesTaskID, @MJTasks_PromptID_CorrelationKey, @MJTasks_PromptID_AttemptCount, @MJTasks_PromptID_NextAttemptAt
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

/* SQL text to insert 12 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '45c5d308-1a6b-4e26-b7a6-cfe2664734e9' OR (EntityID = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND Name = 'User')) BEGIN
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
            '45c5d308-1a6b-4e26-b7a6-cfe2664734e9',
            'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', -- Entity: MJ: ML Model Publish Records
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'),
            'User',
            'User',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d6a3b8f-f864-4ca4-8585-e4c6ee3cb2cb' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'MLTrainingPipeline')) BEGIN
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
            '5d6a3b8f-f864-4ca4-8585-e4c6ee3cb2cb',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA'),
            'MLTrainingPipeline',
            'ML Training Pipeline',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c21872d3-a8c4-4077-8f94-2e8f2c3cc4f4' OR (EntityID = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND Name = 'ViewAuthorization')) BEGIN
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
            'c21872d3-a8c4-4077-8f94-2e8f2c3cc4f4',
            'FD8EF230-65F3-496D-A117-7610572C35AA', -- Entity: MJ: ML Model Scoring Bindings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA'),
            'ViewAuthorization',
            'View Authorization',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ba75b663-d1ab-4afd-b838-1481ea2b16ef' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'MLModelScoringBinding')) BEGIN
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
            'ba75b663-d1ab-4afd-b838-1481ea2b16ef',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'MLModelScoringBinding',
            'ML Model Scoring Binding',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd24c1d93-5014-4ae2-aee3-3aab12db2a5b' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'PredictionUnit')) BEGIN
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
            'd24c1d93-5014-4ae2-aee3-3aab12db2a5b',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'PredictionUnit',
            'Prediction Unit',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b90cca3d-6292-44a1-afe9-0f9777551bd6' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'EvaluationProtocol')) BEGIN
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
            'b90cca3d-6292-44a1-afe9-0f9777551bd6',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'EvaluationProtocol',
            'Evaluation Protocol',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7f8d0b93-bd67-4dfa-9463-a9a721b3d52f' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'TrainingSnapshot')) BEGIN
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
            '7f8d0b93-bd67-4dfa-9463-a9a721b3d52f',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B'),
            'TrainingSnapshot',
            'Training Snapshot',
            NULL,
            'nvarchar',
            128,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90ee43f7-6882-40d9-9564-20701cf7a5fd' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'MLModelScoringBinding')) BEGIN
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
            '90ee43f7-6882-40d9-9564-20701cf7a5fd',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'MLModelScoringBinding',
            'ML Model Scoring Binding',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fdf9dc9f-6241-4661-b45b-df0468efad86' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'ScopeEntity')) BEGIN
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
            'fdf9dc9f-6241-4661-b45b-df0468efad86',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'ScopeEntity',
            'Scope Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20bc4fec-f7be-4524-ba56-9073fe4ee923' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'RequestedByUser')) BEGIN
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
            '20bc4fec-f7be-4524-ba56-9073fe4ee923',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'RequestedByUser',
            'Requested By User',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ede21505-537f-48bb-9e63-16c67c03a496' OR (EntityID = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND Name = 'ScheduledJobRun')) BEGIN
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
            'ede21505-537f-48bb-9e63-16c67c03a496',
            'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', -- Entity: MJ: ML Scoring Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'),
            'ScheduledJobRun',
            'Scheduled Job Run',
            NULL,
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8567862-7f27-41e4-ab3a-a966ce02c38f' OR (EntityID = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND Name = 'ScheduledJobRun')) BEGIN
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
            'f8567862-7f27-41e4-ab3a-a966ce02c38f',
            '18359693-D8DF-4E8F-B5E1-D2C17B742834', -- Entity: MJ: ML Monitoring Results
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834'),
            'ScheduledJobRun',
            'Scheduled Job Run',
            NULL,
            'nvarchar',
            400,
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
               WHERE ID = '13F4734B-CAC4-40B6-A7A1-BBBB2C5CE0FF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7D45D97D-9DBC-42E0-BD83-33F7C91B6923'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.MLTrainingPipelineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Training Pipeline'
WHERE 
   ID = '9A5AB8B8-1DB9-44DE-AC6F-95F6561601B7';

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.FeatureName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Destination',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '13F4734B-CAC4-40B6-A7A1-BBBB2C5CE0FF';

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.TargetColumnSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Destination',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5A5B7894-74CB-42DE-8749-351510121685';

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7D45D97D-9DBC-42E0-BD83-33F7C91B6923';

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.ViewAuthorizationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Retention',
   GeneratedFormSection = 'Category',
   DisplayName = 'View Authorization'
WHERE 
   ID = 'C531130D-2663-402B-9643-57AF83E76F08';

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.RetentionDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Retention',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '134DD51D-B21A-437D-A82B-A9790472B91C';

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.MLTrainingPipeline 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Training Pipeline Name'
WHERE 
   ID = '5D6A3B8F-F864-4CA4-8585-E4C6EE3CB2CB';

-- UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.ViewAuthorization 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Retention',
   GeneratedFormSection = 'Category',
   DisplayName = 'View Authorization Name'
WHERE 
   ID = 'C21872D3-A8C4-4077-8F94-2E8F2C3CC4F4';

/* Update FieldCategoryInfo setting for entity */

                  UPDATE [${flyway:defaultSchema}].[EntitySetting]
                  SET [Value] = '{
  "Binding Configuration": {
    "description": "Settings defining the ML model, process, and scoring mode",
    "icon": "fa fa-sliders-h"
  },
  "Execution Metrics": {
    "description": "Performance and execution statistics from the latest scoring run",
    "icon": "fa fa-tachometer-alt"
  },
  "Security and Retention": {
    "description": "Permissions, authorization rules, and data retention policies for predictions",
    "icon": "fa fa-shield-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Target Destination": {
    "description": "The destination entity and column where model predictions are written",
    "icon": "fa fa-bullseye"
  }
}', [__mj_UpdatedAt] = GETUTCDATE()
                  WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND [Name] = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

                  UPDATE [${flyway:defaultSchema}].[EntitySetting]
                  SET [Value] = '{
  "Binding Configuration": "fa fa-sliders-h",
  "Execution Metrics": "fa fa-tachometer-alt",
  "Security and Retention": "fa fa-shield-alt",
  "System Metadata": "fa fa-cog",
  "Target Destination": "fa fa-bullseye"
}', [__mj_UpdatedAt] = GETUTCDATE()
                  WHERE [EntityID] = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND [Name] = 'FieldCategoryIcons';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1AAF359F-C0A4-4CF0-8365-92803287FB66'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '81D5492D-DDE5-44ED-978E-E67909A7ACAB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C69F005A-A435-46C7-9DE8-62E09D6E7209'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '10699C33-22CF-4BA1-8079-3A354FCB49F9'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CCCD3301-BF44-457E-B997-A82342CE35F2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AB99CFE5-DDBF-4F08-A999-759012ADE712'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A7F0D206-FACB-41B7-B581-12028AD8C572'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '014FCBC2-E056-4EEB-B192-ACE37F3FF497'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1101BBC0-D03A-4635-9510-76635311BCBE'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '286790AA-AA0F-4AE2-BFE5-0F7AE9672906'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1605CC51-F9AD-4CB2-B4C3-7280E8BC6544'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '4B8AA70F-84A5-48BC-ADB9-4E43DE26FD33'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4B8AA70F-84A5-48BC-ADB9-4E43DE26FD33'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '75F9DA13-10D3-4153-9299-E97F1ED296AD'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '80C5C1BB-6F0C-4C4F-B2CD-182162748E53';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = 'C1A24860-AE81-4CF5-8FE2-179E6B9F54BD';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.TrainingRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Run'
WHERE 
   ID = '089114D6-5A6B-41A8-80FF-0B4FCFA82C21';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Kind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '940329A6-0C44-44C2-B816-F192C3DDF75F';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Purpose 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '381291CE-94E9-47E5-B465-216713718BFD';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ApproverKind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authorization and Actors',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CCCD3301-BF44-457E-B997-A82342CE35F2';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authorization and Actors',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = '87B82E1A-CFD0-4B51-9127-E344C63F1373';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Initiator 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authorization and Actors',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '44667EAE-506D-4BFD-B6C8-92E4E148AFB5';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authorization and Actors',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Details'
WHERE 
   ID = '45C5D308-1A6B-4E26-B7A6-CFE2664734E9';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.RecordedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AB99CFE5-DDBF-4F08-A999-759012ADE712';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Decision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Decision and Evaluation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1DD29AB7-CF34-4CC4-9BC3-CC694EA33480';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Reason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Decision and Evaluation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '88A11441-B549-45B5-8484-8B9EE7CDB5B3';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.GateDecision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Decision and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '34E9DB74-EAF9-419A-9B7C-895C4AF44FA0';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Evidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Decision and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'BE4F236F-8B84-4931-B998-F2B568F8E714';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.EvidenceSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Decision and Evaluation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evidence SHA-256'
WHERE 
   ID = 'FEF8D7F7-CB33-4DC5-8165-5D4288E02942';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.OverridesFlags 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Decision and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'FA36FC82-F357-47A8-BD79-BDE885E7E502';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.SignOffID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Sign-Off'
WHERE 
   ID = '08B15F48-8F82-4DF6-9F51-9E944FE5F4A4';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.ReplacesModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Replaces Model'
WHERE 
   ID = '7745439F-8C94-4042-9478-C89100C3FFC3';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Refusal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Decision and Evaluation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Refusal Details',
   ExtendedType = 'JSON'
WHERE 
   ID = '5791332F-D06D-4116-8C09-15269FC16D0F';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.Transient 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publish Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '77191E92-A1C6-4AEB-875F-FEB94AB491E6';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5F340669-13E9-4172-89EA-B9EE16F72407';

-- UPDATE Entity Field Category Info MJ: ML Model Publish Records.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2B16F733-8E05-4D1F-BA5B-9E23B96E8905';

/* Set entity icon to fa fa-history */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-history', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1cbb55be-3e64-5cbe-b3d5-d9c724e28aa4', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'FieldCategoryInfo', '{
  "Authorization and Actors": {
    "description": "Approvers, user details, and initiator metadata",
    "icon": "fa fa-user-shield"
  },
  "Decision and Evaluation": {
    "description": "Evaluations, gate decisions, evidence snapshots, and refusal details",
    "icon": "fa fa-clipboard-check"
  },
  "Publish Details": {
    "description": "Core classifications, timing, and transient state of the publish record",
    "icon": "fa fa-info-circle"
  },
  "Publish References": {
    "description": "References to models, training runs, sign-offs, and replaced entities",
    "icon": "fa fa-link"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('129a1232-5954-5c40-aff9-38c2759018dd', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'FieldCategoryIcons', '{
  "Authorization and Actors": "fa fa-user-shield",
  "Decision and Evaluation": "fa fa-clipboard-check",
  "Publish Details": "fa fa-info-circle",
  "Publish References": "fa fa-link",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640';

/* Set categories for 6 fields */

-- UPDATE Entity Field Category Info MJ: Feature Values.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BAB2F6F6-56D7-4372-9F00-505790D71886';

-- UPDATE Entity Field Category Info MJ: Feature Values.MLModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '24ACE2B5-B5E9-4048-80ED-7D55CBCD2846';

-- UPDATE Entity Field Category Info MJ: Feature Values.MLModelScoringBindingID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Model Scoring Binding'
WHERE 
   ID = '63758D3B-EBE1-4F32-8DDD-A6C56A403651';

-- UPDATE Entity Field Category Info MJ: Feature Values.MLScoringRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Scoring Run'
WHERE 
   ID = '8DC16BEC-2AA6-4E87-88CD-6A2BDD606249';

-- UPDATE Entity Field Category Info MJ: Feature Values.InTraining 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D99F2888-BB28-4435-91FA-E550BB4A5CBF';

-- UPDATE Entity Field Category Info MJ: Feature Values.MLModelScoringBinding 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pipeline Provenance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BA75B663-D1AB-4AFD-B838-1481EA2B16EF';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B35104BB-A8DB-46E9-B4A7-04C8764958A5';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Binding Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = '0674E79F-D45C-49B5-BD64-D4166E92E45C';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.Surface 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Binding Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.SortsBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Binding Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '480927EF-43D6-43D8-AF27-884397692D15';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.DriverDirectionRelativeTo 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Binding Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.Label 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Binding Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4B8AA70F-84A5-48BC-ADB9-4E43DE26FD33';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4E63AFF6-E431-4A19-8587-EE652F430A44';

-- UPDATE Entity Field Category Info MJ: ML Output Bindings.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8BFD740E-DEE6-458A-A4BB-328D7346533C';

/* Set entity icon to fa fa-sliders-h */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-sliders-h', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e84223c8-9333-516f-b65c-2e6149074b01', '75F9DA13-10D3-4153-9299-E97F1ED296AD', 'FieldCategoryInfo', '{
  "Model Binding Configuration": {
    "description": "Configuration settings for how machine learning model outputs are displayed and sorted on a surface",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2adcbedf-ed2b-5775-bdd2-871e51a9e194', '75F9DA13-10D3-4153-9299-E97F1ED296AD', 'FieldCategoryIcons', '{
  "Model Binding Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '75F9DA13-10D3-4153-9299-E97F1ED296AD';

/* Set categories for 26 fields */

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3C7230C6-1208-4299-8E20-D9F95C54BCC5';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period and Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = 'FEDEF598-EA62-4001-91F2-65A0D7C2ED69';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScheduledJobRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D1EE5D2D-3609-4F19-8CA1-58C4CAD0A9E1';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Period 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4CC916C1-6CF0-4392-93EB-A56F04BB62D5';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PeriodGrain 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '98F67019-F93F-4DD6-BBA1-70B848353726';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.State 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1AAF359F-C0A4-4CF0-8365-92803287FB66';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScoredRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '81D5492D-DDE5-44ED-978E-E67909A7ACAB';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.JoinedRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C69F005A-A435-46C7-9DE8-62E09D6E7209';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ExcludedInTrainingRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C0E7F6F2-B61A-4F20-BCF7-C485A500A404';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'AFCE783F-21F5-43C0-B6F2-B9C37FC4FBF2';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '10699C33-22CF-4BA1-8079-3A354FCB49F9';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryLower 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Lower Bound'
WHERE 
   ID = 'CDFD9C3E-F52E-48AE-9843-2D7BC3860DD2';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryUpper 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Upper Bound'
WHERE 
   ID = 'C022EDB6-4870-4CAB-A9A9-E7DDBBE3B2FE';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.TrackedMetrics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '7DA54052-F022-45E3-95BB-D7C70E07E539';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Calibration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'DF8DA9D9-8D9F-4272-9DA7-73F16F1D3BC1';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.DriftLook 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift and Parity Analysis',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '5E85F9AA-08B8-4FB6-8036-FF7BCC422E6E';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.DriftAlarms 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift and Parity Analysis',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'D59641F9-FC8F-43CB-ADE7-6A4A544237B7';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.Parity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Drift and Parity Analysis',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'FEE3EAF7-0F45-41B1-A5B5-C15C46D3A44A';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.TriggersFired 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '44C03183-72FB-48C1-AF77-D74BD3750997';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ChallengerRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers and Governance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DCF4FC08-B0F5-497C-B1B1-613BAF468AB0';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ChallengerResult 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'EE9273B1-CC1C-4FF5-B6C7-B5874C6F8DBD';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.RollbackCheck 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Triggers and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'F8540BBD-4487-406A-8ADE-950F06DF6961';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '58B18E38-A901-40B9-A670-3AD7B05AC820';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E5D79B26-ACE7-4A92-9854-C8467AF131D6';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D2617595-A76D-4D94-8D31-0F23A1F94D23';

-- UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScheduledJobRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Monitoring Period and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F8567862-7F27-41E4-AB3A-A966CE02C38F';

/* Set entity icon to fa fa-chart-line */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-chart-line', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b571334e-6f7a-50a2-8385-1a8e04b94d13', '18359693-D8DF-4E8F-B5E1-D2C17B742834', 'FieldCategoryInfo', '{
  "Drift and Parity Analysis": {
    "description": "Input drift statistics, alarms, and scoring parity check results",
    "icon": "fa fa-balance-scale"
  },
  "Evaluation Metrics": {
    "description": "Scoring outcomes, primary metrics, intervals, and tracked model metrics",
    "icon": "fa fa-chart-bar"
  },
  "Monitoring Period and Status": {
    "description": "Period definitions, job execution references, and monitoring run states",
    "icon": "fa fa-calendar-alt"
  },
  "Triggers and Governance": {
    "description": "Retrain/rollback triggers, challenger evaluations, and automated checks",
    "icon": "fa fa-shield-alt"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e5ff79db-474c-5604-907e-389da8807c3c', '18359693-D8DF-4E8F-B5E1-D2C17B742834', 'FieldCategoryIcons', '{
  "Drift and Parity Analysis": "fa fa-balance-scale",
  "Evaluation Metrics": "fa fa-chart-bar",
  "Monitoring Period and Status": "fa fa-calendar-alt",
  "Triggers and Governance": "fa fa-shield-alt"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '18359693-D8DF-4E8F-B5E1-D2C17B742834';

/* Set categories for 33 fields */

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F1E89CB7-38B9-42A0-849E-5FE2891056F9';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Binding Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Model'
WHERE 
   ID = '92633337-875A-46E0-8B8A-C10043BF583A';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ModelVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Binding Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '035103C4-23DE-4842-9E5F-1838B2531358';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.MLModelScoringBindingID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Binding Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Model Scoring Binding'
WHERE 
   ID = 'C1418070-BC06-4C81-A5E5-9157D98260E1';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ArtifactSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Binding Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact SHA-256'
WHERE 
   ID = 'E628B36A-A9CA-4EE1-B45C-C6C7DDEB946A';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.FeatureSchemaHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Binding Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C29838B7-2F50-4427-88AF-EE9E4181539C';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.MLModelScoringBinding 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model and Binding Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Model Scoring Binding Name'
WHERE 
   ID = '90EE43F7-6882-40D9-9564-20701CF7A5FD';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Path 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Execution',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A7F0D206-FACB-41B7-B581-12028AD8C572';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeKind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Execution',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5C5CA5C1-9F48-40D8-A982-FDE7B605A266';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Execution',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scope Entity'
WHERE 
   ID = '4274B247-7FE6-42AF-82F1-54C01B0BFCFE';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Scope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Execution',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '9EB4C128-62A6-4723-84BE-B928B74A7B0D';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.EntityMapping 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Execution',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '292F38DE-B136-4A24-9205-58C6EDA4BFC3';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.AsOfDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Execution',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9FD64601-0B57-40A7-B646-7B3D923B4204';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ReadPolicy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Execution',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '8CA00152-6DFC-4D07-8D62-D2E756B476E5';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.DryRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Execution',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6B6434A0-8214-45CF-ADF0-14EB1CEE1991';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scoring Scope and Execution',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scope Entity Name'
WHERE 
   ID = 'FDF9DC9F-6241-4661-B45B-DF0468EFAD86';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Request and Context',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'D4F07B62-0498-4C66-A9BF-7A7D6D21E1C1';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Request and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested By User'
WHERE 
   ID = '44A3F9E4-8767-4D71-8D31-800F5593537E';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ProcessRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Request and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Process Run'
WHERE 
   ID = '496111BA-DD23-453A-A738-0FFA3840175E';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScheduledJobRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Request and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Job Run'
WHERE 
   ID = '080EC5A4-CF1B-4BAE-95BD-C7BFBC1442C2';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Request and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested By User Name'
WHERE 
   ID = '20BC4FEC-F7BE-4524-BA56-9073FE4EE923';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScheduledJobRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Request and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Job Run Details'
WHERE 
   ID = 'EDE21505-537F-48BB-9E63-16C67C03A496';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Results and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Refusal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Results and Status',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'A9D0EB0B-9A38-4ECE-8EBD-E431B2927981';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Total 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Results and Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Records'
WHERE 
   ID = '014FCBC2-E056-4EEB-B192-ACE37F3FF497';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Written 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Results and Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Written Records'
WHERE 
   ID = '1101BBC0-D03A-4635-9510-76635311BCBE';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Failed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Results and Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Failed Records'
WHERE 
   ID = '286790AA-AA0F-4AE2-BFE5-0F7AE9672906';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.Skipped 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Results and Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Skipped Records'
WHERE 
   ID = '21A4210A-737E-4F7E-B11B-7C69567952FB';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.FirstErrors 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Results and Status',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '04257C99-90D3-4396-9402-657C9F558C58';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Results and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1605CC51-F9AD-4CB2-B4C3-7280E8BC6544';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Results and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C447F97A-DE65-49B8-9B69-44E75347A05C';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A523AD28-DDF2-4A9F-B98D-98A496860EAB';

-- UPDATE Entity Field Category Info MJ: ML Scoring Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6EDA4EEC-7C3F-4C68-AFFA-E0F8234AC3E5';

/* Set entity icon to fa fa-cogs */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-cogs', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('427233ab-5f26-54db-9a50-b7ba4bf9ba97', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'FieldCategoryInfo', '{
  "Execution Request and Context": {
    "description": "Details on who or what initiated the scoring run",
    "icon": "fa fa-user-clock"
  },
  "Model and Binding Details": {
    "description": "Information regarding the model version, artifacts, and scoring bindings used for the run",
    "icon": "fa fa-cube"
  },
  "Run Results and Status": {
    "description": "Execution status, metrics, error logs, and timestamps for the scoring call",
    "icon": "fa fa-chart-bar"
  },
  "Scoring Scope and Execution": {
    "description": "Parameters defining the scope, read policies, and execution context of the scoring run",
    "icon": "fa fa-crosshairs"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('20bcfbaa-4b4c-58bb-94f1-37c7ae15d3e3', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'FieldCategoryIcons', '{
  "Execution Request and Context": "fa fa-user-clock",
  "Model and Binding Details": "fa fa-cube",
  "Run Results and Status": "fa fa-chart-bar",
  "Scoring Scope and Execution": "fa fa-crosshairs",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2';

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: ML Models.PredictionUnitID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prediction Unit'
WHERE 
   ID = 'D70F7357-7955-4A95-BACA-2C1562AF73BA';

-- UPDATE Entity Field Category Info MJ: ML Models.EvaluationProtocolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol'
WHERE 
   ID = '56811DD1-2425-4943-93E4-699B08CCA40C';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingSnapshotID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Snapshot'
WHERE 
   ID = '7965BB9C-A42E-4DCC-8E32-A78D8309B922';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Run'
WHERE 
   ID = '859E225E-3777-47FE-86FE-38BCD231A562';

-- UPDATE Entity Field Category Info MJ: ML Models.OutputSemantics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema & Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '69E6B2E6-CE7D-4676-ACEE-6A24AB66EB87';

-- UPDATE Entity Field Category Info MJ: ML Models.StatusReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7CD0993F-A915-4D50-9FD8-CADCC9A4FF0E';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifacts & Validation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact SHA-256'
WHERE 
   ID = '53D76647-33D0-4F5F-860C-5FF4968E6429';

-- UPDATE Entity Field Category Info MJ: ML Models.SnapshotHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifacts & Validation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E52DD2C2-0D59-4FFC-A9E9-90456A571E27';

-- UPDATE Entity Field Category Info MJ: ML Models.CodeVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifacts & Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'CAAA603E-D0BA-4796-9851-EEE910205605';

-- UPDATE Entity Field Category Info MJ: ML Models.FeatureSchemaHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifacts & Validation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9BEA6B10-2722-4CCF-8919-6CF80A634CDC';

-- UPDATE Entity Field Category Info MJ: ML Models.Delivery 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifacts & Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '32243FFF-0ADA-46B8-95E6-9E9A300B9ED3';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifacts & Validation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3D26A331-B246-4781-AB7E-5FC789EF4996';

-- UPDATE Entity Field Category Info MJ: ML Models.ArtifactCheckedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifacts & Validation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FD577F2F-8A21-44F1-82A9-A0545EF10CA6';

-- UPDATE Entity Field Category Info MJ: ML Models.ServingWhileUnevaluated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifacts & Validation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D181470A-EF06-4FF6-A288-C7B4479D5B42';

-- UPDATE Entity Field Category Info MJ: ML Models.PredictionUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prediction Unit Name'
WHERE 
   ID = 'D24C1D93-5014-4AE2-AEE3-3AAB12DB2A5B';

-- UPDATE Entity Field Category Info MJ: ML Models.EvaluationProtocol 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol Name'
WHERE 
   ID = 'B90CCA3D-6292-44A1-AFE9-0F9777551BD6';

-- UPDATE Entity Field Category Info MJ: ML Models.TrainingSnapshot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Identity & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Snapshot Name'
WHERE 
   ID = '7F8D0B93-BD67-4DFA-9463-A9A721B3D52F';

/* Update FieldCategoryInfo setting for entity */

                  UPDATE [${flyway:defaultSchema}].[EntitySetting]
                  SET [Value] = '{
  "Artifacts & Validation": {
    "description": "Model artifact hashes, delivery metadata, code versions, and validation checks",
    "icon": "fa fa-shield-alt"
  },
  "Model Identity & Status": {
    "description": "Core model identifiers, versioning, lineage, and lifecycle status.",
    "icon": "fa fa-tag"
  },
  "Schema & Configuration": {
    "description": "Input schemas, target variables, and fitted preprocessing parameters.",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields.",
    "icon": "fa fa-cog"
  },
  "Training & Performance": {
    "description": "Training execution details, validation metrics, and feature importances.",
    "icon": "fa fa-chart-line"
  }
}', [__mj_UpdatedAt] = GETUTCDATE()
                  WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

                  UPDATE [${flyway:defaultSchema}].[EntitySetting]
                  SET [Value] = '{
  "Artifacts & Validation": "fa fa-shield-alt",
  "Model Identity & Status": "fa fa-tag",
  "Schema & Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog",
  "Training & Performance": "fa fa-chart-line"
}', [__mj_UpdatedAt] = GETUTCDATE()
                  WHERE [EntityID] = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND [Name] = 'FieldCategoryIcons';

